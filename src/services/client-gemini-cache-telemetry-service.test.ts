import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetClientGeminiCacheTelemetryTestDeps,
  __setClientGeminiCacheTelemetryTestDeps,
  normalizeClientGeminiCacheTelemetry,
  recordClientGeminiCacheTelemetry,
  summarizeClientGeminiCacheTelemetry,
} from "./client-gemini-cache-telemetry-service.ts";

test.afterEach(() => {
  __resetClientGeminiCacheTelemetryTestDeps();
});

test("cache telemetry normalizes token counts without secrets or prompt content", () => {
  const telemetry = normalizeClientGeminiCacheTelemetry({
    userId: "acct_1",
    cachedTokens: 300,
    inputTokens: 1000,
    outputTokens: 45,
    thoughtTokens: 5,
    totalTokens: 1050,
    cacheAttempted: true,
    cacheEligible: true,
    cacheBoostEnabled: true,
    cacheAttached: true,
    cacheNameHash: "safe_hash_1",
    cacheBoostCharged: true,
    purpose: "customer_ai_reply",
  });

  assert.equal(telemetry.cachedTokens, 300);
  assert.equal(telemetry.uncachedInputTokens, 700);
  assert.equal(telemetry.cacheHit, true);
  assert.equal(telemetry.cacheEligible, true);
  assert.equal(telemetry.cacheBoostEnabled, true);
  assert.equal(telemetry.cacheNameHash, "safe_hash_1");
  assert.equal((telemetry as any).prompt, undefined);
  assert.equal((telemetry as any).apiKey, undefined);
});

test("cache telemetry persists compact safe JSON", async () => {
  let saved: any = null;
  __setClientGeminiCacheTelemetryTestDeps({
    createDocument: async (_databaseId, _collection, _id, doc) => {
      saved = doc;
      return doc;
    },
    idUnique: () => "unique_1",
    now: () => 3000,
  } as any);

  const result = await recordClientGeminiCacheTelemetry({
    userId: "acct_1",
    cachedTokens: 0,
    inputTokens: 900,
    cacheAttempted: true,
    cacheAttached: true,
    cacheMissReason: "cache_miss_zero_cached_tokens",
  });

  assert.equal(result.recorded, true);
  const parsed = JSON.parse(saved.value);
  assert.equal(parsed.userId, "acct_1");
  assert.equal(parsed.cacheMissReason, "no_cached_tokens_reported");
  assert.equal(parsed.cacheBoostCharged, false);
});

test("cache telemetry summary counts attempts, hits, misses, tokens, charges, and skipped reasons", () => {
  const summary = summarizeClientGeminiCacheTelemetry([
    { purpose: "reply", cacheEligible: true, cacheAttempted: true, cacheAttached: true, cacheHit: true, cachedTokens: 100, uncachedInputTokens: 900, cacheBoostCharged: true },
    { purpose: "reply", cacheEligible: true, cacheAttempted: true, cacheAttached: true, cacheHit: false, cachedTokens: 0, uncachedInputTokens: 1000, cacheMissReason: "cache_miss_zero_cached_tokens" },
    { purpose: "manual_learning", provider: "client_custom_gemini", model: "gemini-2.5-flash-lite", cacheEligible: false, cacheAttempted: false, cacheHit: false, inputTokens: 50, cacheMissReason: "small_context" },
  ]);

  assert.equal(summary.attempts, 2);
  assert.equal(summary.eligible, 2);
  assert.equal(summary.attached, 2);
  assert.equal(summary.hits, 1);
  assert.equal(summary.misses, 1);
  assert.equal(summary.skippedSmallContext, 1);
  assert.equal(summary.cachedTokens, 100);
  assert.equal(summary.uncachedTokens, 1900);
  assert.equal(summary.cacheBoostCharges, 1);
  assert.equal(summary.skippedReasons.no_cached_tokens_reported, 1);
  assert.equal(summary.coverageByPurpose[0].purpose, "reply");
  assert.equal(summary.coverageByPurpose[0].calls, 2);
  assert.equal(summary.coverageByPurpose[1].model, "gemini-2.5-flash-lite");
});
