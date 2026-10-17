export const FOLLOWUP_SCAN_INTERVAL_MS = 15 * 60 * 1000;
export const FOLLOWUP_WINDOW_SECONDS = 60 * 60;
export const FOLLOWUP_MAX_WINDOW_HOURS = 6;

export function isFollowupActive(value: any) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

export function isFollowupSchedulerEnabled(env: Record<string, any> = process.env) {
  return String(env.FOLLOWUP_SCHEDULER_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

export function normalizeFollowupHours(value: any, fallback = 24) {
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours : fallback;
}

export function normalizeFollowupWindowHours(value: any, fallback = 1) {
  const hours = Number(value);
  const normalized = Number.isFinite(hours) && hours > 0 ? hours : fallback;
  return Math.min(normalized, FOLLOWUP_MAX_WINDOW_HOURS);
}

export function isWithinFollowupWindow(lastMessageAt: any, nowSeconds: number, hours: any, windowHours: any = 1) {
  const start = normalizeFollowupHours(hours, 24) * 60 * 60;
  const end = start + normalizeFollowupWindowHours(windowHours, 1) * 60 * 60;
  const elapsed = nowSeconds - Number(lastMessageAt || 0);
  return elapsed >= start && elapsed <= end;
}

export function parseFollowupList(raw: any) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseSentFollowupIds(raw: any) {
  const parsed = parseFollowupList(raw);
  return parsed.map((id: any) => String(id || "")).filter(Boolean);
}

export function hasDeliveredFollowupResponse(payload: any) {
  return Boolean(payload?.success && payload?.sentMessageId);
}
