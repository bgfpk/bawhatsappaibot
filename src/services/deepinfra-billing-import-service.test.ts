import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetDeepInfraBillingTestDeps,
  __setDeepInfraBillingTestDeps,
  fetchDeepInfraUsage,
  normalizeDeepInfraUsageCost,
} from "./deepinfra-billing-import-service.ts";

const originalKey = process.env.DEEPINFRA_API_KEY;
const cache = new Map<string, string>();

test.beforeEach(() => {
  cache.clear();
  process.env.DEEPINFRA_API_KEY = "secret_test_token";
  __setDeepInfraBillingTestDeps({
    now: () => 10_000,
    getSystemConfig: async (key) => cache.get(key) || null,
    setSystemConfig: async (key, value) => { cache.set(key, value); },
  } as any);
});

test.afterEach(() => {
  __resetDeepInfraBillingTestDeps();
  if (originalKey === undefined) delete process.env.DEEPINFRA_API_KEY;
  else process.env.DEEPINFRA_API_KEY = originalKey;
});

function response(status: number, payload: any = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

function liveShape() {
  return {
    months: [
      { period: "2026.06", total_cost: 53, invoice_id: "invoice_1", items: [{ model: { model_name: "model", task: "text" }, units: 4_069_894, rate: 0.00001, cost: 41, pricing_type: "input_tokens" }] },
      { period: "2026.07", total_cost: 306, invoice_id: "INVALID", items: [{ model: { model_name: "model", task: "text" }, units: 27_367_970, rate: 0.000009, cost: 246, pricing_type: "input_tokens" }] },
    ],
    initial_month: "2026.06",
  };
}

test("normalizes verified DeepInfra usage cents to USD without guessing unknown units", () => {
  assert.equal(normalizeDeepInfraUsageCost(359, "cents"), 3.59);
  assert.equal(normalizeDeepInfraUsageCost(41, "cents"), 0.41);
  assert.equal(normalizeDeepInfraUsageCost(359, null), null);
  assert.equal(normalizeDeepInfraUsageCost(359, "USD"), null);
});

test("uses exact endpoint, bearer auth, required from, and optional to", async () => {
  __setDeepInfraBillingTestDeps({ fetchImpl: (async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.deepinfra.com/payment/usage");
    assert.equal(url.searchParams.get("from"), "2026.06");
    assert.equal(url.searchParams.get("to"), "2026.07");
    assert.equal((init?.headers as any).Authorization, "Bearer secret_test_token");
    return response(200, liveShape());
  }) as any });
  await fetchDeepInfraUsage(true, { from: "2026.06", to: "2026.07" });
});

test("aggregates two months exactly once and preserves normalized item and raw values", async () => {
  __setDeepInfraBillingTestDeps({ fetchImpl: async () => response(200, liveShape()) as any });
  const result = await fetchDeepInfraUsage(true, { from: "2026.06", to: "2026.07" });
  assert.equal(result.rawTotalCost, 359);
  assert.equal(result.rawCostUnit, "cents");
  assert.equal(result.totalCostUsd, 3.59);
  assert.equal(result.currency, "USD");
  assert.equal(result.costNormalizationVerified, true);
  assert.equal(result.months.length, 2);
  assert.deepEqual(result.months.map((month) => month.totalCostUsd), [0.53, 3.06]);
  assert.equal(result.months[0].items[0].rawCost, 41);
  assert.equal(result.months[0].items[0].costUsd, 0.41);
  assert.equal(result.months[0].items[0].rawRate, 0.00001);
  assert.equal(result.months[0].items[0].rateUsd, 0.0000001);
});

test("period-keyed cache preserves raw and normalized values without cross-period reuse", async () => {
  let calls = 0;
  __setDeepInfraBillingTestDeps({ fetchImpl: (async () => { calls += 1; return response(200, liveShape()); }) as any });
  const first = await fetchDeepInfraUsage(true, { from: "2026.06", to: "2026.07" });
  const cached = await fetchDeepInfraUsage(false, { from: "2026.06", to: "2026.07" });
  await fetchDeepInfraUsage(false, { from: "2026.07", to: "2026.07" });
  assert.equal(first.rawTotalCost, cached.rawTotalCost);
  assert.equal(first.totalCostUsd, cached.totalCostUsd);
  assert.equal(cached.status, "cached");
  assert.equal(calls, 2);
});

test("malformed or missing costs never create a false USD amount", async () => {
  __setDeepInfraBillingTestDeps({ fetchImpl: async () => response(200, { months: [{ period: "2026.07", items: [] }] }) as any });
  const result = await fetchDeepInfraUsage(true);
  assert.equal(result.totalCostUsd, null);
  assert.equal(result.costNormalizationVerified, false);
  assert.equal(result.source, "invalid_cost");
});

for (const status of [401, 403, 422, 429, 500]) {
  test(`handles HTTP ${status} without exposing token`, async () => {
    __setDeepInfraBillingTestDeps({ fetchImpl: async () => response(status) as any });
    const result = await fetchDeepInfraUsage(true);
    assert.equal(result.source, `http_${status}`);
    assert.equal(JSON.stringify(result).includes("secret_test_token"), false);
  });
}

test("handles timeout, malformed JSON, and missing key", async () => {
  __setDeepInfraBillingTestDeps({ fetchImpl: (async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; }) as any });
  assert.equal((await fetchDeepInfraUsage(true)).source, "timeout");
  __setDeepInfraBillingTestDeps({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad"); } }) as any });
  assert.equal((await fetchDeepInfraUsage(true)).source, "malformed_json");
  delete process.env.DEEPINFRA_API_KEY;
  assert.equal((await fetchDeepInfraUsage(true)).source, "missing_api_key");
});
