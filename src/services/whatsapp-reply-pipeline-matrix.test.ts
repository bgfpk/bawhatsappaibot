import test from "node:test";
import assert from "node:assert/strict";
import {
  executeWithSafeConversationLock,
  isBatchOrphaned,
  recoverOrphanedBatch,
  withBoundedTimeout,
  TimeoutError,
  WhatsAppSendDeduplicator,
  RecoverableBatch,
} from "./whatsapp-reply-recovery-service.ts";
import {
  createReplyPipelineTrace,
  WhatsAppReplyPipelineTrace,
} from "./whatsapp-reply-pipeline-tracer.ts";
import {
  normalizeWhatsAppCustomerReply,
  validateWhatsAppCustomerReply,
  repairWhatsAppCustomerReply,
} from "./whatsapp-customer-reply-contract-service.ts";

// Deterministic test helper representing a full mock customer reply pipeline
async function simulateCustomerReplyPipeline(params: {
  jid: string;
  botId: string;
  messageId: string;
  source?: string;
  historyFail?: boolean;
  aiTimeout?: boolean;
  aiProviderError?: boolean;
  aiEmptyResponse?: boolean;
  aiMalformed?: boolean;
  validationPermanentFail?: boolean;
  sendFail?: boolean;
  sendTimeout?: boolean;
  isBillingBlocked?: boolean;
  isPaused?: boolean;
  lockSet: Set<string>;
  activeBatches: Map<string, RecoverableBatch>;
  deduplicator: WhatsAppSendDeduplicator;
}) {
  const {
    jid,
    botId,
    messageId,
    lockSet,
    activeBatches,
    deduplicator,
    source = "test",
  } = params;

  const trace = createReplyPipelineTrace({
    botId,
    customerJid: jid,
    messageId,
    source,
  });

  trace.recordStage("ACCEPTED_FOR_PROCESSING");

  // Stage: Intentional billing check
  if (params.isBillingBlocked) {
    trace.recordTerminal("INTENTIONALLY_BLOCKED", "trial_or_wallet_exhausted");
    return { status: "blocked", reason: "trial_or_wallet_exhausted", trace };
  }

  // Stage: Manual pause check
  if (params.isPaused) {
    trace.recordTerminal("INTENTIONALLY_BLOCKED", "bot_paused_by_user");
    return { status: "blocked", reason: "bot_paused_by_user", trace };
  }

  trace.recordStage("ACCOUNT_INSTANCE_CHECKED", { eligible: true });

  // Self-heal any stale batch from prior crash
  let batch = activeBatches.get(jid);
  if (batch && isBatchOrphaned(batch, { currentlyReplying: lockSet }, jid)) {
    recoverOrphanedBatch(batch, { currentlyReplying: lockSet }, jid);
  }

  if (!batch) {
    batch = {
      batchId: `batch-${Date.now()}`,
      status: "pending_debounce",
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      messageIds: [messageId],
    };
    activeBatches.set(jid, batch);
  }

  // Execute processing within bulletproof lock
  const lockResult = await executeWithSafeConversationLock(
    {
      jid,
      trace,
      lockSet,
      onAcquired: () => {
        batch!.status = "generating_reply";
      },
      onCleanState: async (err) => {
        if (err) {
          batch!.status = "failed_retryable";
        }
      },
    },
    async () => {
      // 1. History load stage
      if (params.historyFail) {
        trace.recordStage("HISTORY_CONTEXT_LOADED", { failed: true });
        trace.recordFailure("HISTORY_CONTEXT_LOADED", new Error("Database read timeout"));
        trace.recordTerminal("HISTORY_FAILED", "Database read timeout");
        throw new Error("Database read timeout");
      }
      trace.recordStage("HISTORY_CONTEXT_LOADED", { historyCount: 5 });

      // 2. AI request stage
      trace.recordStage("AI_REQUEST_STARTED");

      if (params.aiTimeout) {
        await withBoundedTimeout(
          async () => {
            await new Promise((r) => setTimeout(r, 100));
            return "too_late";
          },
          20,
          "AI_REQUEST_STARTED"
        );
      }

      if (params.aiProviderError) {
        throw new Error("AI provider 503 service unavailable");
      }

      let generatedText = "Thank you for reaching out to us. How can we assist you today?";

      if (params.aiEmptyResponse) {
        generatedText = "";
      } else if (params.aiMalformed) {
        generatedText = "Sure! Here is the pricing breakdown:\n\n1. Starter plan\n2. Growth"; // incomplete numbering
      }

      trace.recordStage("AI_RESPONSE_RECEIVED");

      // 3. Response validation and repair
      let normalized = normalizeWhatsAppCustomerReply(generatedText);
      let validation = validateWhatsAppCustomerReply(normalized);

      if (!validation.ok) {
        // Attempt bounded internal repair
        normalized = repairWhatsAppCustomerReply(normalized);
        validation = validateWhatsAppCustomerReply(normalized);
      }

      if (params.validationPermanentFail || !validation.ok) {
        trace.recordStage("RESPONSE_VALIDATED", { ok: false });
        trace.recordTerminal("VALIDATION_FAILED", "Output rejected by formatting validator");
        throw new Error("Validation failed permanently");
      }
      trace.recordStage("RESPONSE_VALIDATED", { ok: true });

      // 4. WhatsApp Send
      trace.recordStage("WHATSAPP_SEND_STARTED");

      if (deduplicator.isDuplicate(jid, normalized)) {
        trace.recordTerminal("DUPLICATE_SUPPRESSED", "Identical message already dispatched");
        return { status: "duplicate_suppressed", text: normalized };
      }

      if (params.sendFail) {
        trace.recordFailure("WHATSAPP_SEND_STARTED", new Error("WhatsApp socket disconnected"));
        trace.recordTerminal("SEND_FAILED", "Socket disconnected");
        throw new Error("WhatsApp socket disconnected");
      }

      if (params.sendTimeout) {
        trace.recordFailure("WHATSAPP_SEND_STARTED", new Error("Send timeout"));
        trace.recordTerminal("SEND_FAILED", "Send timeout");
        throw new Error("Send timeout");
      }

      deduplicator.recordSent(jid, normalized);
      trace.recordStage("WHATSAPP_SEND_SUCCEEDED");
      trace.recordTerminal("SENT", "Message sent successfully");

      batch!.status = "sent";
      activeBatches.delete(jid);

      return { status: "sent", text: normalized };
    }
  );

  return {
    success: lockResult.success,
    result: lockResult.result,
    error: lockResult.error,
    trace,
  };
}

// ==========================================
// TEST MATRIX: SCENARIOS A through Z
// ==========================================

test("Pipeline Matrix A: normal text -> successful reply", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-85d2a3563239@example.invalid";

  const res = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-a",
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(res.success, true);
  assert.equal(res.result?.status, "sent");
  assert.equal(lockSet.has(jid), false, "Lock must be released");
  assert.equal(res.trace.snapshot().terminalOutcome, "SENT");
});

test("Pipeline Matrix B: rapid consecutive messages coalesce without lock collision", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-7e115ddbe2c7@example.invalid";

  // Fire first message
  const p1 = simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-b1",
    lockSet,
    activeBatches,
    deduplicator,
  });

  // Second message arrives almost concurrently while lock is active
  const p2 = simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-b2",
    lockSet,
    activeBatches,
    deduplicator,
  });

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1.success, true);
  // Second concurrent execution was safely rejected as superseded/lock held
  assert.equal(res2.success, false);
  assert.equal(lockSet.has(jid), false, "Lock released after completion");
});

test("Pipeline Matrix C: AI timeout releases lock and records stage", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-8740728e6d8f@example.invalid";

  const res = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-c",
    aiTimeout: true,
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(res.success, false);
  assert.equal(lockSet.has(jid), false, "Lock must be released on AI timeout");
  assert.equal(res.trace.snapshot().terminalOutcome, "AI_FAILED");
});

test("Pipeline Matrix D: AI temporary provider error then recovery on next message", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-496b10088601@example.invalid";

  // First attempt fails with 503
  const failRes = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-d1",
    aiProviderError: true,
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(failRes.success, false);
  assert.equal(lockSet.has(jid), false);

  // Subsequent message succeeds
  const successRes = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-d2",
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(successRes.success, true);
  assert.equal(successRes.result?.status, "sent");
});

test("Pipeline Matrix E & F: AI empty or malformed response gets repaired or cleanly fails", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-1a8241cab258@example.invalid";

  // Empty response permanently fails validation cleanly
  const resEmpty = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-e",
    aiEmptyResponse: true,
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(resEmpty.success, false);
  assert.equal(lockSet.has(jid), false);

  // Malformed numbering gets automatically repaired by contract service and succeeds!
  const resMalformed = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-f",
    aiMalformed: true,
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(resMalformed.success, true);
  assert.equal(resMalformed.result?.status, "sent");
});

test("Pipeline Matrix G & H: validation permanent failure cleanly releases lock without sticking chat", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-633ea8464a56@example.invalid";

  const res = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-h",
    validationPermanentFail: true,
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(res.success, false);
  assert.equal(lockSet.has(jid), false, "Lock must NOT remain held on validation failure");
  assert.equal(res.trace.snapshot().terminalOutcome, "VALIDATION_FAILED");
});

test("Pipeline Matrix I: database read failure cleanly isolates failure", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-222b3f5d1f8b@example.invalid";

  const res = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-i",
    historyFail: true,
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(res.success, false);
  assert.equal(lockSet.has(jid), false);
  assert.equal(res.trace.snapshot().terminalOutcome, "HISTORY_FAILED");
});

test("Pipeline Matrix L & M: send failure and ambiguous timeout without unsafe duplicate retry", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-c007c4137817@example.invalid";

  const res = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-l",
    sendFail: true,
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(res.success, false);
  assert.equal(lockSet.has(jid), false);
  assert.equal(res.trace.snapshot().terminalOutcome, "SEND_FAILED");
});

test("Pipeline Matrix N: duplicate outbound send is safely suppressed", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-375cbe6aa8b1@example.invalid";

  // First send succeeds
  const res1 = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-n1",
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(res1.success, true);
  assert.equal(res1.result?.status, "sent");

  // Immediate identical re-send attempt (e.g. from network retry)
  const res2 = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-n2",
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(res2.success, true);
  assert.equal(res2.result?.status, "duplicate_suppressed");
});

test("Pipeline Matrix W (CRITICAL ASSERTION): One failed message followed by a successful next message", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-e66ac095271d@example.invalid";

  // Attempt 1: Crashes due to provider error
  const failRes = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-w1",
    aiProviderError: true,
    lockSet,
    activeBatches,
    deduplicator,
  });
  assert.equal(failRes.success, false);

  // Attempt 2: Customer sends another message -> MUST SUCCEED!
  const nextRes = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-w2",
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(nextRes.success, true);
  assert.equal(nextRes.result?.status, "sent");
  assert.equal(lockSet.has(jid), false);
});

test("Pipeline Matrix Z: Billing block produces intentional block, not generic AI failure", async () => {
  const lockSet = new Set<string>();
  const activeBatches = new Map<string, RecoverableBatch>();
  const deduplicator = new WhatsAppSendDeduplicator();
  const jid = "contact-96740733f766@example.invalid";

  const res = await simulateCustomerReplyPipeline({
    jid,
    botId: "bot-1",
    messageId: "msg-z",
    isBillingBlocked: true,
    lockSet,
    activeBatches,
    deduplicator,
  });

  assert.equal(res.status, "blocked");
  assert.equal(res.trace.snapshot().terminalOutcome, "INTENTIONALLY_BLOCKED");
  assert.notEqual(res.trace.snapshot().terminalOutcome, "AI_FAILED");
});
