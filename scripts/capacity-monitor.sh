#!/usr/bin/env bash
set -Eeuo pipefail

# BlackArrow Ongoing System Capacity Monitor
# Scheduled via systemd timer / cron every 15 minutes. Safe & structured.

log_tag="blackarrow-capacity"

log_info() {
  echo "[INFO] $*"
  logger -t "$log_tag" -p user.info "$*" 2>/dev/null || true
}

log_warn() {
  echo "[WARNING] $*"
  logger -t "$log_tag" -p user.warning "$*" 2>/dev/null || true
}

# 1. Disk & Inode Metrics
df_line="$(df -BG / | tail -1)"
avail_gb="$(echo "$df_line" | awk '{print $4}' | sed 's/G//')"
used_pct="$(echo "$df_line" | awk '{print $5}' | sed 's/%//')"

df_inode="$(df -i / | tail -1)"
inode_used_pct="$(echo "$df_inode" | awk '{print $5}' | sed 's/%//')"

# 2. Releases Directory Metrics
releases_dir="/root/blackarrow-public-web/releases"
release_count=0
releases_size="0B"
if [[ -d "$releases_dir" ]]; then
  release_count="$(find "$releases_dir" -maxdepth 1 -mindepth 1 -type d | wc -l)"
  releases_size="$(du -sh "$releases_dir" 2>/dev/null | awk '{print $1}' || echo "0B")"
fi

# 3. Log Directory Metrics
nginx_log_size="$(du -sh /var/log/nginx 2>/dev/null | awk '{print $1}' || echo "0B")"

# 4. Dashboard Database & Media Metrics
db_size="$(du -sh /root/blackarrow/data 2>/dev/null | awk '{print $1}' || echo "0B")"
media_size="$(du -sh /root/blackarrow/media 2>/dev/null | awk '{print $1}' || echo "0B")"
sessions_size="$(du -sh /root/blackarrow/data/sessions 2>/dev/null | awk '{print $1}' || echo "0B")"


summary="Capacity Snapshot: Disk Used ${used_pct}% (${avail_gb} GB Free), Inodes Used ${inode_used_pct}%, Releases Count ${release_count} (${releases_size}), Nginx Logs (${nginx_log_size}), DB (${db_size}), Media (${media_size}), Sessions (${sessions_size})"
log_info "$summary"

# 5. Threshold Evaluation & Warning Logs
if (( used_pct >= 90 )); then
  log_warn "CRITICAL: VPS disk usage is at ${used_pct}%! Immediate cleanup required."
elif (( used_pct >= 80 )); then
  log_warn "WARNING: VPS disk usage reached ${used_pct}% threshold."
fi

if (( avail_gb < 10 )); then
  log_warn "WARNING: Free disk space (${avail_gb} GB) is below 10 GB threshold."
fi

if (( inode_used_pct >= 85 )); then
  log_warn "WARNING: Inode usage reached ${inode_used_pct}% threshold."
fi

if (( release_count > 5 )); then
  log_warn "WARNING: Public web release count (${release_count}) exceeds retention limit (5)."
fi
