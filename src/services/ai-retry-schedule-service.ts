export const AI_REPLY_RETRY_INTERVAL_MS = 60 * 1000;
export const AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS = 3;
export const AI_REPLY_RETRY_STALE_MS = 24 * 60 * 60 * 1000;

export type CanonicalCustomerReplyLifecycleStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "AI_FAILED_RETRY_PENDING"
  | "AI_COMPLETED"
  | "SEND_PENDING"
  | "SEND_FAILED_RETRY_PENDING"
  | "SEND_OUTCOME_UNKNOWN"
  | "SENT"
  | "BLOCKED"
  | "SUPERSEDED"
  | "CANCELLED";

export type AiReplyRetryStatus =
  | CanonicalCustomerReplyLifecycleStatus
  | "pending_ai_generation"
  | "retrying_ai_generation"
  | "ai_generated_pending_send"
  | "retrying_whatsapp_send"
  | "send_failed_retry_pending"
  | "sent"
  | "superseded"
  | "cancelled"
  | "blocked"
  | "blocked_insufficient_balance"
  | "blocked_subscription_expired"
  | "blocked_quota_exceeded"
  | "blocked_ai_paused"
  | "blocked_instance_disconnected"
  | "blocked_account_suspended";

const ACTIVE_RETRY_STATUSES = new Set<AiReplyRetryStatus>([
  "pending_ai_generation",
  "retrying_ai_generation",
  "ai_generated_pending_send",
  "retrying_whatsapp_send",
  "send_failed_retry_pending",
  "RECEIVED",
  "PROCESSING",
  "AI_FAILED_RETRY_PENDING",
  "AI_COMPLETED",
  "SEND_PENDING",
  "SEND_FAILED_RETRY_PENDING",
]);

const TERMINAL_RETRY_STATUSES = new Set<AiReplyRetryStatus>([
  "sent",
  "SENT",
  "superseded",
  "SUPERSEDED",
  "cancelled",
  "CANCELLED",
  "blocked",
  "BLOCKED",
  "blocked_insufficient_balance",
  "blocked_subscription_expired",
  "blocked_quota_exceeded",
  "blocked_ai_paused",
  "blocked_instance_disconnected",
  "blocked_account_suspended",
]);

const CUSTOMER_FACING_AI_DELIVERY_CONTEXTS = new Set([
  "ai_text_reply",
  "ai_voice_reply",
  "customer_ai_reply",
  "customer_ai_text_reply",
  "customer_ai_voice_reply",
  "router_direct_reply",
  "router_product_reply",
]);

export type PendingAiReplyRetry = {
  id: string;
  botId: string;
  jid: string;
  messageId: string;
  customerTurnId?: string;
  canonicalCustomerId?: string;
  conversationId?: string;
  attemptCount?: number;
  attempts: number;
  queuedAt: number;
  nextAttemptAt: number;
  lastAttemptAt?: number;
  failureStage?: string;
  sanitizedFailureReason?: string;
  sendState?: string;
  transportReceipt?: string;
  billingState?: string;
  revision?: number;
  lastCustomerMessageAt?: number;
  mergedMessageCount?: number;
  source: string;
  status: AiReplyRetryStatus;
  repliedAt?: number;
  supersededAt?: number;
  pausedAt?: number;
  lastError?: string;
  adminAlertedAt?: number;
  supersededByMessageId?: string;
  pauseReason?: string;
  failedAt?: number;
  blockedAt?: number;
  blockReason?: string;
  generatedReplyText?: string;
  generatedAt?: number;
  lockedByWorker?: string;
  lockExpiresAt?: number;
};

function trimBlock(value: any) {
  return String(value || "").trim();
}

export function buildRetryDelayMs(attempts: number): number {
  const safeAttempts = Math.max(0, Number(attempts) || 0);
  return 60 * 1000 * Math.pow(2, safeAttempts);
}

function resolveRetryStatusFromGeneratedReply(generatedReplyText: any): AiReplyRetryStatus {
  return trimBlock(generatedReplyText) ? "SEND_PENDING" : "AI_FAILED_RETRY_PENDING";
}

function normalizeBlockedRetryStatus(reason: string): AiReplyRetryStatus {
  const value = trimBlock(reason).toLowerCase();
  if (
    value.includes("wallet") ||
    value.includes("insufficient_balance") ||
    value.includes("insufficient_funds")
  ) return "blocked_insufficient_balance";
  if (
    value.includes("quota") ||
    value.includes("reply_limit") ||
    value.includes("limit_exhausted") ||
    value.includes("customer_limit") ||
    value.includes("order_limit") ||
    value.includes("lead_limit")
  ) return "blocked_quota_exceeded";
  if (value.includes("paused") || value.includes("manual_review")) return "blocked_ai_paused";
  if (value.includes("disconnect")) return "blocked_instance_disconnected";
  if (value.includes("suspend") || value.includes("blocked") || value.includes("disabled")) return "blocked_account_suspended";
  return "blocked_subscription_expired";
}

function normalizeDeliveryTimestampMs(value: any) {
  const num = Number(value || 0);
  if (!num) return 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000_000) return Math.floor(num); // epoch milliseconds
  if (abs >= 1_000_000_000) return Math.floor(num * 1000); // epoch seconds
  return Math.floor(num); // relative/test milliseconds
}

function normalizeProfileSecondsFieldToMs(value: any) {
  const num = Number(value || 0);
  if (!num) return 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000_000) return Math.floor(num); // tolerate legacy ms accidentally stored in seconds field
  return Math.floor(num * 1000);
}

export function isCustomerFacingAiDeliveryContext(contextType: any) {
  const context = trimBlock(contextType).toLowerCase();
  if (!context) return false;
  if (/manual|admin|comma|shortcut_command|sequence|template|media|broadcast|followup|customer_update/.test(context)) return false;
  return CUSTOMER_FACING_AI_DELIVERY_CONTEXTS.has(context) || /^ai_.*reply$/.test(context) || /^customer_ai_.*reply$/.test(context);
}

export function hasCustomerFacingAiDeliveryEvidence(input: {
  messageId?: any;
  receiptId?: any;
  contextType?: any;
}) {
  const messageId = trimBlock(input.messageId);
  const receiptId = trimBlock(input.receiptId);
  if (!messageId && !receiptId) return false;
  return isCustomerFacingAiDeliveryContext(input.contextType);
}

export function buildCustomerFacingAiDeliveryPatch(input: {
  messageId: any;
  receiptId?: any;
  contextType: any;
  deliveredAt?: any;
}) {
  const deliveredAtMs = normalizeDeliveryTimestampMs(input.deliveredAt || Date.now());
  return {
    lastCustomerFacingAiReplyAt: Math.floor(deliveredAtMs / 1000),
    lastCustomerFacingAiReplyAtMs: deliveredAtMs,
    lastCustomerFacingAiReplyMessageId: trimBlock(input.messageId),
    lastCustomerFacingAiReplyReceiptId: trimBlock(input.receiptId),
    lastCustomerFacingAiReplyContextType: trimBlock(input.contextType),
    lastAiReplyStatus: "sent",
    lastAiReplyCustomerSendSkipped: false,
    lastAiReplyRetryStatus: "sent",
    lastAiReplyRetryReason: "",
  };
}

export function getCustomerFacingAiDeliveryEvidence(profile: any = {}) {
  const contextType = trimBlock(profile?.lastCustomerFacingAiReplyContextType);
  const messageId = trimBlock(profile?.lastCustomerFacingAiReplyMessageId);
  const receiptId = trimBlock(profile?.lastCustomerFacingAiReplyReceiptId);
  const explicitMs = profile?.lastCustomerFacingAiReplyAtMs;
  const deliveredAtMs = explicitMs
    ? normalizeDeliveryTimestampMs(explicitMs)
    : normalizeProfileSecondsFieldToMs(profile?.lastCustomerFacingAiReplyAt);
  const ok = deliveredAtMs > 0 && hasCustomerFacingAiDeliveryEvidence({ messageId, receiptId, contextType });
  return { ok, deliveredAtMs: ok ? deliveredAtMs : 0, messageId, receiptId, contextType };
}

export function buildAiReplyRetryKey(input: {
  botId: string;
  jid?: string;
  canonicalCustomerId?: string;
  conversationId?: string;
  messageId?: string;
}) {
  const customerKey = trimBlock(input.canonicalCustomerId) || trimBlock(input.jid);
  return [
    "customer-ai-retry",
    trimBlock(input.botId),
    customerKey,
  ].join("|");
}

export function getAiReplyRetryDelayMinutes(attempts: number) {
  return Math.round(buildRetryDelayMs(attempts) / 60000);
}

export function queueAiReplyRetry(
  queue: Map<string, PendingAiReplyRetry>,
  input: {
    botId: string;
    jid: string;
    messageId: string;
    source: string;
    error?: any;
    lastCustomerMessageAt?: number;
    generatedReplyText?: string;
    generatedAt?: number;
    customerTurnId?: string;
    canonicalCustomerId?: string;
    conversationId?: string;
    failureStage?: string;
    sanitizedFailureReason?: string;
    sendState?: string;
    transportReceipt?: string;
    billingState?: string;
  },
  nowMs = Date.now(),
) {
  const id = buildAiReplyRetryKey(input);
  const existing = queue.get(id);
  const attempts = existing?.attempts || 0;
  const messageId = trimBlock(input.messageId) || existing?.messageId || "";
  const knownLastCustomerMessageAt = Math.max(
    0,
    Number(input.lastCustomerMessageAt || 0),
    Number(existing?.lastCustomerMessageAt || 0),
  );
  const lastCustomerMessageAt = knownLastCustomerMessageAt || nowMs;
  const nextAttemptAt = nowMs + buildRetryDelayMs(attempts);
  const generatedReplyText = trimBlock(input.generatedReplyText) || trimBlock(existing?.generatedReplyText);
  const generatedAt = generatedReplyText
    ? Math.max(0, Number(input.generatedAt || 0), Number(existing?.generatedAt || 0)) || nowMs
    : 0;
  const customerTurnId = trimBlock(input.customerTurnId) || existing?.customerTurnId || messageId || id;
  const canonicalCustomerId = trimBlock(input.canonicalCustomerId) || existing?.canonicalCustomerId || trimBlock(input.jid);
  const conversationId = trimBlock(input.conversationId) || existing?.conversationId || `${trimBlock(input.botId)}:${trimBlock(input.jid)}`;
  const failureStage = trimBlock(input.failureStage) || existing?.failureStage || (generatedReplyText ? "transport_send" : "ai_generation");
  const rawReason = input.sanitizedFailureReason || input.error?.message || input.error || existing?.sanitizedFailureReason || existing?.lastError || "";
  const sanitizedFailureReason = trimBlock(rawReason).slice(0, 160);
  const sendState = trimBlock(input.sendState) || existing?.sendState || (generatedReplyText ? "send_pending" : "not_attempted");
  const transportReceipt = trimBlock(input.transportReceipt) || existing?.transportReceipt || "";
  const billingState = trimBlock(input.billingState) || existing?.billingState || "pending";
  const revision = (existing?.revision || 0) + 1;

  const job: PendingAiReplyRetry = {
    id,
    botId: trimBlock(input.botId),
    jid: trimBlock(input.jid),
    messageId,
    customerTurnId,
    canonicalCustomerId,
    conversationId,
    attemptCount: attempts,
    attempts,
    lastCustomerMessageAt,
    mergedMessageCount: existing ? Number(existing.mergedMessageCount || 1) + (messageId && messageId !== existing.messageId ? 1 : 0) : 1,
    source: trimBlock(input.source) || "unknown",
    status: resolveRetryStatusFromGeneratedReply(generatedReplyText),
    queuedAt: existing?.queuedAt || nowMs,
    nextAttemptAt,
    lastAttemptAt: existing?.lastAttemptAt,
    failureStage,
    sanitizedFailureReason,
    sendState,
    transportReceipt,
    billingState,
    revision,
    repliedAt: existing?.repliedAt,
    supersededAt: existing?.supersededAt,
    pausedAt: existing?.pausedAt,
    lastError: sanitizedFailureReason,
    adminAlertedAt: existing?.adminAlertedAt,
    supersededByMessageId: existing?.supersededByMessageId,
    pauseReason: existing?.pauseReason,
    generatedReplyText: generatedReplyText || undefined,
    generatedAt: generatedAt || undefined,
  };
  queue.set(id, job);
  return job;
}

export function dueAiReplyRetries(
  queue: Map<string, PendingAiReplyRetry>,
  nowMs = Date.now(),
  workerId?: string,
) {
  return Array.from(queue.values())
    .filter((job) => {
      if (!ACTIVE_RETRY_STATUSES.has(job.status) || job.nextAttemptAt > nowMs) {
        return false;
      }
      if (job.lockedByWorker && workerId && job.lockedByWorker !== workerId && (job.lockExpiresAt || 0) > nowMs) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
}

export function claimAiReplyRetryForWorker(
  queue: Map<string, PendingAiReplyRetry>,
  id: string,
  workerId: string,
  leaseMs = 60 * 1000,
  nowMs = Date.now(),
): boolean {
  const job = queue.get(id);
  if (!job) return false;
  if (job.lockedByWorker && job.lockedByWorker !== workerId && (job.lockExpiresAt || 0) > nowMs) {
    return false;
  }
  job.lockedByWorker = workerId;
  job.lockExpiresAt = nowMs + leaseMs;
  job.revision = (job.revision || 0) + 1;
  queue.set(id, job);
  return true;
}

export function releaseAiReplyRetryWorkerClaim(
  queue: Map<string, PendingAiReplyRetry>,
  id: string,
  workerId?: string,
) {
  const job = queue.get(id);
  if (!job) return;
  if (!workerId || job.lockedByWorker === workerId) {
    job.lockedByWorker = undefined;
    job.lockExpiresAt = undefined;
    job.revision = (job.revision || 0) + 1;
    queue.set(id, job);
  }
}

export function markAiReplyRetryAttempt(queue: Map<string, PendingAiReplyRetry>, id: string, nowMs = Date.now()) {
  const job = queue.get(id);
  if (!job) return null;
  const attempts = job.attempts + 1;
  const next: PendingAiReplyRetry = {
    ...job,
    attempts,
    attemptCount: attempts,
    status: trimBlock(job.generatedReplyText) ? "retrying_whatsapp_send" : "retrying_ai_generation",
    lastAttemptAt: nowMs,
    revision: (job.revision || 0) + 1,
  };
  queue.set(id, next);
  return next;
}

export function markAiReplyRetryDelivered(queue: Map<string, PendingAiReplyRetry>, id: string, nowMs = Date.now()) {
  const job = queue.get(id);
  if (!job) return null;
  const next: PendingAiReplyRetry = {
    ...job,
    status: "SENT",
    repliedAt: nowMs,
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
    lastError: "",
    sendState: "sent",
    billingState: "billable_send_delivered",
    revision: (job.revision || 0) + 1,
    lockedByWorker: undefined,
    lockExpiresAt: undefined,
  };
  queue.set(id, next);
  return next;
}

export function markAiReplyGeneratedPendingSend(
  queue: Map<string, PendingAiReplyRetry>,
  id: string,
  generatedReplyText: string,
  nowMs = Date.now(),
) {
  const job = queue.get(id);
  if (!job) return null;
  const next: PendingAiReplyRetry = {
    ...job,
    status: "SEND_PENDING",
    generatedReplyText: trimBlock(generatedReplyText),
    generatedAt: Number(job.generatedAt || 0) || nowMs,
    failureStage: "transport_send",
    sendState: "send_pending",
    billingState: "send_pending",
    nextAttemptAt: nowMs + buildRetryDelayMs(job.attempts),
    lastError: "",
    revision: (job.revision || 0) + 1,
  };
  queue.set(id, next);
  return next;
}

export function markAiReplyRetryPaused(
  queue: Map<string, PendingAiReplyRetry>,
  id: string,
  reason: string,
  nowMs = Date.now(),
) {
  const job = queue.get(id);
  if (!job) return null;
  const next: PendingAiReplyRetry = {
    ...job,
    status: "blocked_ai_paused",
    pausedAt: nowMs,
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
    pauseReason: trimBlock(reason).slice(0, 160),
    blockReason: trimBlock(reason).slice(0, 160),
    blockedAt: nowMs,
    revision: (job.revision || 0) + 1,
  };
  queue.set(id, next);
  return next;
}

export function markAiReplyRetryBillingBlocked(
  queue: Map<string, PendingAiReplyRetry>,
  id: string,
  reason: string,
  nowMs = Date.now(),
) {
  const job = queue.get(id);
  if (!job) return null;
  const next: PendingAiReplyRetry = {
    ...job,
    status: normalizeBlockedRetryStatus(reason),
    blockedAt: nowMs,
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
    blockReason: trimBlock(reason).slice(0, 160),
    lastError: trimBlock(reason).slice(0, 160),
    billingState: "blocked",
    revision: (job.revision || 0) + 1,
  };
  queue.set(id, next);
  return next;
}

export function markAiReplyRetryFailed(
  queue: Map<string, PendingAiReplyRetry>,
  id: string,
  reason: string,
  nowMs = Date.now(),
) {
  const job = queue.get(id);
  if (!job) return null;
  const next = queueAiReplyRetry(queue, {
    botId: job.botId,
    jid: job.jid,
    messageId: job.messageId,
    source: job.source,
    error: reason,
    lastCustomerMessageAt: job.lastCustomerMessageAt,
    generatedReplyText: job.generatedReplyText,
    generatedAt: job.generatedAt,
  }, nowMs);
  next.failedAt = nowMs;
  next.lastError = trimBlock(reason).slice(0, 160);
  next.revision = (job.revision || 0) + 1;
  queue.set(id, next);
  return next;
}

export function shouldStopAiReplyRetry(job: PendingAiReplyRetry, nowMs = Date.now()) {
  return { stop: false, reason: "" };
}

export function markAiReplyRetryWaitingProvider(queue: Map<string, PendingAiReplyRetry>, id: string, error: any, nowMs = Date.now()) {
  const job = queue.get(id);
  if (!job) return null;
  const next = queueAiReplyRetry(queue, {
    botId: job.botId,
    jid: job.jid,
    messageId: job.messageId,
    source: job.source,
    error,
    // Clear generatedReplyText so the next attempt will regenerate rather than resending broken output
    generatedReplyText: undefined,
    generatedAt: undefined,
    customerTurnId: job.customerTurnId,
    canonicalCustomerId: job.canonicalCustomerId,
    conversationId: job.conversationId,
    failureStage: "ai_provider",
    sanitizedFailureReason: trimBlock(error?.message || error || "ai_provider_failure").slice(0, 160),
    billingState: "not_charged",
  }, nowMs);
  next.status = "AI_FAILED_RETRY_PENDING";
  next.lockedByWorker = undefined;
  next.lockExpiresAt = undefined;
  queue.set(id, next);
  return next;
}

export function markAiReplyRetryAdminAlerted(queue: Map<string, PendingAiReplyRetry>, id: string, nowMs = Date.now()) {
  const job = queue.get(id);
  if (!job) return null;
  const next = { ...job, adminAlertedAt: nowMs };
  queue.set(id, next);
  return next;
}

export function markAiReplyRetrySuperseded(
  queue: Map<string, PendingAiReplyRetry>,
  input: { botId: string; jid: string; messageId: string; supersededByMessageId: string },
  nowMs = Date.now(),
) {
  const id = buildAiReplyRetryKey(input);
  const job = queue.get(id);
  if (!job) return null;
  const next: PendingAiReplyRetry = {
    ...job,
    status: "SUPERSEDED",
    supersededAt: nowMs,
    supersededByMessageId: trimBlock(input.supersededByMessageId),
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
    sendState: "superseded",
    revision: (job.revision || 0) + 1,
    lockedByWorker: undefined,
    lockExpiresAt: undefined,
  };
  queue.set(id, next);
  return next;
}

export function supersedeAiReplyRetriesForCustomer(
  queue: Map<string, PendingAiReplyRetry>,
  input: { botId: string; jid: string; latestMessageId: string },
  nowMs = Date.now(),
) {
  const merged: PendingAiReplyRetry[] = [];
  for (const job of queue.values()) {
    if (
      job.botId === trimBlock(input.botId) &&
      job.jid === trimBlock(input.jid) &&
      job.messageId !== trimBlock(input.latestMessageId) &&
      ACTIVE_RETRY_STATUSES.has(job.status)
    ) {
      const next: PendingAiReplyRetry = {
        ...job,
        messageId: trimBlock(input.latestMessageId),
        status: resolveRetryStatusFromGeneratedReply(job.generatedReplyText),
        nextAttemptAt: nowMs,
        lastCustomerMessageAt: Math.max(Number(job.lastCustomerMessageAt || 0), nowMs),
        mergedMessageCount: Number(job.mergedMessageCount || 1) + 1,
        supersededByMessageId: "",
        supersededAt: undefined,
      };
      queue.set(job.id, next);
      merged.push(next);
    }
  }
  return merged;
}

export function isDeliveredAfterLatestPendingCustomerMessage(input: {
  lastDeliveredBotAtMs?: number;
  latestIncomingAtMs?: number;
  jobLastCustomerMessageAtMs?: number;
  deliveredContextType?: string;
  deliveredMessageId?: string;
  deliveredReceiptId?: string;
}) {
  const lastDeliveredBotAtMs = normalizeDeliveryTimestampMs(input.lastDeliveredBotAtMs);
  if (!hasCustomerFacingAiDeliveryEvidence({
    messageId: input.deliveredMessageId,
    receiptId: input.deliveredReceiptId,
    contextType: input.deliveredContextType,
  })) {
    return false;
  }
  const latestPendingCustomerAtMs = Math.max(
    normalizeDeliveryTimestampMs(input.latestIncomingAtMs),
    normalizeDeliveryTimestampMs(input.jobLastCustomerMessageAtMs),
  );
  return lastDeliveredBotAtMs > 0 && latestPendingCustomerAtMs > 0 && lastDeliveredBotAtMs > latestPendingCustomerAtMs;
}

export function resumePausedAiReplyRetriesForCustomer(
  queue: Map<string, PendingAiReplyRetry>,
  input: { botId: string; jid: string },
  nowMs = Date.now(),
) {
  const resumed: PendingAiReplyRetry[] = [];
  for (const job of queue.values()) {
    if (job.botId === trimBlock(input.botId) && job.jid === trimBlock(input.jid) && job.status === "blocked_ai_paused") {
      const next: PendingAiReplyRetry = {
        ...job,
        status: resolveRetryStatusFromGeneratedReply(job.generatedReplyText),
        pauseReason: "",
        pausedAt: undefined,
        nextAttemptAt: nowMs,
      };
      queue.set(job.id, next);
      resumed.push(next);
    }
  }
  return resumed;
}

export function resumeBlockedAiReplyRetry(queue: Map<string, PendingAiReplyRetry>, id: string, nowMs = Date.now()) {
  const job = queue.get(id);
  if (!job) return null;
  const next: PendingAiReplyRetry = {
    ...job,
    status: resolveRetryStatusFromGeneratedReply(job.generatedReplyText),
    nextAttemptAt: nowMs,
    blockedAt: undefined,
    blockReason: "",
    pauseReason: "",
    pausedAt: undefined,
    lastError: "",
  };
  queue.set(id, next);
  return next;
}

export function pruneAiReplyRetryQueue(queue: Map<string, PendingAiReplyRetry>, nowMs = Date.now()) {
  for (const [id, job] of queue.entries()) {
    const terminalAt = job.repliedAt || job.supersededAt || job.blockedAt || job.failedAt || job.pausedAt || job.queuedAt;
    if (TERMINAL_RETRY_STATUSES.has(job.status) && nowMs - terminalAt > 7 * 24 * 60 * 60 * 1000) {
      queue.delete(id);
    }
  }
}
