#!/usr/bin/env bash
set -Eeu
set -o pipefail 2>/dev/null || true

PUBLIC_WEB_ROOT="${PUBLIC_WEB_ROOT:-/root/blackarrow-public-web}"
PUBLIC_WEB_PORT="${PUBLIC_WEB_PORT:-3102}"
SOURCE_DIR="$PUBLIC_WEB_ROOT/source"
RELEASES_DIR="$PUBLIC_WEB_ROOT/releases"
LOG_DIR="$PUBLIC_WEB_ROOT/logs"
CURRENT_LINK="$PUBLIC_WEB_ROOT/current"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:?REPO_URL is required}"
EXPECTED_COMMIT="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
PM2_NAME="blackarrow-public-web"
HEALTH_URL="http://127.0.0.1:${PUBLIC_WEB_PORT}/health"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

for command in git npm pm2 curl node; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command"; exit 10; }
done

if [[ ! "$PUBLIC_WEB_PORT" =~ ^[0-9]+$ ]] || (( PUBLIC_WEB_PORT < 1024 || PUBLIC_WEB_PORT > 65535 )); then
  echo "DEPLOY_BLOCKED=invalid_public_web_port"
  exit 9
fi

log "Running VPS deployment disk preflight guard"
df_line="$(df -BG / | tail -1)"
avail_gb="$(echo "$df_line" | awk '{print $4}' | sed 's/G//')"
used_pct="$(echo "$df_line" | awk '{print $5}' | sed 's/%//')"
free_pct=$(( 100 - used_pct ))

df_inode="$(df -i / | tail -1)"
inode_used_pct="$(echo "$df_inode" | awk '{print $5}' | sed 's/%//')"
inode_free_pct=$(( 100 - inode_used_pct ))

if (( avail_gb < 10 || free_pct < 15 || inode_free_pct < 10 )); then
  echo "DEPLOY_BLOCKED=vps_disk_preflight_failed"
  printf 'AVAIL_GB=%s\nFREE_PCT=%s\nINODE_FREE_PCT=%s\n' "$avail_gb" "$free_pct" "$inode_free_pct"
  echo "Largest directories on VPS:"
  du -sh /root/* /var/log/* /var/lib/docker/* 2>/dev/null | sort -hr | head -10 || true
  exit 15
fi
log "Preflight passed: Free ${avail_gb} GB (${free_pct}% free), Inodes ${inode_free_pct}% free."

mkdir -p "$PUBLIC_WEB_ROOT" "$RELEASES_DIR" "$LOG_DIR"


if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  if [[ -e "$SOURCE_DIR" ]]; then
    echo "DEPLOY_BLOCKED=source_path_exists_without_git"
    exit 11
  fi
  log "Creating dedicated public-web source checkout"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$SOURCE_DIR"
fi

cd "$SOURCE_DIR"
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "DEPLOY_BLOCKED=dirty_public_web_source"
  git status --short --untracked-files=all
  exit 12
fi

configured_origin="$(git remote get-url origin)"
if [[ "$configured_origin" != "$REPO_URL" ]]; then
  echo "DEPLOY_BLOCKED=unexpected_origin"
  printf 'EXPECTED_ORIGIN=%s\nACTUAL_ORIGIN=%s\n' "$REPO_URL" "$configured_origin"
  exit 13
fi

log "Fetching approved branch"
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
git checkout -B "$BRANCH" "$EXPECTED_COMMIT"
target_commit="$(git rev-parse HEAD)"
if [[ "$target_commit" != "$EXPECTED_COMMIT" ]]; then
  echo "DEPLOY_BLOCKED=unexpected_commit"
  printf 'EXPECTED_COMMIT=%s\nACTUAL_COMMIT=%s\n' "$EXPECTED_COMMIT" "$target_commit"
  exit 14
fi

release_id="$(date -u '+%Y%m%dT%H%M%SZ')-${target_commit:0:12}"
release_dir="$RELEASES_DIR/$release_id"
log "Creating immutable release $release_id"
git worktree add --detach "$release_dir" "$target_commit"

app_dir="$release_dir/apps/web"
cd "$app_dir"
log "Installing locked dependencies"
npm ci
log "Running lint"
npm run lint
log "Running typecheck"
npm run typecheck
log "Running tests"
npm run test
log "Building Next.js production output"
npm run build

previous_release=""
if [[ -L "$CURRENT_LINK" ]]; then
  previous_release="$(readlink -f "$CURRENT_LINK")"
fi

next_link="$PUBLIC_WEB_ROOT/.current-$release_id"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$CURRENT_LINK"

pm2_config="$release_dir/infra/pm2/public-web.ecosystem.config.cjs"
log "Starting or reloading only $PM2_NAME"
PUBLIC_WEB_ROOT="$PUBLIC_WEB_ROOT" PUBLIC_WEB_PORT="$PUBLIC_WEB_PORT" \
  pm2 startOrReload "$pm2_config" --only "$PM2_NAME" --update-env

healthy=false
for attempt in $(seq 1 20); do
  response="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  if [[ "$response" == *'"status":"ok"'* && "$response" == *'"service":"blackarrow-public-web"'* ]]; then
    healthy=true
    break
  fi
  printf 'HEALTH_ATTEMPT_%s=not_ready\n' "$attempt"
  sleep 3
done

if [[ "$healthy" != true ]]; then
  log "Health check failed; rolling back only the public-web process"
  pm2 logs "$PM2_NAME" --lines 100 --nostream || true
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    rollback_link="$PUBLIC_WEB_ROOT/.rollback-$release_id"
    ln -s "$previous_release" "$rollback_link"
    mv -Tf "$rollback_link" "$CURRENT_LINK"
    PUBLIC_WEB_ROOT="$PUBLIC_WEB_ROOT" PUBLIC_WEB_PORT="$PUBLIC_WEB_PORT" pm2 startOrReload \
      "$previous_release/infra/pm2/public-web.ecosystem.config.cjs" \
      --only "$PM2_NAME" --update-env
  else
    pm2 delete "$PM2_NAME" || true
  fi
  echo "FAILED_RELEASE_PRESERVED=$release_dir"
  exit 20
fi

pm2 save
printf 'PUBLIC_WEB_RELEASE=%s\nPUBLIC_WEB_COMMIT=%s\nHEALTH_URL=%s\n' \
  "$release_dir" "$target_commit" "$HEALTH_URL"

log "Enforcing safe release retention (keeping maximum 5 successful releases)"
active_target=""
if [[ -L "$CURRENT_LINK" ]]; then
  active_target="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
fi

# Collect successful release directories sorted chronologically (newest first)
mapfile -t all_releases < <(find "$RELEASES_DIR" -maxdepth 1 -mindepth 1 -type d -name "2026*" | sort -r)
retained_count=0
deleted_count=0

for rel in "${all_releases[@]}"; do
  real_rel="$(readlink -f "$rel" 2>/dev/null || echo "$rel")"
  if [[ -n "$active_target" && "$real_rel" == "$active_target" ]]; then
    log "Retaining active release: $rel"
    retained_count=$((retained_count + 1))
  elif (( retained_count < 5 )); then
    log "Retaining recent release ($retained_count/5): $rel"
    retained_count=$((retained_count + 1))
  else
    log "Deleting old release beyond retention policy: $rel"
    git -C "$SOURCE_DIR" worktree remove --force "$rel" 2>/dev/null || rm -rf "$rel"
    deleted_count=$((deleted_count + 1))
  fi
done

log "Release retention complete: $retained_count retained, $deleted_count deleted."

