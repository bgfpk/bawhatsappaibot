// src/services/whatsapp-cloud-api-service-window.ts
//
// Authoritative 24-Hour Customer Service Window Evaluator and Resolver for WhatsApp Cloud API.
//
// Meta Service-Window Contract:
// - Rolling 24-hour window refreshed ONLY by a real inbound customer WhatsApp message.
// - Duration: 24 * 60 * 60 * 1000 ms (86,400,000 ms).
// - At exactly the 24h boundary (and beyond), the window is closed (fail closed).
// - Subtractive clock skew only (never extends beyond 24 hours).
// - Template sends, status callbacks, outbound messages, synthetic messages NEVER open/refresh the window.

export const WHATSAPP_SERVICE_WINDOW_DURATION_MS = 24 * 60 * 60 * 1000; // 86,400,000 ms

export type WhatsAppCloudServiceWindowReason =
  | "window_open"
  | "window_expired"
  | "no_inbound_history"
  | "invalid_timestamp";

export interface WhatsAppCloudServiceWindowEvaluation {
  isOpen: boolean;
  latestInboundAt: number | null;
  expiresAt: number | null;
  remainingMs: number;
  reason: WhatsAppCloudServiceWindowReason;
}

/**
 * Normalizes any timestamp representation into epoch milliseconds.
 * Handles epoch seconds (e.g. 10-digit) and epoch milliseconds (e.g. 13-digit).
 */
export function normalizeTimestampToMs(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  // If timestamp is in seconds (less than 100 billion, i.e., before year 5138 in seconds)
  return num < 100000000000 ? Math.floor(num * 1000) : Math.floor(num);
}

/**
 * Pure evaluator for WhatsApp Cloud API 24-hour customer service window.
 *
 * @param latestInboundAt - Milliseconds (or seconds) of the latest accepted inbound customer message
 * @param nowMs - Current epoch milliseconds (defaults to Date.now())
 */
export function evaluateWhatsAppCloudServiceWindow(
  latestInboundAt?: number | null,
  nowMs: number = Date.now()
): WhatsAppCloudServiceWindowEvaluation {
  const currentNow = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const inboundMs = normalizeTimestampToMs(latestInboundAt);

  if (inboundMs === null) {
    return {
      isOpen: false,
      latestInboundAt: null,
      expiresAt: null,
      remainingMs: 0,
      reason: "no_inbound_history",
    };
  }

  const expiresAt = inboundMs + WHATSAPP_SERVICE_WINDOW_DURATION_MS;
  const remainingMs = Math.max(0, expiresAt - currentNow);

  // Exact boundary or past boundary: fail closed
  if (currentNow >= expiresAt || remainingMs <= 0) {
    return {
      isOpen: false,
      latestInboundAt: inboundMs,
      expiresAt,
      remainingMs: 0,
      reason: "window_expired",
    };
  }

  return {
    isOpen: true,
    latestInboundAt: inboundMs,
    expiresAt,
    remainingMs,
    reason: "window_open",
  };
}

/**
 * Resolves the authoritative service window state for a customer.
 * Inspects customer profile's `lastInboundWhatsAppAt` (or `lastInboundAt`).
 */
export async function resolveCustomerServiceWindow(params: {
  customerProfile?: any;
  latestInboundTimestamp?: number | null;
  nowMs?: number;
}): Promise<WhatsAppCloudServiceWindowEvaluation> {
  const { customerProfile, latestInboundTimestamp, nowMs } = params;

  let candidateTimestamp: any = latestInboundTimestamp;

  if (candidateTimestamp === undefined || candidateTimestamp === null) {
    const profile = customerProfile && typeof customerProfile === "object" ? customerProfile : {};
    candidateTimestamp =
      profile.lastInboundWhatsAppAt ??
      profile.lastInboundAt ??
      profile.last_inbound_whatsapp_at ??
      null;
  }

  return evaluateWhatsAppCloudServiceWindow(candidateTimestamp, nowMs);
}
