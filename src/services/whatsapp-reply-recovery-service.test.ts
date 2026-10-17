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
import { createReplyPipelineTrace } from "./whatsapp-reply-pipeline-tracer.ts";

test("executeWithSafeConversationLock acquires and cleanly releases lock on success", async () => {
  const lockSet = new Set<string>();
  const jid = "contact-e4ed32210a80@example.invalid";
  const trace = createReplyPipelineTrace({
    botId: "bot-1",
    customerJid: jid,
    messageId: "msg-1",
    source: "test",
  });

  let acquiredCalled = false;
  let cleanStateCalled = false;

  const res = await executeWithSafeConversationLock(
    {
      jid,
      trace,
      lockSet,
      onAcquired: () => {
        acquiredCalled = true;
      },
      onCleanState: async () => {
        cleanStateCalled = true;
      },
    },
    async () => {
      assert.equal(lockSet.has(jid), true, "Lock must be held during operation");
      return "reply_sent";
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.result, "reply_sent");
  assert.equal(acquiredCalled, true);
  assert.equal(cleanStateCalled, true);
  assert.equal(lockSet.has(jid), false, "Lock must be released after completion");

  const snapshot = trace.snapshot();
  assert.ok(snapshot.stages.some((s) => s.stage === "CONVERSATION_STATE_RELEASED"));
});

test("executeWithSafeConversationLock guarantees lock release on unhandled error and enables next message", async () => {
  const lockSet = new Set<string>();
  const jid = "contact-e4ed32210a80@example.invalid";
  const trace1 = createReplyPipelineTrace({
    botId: "bot-1",
    customerJid: jid,
    messageId: "msg-fail",
    source: "test",
  });

  let cleanupErrorCaptured: any;

  // First attempt fails catastrophically
  const res1 = await executeWithSafeConversationLock(
    {
      jid,
      trace: trace1,
      lockSet,
      onCleanState: async (err) => {
        cleanupErrorCaptured = err;
      },
    },
    async () => {
      throw new Error("AI provider rate limit 429");
    }
  );

  assert.equal(res1.success, false);
  assert.match(res1.error?.message, /rate limit 429/);
  assert.match(cleanupErrorCaptured?.message, /rate limit 429/);
  assert.equal(lockSet.has(jid), false, "Lock must be released even on catastrophic error");

  // Crucial assertion: Next legitimate message CAN acquire lock and succeed!
  const trace2 = createReplyPipelineTrace({
    botId: "bot-1",
    customerJid: jid,
    messageId: "msg-success",
    source: "test",
  });

  const res2 = await executeWithSafeConversationLock(
    {
      jid,
      trace: trace2,
      lockSet,
    },
    async () => {
      return "second_message_ok";
    }
  );

  assert.equal(res2.success, true);
  assert.equal(res2.result, "second_message_ok");
  assert.equal(lockSet.has(jid), false);
});

test("executeWithSafeConversationLock blocks duplicate execution while lock is held", async () => {
  const lockSet = new Set<string>();
  const jid = "contact-e4ed32210a80@example.invalid";
  lockSet.add(jid); // simulate in-flight execution

  const res = await executeWithSafeConversationLock(
    {
      jid,
      lockSet,
    },
    async () => {
      return "should_not_run";
    }
  );

  assert.equal(res.success, false);
  assert.match(res.error?.message, /already held/);
});

test("isBatchOrphaned correctly identifies orphaned generating_reply status", () => {
  const batch: RecoverableBatch = {
    batchId: "b-1",
    status: "generating_reply",
    createdAt: Date.now() - 10000,
    lastUpdatedAt: Date.now() - 10000,
  };

  const locksEmpty = {
    currentlyReplying: new Set<string>(),
    activeAIControllers: new Map<string, any>(),
  };

  const jid = "contact-e4ed32210a80@example.invalid";

  // When lock set does NOT have the JID, it is orphaned
  assert.equal(isBatchOrphaned(batch, locksEmpty, jid), true);

  // When lock set DOES have the JID, it is actively processing, not orphaned
  locksEmpty.currentlyReplying.add(jid);
  assert.equal(isBatchOrphaned(batch, locksEmpty, jid), false);
});

test("recoverOrphanedBatch resets orphaned status back to pending_debounce", () => {
  const batch: RecoverableBatch = {
    batchId: "b-1",
    status: "generating_reply",
    pendingWhileProcessing: true,
    createdAt: Date.now() - 5000,
    lastUpdatedAt: Date.now() - 5000,
  };

  const locks = {
    currentlyReplying: new Set<string>(),
  };

  const jid = "contact-e4ed32210a80@example.invalid";
  const outcome = recoverOrphanedBatch(batch, locks, jid);

  assert.equal(outcome.recovered, true);
  assert.equal(outcome.previousStatus, "generating_reply");
  assert.equal(batch.status, "pending_debounce");
  assert.equal(batch.pendingWhileProcessing, false);
});

test("withBoundedTimeout aborts operation if timeout is exceeded", async () => {
  await assert.rejects(
    async () => {
      await withBoundedTimeout(
        async (signal) => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "too_late";
        },
        50,
        "AI_GENERATE"
      );
    },
    (err: any) => {
      assert.ok(err instanceof TimeoutError);
      assert.equal(err.stage, "AI_GENERATE");
      assert.equal(err.timeoutMs, 50);
      return true;
    }
  );
});

test("WhatsAppSendDeduplicator detects duplicate customer send within window", () => {
  const deduplicator = new WhatsAppSendDeduplicator(10000);
  const jid = "contact-e4ed32210a80@example.invalid";
  const reply = "Yes, our performance marketing fee is 4% of total order value.";

  assert.equal(deduplicator.isDuplicate(jid, reply), false);
  deduplicator.recordSent(jid, reply);
  assert.equal(deduplicator.isDuplicate(jid, reply), true);
  assert.equal(deduplicator.isDuplicate(jid, "Different text entirely"), false);
});
