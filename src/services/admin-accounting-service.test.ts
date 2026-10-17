import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetAdminAccountingTestDeps,
  __setAdminAccountingTestDeps,
  buildAdminAccountingReport,
} from "./admin-accounting-service.ts";
import { COLLECTIONS } from "../config/appwrite-client.ts";

test.afterEach(() => {
  __resetAdminAccountingTestDeps();
});

test("admin accounting aggregates revenue, errors, estimated free/paid usage, and paginated usage rows", async () => {
  const pageCalls: Record<string, number> = {};
  const users = [
    { $id: "user_1", email: "contact-e233d4a29013@example.invalid", role: "user", plan_id: "growth_plan", plan_expiry: 9999999999, trial_expires_at: 0 },
    { $id: "trial_1", email: "contact-63f6f5c42a8b@example.invalid", role: "user", plan_id: "starter_plan", plan_expiry: 0, trial_expires_at: 9999999999 },
    { $id: "admin_1", email: "contact-258d8dc916db@example.invalid", role: "admin" },
  ];
  const usageRows = Array.from({ length: 5002 }, (_, index) => ({
    $id: `usage_${index}`,
    user_id: "user_1",
    timestamp: 1000 + index,
    type: "text_reply",
    cost: 0.001,
    amount: 1,
  }));
  const transactions = [
    { $id: "tx_topup", user_id: "user_1", created_at: 1500, type: "topup", amount: 25, description: "Creem wallet top-up $25 confirmed" },
    { $id: "tx_plan", user_id: "user_1", created_at: 1600, type: "subscription", amount: 29, description: "Creem monthly plan confirmed" },
    { $id: "tx_addon", user_id: "user_1", created_at: 1700, type: "addon", amount: 7, description: "Creem add-on confirmed" },
    { $id: "tx_failed", user_id: "user_1", created_at: 1800, type: "payment_status", amount: 0, description: "Creem payment.failed received" },
    { $id: "tx_failed_dup", user_id: "user_1", created_at: 1810, type: "payment_status", amount: 0, description: "Creem payment.failed received" },
    { $id: "tx_free", user_id: "trial_1", created_at: 1900, type: "signup_credit", amount: 1, description: "7-day trial AI test credit" },
    { $id: "tx_admin", user_id: "admin_1", created_at: 2000, type: "topup", amount: 999, description: "Admin topup ignored" },
  ];

  __setAdminAccountingTestDeps({
    getProviderCostSummary: async () => ({
      providerCostUnavailable: true,
      unavailableReason: "not_configured",
      providerCostSource: "google_cloud_billing_bigquery",
      providerCostStatus: "unavailable",
      grossProviderCost: null,
      credits: null,
      netProviderCost: null,
      currency: "USD",
      dailyRows: [],
      serviceSkuBreakdown: [],
    }),
    listDocuments: async (_databaseId: string, collection: string) => {
      pageCalls[collection] = Number(pageCalls[collection] || 0) + 1;
      if (collection === COLLECTIONS.USERS) return { documents: users };
      if (collection === COLLECTIONS.WALLET_TRANSACTIONS) return { documents: transactions };
      if (collection === COLLECTIONS.USER_SUBSCRIPTIONS) return { documents: [] };
      if (collection === COLLECTIONS.USAGE_ANALYTICS) {
        return {
          documents: pageCalls[collection] === 1 ? usageRows.slice(0, 5000) : usageRows.slice(5000),
        };
      }
      return { documents: [] };
    },
  } as any);

  const report = await buildAdminAccountingReport(1, 10000);

  assert.equal(pageCalls[COLLECTIONS.USAGE_ANALYTICS], 2);
  assert.equal(report.summary.walletTopupRevenue, 25);
  assert.equal(report.summary.subscriptionRevenue, 29);
  assert.equal(report.summary.addonSetupRevenue, 7);
  assert.equal(report.summary.grossRevenue, 61);
  assert.equal(report.paymentErrors.length, 1);
  assert.equal(report.paymentErrors[0].count, 2);
  assert.equal(report.summary.freeCreditUsage, 1);
  assert.equal(report.summary.paidWalletUsage, 4.002);
  assert.equal((report.revenueBySource as any).usage, undefined);
  assert.equal(report.usageConsumptionBySource.paidWallet, 4.002);
  assert.equal(report.usageConsumptionBySource.freeCredit, 1);
  assert.equal(report.usageConsumptionBySource.totalUsageCharges, 5.002);
  assert.equal(report.summary.activePaidAccounts, 1);
  assert.equal(report.summary.activeTrialAccounts, 1);
  assert.equal(report.historicalSplitStatus, "estimated_or_unknown");
  assert.equal(report.topClients[0].splitStatus, "estimated");
});

test("admin accounting separates paid, trial, manual legacy, expired, starter, and admin accounts", async () => {
  const users = [
    { $id: "paid_1", email: "contact-e44789c35346@example.invalid", role: "user", plan_id: "growth_plan", plan_expiry: 9999999999, trial_expires_at: 0 },
    { $id: "trial_1", email: "contact-63f6f5c42a8b@example.invalid", role: "user", plan_id: "starter_plan", plan_expiry: 0, trial_expires_at: 9999999999 },
    { $id: "wallet_paid_1", email: "contact-32c63c304fcf@example.invalid", role: "user", plan_id: "starter_plan", plan_expiry: 0, trial_expires_at: 9999999999, wallet_balance: 0.5 },
    { $id: "manual_1", email: "contact-a35a6c89c203@example.invalid", role: "user", plan_id: "pro_plan", plan_expiry: 9999999999, trial_expires_at: 0 },
    { $id: "expired_1", email: "contact-c71e8779c4e9@example.invalid", role: "user", plan_id: "growth_plan", plan_expiry: 1, trial_expires_at: 0 },
    { $id: "starter_1", email: "contact-f98fac5008e4@example.invalid", role: "user", plan_id: "starter_plan", plan_expiry: 0, trial_expires_at: 0 },
    { $id: "admin_1", email: "contact-258d8dc916db@example.invalid", role: "admin", plan_id: "pro_plan", plan_expiry: 9999999999 },
  ];
  const subscriptions = [
    { $id: "sub_paid", user_id: "paid_1", type: "growth_plan", expires_at: 9999999999, creem_subscription_id: "sub_123" },
  ];
  const transactions = [
    { $id: "tx_wallet_paid", user_id: "wallet_paid_1", created_at: 1000, type: "topup", amount: 5, description: "Creem wallet top-up $5 confirmed" },
  ];

  __setAdminAccountingTestDeps({
    getProviderCostSummary: async () => ({
      providerCostUnavailable: true,
      unavailableReason: "not_configured",
      providerCostSource: "google_cloud_billing_bigquery",
      providerCostStatus: "unavailable",
      grossProviderCost: null,
      credits: null,
      netProviderCost: null,
      currency: "USD",
      dailyRows: [],
      serviceSkuBreakdown: [],
    }),
    listDocuments: async (_databaseId: string, collection: string) => {
      if (collection === COLLECTIONS.USERS) return { documents: users };
      if (collection === COLLECTIONS.USER_SUBSCRIPTIONS) return { documents: subscriptions };
      if (collection === COLLECTIONS.WALLET_TRANSACTIONS) return { documents: transactions };
      return { documents: [] };
    },
  } as any);

  const report = await buildAdminAccountingReport(1, 10000);

  assert.equal(report.summary.activePaidAccounts, 1);
  assert.equal(report.summary.activeTrialAccounts, 1);
  assert.equal(report.summary.manualLegacyActiveAccounts, 1);
  assert.equal(report.summary.starterFreeAccounts, 1);
  assert.equal(report.summary.activeSubscriptionRows, 1);
});

test("admin accounting shows provider cost and profit only when imported cost is available", async () => {
  const users = [
    { $id: "user_1", email: "contact-e44789c35346@example.invalid", role: "user", plan_id: "growth_plan", plan_expiry: 9999999999, trial_expires_at: 0 },
  ];
  const transactions = [
    { $id: "tx_topup", user_id: "user_1", created_at: 1770000000, type: "topup", amount: 25, description: "Creem wallet top-up $25 confirmed" },
  ];

  __setAdminAccountingTestDeps({
    getProviderCostSummary: async () => ({
      providerCostSource: "google_cloud_billing_bigquery",
      providerCostStatus: "imported",
      grossProviderCost: 4,
      credits: 1,
      netProviderCost: 3,
      currency: "USD",
      dailyRows: [{ date: "2026-02-03", grossProviderCost: 4, credits: 1, netProviderCost: 3 }],
      serviceSkuBreakdown: [{ serviceDescription: "Vertex AI", skuDescription: "Gemini", grossProviderCost: 4, credits: 1, netProviderCost: 3 }],
      importedAt: 1770000100,
    }),
    listDocuments: async (_databaseId: string, collection: string) => {
      if (collection === COLLECTIONS.USERS) return { documents: users };
      if (collection === COLLECTIONS.WALLET_TRANSACTIONS) return { documents: transactions };
      return { documents: [] };
    },
  } as any);

  const report = await buildAdminAccountingReport(1769990400, 1770076800);

  assert.equal(report.summary.grossRevenue, 25);
  assert.equal(report.summary.estimatedProviderCost, 3);
  assert.equal(report.summary.estimatedProfit, 22);
  assert.equal(report.summary.providerCostStatus, "imported");
  assert.match(report.summary.providerCostRevenueMappingNote, /does not map one-to-one/);
  assert.match(report.summary.helperBackgroundAiCostNote, /helper prompts/);
  assert.ok(report.reconciliationWarnings.some((warning: string) => /not a one-to-one map/.test(warning)));
  assert.equal(report.providerCost.serviceSkuBreakdown[0].skuDescription, "Gemini");
  assert.equal(report.dailyRows.find((row: any) => row.date === "2026-02-03")?.providerCost, 3);
});

test("admin accounting includes report-only AI provider ledger diagnostics", async () => {
  const users = [
    { $id: "user_1", email: "contact-e44789c35346@example.invalid", role: "user", business_name: "Paid Bakery", plan_id: "growth_plan", plan_expiry: 9999999999, trial_expires_at: 0 },
    { $id: "user_2", role: "user", plan_id: "starter_plan", plan_expiry: 0, trial_expires_at: 0 },
  ];
  const usageRows = [
    { $id: "usage_1", user_id: "user_1", timestamp: 1770000000, type: "text_reply", cost: 1.25, amount: 1 },
    { $id: "usage_2", user_id: "user_1", timestamp: 1770000001, type: "text_reply", cost: 0.5, amount: 1 },
  ];
  const ledgerDocs = [
    { $id: "aipl_visible", value: JSON.stringify({ accountId: "user_1", purpose: "customer_ai_reply", category: "customer_reply", customerVisible: true, helper: false, finalSendOutcome: "sent", estimatedProviderCost: 0.09 }), updated_at: 1770000001 },
    { $id: "aipl_summary", value: JSON.stringify({ accountId: "user_1", purpose: "ai_customer_summary", category: "summary", customerVisible: false, helper: true, finalSendOutcome: "no_send" }), updated_at: 1770000002 },
    { $id: "aipl_fallback", value: JSON.stringify({ accountId: "user_2", purpose: "ai_customer_summary", category: "summary", customerVisible: false, helper: true, finalSendOutcome: "no_send" }), updated_at: 1770000003 },
  ];

  __setAdminAccountingTestDeps({
    fetchDeepInfraUsage: async (_force, period) => {
      assert.deepEqual(period, { from: "2026.02", to: "2026.02" });
      return {
        rawTotalCost: 359,
        rawCostUnit: "cents",
        totalCostUsd: 3.59,
        currency: "USD",
        costNormalizationSource: "verified_test",
        costNormalizationVerified: true,
        months: [],
        status: "current",
        importedAt: 1,
        source: "deepinfra_payment_usage",
        selectedPeriod: period,
      };
    },
    getProviderCostSummary: async () => ({
      providerCostUnavailable: true,
      unavailableReason: "not_configured",
      providerCostSource: "google_cloud_billing_bigquery",
      providerCostStatus: "unavailable",
      grossProviderCost: null,
      credits: null,
      netProviderCost: null,
      currency: "USD",
      dailyRows: [],
      serviceSkuBreakdown: [],
    }),
    listDocuments: async (_databaseId: string, collection: string) => {
      if (collection === COLLECTIONS.USERS) return { documents: users };
      if (collection === COLLECTIONS.USAGE_ANALYTICS) return { documents: usageRows };
      if (collection === COLLECTIONS.SYSTEM_CONFIGS) return { documents: ledgerDocs };
      return { documents: [] };
    },
  } as any);

  const report = await buildAdminAccountingReport(1769990400, 1770076800);
  const paidAccount = report.aiProviderCallLedgerDiagnostics.topAccountsByAiCallCount.find((row: any) => row.accountId === "user_1");
  const fallbackAccount = report.aiProviderCallLedgerDiagnostics.topAccountsByAiCallCount.find((row: any) => row.accountId === "user_2");

  assert.equal(report.summary.aiProviderLedgerCount, 3);
  assert.equal(report.summary.customerVisibleAiCallCount, 1);
  assert.equal(report.summary.helperBackgroundAiCallCount, 2);
  assert.equal(report.summary.noSendFailedAiCallCount, 2);
  assert.equal(report.summary.summaryAiCallCount, 2);
  assert.equal(report.summary.deepinfraBillingRawTotalCost, 359);
  assert.equal(report.summary.deepinfraBillingTotalCostUsd, 3.59);
  assert.equal(report.summary.deepinfraBillingVarianceUsd, 3.5);
  assert.match(report.summary.aiProviderLedgerNote, /diagnostic/i);
  assert.equal(report.aiProviderCallLedgerDiagnostics.topPurposesByCallCount.length, 2);
  assert.equal(paidAccount.name, "Paid Bakery");
  assert.equal(paidAccount.email, "contact-e44789c35346@example.invalid");
  assert.equal(paidAccount.paidWalletUsage, 0.75);
  assert.equal(paidAccount.freeCreditUsage, 1);
  assert.equal(paidAccount.totalUsageCharges, 1.75);
  assert.equal(fallbackAccount.name, "user_2");
  assert.equal(fallbackAccount.email, "");
});

test("admin accounting groups repeated billing notification rows by account type status and date", async () => {
  const users = [
    { $id: "user_1", email: "contact-63f6f5c42a8b@example.invalid", role: "user", name: "Azeem Tajamul", trial_expires_at: 9999999999 },
  ];
  const transactions = [4, 5, 6, 7].map((hour) => ({
    $id: `billing_notice_${hour}`,
    user_id: "user_1",
    created_at: 1781840000 + hour * 3600,
    type: "billing_notification",
    amount: 0,
    description: [
      "BlackArrow billing update",
      "Account: Azeem Tajamul",
      "Type: Trial expiring soon",
      "Status: 1 day left",
      "Action: Choose a paid plan in Billing to continue after trial.",
    ].join("\n"),
  }));

  __setAdminAccountingTestDeps({
    getProviderCostSummary: async () => ({
      providerCostUnavailable: true,
      unavailableReason: "not_configured",
      providerCostSource: "google_cloud_billing_bigquery",
      providerCostStatus: "unavailable",
      grossProviderCost: null,
      credits: null,
      netProviderCost: null,
      currency: "USD",
      dailyRows: [],
      serviceSkuBreakdown: [],
    }),
    listDocuments: async (_databaseId: string, collection: string) => {
      if (collection === COLLECTIONS.USERS) return { documents: users };
      if (collection === COLLECTIONS.WALLET_TRANSACTIONS) return { documents: transactions };
      return { documents: [] };
    },
  } as any);

  const report = await buildAdminAccountingReport(1781800000, 1781900000);

  assert.equal(report.paymentErrors.length, 1);
  assert.equal(report.paymentErrors[0].count, 4);
  assert.match(report.paymentErrors[0].description, /Trial expiring soon/);
});

test("July accounting combines providers once and distinguishes cash loss from usage pricing margin", async () => {
  __setAdminAccountingTestDeps({
    fetchDeepInfraUsage: async (_force, period) => {
      assert.deepEqual(period, { from: "2026.07", to: "2026.07" });
      return {
        rawTotalCost: 307,
        rawCostUnit: "cents",
        totalCostUsd: 3.07,
        currency: "USD",
        costNormalizationSource: "verified_test",
        costNormalizationVerified: true,
        months: [{ period: "2026.07", rawTotalCost: 307, totalCostUsd: 3.07, invoiceId: "INVALID", items: [] }],
        status: "current",
        importedAt: 1,
        source: "deepinfra_payment_usage",
        selectedPeriod: period,
      };
    },
    getProviderCostSummary: async () => ({
      providerCostSource: "google_cloud_billing_bigquery",
      providerCostStatus: "imported",
      grossProviderCost: 1.6,
      credits: 0,
      netProviderCost: 1.6,
      totalGoogleCloudNetCost: 1.6,
      aiGeminiProviderCost: 1.6,
      currency: "USD",
      dailyRows: [],
      serviceSkuBreakdown: [],
    }),
    listDocuments: async (_databaseId: string, collection: string) => {
      if (collection === COLLECTIONS.USERS) return { documents: [{ $id: "user_1", email: "contact-b4c9a289323b@example.invalid", role: "user" }] };
      if (collection === COLLECTIONS.USAGE_ANALYTICS) return { documents: [{ $id: "usage_1", user_id: "user_1", timestamp: 1782864001, type: "text_reply", cost: 4.49 }] };
      return { documents: [] };
    },
  } as any);

  const report = await buildAdminAccountingReport(1782864000, 1785542400);
  assert.equal(report.summary.grossRevenue, 0);
  assert.equal(report.summary.totalUsageCharges, 4.49);
  assert.equal(report.summary.googleCloudCostUsd, 1.6);
  assert.equal(report.summary.deepInfraCostUsd, 3.07);
  assert.equal(report.summary.totalProviderCostUsd, 4.67);
  assert.equal(report.summary.totalAiProviderCostUsd, 4.67);
  assert.equal(report.summary.cashProfitLossUsd, -4.67);
  assert.equal(report.summary.usagePricingMarginUsd, -0.18);
  assert.ok(["Current month-to-date DeepInfra spend", "Monthly DeepInfra spend"].includes(report.summary.deepinfraSpendLabel));
});
