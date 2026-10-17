import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  __resetGoogleBillingImportTestDeps,
  __setGoogleBillingImportTestDeps,
  getProviderCostSummary,
  fetchGoogleProviderCostRows,
  fetchGoogleBillingDiagnostics,
  isGoogleBillingImportConfigured,
  isLikelyGoogleAiBillingRow,
  classifyGoogleBillingRow,
  summarizeGoogleProviderCostRows,
} from "./google-billing-bigquery-import-service.ts";

test.afterEach(() => {
  __resetGoogleBillingImportTestDeps();
});

test("reports unavailable when BigQuery export env is missing", async () => {
  __setGoogleBillingImportTestDeps({ env: {} as any });

  assert.equal(isGoogleBillingImportConfigured(), false);
  const summary = await getProviderCostSummary({ from: 1, to: 2 });

  assert.equal(summary.providerCostUnavailable, true);
  assert.equal(summary.providerCostStatus, "unavailable");
  assert.equal(summary.netProviderCost, null);
});

test("aggregates gross cost, credits, net cost, daily rows, and SKU breakdown", () => {
  const summary = summarizeGoogleProviderCostRows([
    {
      date: "2026-06-01",
      projectId: "p1",
      projectName: "Project",
      serviceDescription: "Vertex AI",
      skuDescription: "Gemini 2.5 Flash input",
      cost: 4,
      credits: -1.25,
      currency: "USD",
      usageAmount: 100,
      usageUnit: "tokens",
    },
    {
      date: "2026-06-01",
      projectId: "p1",
      projectName: "Project",
      serviceDescription: "Generative Language API",
      skuDescription: "Gemini output",
      cost: 2,
      credits: -0.5,
      currency: "USD",
      usageAmount: 10,
      usageUnit: "requests",
    },
    {
      date: "2026-06-01",
      projectId: "p1",
      projectName: "Project",
      serviceDescription: "Cloud Logging",
      skuDescription: "Log ingestion",
      cost: 10,
      credits: 0,
      currency: "USD",
      usageAmount: 10,
      usageUnit: "gibibyte",
    },
  ]);

  assert.equal(summary.grossProviderCost, 6);
  assert.equal(summary.credits, 1.75);
  assert.equal(summary.netProviderCost, 4.25);
  assert.equal(summary.totalGoogleCloudCost, 16);
  assert.equal(summary.totalGoogleCloudNetCost, 14.25);
  assert.equal(summary.otherGoogleCloudCost, 10);
  assert.equal(summary.dailyRows[0].netProviderCost, 4.25);
  assert.equal(summary.serviceSkuBreakdown.length, 3);
  assert.equal(summary.serviceSkuBreakdown.some((row) => row.matchedCategory === "non_ai_google"), true);
  assert.equal(summary.serviceSkuBreakdown[0].projectId, "p1");
});

test("query failure falls back to cached summary when available", async () => {
  const cache: Record<string, string> = {};
  __setGoogleBillingImportTestDeps({
    env: {
      GOOGLE_BILLING_BIGQUERY_PROJECT_ID: "billing-project",
      GOOGLE_BILLING_BIGQUERY_DATASET: "billing",
      GOOGLE_BILLING_BIGQUERY_TABLE: "gcp_export",
    } as any,
    createBigQueryClient: async () => ({
      query: async () => {
        throw new Error("BigQuery unavailable");
      },
    }),
    getSystemConfig: async (key: string) => cache[key] || null,
    setSystemConfig: async (key: string, value: string) => {
      cache[key] = value;
    },
  });
  const cached = {
    providerCostSource: "google_cloud_billing_bigquery",
    providerCostStatus: "imported",
    grossProviderCost: 3,
    credits: 1,
    netProviderCost: 2,
    currency: "USD",
    dailyRows: [],
    serviceSkuBreakdown: [],
    cachedAt: 123,
  };
  const firstKey = `google_billing_provider_cost_${crypto.createHash("sha1").update("2026-06-01:2026-06-01").digest("hex").slice(0, 12)}`;
  cache[firstKey] = JSON.stringify(cached);

  const summary = await getProviderCostSummary({
    from: Date.parse("2026-06-01T00:00:00Z") / 1000,
    to: Date.parse("2026-06-02T00:00:00Z") / 1000,
  });

  assert.equal(summary.providerCostStatus, "cached");
  assert.equal(summary.netProviderCost, 2);
});

test("BigQuery query imports all Google rows and omits optional project filter when not configured", async () => {
  let capturedOptions: any = null;
  __setGoogleBillingImportTestDeps({
    env: {
      GOOGLE_BILLING_BIGQUERY_PROJECT_ID: "billing-project",
      GOOGLE_BILLING_BIGQUERY_DATASET: "billing",
      GOOGLE_BILLING_BIGQUERY_TABLE: "gcp_export",
    } as any,
    createBigQueryClient: async () => ({
      query: async (options: any) => {
        capturedOptions = options;
        return [[{
          date: "2026-06-01",
          serviceDescription: "Cloud Logging",
          skuDescription: "Log ingestion",
          cost: 1,
          credits: 0,
          currency: "USD",
        }]];
      },
    }),
  });

  const rows = await fetchGoogleProviderCostRows({ from: 1, to: 2 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].matchedCategory, "non_ai_google");
  assert.doesNotMatch(capturedOptions.query, /LOWER\(COALESCE\(service\.description/i);
  assert.equal(Object.hasOwn(capturedOptions.params, "projectFilter"), false);
});

test("filters Gemini/API rows safely by service or SKU text", () => {
  assert.equal(isLikelyGoogleAiBillingRow({ serviceDescription: "Vertex AI", skuDescription: "Gemini tokens" }), true);
  assert.equal(isLikelyGoogleAiBillingRow({ serviceDescription: "Generative Language API", skuDescription: "Generate content output token" }), true);
  assert.equal(isLikelyGoogleAiBillingRow({ serviceDescription: "Other API", skuDescription: "input token usage" }), true);
  assert.equal(isLikelyGoogleAiBillingRow({ serviceDescription: "Cloud Storage", skuDescription: "Standard storage" }), false);
  assert.equal(classifyGoogleBillingRow({ serviceDescription: "Cloud Logging", skuDescription: "Log ingestion" }), "non_ai_google");
});

test("warns when Google billing rows import but AI classifier matches nothing", () => {
  const summary = summarizeGoogleProviderCostRows([{
    date: "2026-06-01",
    projectId: "p1",
    projectName: "Project",
    serviceDescription: "Cloud Logging",
    skuDescription: "Log ingestion",
    cost: 4,
    credits: 0,
    currency: "USD",
    usageAmount: 1,
    usageUnit: "gibibyte",
  }]);

  assert.equal(summary.totalGoogleCloudCost, 4);
  assert.equal(summary.netProviderCost, 0);
  assert.match(summary.classifierWarning || "", /classifier matched 0 rows/);
});

test("diagnostics expose table row count, date range, projects, and top rows", async () => {
  __setGoogleBillingImportTestDeps({
    env: {
      GOOGLE_BILLING_BIGQUERY_PROJECT_ID: "billing-project",
      GOOGLE_BILLING_BIGQUERY_DATASET: "billing",
      GOOGLE_BILLING_BIGQUERY_TABLE: "gcp_export",
    } as any,
    createBigQueryClient: async () => ({
      query: async () => [[{
        rowCount: { value: "123" },
        minUsageStartTime: { value: "2026-06-01 00:00:00" },
        maxUsageStartTime: { value: "2026-06-20 00:00:00" },
        selectedRangeUnfilteredNetCost: { value: "7.5" },
        availableProjects: [{ projectId: "other-project", cost: { value: "8" } }],
        topRows: [{
          serviceDescription: "Generative Language API",
          skuDescription: "Gemini input token",
          projectId: "other-project",
          cost: { value: "5" },
          credits: { value: "-1" },
          netCost: { value: "4" },
          currency: "USD",
        }],
      }]],
    }),
  });

  const diagnostics = await fetchGoogleBillingDiagnostics({ from: 1, to: 2 });

  assert.equal(diagnostics?.rowCount, 123);
  assert.equal(diagnostics?.selectedRangeUnfilteredNetCost, 7.5);
  assert.equal(diagnostics?.availableProjectIds[0].projectId, "other-project");
  assert.equal(diagnostics?.topRows[0].matchedCategory, "ai_gemini");
});

test("project filter mismatch produces warning when unfiltered range has cost", async () => {
  __setGoogleBillingImportTestDeps({
    env: {
      GOOGLE_BILLING_BIGQUERY_PROJECT_ID: "billing-project",
      GOOGLE_BILLING_BIGQUERY_DATASET: "billing",
      GOOGLE_BILLING_BIGQUERY_TABLE: "gcp_export",
      GOOGLE_BILLING_PROJECT_FILTER: "selected-project",
    } as any,
    createBigQueryClient: async () => ({
      query: async (options: any) => {
        if (String(options.query).includes("WITH range_rows")) {
          return [[{
            rowCount: 10,
            selectedRangeUnfilteredNetCost: 12,
            availableProjects: [{ projectId: "other-project", cost: 12 }],
            topRows: [],
          }]];
        }
        assert.deepEqual(options.params.projectFilters, ["selected-project"]);
        return [[]];
      },
    }),
    setSystemConfig: async () => {},
  });

  const summary = await getProviderCostSummary({ from: 1, to: 2 });

  assert.equal(summary.totalGoogleCloudNetCost, 0);
  assert.match(summary.projectFilterWarning || "", /project filter excluded/);
  assert.equal(summary.diagnostics?.availableProjectIds[0].projectId, "other-project");
});

test("detailed export stale and standard table missing returns diagnostics without reliable profit", async () => {
  __setGoogleBillingImportTestDeps({
    env: {
      GOOGLE_BILLING_BIGQUERY_PROJECT_ID: "billing-project",
      GOOGLE_BILLING_BIGQUERY_DATASET: "billing",
      GOOGLE_BILLING_BIGQUERY_TABLE: "gcp_billing_export_resource_v1_01677E_F8C6EB_FD1D62",
    } as any,
    createBigQueryClient: async () => ({
      query: async (options: any) => {
        const query = String(options.query || "");
        if (query.includes("gcp_billing_export_v1_01677E_F8C6EB_FD1D62")) {
          throw new Error("Not found: Table standard export table was not found");
        }
        if (query.includes("WITH range_rows")) {
          return [[{
            rowCount: 1500,
            selectedRangeRows: 0,
            minUsageStartTime: { value: "2026-06-01 00:00:00" },
            maxUsageStartTime: { value: "2026-06-10 00:00:00" },
            selectedRangeUnfilteredNetCost: 0,
            availableProjects: [],
            topRows: [],
          }]];
        }
        return [[]];
      },
    }),
    setSystemConfig: async () => {},
  });

  const summary = await getProviderCostSummary({
    from: Date.parse("2026-06-19T00:00:00Z") / 1000,
    to: Date.parse("2026-06-20T00:00:00Z") / 1000,
  });

  assert.equal(summary.providerCostUnavailable, true);
  assert.equal(summary.reliabilityStatus, "stale_or_backfilling");
  assert.equal(summary.selectedRangeRows, 0);
  assert.equal(summary.diagnostics?.rowCount, 1500);
  assert.match(summary.standardTableStatus || "", /not created yet/);
  assert.equal(summary.activeExportTable, "gcp_billing_export_resource_v1_01677E_F8C6EB_FD1D62");
});
