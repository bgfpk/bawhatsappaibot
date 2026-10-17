import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createAiReplySupersededError, isAiReplySupersededError, isAiReplyRetryableError } from "./ai-reply-retry-error-service.ts";

const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
const workerSource = fs.readFileSync(new URL("../../bot-worker.ts", import.meta.url), "utf8");
const timeoutSource = fs.readFileSync(new URL("./ai-timeout-fallback-service.ts", import.meta.url), "utf8");

test("AI timeout path no longer sends a customer-facing slow fallback message", () => {
  assert.equal(handlerSource.includes("sending local safe fallback"), false);
  assert.equal(handlerSource.includes("fallback sent for"), false);
  assert.equal(timeoutSource.includes("response was a little slow"), false);
  assert.equal(timeoutSource.includes("I got your message. The response was a little slow"), false);
});

test("no customer-facing slow response wording remains in timeout helper", () => {
  const forbidden = [
    "response was slow",
    "i cannot reply right now",
    "try again later",
    "ai is busy",
    "provider timeout",
    "temporary issue",
  ];

  for (const phrase of forbidden) {
    assert.equal(timeoutSource.toLowerCase().includes(phrase), false);
  }
});

test("appointment confirmation guard does not bypass the primary AI reply path", () => {
  assert.equal(handlerSource.includes("appointment_confirmation_guard"), false);
  assert.equal(handlerSource.includes("Appointment confirmation guard replied"), false);
});

test("newer customer message is treated as superseded skip, not retryable AI error", () => {
  const error = createAiReplySupersededError("newer customer message");
  assert.equal(isAiReplySupersededError(error), true);
  assert.equal(isAiReplyRetryableError(error), false);
  assert.equal(handlerSource.includes("isAiReplySupersededError(err)"), true);
  assert.equal(handlerSource.includes("newer_customer_message_pending context="), true);
  assert.equal(handlerSource.includes("pending_retry_kept_for_latest_message context="), false);
});

test("unsafe repaired replies throw retryable error and do not send canned fallback", () => {
  assert.equal(handlerSource.includes("buildSafeCompleteReplyFallback"), false);
  assert.equal(handlerSource.includes("Sorry, I couldn't complete that reply"), false);
  assert.match(handlerSource, /throw createAiReplyRetryableError\("AI reply was unsafe or incomplete after repair", finalReason\);/);
});

test("service_business_product_wording can keep the original DeepInfra reply instead of forcing no-reply retry", () => {
  assert.equal(handlerSource.includes("service_business_product_wording_safe_original_kept=true"), true);
  assert.match(handlerSource, /if \(!replyText && guardedReply\.reason === "service_business_product_wording"\)/);
  assert.match(handlerSource, /canUseOriginalServiceBusinessReplyAfterGuardFailure\(/);
  assert.match(handlerSource, /validateCompleteCustomerFacingText\(originalGuardCandidateReply\)/);
});

test("duplicate phone guard can clean the original DeepInfra reply before retrying", () => {
  assert.equal(handlerSource.includes("duplicate_phone_question_cleanup_applied=true"), true);
  assert.match(handlerSource, /guardedReply\.reason === "duplicate_phone_question"/);
  assert.match(handlerSource, /stripDuplicateKnownPhoneQuestionFromReply\(originalGuardCandidateReply\)/);
  assert.match(handlerSource, /Customer phone\/WhatsApp number is already known:/);
});

test("worker retry loop does not stop after one failed guard repair", () => {
  assert.equal(workerSource.includes("ai_failure_paused"), false);
  assert.equal(workerSource.includes("processPendingAiReplyRetries({ onlyJid: normalizedJid, forceDue: true })"), false);
  assert.equal(workerSource.includes("AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS"), true);
  assert.equal(workerSource.includes("Number(job.attempts || 0) >= AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS"), true);
  assert.equal(workerSource.includes("markAiReplyRetryDelivered(pendingAiReplyRetries, pendingJob.id);"), true);
});

test("worker recovery skips active live replies and stale or already delivered retry jobs", () => {
  assert.equal(workerSource.includes("reply_recovery_skipped reason=active_live_reply_exists"), true);
  assert.equal(workerSource.includes("reply_recovery_skipped reason=active_batch_exists"), true);
  assert.equal(workerSource.includes("retry_job_attached_to_active_batch"), true);
  assert.equal(workerSource.includes("pending_reply_cancelled reason=newer_customer_message"), true);
  assert.equal(workerSource.includes("reply_retry_skipped reason=stale_message"), true);
  assert.equal(workerSource.includes("reply_retry_skipped reason=message_already_delivered"), true);
  assert.equal(workerSource.includes("reply_retry_skipped reason=message_already_handled_by_batch"), true);
});
