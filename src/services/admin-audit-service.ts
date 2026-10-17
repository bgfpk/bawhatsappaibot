import crypto from "node:crypto";

export interface AdminAuditEvent {
  id: string;
  accountId: string;
  adminJidMasked: string;
  botId: string;
  requestId: string;
  actionId: string;
  riskLevel: string;
  timestamp: number;
  confirmationRequired: boolean;
  confirmationResult?: "confirmed" | "cancelled" | "expired" | "none" | "pending";
  executionResult: "success" | "denied" | "failed" | "pending_confirmation" | "unsupported";
  failureReason?: string;
  metadata?: Record<string, any>;
  durationMs?: number;
}

const AUDIT_STORE: AdminAuditEvent[] = [];
const MAX_AUDIT_EVENTS = 2000;

/**
 * Safely masks a JID or phone for logging and auditing.
 * e.g. "contact-e4ed32210a80@example.invalid" -> "+92 300 *** 567"
 */
export function maskAdminIdentity(jidOrPhone: string): string {
  const clean = String(jidOrPhone || "").trim();
  if (!clean) return "—";
  const rawNumber = clean.split("@")[0].replace(/\D/g, "");
  if (!rawNumber) return clean;
  if (rawNumber.length <= 4) return "***";
  if (rawNumber.length <= 8) return `${rawNumber.slice(0, 2)}***${rawNumber.slice(-2)}`;
  return `+${rawNumber.slice(0, 3)} *** ${rawNumber.slice(-3)}`;
}

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth(orization)?/i,
  /bearer/i,
  /cookie/i,
  /otp/i,
  /pin/i,
  /credit[_-]?card/i,
  /cvv/i,
  /2fa/i,
];

/**
 * Deeply redacts sensitive keys and values from objects before logging or auditing.
 */
export function redactSensitiveData(value: any, depth = 0): any {
  if (depth > 5) return "[Truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Redact JWT tokens, long base64 strings, or bearer strings
    if (value.startsWith("eyJ") && value.length > 30) return "[REDACTED_JWT]";
    if (/bearer\s+[a-z0-9._-]+/i.test(value)) return "[REDACTED_BEARER_TOKEN]";
    return value;
  }
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(k));
    if (isSensitiveKey) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = redactSensitiveData(v, depth + 1);
    }
  }
  return result;
}

/**
 * Records a privileged admin audit event with automatic secret redaction and masking.
 */
export function recordAdminAuditEvent(
  event: Partial<AdminAuditEvent> & {
    accountId: string;
    actionId: string;
    riskLevel: string;
  }
): AdminAuditEvent {
  const now = Date.now();
  const id = `audit_${now}_${crypto.randomBytes(4).toString("hex")}`;

  const cleanEvent: AdminAuditEvent = {
    id,
    accountId: String(event.accountId).trim(),
    adminJidMasked: maskAdminIdentity(event.adminJidMasked || ""),
    botId: String(event.botId || "").trim(),
    requestId: String(event.requestId || id).trim(),
    actionId: String(event.actionId).trim(),
    riskLevel: String(event.riskLevel).trim(),
    timestamp: now,
    confirmationRequired: Boolean(event.confirmationRequired),
    confirmationResult: event.confirmationResult || "none",
    executionResult: event.executionResult || "success",
    failureReason: event.failureReason ? String(event.failureReason).slice(0, 500) : undefined,
    metadata: event.metadata ? redactSensitiveData(event.metadata) : undefined,
    durationMs: event.durationMs,
  };

  AUDIT_STORE.unshift(cleanEvent);
  if (AUDIT_STORE.length > MAX_AUDIT_EVENTS) {
    AUDIT_STORE.length = MAX_AUDIT_EVENTS;
  }

  return cleanEvent;
}

/**
 * Retrieves audit events scoped strictly to an account.
 */
export function getAdminAuditEvents(accountId: string, limit = 50): AdminAuditEvent[] {
  const cleanId = String(accountId || "").trim();
  if (!cleanId) return [];
  return AUDIT_STORE.filter((item) => item.accountId === cleanId).slice(0, limit);
}

/**
 * Clears the audit store (used in tests).
 */
export function clearAuditStoreForTest(): void {
  AUDIT_STORE.length = 0;
}
