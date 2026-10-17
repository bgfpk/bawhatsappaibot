import test from "node:test";
import assert from "node:assert/strict";

import {
  createAiReplyRetryableError,
  getAiReplyRetryMetadata,
  getAiReplyRetryReason,
  isDeterministicAiReplyQualityFailure,
  shouldScheduleAiReplyRetryForReason,
} from "./ai-reply-retry-error-service.ts";

test("duplicate phone guard failures remain retry-schedulable for AI repair/recovery", () => {
  assert.equal(isDeterministicAiReplyQualityFailure("duplicate_phone_question"), false);
  assert.equal(shouldScheduleAiReplyRetryForReason("duplicate_phone_question"), true);
  assert.equal(shouldScheduleAiReplyRetryForReason("guard_repair_failed:duplicate_phone_question"), true);
  assert.equal(shouldScheduleAiReplyRetryForReason("AI reply guard repair failed: duplicate_phone_question"), true);
});

test("provider and transient reasons remain retry-schedulable", () => {
  assert.equal(isDeterministicAiReplyQualityFailure("provider_failure"), false);
  assert.equal(shouldScheduleAiReplyRetryForReason("provider_failure"), true);
  assert.equal(shouldScheduleAiReplyRetryForReason("429_rate_limit"), true);
});

test("retryable error preserves explicit reason", () => {
  const error = createAiReplyRetryableError("AI provider timed out", "provider_timeout");
  assert.equal(getAiReplyRetryReason(error), "provider_timeout");
});

test("retryable error preserves send retry metadata", () => {
  const error = createAiReplyRetryableError("WhatsApp send failed", "whatsapp_send_failed", {
    phase: "whatsapp_send",
    generatedReplyText: "Already generated reply",
  });
  assert.deepEqual(getAiReplyRetryMetadata(error), {
    phase: "whatsapp_send",
    generatedReplyText: "Already generated reply",
  });
});
