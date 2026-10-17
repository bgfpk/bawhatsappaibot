export function normalizeOrderCreatedAt(value: any, fallbackSeconds = Math.floor(Date.now() / 1000)) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }

  const parsed = Date.parse(String(value || ""));
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);

  return fallbackSeconds;
}

export function toOrderCreatedAtIso(createdAtSeconds: number) {
  return new Date(createdAtSeconds * 1000).toISOString();
}
