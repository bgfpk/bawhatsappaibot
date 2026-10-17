import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDelayedReadConfig,
  scheduleOrExecuteReadReceipt,
  cancelPendingReadsForInstance,
  clearAllPendingReads,
  getPendingReadReceiptsCount,
  getPendingMessageKeysForChat,
  DEFAULT_READ_RECEIPT_DELAY_SECONDS,
} from "./whatsapp-delayed-read-service.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("resolveDelayedReadConfig: defaults to disabled when config is empty or missing", () => {
  const result = resolveDelayedReadConfig(undefined, undefined);
  assert.equal(result.enabled, false);
  assert.equal(result.delaySeconds, DEFAULT_READ_RECEIPT_DELAY_SECONDS);
});

test("resolveDelayedReadConfig: strict precedence - account default vs instance override", () => {
  // 1. Account enabled = true, Instance undefined -> inherits Account (true)
  const inheritTrue = resolveDelayedReadConfig({}, { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 15 });
  assert.equal(inheritTrue.enabled, true);
  assert.equal(inheritTrue.delaySeconds, 15);

  // 2. Account enabled = true, Instance without explicit override -> inherits Account (true)
  const inheritOverInstanceDefault = resolveDelayedReadConfig({ delayed_read_receipts_enabled: false }, { delayedReadReceiptsEnabled: true });
  assert.equal(inheritOverInstanceDefault.enabled, true);

  // 3. Account enabled = true, Instance explicitly set with override -> Instance override wins (false)
  const instanceFalse = resolveDelayedReadConfig({ delayed_read_receipts_override: true, delayed_read_receipts_enabled: false }, { delayedReadReceiptsEnabled: true });
  assert.equal(instanceFalse.enabled, false);

  // 4. Account enabled = false, Instance explicitly true with override -> Instance override wins (true)
  const instanceTrue = resolveDelayedReadConfig({ delayed_read_receipts_override: true, delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 20 }, { delayedReadReceiptsEnabled: false, readReceiptDelaySeconds: 5 });
  assert.equal(instanceTrue.enabled, true);
  assert.equal(instanceTrue.delaySeconds, 20);

  // 5. Clamps out-of-bounds delays to safe range (1s - 300s)
  const clampedHigh = resolveDelayedReadConfig({ delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 999 });
  assert.equal(clampedHigh.delaySeconds, 300);

  const clampedLow = resolveDelayedReadConfig({ delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 0 });
  assert.equal(clampedLow.delaySeconds, DEFAULT_READ_RECEIPT_DELAY_SECONDS);
});

test("scheduleOrExecuteReadReceipt: when toggle is OFF, immediately executes read receipt synchronously", async () => {
  clearAllPendingReads();
  const executedCalls: any[][] = [];

  const outcome = await scheduleOrExecuteReadReceipt({
    instanceId: "bot_123",
    chatJid: "contact-e4ed32210a80@example.invalid",
    messageKey: { id: "msg_off_1", remoteJid: "contact-e4ed32210a80@example.invalid" },
    config: { delayedReadReceiptsEnabled: false },
    readExecutor: async (keys) => {
      executedCalls.push(keys);
    },
  });

  assert.equal(outcome.scheduled, false);
  assert.equal(outcome.delaySeconds, 0);
  assert.equal(executedCalls.length, 1);
  assert.deepEqual(executedCalls[0], [{ id: "msg_off_1", remoteJid: "contact-e4ed32210a80@example.invalid" }]);
});

test("OWNER REQUIREMENT: AI reply sent before delay expires does NOT flush or cancel delayed read receipt", async () => {
  clearAllPendingReads();
  const readReceiptCalls: { timestamp: number; keys: any[] }[] = [];
  const startAt = Date.now();

  // Inbound message arrives at t=0 with 1s delay
  const scheduleOutcome = await scheduleOrExecuteReadReceipt({
    instanceId: "bot_business",
    chatJid: "contact-6c9bc40fc084@example.invalid",
    messageKey: { id: "inbound_msg_1", remoteJid: "contact-6c9bc40fc084@example.invalid" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async (keys) => {
      readReceiptCalls.push({ timestamp: Date.now(), keys });
    },
  });

  assert.equal(scheduleOutcome.scheduled, true);
  assert.equal(scheduleOutcome.delaySeconds, 1);

  // At t=200ms, BlackArrow generates and sends an AI reply to the customer
  await sleep(200);
  // Simulating outbound send: Outbound send does NOT call readExecutor and does NOT flush timers
  assert.equal(readReceiptCalls.length, 0, "readMessages must NOT be called when outbound reply is sent");
  assert.equal(getPendingReadReceiptsCount("bot_business"), 1, "Pending delayed read must remain active");

  // At t=500ms (before the 1s delay expires)
  await sleep(300);
  assert.equal(readReceiptCalls.length, 0, "readMessages must NOT be called before full delay expires");

  // Wait until the full 1s delay elapses (~t=1050ms)
  await sleep(650);

  // Now the delayed read receipt MUST have executed exactly once
  assert.equal(readReceiptCalls.length, 1, "readMessages must execute exactly once after full delay");
  assert.equal(readReceiptCalls[0].keys.length, 1);
  assert.equal(readReceiptCalls[0].keys[0].id, "inbound_msg_1");

  const elapsedMs = readReceiptCalls[0].timestamp - startAt;
  assert.ok(elapsedMs >= 950, `Expected read receipt to fire at ~1000ms, elapsed: ${elapsedMs}ms`);
  assert.equal(getPendingReadReceiptsCount("bot_business"), 0);
});

test("scheduleOrExecuteReadReceipt: batches multiple rapid messages in same chat without indefinite postponement", async () => {
  clearAllPendingReads();
  const readReceiptCalls: { timestamp: number; keys: any[] }[] = [];
  const startAt = Date.now();

  // Message 1 arrives at t=0
  await scheduleOrExecuteReadReceipt({
    instanceId: "bot_batch",
    chatJid: "contact-f3e665cdb447@example.invalid",
    messageKey: { id: "msg_batch_1", remoteJid: "contact-f3e665cdb447@example.invalid" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async (keys) => {
      readReceiptCalls.push({ timestamp: Date.now(), keys });
    },
  });

  // Message 2 arrives at t=200ms
  await sleep(200);
  await scheduleOrExecuteReadReceipt({
    instanceId: "bot_batch",
    chatJid: "contact-f3e665cdb447@example.invalid",
    messageKey: { id: "msg_batch_2", remoteJid: "contact-f3e665cdb447@example.invalid" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async (keys) => {
      readReceiptCalls.push({ timestamp: Date.now(), keys });
    },
  });

  // Outbound AI reply sent at t=400ms (does not flush)
  await sleep(200);
  assert.equal(readReceiptCalls.length, 0);

  // Message 3 arrives at t=600ms
  await sleep(200);
  await scheduleOrExecuteReadReceipt({
    instanceId: "bot_batch",
    chatJid: "contact-f3e665cdb447@example.invalid",
    messageKey: { id: "msg_batch_3", remoteJid: "contact-f3e665cdb447@example.invalid" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async (keys) => {
      readReceiptCalls.push({ timestamp: Date.now(), keys });
    },
  });

  assert.equal(readReceiptCalls.length, 0, "No read receipts before initial timer expiration");
  assert.equal(getPendingMessageKeysForChat("bot_batch", "contact-f3e665cdb447@example.invalid").length, 3);

  // Wait for initial timer (1s from t=0)
  await sleep(600);

  // All 3 messages should be acknowledged together in a single readMessages invocation
  assert.equal(readReceiptCalls.length, 1, "All batched messages acknowledged in a single call");
  assert.equal(readReceiptCalls[0].keys.length, 3);
  assert.deepEqual(
    readReceiptCalls[0].keys.map((k) => k.id),
    ["msg_batch_1", "msg_batch_2", "msg_batch_3"]
  );

  const totalElapsed = readReceiptCalls[0].timestamp - startAt;
  assert.ok(totalElapsed >= 950 && totalElapsed <= 1500, `Expected batch execution near ~1000ms, got ${totalElapsed}ms`);
});

test("Lifecycle Safety: cancelPendingReadsForInstance clears timers cleanly on socket disconnect without executing reads", async () => {
  clearAllPendingReads();
  let readExecuted = false;

  await scheduleOrExecuteReadReceipt({
    instanceId: "bot_disconnect",
    chatJid: "contact-012234cfd597@example.invalid",
    messageKey: { id: "msg_dc_1" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async () => {
      readExecuted = true;
    },
  });

  assert.equal(getPendingReadReceiptsCount("bot_disconnect"), 1);

  // Socket disconnect occurs at t=200ms
  await sleep(200);
  const cancelledCount = cancelPendingReadsForInstance("bot_disconnect");
  assert.equal(cancelledCount, 1);
  assert.equal(getPendingReadReceiptsCount("bot_disconnect"), 0);

  // Wait beyond the original 1s delay
  await sleep(1000);
  assert.equal(readExecuted, false, "readExecutor must NOT be called after instance disconnect cancellation");
});

test("Cross-Context and Message Type Uniformity: text, voice note, image across Business & Personal instances", async () => {
  clearAllPendingReads();
  const contextExecutions: Record<string, any[]> = {};

  const contexts = [
    { name: "business_customer_text", instance: "bot_biz", jid: "contact-a11f81e9eb58@example.invalid", key: { id: "text_key", type: "conversation" } },
    { name: "business_admin_assistant_voice", instance: "bot_biz", jid: "contact-a56fc0ed8211@example.invalid", key: { id: "voice_key", type: "audioMessage" } },
    { name: "personal_assistant_image", instance: "bot_personal", jid: "contact-ebc14cc01e8f@example.invalid", key: { id: "image_key", type: "imageMessage" } },
    { name: "personal_contact_document", instance: "bot_personal", jid: "contact-7cbf83b8e5e0@example.invalid", key: { id: "doc_key", type: "documentMessage" } },
  ];

  for (const ctx of contexts) {
    contextExecutions[ctx.name] = [];
    await scheduleOrExecuteReadReceipt({
      instanceId: ctx.instance,
      chatJid: ctx.jid,
      messageKey: ctx.key,
      config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
      readExecutor: async (keys) => {
        contextExecutions[ctx.name].push(...keys);
      },
    });
  }

  assert.equal(getPendingReadReceiptsCount(), 4);

  // At t=300ms, simulated replies are sent across all contexts
  await sleep(300);
  for (const ctx of contexts) {
    assert.equal(contextExecutions[ctx.name].length, 0, `${ctx.name} must still be unread after simulated reply`);
  }

  // Wait for all delayed timers to expire
  await sleep(900);

  for (const ctx of contexts) {
    assert.equal(contextExecutions[ctx.name].length, 1, `${ctx.name} must be acknowledged after full delay`);
    assert.equal(contextExecutions[ctx.name][0].id, ctx.key.id);
  }
  assert.equal(getPendingReadReceiptsCount(), 0);
});

test("Different chats maintain isolated independent batches", async () => {
  clearAllPendingReads();
  const executedA: any[] = [];
  const executedB: any[] = [];

  await scheduleOrExecuteReadReceipt({
    instanceId: "bot_iso",
    chatJid: "contact-a0e503786bd2@example.invalid",
    messageKey: { id: "a_1" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async (keys) => {
      executedA.push(...keys);
    },
  });

  await scheduleOrExecuteReadReceipt({
    instanceId: "bot_iso",
    chatJid: "contact-f8f5beb5275a@example.invalid",
    messageKey: { id: "b_1" },
    config: { delayedReadReceiptsEnabled: true, readReceiptDelaySeconds: 1 },
    readExecutor: async (keys) => {
      executedB.push(...keys);
    },
  });

  assert.equal(getPendingReadReceiptsCount("bot_iso"), 2);
  await sleep(1200);

  assert.equal(executedA.length, 1);
  assert.equal(executedA[0].id, "a_1");
  assert.equal(executedB.length, 1);
  assert.equal(executedB[0].id, "b_1");
});
