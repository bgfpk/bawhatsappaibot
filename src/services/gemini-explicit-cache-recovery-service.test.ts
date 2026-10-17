import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetExplicitCacheCooldownTestDeps,
  __setExplicitCacheCooldownTestDeps,
  isExplicitCacheCooldownActive,
} from "./gemini-explicit-cache-cooldown-service.ts";
import { runWithExplicitCacheRecovery } from "./gemini-explicit-cache-recovery-service.ts";

test.afterEach(() => {
  __resetExplicitCacheCooldownTestDeps();
});

test("invalid cached request retries the same model once without cache", async () => {
  const attempts: boolean[] = [];
  const result = await runWithExplicitCacheRecovery({
    botId: "bot-1",
    model: "gemini-2.5-flash",
    useExplicitCache: true,
    execute: async (useExplicitCache) => {
      attempts.push(useExplicitCache);
      if (useExplicitCache) {
        throw new Error("400 INVALID_ARGUMENT: CachedContent can not be used with GenerateContent request setting system_instruction, tools or tool_config.");
      }
      return { ok: true };
    },
    logger: console,
  });

  assert.deepEqual(attempts, [true, false]);
  assert.deepEqual(result, { ok: true });
});

test("cache failure activates cooldown for the bot/model pair", async () => {
  __setExplicitCacheCooldownTestDeps({ now: () => 1_000, cooldownMs: () => 60_000 });

  await runWithExplicitCacheRecovery({
    botId: "bot-1",
    model: "gemini-2.5-flash",
    useExplicitCache: true,
    execute: async (useExplicitCache) => {
      if (useExplicitCache) {
        throw new Error("INVALID_ARGUMENT cachedContent failure");
      }
      return { ok: true };
    },
  });

  assert.equal(isExplicitCacheCooldownActive({ botId: "bot-1", model: "gemini-2.5-flash" }), true);
});

test("cache recovery does not mutate reply-mode or billing metadata", async () => {
  const requestMetadata = { replyBehavior: "text_preferred", billingPath: "customer-ai" };

  await runWithExplicitCacheRecovery({
    botId: "bot-1",
    model: "gemini-2.5-flash",
    useExplicitCache: true,
    execute: async (useExplicitCache) => {
      assert.deepEqual(requestMetadata, { replyBehavior: "text_preferred", billingPath: "customer-ai" });
      if (useExplicitCache) throw new Error("INVALID_ARGUMENT cachedContent failure");
      return { ok: true };
    },
  });

  assert.deepEqual(requestMetadata, { replyBehavior: "text_preferred", billingPath: "customer-ai" });
});

test("recovery logs stay generic and do not expose phone, customer message, or full prompt", async () => {
  const logs: string[] = [];
  const sensitivePhone = "+144225232320";
  const sensitiveMessage = "Customer said my address is 123 secret street";
  const sensitivePrompt = "VERY LONG FULL PROMPT BLOCK";

  await runWithExplicitCacheRecovery({
    botId: "bot-1",
    model: "gemini-2.5-flash",
    useExplicitCache: true,
    execute: async (useExplicitCache) => {
      if (useExplicitCache) {
        throw new Error(`INVALID_ARGUMENT ${sensitivePhone} ${sensitiveMessage} ${sensitivePrompt}`);
      }
      return { ok: true };
    },
    logger: {
      warn: (message: string) => logs.push(message),
    },
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0], "[AI-Process] Explicit cache failed, retrying normal full prompt.");
  assert.equal(logs[0].includes(sensitivePhone), false);
  assert.equal(logs[0].includes(sensitiveMessage), false);
  assert.equal(logs[0].includes(sensitivePrompt), false);
});
