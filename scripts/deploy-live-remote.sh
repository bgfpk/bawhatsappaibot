#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/blackarrow}"
PM2_NAME="${PM2_NAME:-blackarrow}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-https://blackarrow-source.offline.invalid}"
EXPECTED_COMMIT="${EXPECTED_COMMIT:-}"
LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:3000}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
HEALTH_RETRY_INTERVAL_SECONDS="${HEALTH_RETRY_INTERVAL_SECONDS:-5}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

capture_head_status() {
  local url="$1"
  local tmp_file
  tmp_file="$(mktemp)"
  local http_code
  http_code="$(curl -sS -I -L --max-time 20 -D "$tmp_file" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
  local status_line
  status_line="$(head -n 1 "$tmp_file" | tr -d '\r')"
  rm -f "$tmp_file"

  if [[ -z "$http_code" ]]; then
    http_code="000"
  fi

  printf '%s|%s\n' "$http_code" "$status_line"
}

status_is_healthy() {
  local http_code="$1"
  [[ "$http_code" =~ ^[0-9]{3}$ ]] && (( http_code >= 200 && http_code < 400 ))
}

print_failure_diagnostics() {
  log "Health checks failed. Printing diagnostics"
  pm2 status || true
  pm2 logs "$PM2_NAME" --lines 100 --nostream || true

  if [[ -f /var/log/nginx/error.log ]]; then
    log "Recent nginx error log lines"
    tail -n 50 /var/log/nginx/error.log || true
  elif [[ -f /usr/local/openresty/nginx/logs/error.log ]]; then
    log "Recent nginx error log lines"
    tail -n 50 /usr/local/openresty/nginx/logs/error.log || true
  else
    log "nginx error log not found in common locations"
  fi
}

wait_for_health_checks() {
  local started_at
  started_at="$(date +%s)"
  local deadline=$((started_at + HEALTH_TIMEOUT_SECONDS))
  local attempt=1

  while true; do
    local now
    now="$(date +%s)"
    local elapsed=$((now - started_at))

    local local_result
    local_result="$(capture_head_status "$LOCAL_HEALTH_URL")"
    local local_code="${local_result%%|*}"
    local local_line="${local_result#*|}"
    printf 'LOCAL_HEALTH_ATTEMPT_%s=%ss %s %s\n' "$attempt" "$elapsed" "$local_code" "${local_line:-NO_STATUS_LINE}"

    local domain_result=""
    local domain_code="000"
    local domain_line="SKIPPED_UNTIL_LOCAL_READY"
    if status_is_healthy "$local_code"; then
      domain_result="$(capture_head_status "$DOMAIN")"
      domain_code="${domain_result%%|*}"
      domain_line="${domain_result#*|}"
    fi
    printf 'DOMAIN_HEALTH_ATTEMPT_%s=%ss %s %s\n' "$attempt" "$elapsed" "$domain_code" "${domain_line:-NO_STATUS_LINE}"

    if status_is_healthy "$local_code" && status_is_healthy "$domain_code"; then
      log "Health checks passed"
      return 0
    fi

    if (( now >= deadline )); then
      print_failure_diagnostics
      return 1
    fi

    sleep "$HEALTH_RETRY_INTERVAL_SECONDS"
    attempt=$((attempt + 1))
  done
}

cd "$APP_DIR"

log "Inspecting current VPS checkout"
git update-index -q --refresh || true
git status --short --branch
current_head="$(git rev-parse HEAD)"
printf 'REMOTE_HEAD_BEFORE=%s\n' "$current_head"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "DEPLOY_BLOCKED=dirty_tracked_files"
  echo "Tracked files changed on the VPS. Review, commit, or restore them before deploy so git pull cannot overwrite live-only edits."
  git status --short
  echo "UNSTAGED_DIFF_STAT:"
  git diff --stat
  echo "STAGED_DIFF_STAT:"
  git diff --cached --stat
  echo "To inspect on VPS: cd $APP_DIR && git diff --stat && git diff -- <path>"
  echo "To inspect staged changes on VPS: cd $APP_DIR && git diff --cached --stat && git diff --cached -- <path>"
  echo "If the changes are only stale file metadata, run: cd $APP_DIR && git update-index -q --refresh"
  exit 20
fi

log "Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
remote_branch_head="$(git rev-parse "origin/$BRANCH")"
printf 'REMOTE_BRANCH_HEAD=%s\n' "$remote_branch_head"

if [[ -n "$EXPECTED_COMMIT" && "$remote_branch_head" != "$EXPECTED_COMMIT" ]]; then
  echo "DEPLOY_BLOCKED=unexpected_remote_commit"
  printf 'EXPECTED_COMMIT=%s\n' "$EXPECTED_COMMIT"
  exit 21
fi

log "Pulling latest code"
git pull --ff-only origin "$BRANCH"
printf 'REMOTE_HEAD_AFTER_PULL=%s\n' "$(git rev-parse HEAD)"

log "Installing dependencies"
npm ci

log "Type-checking"
npm run lint

log "Building production bundle"
npm run build

log "Provisioning Appwrite schema and storage buckets idempotently"
node --import tsx scripts/ensure-appwrite-schemas.ts

log "Restarting PM2 using ecosystem.config.cjs"
desired_script="$APP_DIR/dist/server.cjs"
existing_pm2_description="$(pm2 describe "$PM2_NAME" 2>/dev/null || true)"
if [[ -n "$existing_pm2_description" ]] && grep -q "$desired_script" <<<"$existing_pm2_description"; then
  pm2 startOrReload ecosystem.config.cjs --only "$PM2_NAME" --update-env
else
  if [[ -n "$existing_pm2_description" ]]; then
    log "Replacing legacy PM2 process definition for $PM2_NAME"
    pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  fi
  pm2 start ecosystem.config.cjs --only "$PM2_NAME" --update-env
fi
pm2 save

log "Verifying PM2 runtime"
pm2 describe "$PM2_NAME"
pm2_exec_cwd="$(pm2 jlist | node -e 'const fs = require("fs"); const name = process.argv[1]; const data = JSON.parse(fs.readFileSync(0, "utf8")); const proc = data.find((entry) => entry.name === name) || {}; process.stdout.write(proc.pm2_env?.pm_cwd || "");' "$PM2_NAME")"
pm2_exec_path="$(pm2 jlist | node -e 'const fs = require("fs"); const name = process.argv[1]; const data = JSON.parse(fs.readFileSync(0, "utf8")); const proc = data.find((entry) => entry.name === name) || {}; process.stdout.write(proc.pm2_env?.pm_exec_path || "");' "$PM2_NAME")"
pm2_args="$(pm2 jlist | node -e 'const fs = require("fs"); const name = process.argv[1]; const data = JSON.parse(fs.readFileSync(0, "utf8")); const proc = data.find((entry) => entry.name === name) || {}; const args = Array.isArray(proc.pm2_env?.args) ? proc.pm2_env.args.join(" ") : ""; process.stdout.write(args);' "$PM2_NAME")"
printf 'PM2_EXEC_CWD=%s\n' "$pm2_exec_cwd"
printf 'PM2_EXEC_PATH=%s\n' "$pm2_exec_path"
printf 'PM2_ARGS=%s\n' "$pm2_args"

asset_js="$(find dist/assets -maxdepth 1 -type f -name 'index-*.js' | sort | tail -n 1)"
asset_css="$(find dist/assets -maxdepth 1 -type f -name 'index-*.css' | sort | tail -n 1)"
served_asset="$(curl -fsSL "$DOMAIN" | grep -oE '/assets/index-[^"]+\.js' | head -n 1 || true)"

printf 'LOCAL_ASSET_JS=%s\n' "$(basename "$asset_js")"
printf 'LOCAL_ASSET_CSS=%s\n' "$(basename "$asset_css")"
printf 'LOCAL_ASSET_JS_SHA256=%s\n' "$(sha256sum "$asset_js" | awk '{print $1}')"
printf 'SERVED_ASSET_PATH=%s\n' "$served_asset"

log "Waiting for local and live health checks"
wait_for_health_checks
