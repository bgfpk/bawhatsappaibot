// src/services/whatsapp-cloud-api-rate-controller.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  getPhoneRateState,
  isPhoneInCooldown,
  recordPhoneApiSuccess,
  recordPhoneApiFailure,
  extractSafeRateHeaders,
  classifySendAttemptOutcome,
  clearPhoneRateStates,
} from "./whatsapp-cloud-api-rate-controller.ts";

test.afterEach(() => {
  clearPhoneRateStates();
});

test("RateController: per-phone isolation ensures Phone A failure does not affect Phone B", () => {
  const phoneA = "111111111";
  const phoneB = "222222222";

  // Trigger 429 on Phone A
  recordPhoneApiFailure(phoneA, 429, 60);

  const statusA = isPhoneInCooldown(phoneA);
  const statusB = isPhoneInCooldown(phoneB);

  assert.equal(statusA.inCooldown, true);
  assert.ok(statusA.remainingMs > 0);

  // Phone B remains healthy
  assert.equal(statusB.inCooldown, false);
  assert.equal(statusB.remainingMs, 0);
});

test("RateController: circuit breaker triggers after 5 consecutive 5xx errors", () => {
  const phoneId = "333333333";

  for (let i = 0; i < 4; i++) {
    recordPhoneApiFailure(phoneId, 500);
    assert.equal(isPhoneInCooldown(phoneId).inCooldown, false);
  }

  // 5th failure trips the circuit
  recordPhoneApiFailure(phoneId, 500);
  assert.equal(isPhoneInCooldown(phoneId).inCooldown, true);

  // Success resets circuit breaker
  recordPhoneApiSuccess(phoneId);
  assert.equal(isPhoneInCooldown(phoneId).inCooldown, false);
});

test("RateController: classifies ambiguous network timeout as ambiguous_send_result (non-retryable)", () => {
  const outcome = classifySendAttemptOutcome({
    networkError: new Error("ETIMEDOUT: connection timed out after 30000ms"),
  });

  assert.equal(outcome.status, "ambiguous_send_result");
  assert.equal(outcome.retryable, false, "Ambiguous sends must not automatically duplicate");
  assert.equal(outcome.errorReason, "ambiguous_network_timeout");
});

test("RateController: classifies 429 rate limit with Retry-After as retryable", () => {
  const outcome = classifySendAttemptOutcome({
    httpStatus: 429,
    retryAfterSeconds: 15,
  });

  assert.equal(outcome.status, "rate_limited");
  assert.equal(outcome.retryable, true);
  assert.equal(outcome.retryAfterMs, 15000);
});

test("RateController: classifies 200 with WAMID as success", () => {
  const outcome = classifySendAttemptOutcome({
    httpStatus: 200,
    responseData: {
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.HBgLMjA0..." }],
    },
  });

  assert.equal(outcome.status, "success");
  assert.equal(outcome.wamid, "wamid.HBgLMjA0...");
  assert.equal(outcome.retryable, false);
});

test("RateController: extractSafeRateHeaders parses retry-after and usage headers safely", () => {
  const headers = {
    "retry-after": "45",
    "x-business-use-case-usage": JSON.stringify([{ pct_estimated_usage: 75.5 }]),
  };

  const parsed = extractSafeRateHeaders(headers);
  assert.equal(parsed.retryAfterSeconds, 45);
  assert.equal(parsed.usagePercent, 75.5);
});
