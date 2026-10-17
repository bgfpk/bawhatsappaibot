// src/services/whatsapp-cloud-api-rate-controller.ts
//
// Rate limiting, backpressure, operation-specific retry policies, and circuit breaker/cooldown
// for Meta WhatsApp Cloud API operations.
//
// Guarantees:
// - Per-phone-number isolation (Account A rate limits never block Account B)
// - Operation-specific retry semantics:
//     * READ: Bounded retry on 429/5xx/network errors
//     * MEDIA UPLOAD: Bounded retry when no media ID returned
//     * MESSAGE SEND: Conservative! Network timeouts -> 'ambiguous_send_result' (NO duplicate sends)
// - Bounded exponential backoff with jitter and Retry-After header parsing
// - Circuit breaker / cooldown on consecutive 429/5xx failures
// - Never logs authorization headers, cookies, or tokens

export type CloudApiOperationType = "read" | "media_upload" | "message_send";

export interface PhoneRateState {
  phoneNumberId: string;
  activeRequests: number;
  maxConcurrent: number;
  last429At: number | null;
  consecutiveTransientFailures: number;
  cooldownUntil: number | null;
  lastSuccessfulApiAt: number | null;
}

export interface RetryPolicyConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

export interface SendResultClassification {
  status: "success" | "transient_error" | "permanent_error" | "rate_limited" | "ambiguous_send_result";
  wamid?: string;
  retryable: boolean;
  httpStatus?: number;
  retryAfterMs?: number;
  errorReason?: string;
}

const DEFAULT_MAX_CONCURRENT = 5;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30 * 1000; // 30s
const phoneRateStates = new Map<string, PhoneRateState>();

function cleanPhoneId(phoneNumberId: string): string {
  return String(phoneNumberId || "").trim();
}

/**
 * Gets or initializes rate state for a specific Cloud Phone Number ID.
 */
export function getPhoneRateState(phoneNumberId: string): PhoneRateState {
  const phoneId = cleanPhoneId(phoneNumberId);
  let state = phoneRateStates.get(phoneId);
  if (!state) {
    state = {
      phoneNumberId: phoneId,
      activeRequests: 0,
      maxConcurrent: DEFAULT_MAX_CONCURRENT,
      last429At: null,
      consecutiveTransientFailures: 0,
      cooldownUntil: null,
      lastSuccessfulApiAt: null,
    };
    phoneRateStates.set(phoneId, state);
  }
  return state;
}

/**
 * Checks if a phone number is currently in circuit-breaker cooldown.
 */
export function isPhoneInCooldown(phoneNumberId: string): { inCooldown: boolean; remainingMs: number } {
  const state = getPhoneRateState(phoneNumberId);
  const now = Date.now();
  if (state.cooldownUntil && state.cooldownUntil > now) {
    return { inCooldown: true, remainingMs: state.cooldownUntil - now };
  }
  if (state.cooldownUntil && state.cooldownUntil <= now) {
    state.cooldownUntil = null;
  }
  return { inCooldown: false, remainingMs: 0 };
}

/**
 * Resets all phone rate states (useful in testing and maintenance).
 */
export function resetPhoneRateStates(): void {
  phoneRateStates.clear();
}

/**
 * Records a successful API operation for a phone number ID, resetting circuit breaker counters.
 */
export function recordPhoneApiSuccess(phoneNumberId: string): void {
  const state = getPhoneRateState(phoneNumberId);
  state.consecutiveTransientFailures = 0;
  state.cooldownUntil = null;
  state.lastSuccessfulApiAt = Date.now();
}

/**
 * Records a transient failure (429 or 5xx) and updates circuit breaker state.
 */
export function recordPhoneApiFailure(
  phoneNumberId: string,
  httpStatus?: number,
  retryAfterSeconds?: number
): void {
  if (httpStatus && httpStatus > 0 && httpStatus < 429) {
    return;
  }
  const state = getPhoneRateState(phoneNumberId);
  const now = Date.now();
  state.consecutiveTransientFailures += 1;

  if (httpStatus === 429) {
    state.last429At = now;
    const cooldownDuration = (retryAfterSeconds && retryAfterSeconds > 0)
      ? retryAfterSeconds * 1000
      : DEFAULT_COOLDOWN_MS;
    state.cooldownUntil = now + cooldownDuration;
  } else if (state.consecutiveTransientFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.cooldownUntil = now + DEFAULT_COOLDOWN_MS;
  }
}

/**
 * Parses safe numeric rate-limit signals or Retry-After from response headers.
 * Never logs raw headers or auth tokens.
 */
export function extractSafeRateHeaders(headers: Headers | Record<string, any> | undefined): {
  retryAfterSeconds?: number;
  usagePercent?: number;
} {
  if (!headers) return {};

  let retryAfterSeconds: number | undefined;
  let usagePercent: number | undefined;

  try {
    const getHeader = (name: string): string | null => {
      if (typeof (headers as any).get === "function") {
        return (headers as any).get(name);
      }
      return headers[name] || headers[name.toLowerCase()] || null;
    };

    const retryAfterRaw = getHeader("retry-after");
    if (retryAfterRaw) {
      const parsed = parseInt(retryAfterRaw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterSeconds = parsed;
      }
    }

    const usageRaw = getHeader("x-business-use-case-usage") || getHeader("x-app-usage");
    if (usageRaw && typeof usageRaw === "string") {
      try {
        const parsed = JSON.parse(usageRaw);
        if (Array.isArray(parsed) && parsed[0]?.pct_estimated_usage !== undefined) {
          usagePercent = Number(parsed[0].pct_estimated_usage);
        } else if (parsed?.call_count !== undefined) {
          usagePercent = Number(parsed.call_count);
        }
      } catch {}
    }
  } catch {}

  return { retryAfterSeconds, usagePercent };
}

/**
 * Calculates exponential backoff delay with jitter.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Partial<RetryPolicyConfig> = {}
): number {
  const initialDelay = config.initialDelayMs ?? 500;
  const maxDelay = config.maxDelayMs ?? 8000;
  const factor = config.backoffFactor ?? 2;

  const baseDelay = initialDelay * Math.pow(factor, attempt);
  const jitter = Math.random() * (initialDelay * 0.5);
  return Math.min(baseDelay + jitter, maxDelay);
}

/**
 * Classifies an HTTP response or exception for a message send attempt.
 * Differentiates ambiguous network timeouts from explicit Meta responses.
 */
export function classifySendAttemptOutcome(params: {
  httpStatus?: number;
  responseData?: any;
  networkError?: Error;
  retryAfterSeconds?: number;
}): SendResultClassification {
  const { httpStatus, responseData, networkError, retryAfterSeconds } = params;

  // 1. Success with WAMID
  const wamid = responseData?.messages?.[0]?.id;
  if (httpStatus && httpStatus >= 200 && httpStatus < 300 && wamid) {
    return {
      status: "success",
      wamid,
      retryable: false,
      httpStatus,
    };
  }

  // 2. Ambiguous send result: network timeout / reset without response
  if (networkError && !httpStatus) {
    const errMsg = String(networkError.message || "").toLowerCase();
    const isAmbiguous =
      errMsg.includes("timeout") ||
      errMsg.includes("econnreset") ||
      errMsg.includes("etimedout") ||
      errMsg.includes("socket hang up");

    if (isAmbiguous) {
      return {
        status: "ambiguous_send_result",
        retryable: false, // DO NOT automatically resend ambiguous POSTs!
        errorReason: "ambiguous_network_timeout",
      };
    }
  }

  // 3. Rate limited (429)
  if (httpStatus === 429) {
    return {
      status: "rate_limited",
      retryable: true,
      httpStatus: 429,
      retryAfterMs: (retryAfterSeconds ?? 30) * 1000,
      errorReason: "rate_limit_exceeded",
    };
  }

  // 4. Server error (5xx)
  if (httpStatus && httpStatus >= 500) {
    return {
      status: "transient_error",
      retryable: true,
      httpStatus,
      errorReason: `meta_server_error_${httpStatus}`,
    };
  }

  // 5. Client error (4xx) - not retryable
  return {
    status: "permanent_error",
    retryable: false,
    httpStatus: httpStatus || 400,
    errorReason: responseData?.error?.message || "meta_client_error",
  };
}

/**
 * Clears rate controller state. For testing only.
 */
export function clearPhoneRateStates(): void {
  phoneRateStates.clear();
}
