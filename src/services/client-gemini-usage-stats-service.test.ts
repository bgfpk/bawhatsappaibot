import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientGeminiUsageSummary,
  summarizeClientGeminiUsageStats,
} from "./client-gemini-usage-stats-service.ts";

test("billing stats include custom Gemini cycle count/cost and Cache Boost count/cost", () => {
  const stats = summarizeClientGeminiUsageStats([
    { type: "client_gemini_message_cycle", amount: 2, cost: 0.002 },
    { type: "client_gemini_explicit_cache_boost", amount: 1, cost: 0.001 },
    { type: "customer_ai_text_reply", amount: 5, cost: 0.015 },
  ]);

  assert.deepEqual(stats, {
    customGeminiCycles: 2,
    customGeminiRequests: 2,
    customGeminiCost: 0.002,
    cacheBoostCharges: 1,
    cacheBoostCost: 0.001,
  });
});

test("usage summary preserves Cache Boost status and date windows", () => {
  const summary = buildClientGeminiUsageSummary({
    cacheBoostEnabled: true,
    todayRows: [{ type: "client_gemini_message_cycle", amount: 1, cost: 0.001 }],
    sevenDayRows: [{ type: "client_gemini_message_cycle", amount: 3, cost: 0.003 }],
    totalRows: [{ type: "client_gemini_explicit_cache_boost", amount: 2, cost: 0.002 }],
    totalTelemetryRows: [
      { purpose: "ai_customer_summary", cacheEligible: true, cacheAttempted: true, cacheAttached: true, cacheHit: true, cachedTokens: 500, uncachedInputTokens: 1500, cacheBoostCharged: true },
      { cacheAttempted: true, cacheHit: false, cachedTokens: 0, uncachedInputTokens: 2000, cacheMissReason: "cache_miss_zero_cached_tokens" },
    ],
  });

  assert.equal(summary.cacheBoostEnabled, true);
  assert.equal(summary.today.customGeminiCycles, 1);
  assert.equal(summary.last7Days.customGeminiCycles, 3);
  assert.equal(summary.total.cacheBoostCharges, 2);
  assert.equal(summary.total.cacheBoostCost, 0.002);
  assert.equal(summary.cacheBoostStats.total.attempts, 2);
  assert.equal(summary.cacheBoostStats.total.eligible, 1);
  assert.equal(summary.cacheBoostStats.total.attached, 1);
  assert.equal(summary.cacheBoostStats.total.hits, 1);
  assert.equal(summary.cacheBoostStats.total.misses, 1);
  assert.equal(summary.cacheBoostStats.total.cachedTokens, 500);
  assert.equal(summary.cacheBoostStats.total.cacheBoostCharges, 1);
});

test("usage summary treats historical per-request rows as custom Gemini cycles", () => {
  const stats = summarizeClientGeminiUsageStats([
    { type: "client_gemini_api_request", amount: 1, cost: 0.001 },
  ]);

  assert.equal(stats.customGeminiCycles, 1);
  assert.equal(stats.customGeminiRequests, 1);
  assert.equal(stats.customGeminiCost, 0.001);
});
