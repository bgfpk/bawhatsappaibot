const locks = new Map<string, number>();
const LOCK_SECONDS = 24 * 60 * 60;

function key(dataOwnerKey: string, jid: string) {
  return `${dataOwnerKey}::${jid}`;
}

export function hasRecentPhoneRequestLock(dataOwnerKey: string, jid: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const until = locks.get(key(dataOwnerKey, jid)) || 0;
  if (until > nowSeconds) return true;
  if (until) locks.delete(key(dataOwnerKey, jid));
  return false;
}

export function markPhoneRequestLock(dataOwnerKey: string, jid: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  locks.set(key(dataOwnerKey, jid), nowSeconds + LOCK_SECONDS);
}
