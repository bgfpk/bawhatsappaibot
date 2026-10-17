export type CourierBroadcastItemResult = {
  trackingId: string;
  status: "sent_fresh" | "duplicate_not_resent" | "failed" | "skipped" | "sent" | "duplicate";
  reason?: string;
  messageId?: string;
};

export type CourierBroadcastSummary = {
  success: boolean;
  total: number;
  freshSent: number;
  duplicate: number;
  sent: number;
  failed: number;
  skipped: number;
  results: CourierBroadcastItemResult[];
  message: string;
};

const SECRETISH_PATTERNS = [
  /token["'\s:=]+[^"',\s<>]+/gi,
  /api[_-]?key["'\s:=]+[^"',\s<>]+/gi,
  /api[_-]?password["'\s:=]+[^"',\s<>]+/gi,
  /authorization["'\s:=]+[^"',\s<>]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
];

export function parseCourierTrackingIds(value: any): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  String(value || "")
    .split(/[\s,]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      ids.push(item);
    });
  return ids;
}

export function sanitizeCourierText(value: any, maxLength = 180) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  for (const pattern of SECRETISH_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const key = match.split(/["'\s:=]+/)[0] || "secret";
      return `${key}: [redacted]`;
    });
  }
  text = text.replace(/https?:\/\/\S+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return "[redacted-url]";
    }
  });
  if (text.length > maxLength) return `${text.slice(0, maxLength).trim()}...`;
  return text;
}

export function getCourierErrorMessage(error: any, fallback = "Courier broadcast failed") {
  return sanitizeCourierText(error?.userMessage || error?.message || error || fallback);
}

export function buildCourierBroadcastSummary(results: CourierBroadcastItemResult[]): CourierBroadcastSummary {
  const freshSent = results.filter((item) => item.status === "sent_fresh" || item.status === "sent").length;
  const duplicate = results.filter((item) => item.status === "duplicate_not_resent" || item.status === "duplicate").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const total = results.length;
  return {
    success: failed === 0,
    total,
    freshSent,
    duplicate,
    sent: freshSent,
    failed,
    skipped,
    results,
    message: `Broadcast complete. Fresh sent: ${freshSent}, Duplicates: ${duplicate}, Failed: ${failed}, Skipped: ${skipped}.`,
  };
}
