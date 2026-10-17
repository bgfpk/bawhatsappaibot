import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetCustomerMessageBatchStateTestDeps,
  __setCustomerMessageBatchStateTestDeps,
  loadCustomerMessageBatchState,
  saveCustomerMessageBatchState,
  withActiveBatchState,
  withBaselineHandledMessages,
  withHandledBatchMessages,
} from "./customer-message-batch-state-service.ts";

function inboundMessage(id: string, timestamp: number, text = "Need help") {
  return {
    key: { id, remoteJid: "contact-e4ed32210a80@example.invalid", fromMe: false },
    messageTimestamp: timestamp,
    message: { conversation: text },
  };
}

test.afterEach(() => {
  __resetCustomerMessageBatchStateTestDeps();
});

test("handled message IDs and high-water cursor persist after successful batch send", async () => {
  const store = new Map<string, string>();
  __setCustomerMessageBatchStateTestDeps({
    getSystemConfig: async (key) => store.get(key) || null,
    setSystemConfig: async (key, value) => {
      store.set(key, value);
    },
  });

  const initial = await loadCustomerMessageBatchState("bot-1", "contact-e4ed32210a80@example.invalid");
  const next = withHandledBatchMessages(initial, {
    batchId: "batch-1",
    messages: [inboundMessage("m1", 100), inboundMessage("m2", 101)],
  });
  await saveCustomerMessageBatchState("bot-1", "contact-e4ed32210a80@example.invalid", next);

  const loaded = await loadCustomerMessageBatchState("bot-1", "contact-e4ed32210a80@example.invalid");
  assert.deepEqual(loaded.handledMessageIds, ["m1", "m2"]);
  assert.equal(loaded.lastHandledMessageCursor.endsWith(":m2"), true);
  assert.equal(loaded.lastHandledMessageTimestamp, 101);
  assert.equal(Boolean(loaded.baselineReplyCursor), true);
  assert.equal(loaded.recentTerminalBatches.at(-1)?.status, "sent");
});

test("sent batch is terminal and active batch is cleared when messages are marked handled", () => {
  const active = withActiveBatchState(awaitedEmptyState(), {
    batchId: "batch-2",
    status: "generating_reply",
    messageIds: ["m3"],
    latestGenerationMessageId: "m3",
    updatedAt: 200,
    transport: "socket",
  });
  const handled = withHandledBatchMessages(active, {
    batchId: "batch-2",
    messages: [inboundMessage("m3", 200)],
  });

  assert.equal(handled.activeBatch, null);
  assert.equal(handled.recentTerminalBatches.some((item) => item.batchId === "batch-2" && item.status === "sent"), true);
});

test("baseline marks older inbound messages handled without touching newer unreplied messages", () => {
  const baseline = withBaselineHandledMessages(awaitedEmptyState(), {
    replyCursor: "000000000200:bot-reply",
    replyTimestamp: 200,
    handledMessageIds: ["m1", "m2"],
    markedMessages: [inboundMessage("m1", 100), inboundMessage("m2", 150)],
  });

  assert.deepEqual(baseline.handledMessageIds, ["m1", "m2"]);
  assert.equal(baseline.lastHandledMessageTimestamp, 200);
  assert.equal(baseline.baselineReplyCursor, "000000000200:bot-reply");
  assert.equal(baseline.baselineAppliedAt > 0, true);
});

function awaitedEmptyState() {
  return {
    lastHandledMessageCursor: "",
    lastHandledMessageTimestamp: 0,
    handledMessageIds: [],
    baselineAppliedAt: 0,
    baselineReplyCursor: "",
    recentTerminalBatches: [],
    activeBatch: null,
    updatedAt: 0,
  };
}
