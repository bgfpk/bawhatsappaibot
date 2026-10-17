import test from "node:test";
import assert from "node:assert/strict";

import { summarizeAiProviderCallLedger } from "./ai-provider-call-ledger-diagnostics-service.ts";

function ledgerDoc(id: string, value: Record<string, any>) {
  return {
    $id: `aipl_${id}`,
    value: JSON.stringify({ id: `aipl_${id}`, ...value }),
  };
}

test("summarizeAiProviderCallLedger returns leakage breakdowns by purpose, category, account, and outcome", () => {
  const docs = [
    ledgerDoc("reply_sent", {
      accountId: "acct_1",
      purpose: "customer_ai_reply",
      category: "customer_reply",
      customerVisible: true,
      helper: false,
      background: false,
      finalSendOutcome: "sent",
      chargeOutcome: "charged",
      walletChargeCategory: "customer_ai_text_reply",
      expectedWalletCharge: 0.003,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      updatedAt: 100,
    }),
    ledgerDoc("summary_no_send", {
      accountId: "acct_1",
      purpose: "ai_customer_summary",
      category: "summary",
      customerVisible: false,
      helper: true,
      background: true,
      finalSendOutcome: "no_send",
      chargeOutcome: "no_charge",
      walletChargeCategory: "none",
      expectedWalletCharge: 0,
      inputTokens: 70,
      outputTokens: 20,
      totalTokens: 90,
      updatedAt: 110,
    }),
    ledgerDoc("followup_blocked", {
      accountId: "acct_2",
      purpose: "ai_smart_followup_generation",
      category: "smart_followup",
      customerVisible: true,
      helper: false,
      background: false,
      finalSendOutcome: "blocked",
      chargeOutcome: "skipped",
      walletChargeCategory: "ai_smart_followup_text",
      expectedWalletCharge: 0.003,
      updatedAt: 120,
    }),
    ledgerDoc("confirmed_unmatched", {
      accountId: "acct_2",
      purpose: "customer_ai_reply",
      category: "customer_reply",
      customerVisible: true,
      finalSendOutcome: "sent",
      chargeOutcome: "no_charge",
      idempotencyKey: "request_1",
      billingGroupKey: "group_1",
      receiptId: "receipt_1",
      relatedMessageId: "message_1",
      updatedAt: 130,
    }),
  ];

  const summary = summarizeAiProviderCallLedger(docs, new Set(["acct_1", "acct_2"]), {
    acct_1: { name: "Client One", email: "contact-d25354f65825@example.invalid", paidWalletUsage: 0.25, freeCreditUsage: 0.1, totalUsageCharges: 0.35 },
    acct_2: { name: "Client Two", email: "contact-1f6c1f35fba8@example.invalid" },
  });

  assert.equal(summary.totalProviderCallLedgerCount, 4);
  assert.equal(summary.customerVisibleCallCount, 3);
  assert.equal(summary.helperBackgroundCallCount, 1);
  assert.equal(summary.internalAiWorkCallCount, 1);
  assert.equal(summary.noSendFailedCallCount, 2);
  assert.equal(summary.backgroundNoCustomerMessageCallCount, 1);
  assert.equal(summary.customerVisibleFailedOrBlockedCallCount, 1);
  assert.equal(summary.notLinkedToWalletChargeCallCount, 3);
  assert.equal(summary.summaryCallCount, 1);
  assert.equal(summary.chargedCallCount, 1);
  assert.equal(summary.noChargeUnknownCallCount, 3);
  assert.equal(summary.unreconciledOrLegacyCallCount, 3);
  assert.equal(summary.confirmedSentWithoutMatchedChargeCount, 1);
  assert.equal(summary.expectedWalletChargeTotal, 0.006);
  assert.equal(summary.helperBackgroundShare, 0.25);
  assert.equal(summary.internalAiWorkShare, 0.25);
  assert.equal(summary.noSendFailedShare, 0.5);
  assert.equal(summary.backgroundNoCustomerMessageShare, 0.25);
  assert.equal(summary.customerVisibleProblemShare, 0.25);
  assert.equal(summary.ownerSummary.status, "review_needed");
  assert.match(summary.ownerSummary.headline, /Review AI cost leakage/);
  assert.match(summary.ownerFriendlyNote, /Internal AI work is normal/);
  assert.equal(summary.displayLabels.noSendFailedCalls, "No customer message / failed send");
  assert.equal(summary.displayLabels.noChargeCalls, "Unreconciled or legacy calls");
  assert.match(summary.reconciliationHelpText, /does not automatically mean they were uncharged/);
  assert.match(summary.ledgerLimitationNote, /Historical DeepInfra spending/);

  assert.equal(summary.topCategoriesByCallCount[0].category, "customer_reply");
  assert.ok(summary.topPurposesByCallCount.some((row: any) => row.purpose === "ai_customer_summary"));
  assert.equal(summary.topAccountsByAiCallCount[0].accountId, "acct_1");
  assert.equal(summary.topAccountsByAiCallCount[0].name, "Client One");
  assert.equal(summary.topHelperBackgroundAccounts[0].accountId, "acct_1");
  assert.equal(summary.topNoSendFailedAccounts[0].risk, "normal");
  assert.ok(summary.chargeOutcomeBreakdown.some((row: any) => row.chargeOutcome === "skipped"));
  assert.ok(summary.finalSendOutcomeBreakdown.some((row: any) => row.finalSendOutcome === "blocked"));
  assert.ok(summary.walletChargeCategoryBreakdown.some((row: any) => row.walletChargeCategory === "customer_ai_text_reply"));
});

test("summarizeAiProviderCallLedger filters accounts outside the allowed set", () => {
  const docs = [
    ledgerDoc("allowed", { accountId: "allowed", purpose: "customer_ai_reply", category: "customer_reply", customerVisible: true, finalSendOutcome: "sent", chargeOutcome: "charged" }),
    ledgerDoc("blocked", { accountId: "blocked", purpose: "ai_customer_summary", category: "summary", helper: true, finalSendOutcome: "no_send", chargeOutcome: "no_charge" }),
  ];

  const summary = summarizeAiProviderCallLedger(docs, new Set(["allowed"]));

  assert.equal(summary.totalProviderCallLedgerCount, 1);
  assert.equal(summary.topAccountsByAiCallCount[0].accountId, "allowed");
  assert.equal(summary.summaryCallCount, 0);
});
