export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Karachi";

export const COMMON_BUSINESS_TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

function clean(value: any) {
  return String(value || "").trim();
}

export function isValidBusinessTimezone(timezone: any) {
  const candidate = clean(timezone);
  if (!candidate) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getExplicitAccountTimezone(config: any = {}): string | null {
  const candidate = clean(
    config?.businessTimezone ||
    config?.business_timezone ||
    config?.timezone ||
    config?.time_zone
  );
  return isValidBusinessTimezone(candidate) ? candidate : null;
}

export function hasConfiguredTimezone(config: any = {}): boolean {
  return Boolean(getExplicitAccountTimezone(config));
}

export function resolveBusinessTimezone(config: any = {}, fallback: string = DEFAULT_BUSINESS_TIMEZONE): string {
  const explicit = getExplicitAccountTimezone(config);
  return explicit || fallback;
}

export function formatBusinessDateTime(date: Date | number | string = new Date(), timezone?: any) {
  const resolvedTimezone = resolveBusinessTimezone({ businessTimezone: timezone });
  const parsed = date instanceof Date ? date : new Date(date);
  const safeDate = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTimezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(safeDate);
}

export function buildBusinessDateTimeContext(config: any = {}, date: Date | number | string = new Date()) {
  const timezone = resolveBusinessTimezone(config);
  return {
    timezone,
    currentDateTime: formatBusinessDateTime(date, timezone),
  };
}
