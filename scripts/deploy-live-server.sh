#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/blackarrow}"
PM2_NAME="${PM2_NAME:-blackarrow}"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/root/deploy-backups}"
DOMAIN="${DOMAIN:-https://blackarrow-source.offline.invalid}"

case "${1:-}" in
  -h|--help)
    cat <<'HELP'
Usage: deploy-blackarrow

Pulls origin/main in /root/blackarrow, backs up runtime WhatsApp/Appwrite
files, runs npm ci, type-checks, builds, restarts PM2 process blackarrow,
and prints recent AI reply logs.

Environment overrides:
  APP_DIR=/root/blackarrow
  PM2_NAME=blackarrow
  BRANCH=main
  BACKUP_DIR=/root/deploy-backups
  DOMAIN=https://blackarrow-source.offline.invalid
HELP
    exit 0
    ;;
esac

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

cd "$APP_DIR"

log "Deploying $APP_DIR from origin/$BRANCH"
git status --short --branch

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy because tracked files on the VPS have local edits."
  echo "Fix them on the VPS or commit/stash them before deploying."
  git status --short
  exit 1
fi

stamp="$(date '+%Y%m%d-%H%M%S')"
mkdir -p "$BACKUP_DIR"

log "Backing up runtime files to $BACKUP_DIR/blackarrow-$stamp.tgz"
tar --ignore-failed-read -czf "$BACKUP_DIR/blackarrow-$stamp.tgz" \
  .env \
  bot_config*.json \
  auth_info_baileys_bot_* \
  local_store*.json \
  local.db \
  local.db-* \
  2>/dev/null || true

log "Pulling latest code"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "Installing exact dependencies"
npm ci

log "Type-checking"
npm run lint

log "Building frontend and server bundle"
npm run build

log "Restarting PM2 process: $PM2_NAME"
pm2 restart "$PM2_NAME" --update-env
pm2 save

log "PM2 status"
pm2 status "$PM2_NAME"

log "Domain check"
curl -fsSI --max-time 20 "$DOMAIN" | head -n 1 || true

log "Recent AI/reply log lines"
pm2 logs "$PM2_NAME" --lines 120 --nostream \
  | grep -Ei "Dispatched to AI Handler|AI-Process|Secondary text|Text reply delivered|AI returned empty|Error replying|Gemini API error|timeout" \
  || true

log "Done. $DOMAIN is deployed."
