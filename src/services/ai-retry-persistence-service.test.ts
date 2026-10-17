import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetAiRetryPersistenceTestDeps,
  __setAiRetryPersistenceTestDeps,
  loadAiReplyRetryQueue,
  saveAiReplyRetryQueue,
} from "./ai-retry-persistence-service.ts";
import { buildAiReplyRetryKey } from "./ai-retry-schedule-service.ts";

test.afterEach(() => {
  __resetAiRetryPersistenceTestDeps();
});

test("retry queue persists across reload", async () => {
  const storage = new Map<string, string>();
  __setAiRetryPersistenceTestDeps({
    getSystemConfig: async (key: string) => storage.get(key) || null,
    setSystemConfig: async (key: string, value: string) => {
      storage.set(key, value);
    },
  } as any);

  const queue = new Map<string, any>();
  queue.set("retry-1", {
    id: "retry-1",
    botId: "bot-1",
    jid: "a@b",
    messageId: "m1",
    source: "live",
    status: "pending_ai_generation",
    attempts: 0,
    queuedAt: 1_000,
    nextAttemptAt: 61_000,
  });

  await saveAiReplyRetryQueue("bot-1", queue);
  const loaded = await loadAiReplyRetryQueue("bot-1");

  assert.equal(loaded.size, 1);
  assert.equal(loaded.get(buildAiReplyRetryKey({ botId: "bot-1", jid: "a@b", messageId: "m1" }))?.messageId, "m1");
});
