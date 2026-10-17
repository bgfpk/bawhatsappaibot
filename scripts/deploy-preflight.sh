#!/usr/bin/env bash
set -Eeuo pipefail

# Deployment Disk-Space Preflight Guard
# Verifies root filesystem available bytes (>= 10 GB), free space (>= 15%), and available inodes (>= 10%).

MIN_FREE_GB="${MIN_FREE_GB:-10}"
MIN_FREE_PCT="${MIN_FREE_PCT:-15}"
MIN_INODE_PCT="${MIN_INODE_PCT:-10}"

log() {
  printf '[PREFLIGHT] %s\n' "$*"
}

log "Running Deployment Disk-Space Preflight Guard..."

# Extract df output for root /
df_output="$(df -BG / | tail -1)"
avail_gb="$(echo "$df_output" | awk '{print $4}' | sed 's/G//')"
used_pct="$(echo "$df_output" | awk '{print $5}' | sed 's/%//')"
free_pct=$(( 100 - used_pct ))

# Extract df -i output for root /
df_inode="$(df -i / | tail -1)"
inode_used_pct="$(echo "$df_inode" | awk '{print $5}' | sed 's/%//')"
inode_free_pct=$(( 100 - inode_used_pct ))

log "Root Filesystem Status: Free ${avail_gb} GB (${free_pct}% available), Inodes ${inode_free_pct}% free."

failed=false

if (( avail_gb < MIN_FREE_GB )); then
  log "FAIL: Available disk space (${avail_gb} GB) is below minimum required threshold (${MIN_FREE_GB} GB)."
  failed=true
fi

if (( free_pct < MIN_FREE_PCT )); then
  log "FAIL: Available disk space percentage (${free_pct}%) is below minimum required threshold (${MIN_FREE_PCT}%)."
  failed=true
fi

if (( inode_free_pct < MIN_INODE_PCT )); then
  log "FAIL: Available inode percentage (${inode_free_pct}%) is below minimum required threshold (${MIN_INODE_PCT}%)."
  failed=true
fi

if [[ "$failed" == true ]]; then
  log "DEPLOYMENT BLOCKED: Insufficient VPS capacity."
  log "Largest directories on system:"
  du -sh /root/* /var/log/* /var/lib/docker/* 2>/dev/null | sort -hr | head -10 || true
  exit 15
fi

log "SUCCESS: Preflight capacity check passed. Safe to proceed with deployment."
