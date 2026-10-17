export class AiReplyRetryableError extends Error {
  retryReason: string;
  metadata: Record<string, any>;

  constructor(message: string, retryReason = "provider_failure", metadata: Record<string, any> = {}) {
    super(message);
    this.name = "AiReplyRetryableError";
    this.retryReason = String(retryReason || "provider_failure");
    this.metadata = metadata || {};
  }
}

export class AiReplySupersededError extends Error {
  reason: string;

  constructor(message: string, reason = "newer_customer_message_pending") {
    super(message);
    this.name = "AiReplySupersededError";
    this.reason = String(reason || "newer_customer_message_pending");
  }
}

const DETERMINISTIC_AI_REPLY_QUALITY_REASONS = new Set([
  "configured_field_instruction_echo",
  "duplicate_appointment_question",
  "duplicate_budget_question",
  "duplicate_custom_field_question",
  "duplicate_interest_question",
  "duplicate_location_question",
  "duplicate_quantity_question",
  "echo_latest_customer_message",
  "generic_product_fallback_not_contextual",
  "guard_repair_empty",
  "guard_repair_incomplete",
  "incomplete_after_repair",
  "incomplete_order_summary",
  "internal_reasoning",
  "service_business_product_wording",
  "tool_meta_text_blocked",
  "unsafe_or_incomplete_after_repair",
]);

function normalizeRetryReason(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^guard_repair_failed:/, "")
    .replace(/^ai reply guard repair failed:\s*/i, "")
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
}

export function isDeterministicAiReplyQualityFailure(reason: any) {
  const normalized = normalizeRetryReason(reason);
  if (!normalized) return false;
  if (DETERMINISTIC_AI_REPLY_QUALITY_REASONS.has(normalized)) return true;
  return Array.from(DETERMINISTIC_AI_REPLY_QUALITY_REASONS).some((knownReason) => normalized.includes(knownReason));
}

export function shouldScheduleAiReplyRetryForReason(reason: any) {
  return !isDeterministicAiReplyQualityFailure(reason);
}

export function createAiReplyRetryableError(message: string, retryReason = "provider_failure", metadata: Record<string, any> = {}) {
  return new AiReplyRetryableError(message, retryReason, metadata);
}

export function isAiReplyRetryableError(error: any) {
  return error instanceof AiReplyRetryableError || error?.name === "AiReplyRetryableError";
}

export function getAiReplyRetryReason(error: any) {
  return String(error?.retryReason || error?.message || "provider_failure");
}

export function getAiReplyRetryMetadata(error: any) {
  return error?.metadata && typeof error.metadata === "object" ? error.metadata : {};
}

export function createAiReplySupersededError(message: string, reason = "newer_customer_message_pending") {
  return new AiReplySupersededError(message, reason);
}

export function isAiReplySupersededError(error: any) {
  return error instanceof AiReplySupersededError || error?.name === "AiReplySupersededError" || error?.reason === "newer_customer_message_pending";
}
