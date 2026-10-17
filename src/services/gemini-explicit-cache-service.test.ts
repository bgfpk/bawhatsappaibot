import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetGeminiExplicitCacheTestDeps,
  __setGeminiExplicitCacheTestDeps,
  buildExplicitCacheRequestConfig,
  buildGeminiExplicitCacheKey,
  getOrCreateGeminiExplicitCache,
} from "./gemini-explicit-cache-service.ts";

test.afterEach(() => {
  __resetGeminiExplicitCacheTestDeps();
});

function buildInput(overrides: Partial<any> = {}) {
  return {
    aiClient: {
      caches: {
        create: async () => ({ name: "cachedContents/abc123456789", expireTime: "2026-06-09T12:00:00.000Z" }),
        get: async () => ({ name: "cachedContents/abc123456789" }),
        update: async () => ({ name: "cachedContents/abc123456789", expireTime: "2026-06-09T12:30:00.000Z" }),
      },
    },
    model: "gemini-2.5-flash",
    botId: "account:contact-7462108984f6@example.invalid",
    stablePrefix: "Stable prompt block only.",
    stablePrefixHash: "abc123stable",
    stablePrefixTokenEstimate: 3000,
    ...overrides,
  };
}

test("cache key includes bot id, model, and stable hash", () => {
  const key = buildGeminiExplicitCacheKey({
    botId: "account:contact-7462108984f6@example.invalid",
    model: "gemini-2.5-flash",
    stablePrefixHash: "abc123stable",
  });
  assert.ok(key.includes("account:contact-7462108984f6@example.invalid"));
  assert.ok(key.includes("gemini-2.5-flash"));
  assert.ok(key.includes("abc123stable"));
});

test("stable prompt above min tokens triggers cache attempt", async () => {
  let created = 0;
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => true,
    getMinTokens: () => 2048,
  });
  const input = buildInput({
    aiClient: {
      caches: {
        create: async () => {
          created++;
          return { name: "cachedContents/abc123456789", expireTime: "2026-06-09T12:00:00.000Z" };
        },
        get: async () => ({ name: "cachedContents/abc123456789" }),
      },
    },
  });

  const result = await getOrCreateGeminiExplicitCache(input);

  assert.equal(created, 1);
  assert.equal(result.telemetry.explicitCacheUsed, true);
  assert.equal(result.telemetry.explicitCacheCreated, true);
  assert.equal(result.telemetry.explicitCacheRequestSucceeded, true);
});

test("stable prompt below min tokens does not create cache", async () => {
  let created = 0;
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => true,
    getMinTokens: () => 2048,
  });
  const result = await getOrCreateGeminiExplicitCache(buildInput({
    stablePrefixTokenEstimate: 1200,
    aiClient: {
      caches: {
        create: async () => {
          created++;
          return { name: "cachedContents/abc123456789", expireTime: "2026-06-09T12:00:00.000Z" };
        },
        get: async () => ({ name: "cachedContents/abc123456789" }),
      },
    },
  }));

  assert.equal(created, 0);
  assert.equal(result.cachedContentName, "");
  assert.equal(result.telemetry.fallbackReason, "stable_prefix_below_min_tokens");
});

test("cache hit path returns cached content reference and request config excludes stable prompt", async () => {
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => true,
    getMinTokens: () => 2048,
    now: () => 1_700_000_000_000,
  });
  const first = await getOrCreateGeminiExplicitCache(buildInput({
    aiClient: {
      caches: {
        create: async () => ({ name: "cachedContents/abc123456789", expireTime: "2026-06-09T12:00:00.000Z" }),
        get: async () => ({ name: "cachedContents/abc123456789" }),
      },
    },
  }));
  const second = await getOrCreateGeminiExplicitCache(buildInput({
    aiClient: {
      caches: {
        create: async () => {
          throw new Error("should not recreate");
        },
        get: async () => ({ name: "cachedContents/abc123456789" }),
      },
    },
  }));
  const config = buildExplicitCacheRequestConfig({
    systemInstruction: "dynamic only",
    cachedContentName: second.cachedContentName,
    baseConfig: { tools: [] },
  });

  assert.equal(first.telemetry.explicitCacheCreated, true);
  assert.equal(second.telemetry.explicitCacheUsed, true);
  assert.equal(second.telemetry.explicitCacheRequestAttempted, false);
  assert.equal(second.telemetry.explicitCacheRequestSucceeded, false);
  assert.equal(config.cachedContent, "cachedContents/abc123456789");
  assert.equal(typeof config.systemInstruction, "undefined");
  assert.equal(typeof config.tools, "undefined");
  assert.ok(!JSON.stringify(config).includes("Stable prompt block only."));
});

test("non-cached request config keeps system instruction and tools", () => {
  const config = buildExplicitCacheRequestConfig({
    systemInstruction: "full prompt",
    tools: [{ functionDeclarations: [] }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
  });

  assert.equal(config.systemInstruction, "full prompt");
  assert.equal(Array.isArray(config.tools), true);
  assert.deepEqual(config.toolConfig, { functionCallingConfig: { mode: "AUTO" } });
});

test("cache failure falls back cleanly", async () => {
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => true,
    getMinTokens: () => 2048,
  });
  const result = await getOrCreateGeminiExplicitCache(buildInput({
    aiClient: {
      caches: {
        create: async () => {
          throw new Error("cache create failed");
        },
        get: async () => null,
      },
    },
  }));

  assert.equal(result.cachedContentName, "");
  assert.equal(result.telemetry.fallbackReason, "cache_create_failed");
  assert.equal(result.telemetry.explicitCacheRequestAttempted, true);
  assert.equal(result.telemetry.explicitCacheRequestSucceeded, false);
});

test("model fallback does not reuse wrong-model cache", async () => {
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => true,
    getMinTokens: () => 2048,
  });
  const first = await getOrCreateGeminiExplicitCache(buildInput());
  const second = await getOrCreateGeminiExplicitCache(buildInput({
    model: "gemini-3-flash-preview",
    aiClient: {
      caches: {
        create: async () => ({ name: "cachedContents/preview987654321", expireTime: "2026-06-09T12:00:00.000Z" }),
        get: async () => ({ name: "cachedContents/preview987654321" }),
      },
    },
  }));

  assert.notEqual(first.cachedContentName, second.cachedContentName);
});

test("explicit cache disabled uses normal fallback", async () => {
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => false,
  });
  const result = await getOrCreateGeminiExplicitCache(buildInput());
  assert.equal(result.cachedContentName, "");
  assert.equal(result.telemetry.fallbackReason, "disabled");
});

test("client Cache Boost off disables explicit cache even when global cache is enabled", async () => {
  let created = 0;
  __setGeminiExplicitCacheTestDeps({
    isEnabled: () => true,
  });
  const result = await getOrCreateGeminiExplicitCache(buildInput({
    cacheBoostEnabled: false,
    aiClient: {
      caches: {
        create: async () => {
          created++;
          return { name: "cachedContents/abc123456789", expireTime: "2026-06-09T12:00:00.000Z" };
        },
        get: async () => ({ name: "cachedContents/abc123456789" }),
      },
    },
  }));

  assert.equal(created, 0);
  assert.equal(result.cachedContentName, "");
  assert.equal(result.telemetry.explicitCacheEnabled, false);
  assert.equal(result.telemetry.explicitCacheRequestAttempted, false);
  assert.equal(result.telemetry.explicitCacheRequestSucceeded, false);
  assert.equal(result.telemetry.fallbackReason, "disabled");
});
