export type InstanceConnectionUiStatus = "connected" | "qr-ready" | "retrying" | "stopped" | "needs_attention" | "connecting";

const TEMPORARY_ISSUE_RE = /\b(timeout|timed out|etimedout|econnreset|econnrefused|socket hang up|fetch failed|network|proxy unavailable|no active proxy|connection closed|transport close|xhr poll error|websocket error)\b/i;
const ATTENTION_ISSUE_RE = /\b(logged out|auth corruption|bad session|permission|locked to another|account suspended|forbidden|unauthorized|intentional logout|user stopped)\b/i;

function clean(value: any, limit = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function isTemporaryInstanceConnectionIssue(value: any) {
  const text = clean(value).toLowerCase();
  return Boolean(text) && TEMPORARY_ISSUE_RE.test(text) && !ATTENTION_ISSUE_RE.test(text);
}

export function normalizeTemporaryInstanceIssue(value: any) {
  const text = clean(value);
  if (!text) return "temporary connection issue";
  if (/\b(no active proxy|proxy unavailable)\b/i.test(text)) return "proxy temporarily unavailable";
  if (/\b(timeout|timed out|etimedout)\b/i.test(text)) return "network timeout";
  if (/\b(socket|transport|connection closed|econnreset|econnrefused)\b/i.test(text)) return "temporary socket issue";
  if (/\bnetwork|fetch failed\b/i.test(text)) return "temporary network issue";
  return "temporary connection issue";
}

export function mapInstanceConnectionStatus(input: {
  status?: any;
  issue?: any;
  retryCount?: any;
  nextRetryMs?: any;
}) {
  const status = clean(input.status);
  const issue = clean(input.issue);
  const retryCount = Math.max(0, Number(input.retryCount || 0));
  const temporary = status === "retrying" || isTemporaryInstanceConnectionIssue(issue);
  if (status === "connected") return { status: "connected" as const, retryCount: 0, lastIssue: "", nextRetrySeconds: 0 };
  if (status === "qr-ready") return { status: "qr-ready" as const, retryCount: 0, lastIssue: "", nextRetrySeconds: 0 };
  if (status === "stopped") return { status: "stopped" as const, retryCount: 0, lastIssue: "", nextRetrySeconds: 0 };
  if (temporary) {
    return {
      status: "retrying" as const,
      retryCount: Math.max(1, retryCount),
      lastIssue: normalizeTemporaryInstanceIssue(issue),
      nextRetrySeconds: Math.max(1, Math.ceil(Number(input.nextRetryMs || 0) / 1000)),
    };
  }
  if (status === "error") return { status: "needs_attention" as const, retryCount, lastIssue: issue, nextRetrySeconds: 0 };
  return { status: "connecting" as const, retryCount, lastIssue: "", nextRetrySeconds: 0 };
}

export function shouldHideNormalInstanceLog(value: any) {
  const text = clean(value);
  return /^engine socket error:\s*/i.test(text) && isTemporaryInstanceConnectionIssue(text);
}
