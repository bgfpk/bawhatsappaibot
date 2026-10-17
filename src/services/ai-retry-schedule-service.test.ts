import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerFacingAiDeliveryPatch,
  getCustomerFacingAiDeliveryEvidence,
  hasCustomerFacingAiDeliveryEvidence,
  isDeliveredAfterLatestPendingCustomerMessage,
  markAiReplyRetryBillingBlocked,
  markAiReplyRetryFailed,
  markAiReplyGeneratedPendingSend,
  queueAiReplyRetry,
  resumeBlockedAiReplyRetry,
  shouldStopAiReplyRetry,
  supersedeAiReplyRetriesForCustomer,
  buildRetryDelayMs,
  claimAiReplyRetryForWorker,
  releaseAiReplyRetryWorkerClaim,
  dueAiReplyRetries,
} from "./ai-retry-schedule-service.ts";

test("queue keeps one pending retry per bot and customer and merges latest message", () => {
  const queue = new Map();
  const first = queueAiReplyRetry(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_1",
    source: "live",
    lastCustomerMessageAt: 1_000,
  }, 1_000);

  const second = queueAiReplyRetry(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_2",
    source: "live",
    lastCustomerMessageAt: 2_000,
  }, 2_000);

  assert.equal(queue.size, 1);
  assert.equal(first.id, second.id);
  assert.equal(second.messageId, "msg_2");
  assert.equal(second.lastCustomerMessageAt, 2_000);
  assert.equal(second.mergedMessageCount, 2);
  assert.equal(second.status, "AI_FAILED_RETRY_PENDING");
});

test("superseding a pending retry updates the latest message without clearing it", () => {
  const queue = new Map();
  const first = queueAiReplyRetry(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_1",
    source: "retry",
    lastCustomerMessageAt: 1_000,
  }, 1_000);

  const merged = supersedeAiReplyRetriesForCustomer(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    latestMessageId: "msg_2",
  }, 2_000);

  assert.equal(merged.length, 1);
  const job = queue.get(first.id);
  assert.equal(job.messageId, "msg_2");
  assert.equal(job.status, "AI_FAILED_RETRY_PENDING");
  assert.equal(job.lastCustomerMessageAt, 2_000);
});

test("delivered reply clears retry only with customer-facing AI send evidence after latest pending customer message", () => {
  assert.equal(isDeliveredAfterLatestPendingCustomerMessage({
    lastDeliveredBotAtMs: 2_001,
    latestIncomingAtMs: 2_000,
    jobLastCustomerMessageAtMs: 2_000,
    deliveredContextType: "ai_text_reply",
    deliveredMessageId: "bot_msg_1",
  }), true);

  assert.equal(isDeliveredAfterLatestPendingCustomerMessage({
    lastDeliveredBotAtMs: 1_500,
    latestIncomingAtMs: 2_000,
    jobLastCustomerMessageAtMs: 2_000,
    deliveredContextType: "ai_text_reply",
    deliveredMessageId: "bot_msg_1",
  }), false);

  assert.equal(isDeliveredAfterLatestPendingCustomerMessage({
    lastDeliveredBotAtMs: 2_000,
    latestIncomingAtMs: 2_000,
    jobLastCustomerMessageAtMs: 2_000,
    deliveredContextType: "ai_text_reply",
    deliveredMessageId: "bot_msg_1",
  }), false);

  assert.equal(isDeliveredAfterLatestPendingCustomerMessage({
    lastDeliveredBotAtMs: 3_000,
    latestIncomingAtMs: 2_000,
    jobLastCustomerMessageAtMs: 2_000,
    deliveredContextType: "sequence_template",
    deliveredMessageId: "tpl_1",
  }), false);
});

test("manual admin comma command is never delivery evidence", () => {
  assert.equal(hasCustomerFacingAiDeliveryEvidence({
    messageId: "manual-comma-1",
    contextType: "manual comma shortcut",
  }), false);

  assert.equal(isDeliveredAfterLatestPendingCustomerMessage({
    lastDeliveredBotAtMs: 3_000,
    latestIncomingAtMs: 2_000,
    jobLastCustomerMessageAtMs: 2_000,
    deliveredContextType: "manual comma shortcut",
    deliveredMessageId: "manual-comma-1",
  }), false);
});

test("delivery profile patch stores only explicit AI reply evidence", () => {
  const patch = buildCustomerFacingAiDeliveryPatch({
    messageId: "bot_msg_2",
    receiptId: "receipt_2",
    contextType: "ai_text_reply",
    deliveredAt: 4_000,
  });
  const evidence = getCustomerFacingAiDeliveryEvidence(patch);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.deliveredAtMs, 4_000);
  assert.equal(evidence.messageId, "bot_msg_2");
  assert.equal(evidence.receiptId, "receipt_2");
  assert.equal(evidence.contextType, "ai_text_reply");
});

test("billing blocked retry is terminal and not due again", () => {
  const queue = new Map();
  const job = queueAiReplyRetry(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_1",
    source: "retry",
  }, 1_000);

  const blocked = markAiReplyRetryBillingBlocked(queue, job.id, "wallet_empty", 2_000);

  assert.equal(blocked?.status, "blocked_insufficient_balance");
  assert.equal(blocked?.blockReason, "wallet_empty");
  assert.equal(blocked?.nextAttemptAt, Number.MAX_SAFE_INTEGER);
});

test("retry safety keeps retrying past repeated failures without stale expiry", () => {
  const repeatedFailures = {
    id: "retry_1",
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_1",
    source: "test",
    status: "pending_ai_generation" as const,
    attempts: 25,
    queuedAt: 1_000,
    nextAttemptAt: 2_000,
  };
  assert.deepEqual(shouldStopAiReplyRetry(repeatedFailures, 3_000), { stop: false, reason: "" });
  assert.deepEqual(shouldStopAiReplyRetry(repeatedFailures, 1_000 + (60 * 60 * 24 * 365)), { stop: false, reason: "" });
});

test("generated reply is retained for WhatsApp send retries and can be resumed after block clears", () => {
  const queue = new Map();
  const job = queueAiReplyRetry(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_1",
    source: "live",
  }, 1_000);

  const generated = markAiReplyGeneratedPendingSend(queue, job.id, "Saved AI reply", 2_000);
  assert.equal(generated?.status, "SEND_PENDING");
  assert.equal(generated?.generatedReplyText, "Saved AI reply");

  const blocked = markAiReplyRetryBillingBlocked(queue, job.id, "subscription_expired", 3_000);
  assert.equal(blocked?.status, "blocked_subscription_expired");

  const resumed = resumeBlockedAiReplyRetry(queue, job.id, 4_000);
  assert.equal(resumed?.status, "SEND_PENDING");
  assert.equal(resumed?.generatedReplyText, "Saved AI reply");
});

test("failed retry stays active for another minute instead of becoming terminal", () => {
  const queue = new Map();
  const job = queueAiReplyRetry(queue, {
    botId: "bot_1",
    jid: "contact-2658838c5e39@example.invalid",
    messageId: "msg_1",
    source: "live",
  }, 1_000);

  const failed = markAiReplyRetryFailed(queue, job.id, "provider_timeout", 4_000);
  assert.equal(failed?.status, "AI_FAILED_RETRY_PENDING");
  assert.equal(failed?.nextAttemptAt, 64_000);
});

test("Exponential Doubling Backoff - Continuous doubling progression (1m, 2m, 4m, 8m, 16m, 32m, 64m, 128m)", () => {
  assert.equal(buildRetryDelayMs(0), 60 * 1000); // 1m
  assert.equal(buildRetryDelayMs(1), 120 * 1000); // 2m
  assert.equal(buildRetryDelayMs(2), 240 * 1000); // 4m
  assert.equal(buildRetryDelayMs(3), 480 * 1000); // 8m
  assert.equal(buildRetryDelayMs(4), 960 * 1000); // 16m
  assert.equal(buildRetryDelayMs(5), 1920 * 1000); // 32m
  assert.equal(buildRetryDelayMs(6), 3840 * 1000); // 64m
  assert.equal(buildRetryDelayMs(7), 7680 * 1000); // 128m
});

test("Retry Access & Billing Gates - Blocks pending turn appropriately without provider call or send", () => {
  const queue = new Map();

  // Case A: Wallet insufficient before retry
  const jobWallet = queueAiReplyRetry(queue, { botId: "b1", jid: "contact-21b91f46af88@example.invalid", messageId: "m1", source: "test" }, 1000);
  const blockedWallet = markAiReplyRetryBillingBlocked(queue, jobWallet.id, "insufficient_balance", 2000);
  assert.equal(blockedWallet?.status, "blocked_insufficient_balance");
  assert.equal(blockedWallet?.nextAttemptAt, Number.MAX_SAFE_INTEGER);

  // Case B: Subscription plan expired before retry
  const jobPlan = queueAiReplyRetry(queue, { botId: "b1", jid: "contact-3ea296fd6e0b@example.invalid", messageId: "m2", source: "test" }, 1000);
  const blockedPlan = markAiReplyRetryBillingBlocked(queue, jobPlan.id, "subscription_expired", 2000);
  assert.equal(blockedPlan?.status, "blocked_subscription_expired");

  // Case C: Quota / limit reached before retry
  const jobQuota = queueAiReplyRetry(queue, { botId: "b1", jid: "contact-5e36b9533192@example.invalid", messageId: "m3", source: "test" }, 1000);
  const blockedQuota = markAiReplyRetryBillingBlocked(queue, jobQuota.id, "reply_limit_exhausted", 2000);
  assert.equal(blockedQuota?.status, "blocked_quota_exceeded");

  // Case D: AI paused / manual takeover before retry
  const jobPaused = queueAiReplyRetry(queue, { botId: "b1", jid: "contact-e22458bd7a78@example.invalid", messageId: "m4", source: "test" }, 1000);
  const blockedPaused = markAiReplyRetryBillingBlocked(queue, jobPaused.id, "customer_ai_paused", 2000);
  assert.equal(blockedPaused?.status, "blocked_ai_paused");

  // Verify none of these are returned in due jobs
  const due = dueAiReplyRetries(queue, 3000);
  assert.equal(due.length, 0);
});

test("Cross-Worker Concurrency - Exactly 1 worker claims and processes due retry", () => {
  const queue = new Map();
  const job = queueAiReplyRetry(queue, {
    botId: "bot_shared",
    jid: "contact-bbe0d0982485@example.invalid",
    messageId: "msg_turn",
    source: "test",
  }, 1000);
  job.nextAttemptAt = 1500;

  // Two workers query due jobs
  const dueWorkerA = dueAiReplyRetries(queue, 2000, "worker_A");
  const dueWorkerB = dueAiReplyRetries(queue, 2000, "worker_B");
  assert.equal(dueWorkerA.length, 1);
  assert.equal(dueWorkerB.length, 1);

  // Worker A claims job
  const claimedA = claimAiReplyRetryForWorker(queue, job.id, "worker_A", 30000);
  assert.equal(claimedA, true);

  // Worker B attempts to claim the same job simultaneously -> MUST BE REJECTED
  const claimedB = claimAiReplyRetryForWorker(queue, job.id, "worker_B", 30000);
  assert.equal(claimedB, false);

  // Worker B queries due jobs -> job is locked, so Worker B gets 0 due jobs
  const dueWorkerBAgain = dueAiReplyRetries(queue, 2000, "worker_B");
  assert.equal(dueWorkerBAgain.length, 0);

  // Worker A finishes and releases
  releaseAiReplyRetryWorkerClaim(queue, job.id, "worker_A");
  assert.equal(queue.get(job.id)?.lockedByWorker, undefined);
});

test("Durable Retry Restart - Failed turn recovers across process restart", async () => {
  const { loadAiReplyRetryQueue, saveAiReplyRetryQueue, __setAiRetryPersistenceTestDeps, __resetAiRetryPersistenceTestDeps } = await import("./ai-retry-persistence-service.ts");
  const store = new Map<string, string>();
  __setAiRetryPersistenceTestDeps({
    getSystemConfig: async (key: string) => store.get(key) || null,
    setSystemConfig: async (key: string, value: string) => {
      store.set(key, value);
    },
  });

  try {
    // Worker A records failed turn
    const queueA = new Map();
    const job = queueAiReplyRetry(queueA, {
      botId: "bot_prod_worker",
      jid: "contact-d3b9636f8b0e@example.invalid",
      messageId: "msg_orig_failed",
      source: "live",
      lastCustomerMessageAt: 1725800000000,
    }, 1725800000000);
    job.attempts = 1;
    job.nextAttemptAt = 1725800060000;
    job.failureStage = "provider_timeout";

    await saveAiReplyRetryQueue("bot_prod_worker", queueA);

    // Clear memory to simulate worker crash / PM2 restart
    queueA.clear();

    // Worker B boots up fresh and loads pending queue from disk
    const queueB = await loadAiReplyRetryQueue("bot_prod_worker");

    assert.equal(queueB.size, 1);
    const recoveredJob = queueB.get(job.id);
    assert.ok(recoveredJob);
    assert.equal(recoveredJob?.jid, "contact-d3b9636f8b0e@example.invalid");
    assert.equal(recoveredJob?.attempts, 1);
    assert.equal(recoveredJob?.nextAttemptAt, 1725800060000);
    assert.equal(recoveredJob?.failureStage, "provider_timeout");
    assert.equal(recoveredJob?.status, "AI_FAILED_RETRY_PENDING");
  } finally {
    __resetAiRetryPersistenceTestDeps();
  }
});
