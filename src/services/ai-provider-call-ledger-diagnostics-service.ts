import type { AiProviderCallLedgerRecord } from "./ai-provider-call-ledger-service.ts";

type LedgerAccountProfile = {
  accountId?: string;
  name?: string;
  email?: string;
  plan?: string;
  paidWalletUsage?: number;
  freeCreditUsage?: number;
  totalUsageCharges?: number;
};

const NO_SEND_OUTCOMES = new Set(["failed", "skipped", "blocked", "no_send"]);
const CUSTOMER_VISIBLE_PROBLEM_OUTCOMES = new Set(["failed", "skipped", "blocked", "no_send"]);
const NO_REVENUE_CHARGE_OUTCOMES = new Set(["no_charge", "skipped", "unknown"]);

function clean(value: any, limit = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function numberValue(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseLedgerDoc(doc: any): AiProviderCallLedgerRecord | null {
  const id = clean(doc?.$id || doc?.id, 40);
  if (!id.startsWith("aipl_")) return null;
  try {
    const parsed = JSON.parse(String(doc?.value || "{}"));
    return { ...parsed, id: clean(parsed?.id || id, 40) };
  } catch {
    return null;
  }
}

function makeCounterRow(key: string, extra: Record<string, any> = {}) {
  return {
    ...extra,
    count: 0,
    helperBackgroundCalls: 0,
    customerVisibleCalls: 0,
    noSendFailedCalls: 0,
    backgroundNoCustomerMessageCalls: 0,
    customerVisibleFailedOrBlockedCalls: 0,
    chargedCalls: 0,
    noChargeCalls: 0,
    expectedWalletCharge: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedProviderCost: 0,
    lastSeenAt: 0,
    key,
  };
}

function isBackgroundNoCustomerMessage(row: AiProviderCallLedgerRecord) {
  return Boolean(row.helper || row.background) && row.finalSendOutcome === "no_send";
}

function isCustomerVisibleProblem(row: AiProviderCallLedgerRecord) {
  return Boolean(row.customerVisible) && CUSTOMER_VISIBLE_PROBLEM_OUTCOMES.has(row.finalSendOutcome);
}

function isConfirmedSentWithoutMatchedCharge(row: AiProviderCallLedgerRecord) {
  return Boolean(
    row.customerVisible &&
    row.finalSendOutcome === "sent" &&
    row.chargeOutcome === "no_charge" &&
    row.idempotencyKey &&
    row.billingGroupKey &&
    row.receiptId &&
    row.relatedMessageId
  );
}

function addLedgerStats(target: any, row: AiProviderCallLedgerRecord) {
  const expected = numberValue(row.expectedWalletCharge);
  target.count += 1;
  if (row.helper || row.background) target.helperBackgroundCalls += 1;
  if (row.customerVisible) target.customerVisibleCalls += 1;
  if (NO_SEND_OUTCOMES.has(row.finalSendOutcome)) target.noSendFailedCalls += 1;
  if (isBackgroundNoCustomerMessage(row)) target.backgroundNoCustomerMessageCalls += 1;
  if (isCustomerVisibleProblem(row)) target.customerVisibleFailedOrBlockedCalls += 1;
  if (row.chargeOutcome === "charged") target.chargedCalls += 1;
  if (NO_REVENUE_CHARGE_OUTCOMES.has(row.chargeOutcome)) target.noChargeCalls += 1;
  target.expectedWalletCharge = Number((Number(target.expectedWalletCharge || 0) + expected).toFixed(6));
  target.inputTokens += numberValue(row.inputTokens);
  target.cachedTokens += numberValue(row.cachedTokens);
  target.outputTokens += numberValue(row.outputTokens);
  target.totalTokens += numberValue(row.totalTokens);
  target.estimatedProviderCost += numberValue(row.estimatedProviderCost);
  target.lastSeenAt = Math.max(Number(target.lastSeenAt || 0), Number(row.updatedAt || row.timestamp || 0));
}

function riskLabel(row: any) {
  if (row.customerVisibleFailedOrBlockedCalls >= 5 || row.helperBackgroundCalls >= 25) return "high";
  if (row.customerVisibleFailedOrBlockedCalls >= 2 || row.helperBackgroundCalls >= 8 || row.noChargeCalls >= 8) return "watch";
  return "normal";
}

function sortByCount(rows: Record<string, any>, limit = 20) {
  return Object.values(rows)
    .map((row: any) => ({ ...row, risk: riskLabel(row) }))
    .sort((a: any, b: any) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, limit);
}

function sortByRisk(rows: Record<string, any>, limit = 20) {
  return Object.values(rows)
    .map((row: any) => ({ ...row, risk: riskLabel(row) }))
    .sort((a: any, b: any) => {
      const aScore = Number(a.customerVisibleFailedOrBlockedCalls || 0) * 4 + Number(a.helperBackgroundCalls || 0) * 2 + Number(a.noChargeCalls || 0);
      const bScore = Number(b.customerVisibleFailedOrBlockedCalls || 0) * 4 + Number(b.helperBackgroundCalls || 0) * 2 + Number(b.noChargeCalls || 0);
      return bScore - aScore || Number(b.count || 0) - Number(a.count || 0);
    })
    .slice(0, limit);
}

function buildOwnerSummary(input: {
  total: number;
  helper: number;
  customerVisible: number;
  backgroundNoCustomerMessage: number;
  customerVisibleProblem: number;
  charged: number;
  notLinked: number;
}) {
  const insights: string[] = [];
  if (!input.total) {
    insights.push("No AI provider-call ledger records were found for this date range yet.");
  } else {
    insights.push(`${input.helper} of ${input.total} AI calls were internal/background work, not direct customer replies.`);
    if (input.backgroundNoCustomerMessage) {
      insights.push(`${input.backgroundNoCustomerMessage} calls were normal internal AI work with no customer message, such as summaries or manual learning.`);
    }
    if (input.customerVisibleProblem) {
      insights.push(`${input.customerVisibleProblem} customer-visible AI calls failed, were blocked, skipped, or did not reach a send outcome.`);
    }
    if (input.notLinked) {
      insights.push(`${input.notLinked} calls were not clearly linked to a wallet charge yet; review these before scaling.`);
    }
  }
  const status = input.customerVisibleProblem > 0 || input.notLinked > input.charged ? "review_needed" : "normal";
  return {
    status,
    headline: status === "review_needed" ? "Review AI cost leakage before scaling." : "AI ledger activity looks normal for this range.",
    insights,
  };
}

export function summarizeAiProviderCallLedger(
  rows: any[] = [],
  allowedAccounts?: Set<string>,
  accountProfiles: Record<string, LedgerAccountProfile> = {},
) {
  const parsed = rows.map(parseLedgerDoc).filter(Boolean) as AiProviderCallLedgerRecord[];
  const filtered = allowedAccounts
    ? parsed.filter((row) => !row.accountId || allowedAccounts.has(row.accountId))
    : parsed;
  const byPurpose: Record<string, any> = {};
  const byCategory: Record<string, any> = {};
  const byAccount: Record<string, any> = {};
  const byHelperAccount: Record<string, any> = {};
  const byNoSendAccount: Record<string, any> = {};
  const byChargeOutcome: Record<string, any> = {};
  const bySendOutcome: Record<string, any> = {};
  const byWalletChargeCategory: Record<string, any> = {};
  let helperBackgroundCallCount = 0;
  let customerVisibleCallCount = 0;
  let noSendFailedCallCount = 0;
  let backgroundNoCustomerMessageCallCount = 0;
  let customerVisibleFailedOrBlockedCallCount = 0;
  let summaryCallCount = 0;
  let retryRepairCallCount = 0;
  let chargedCallCount = 0;
  let noChargeUnknownCallCount = 0;
  let confirmedSentWithoutMatchedChargeCount = 0;
  let expectedWalletChargeTotal = 0;
  let inputTokens = 0;
  let cachedTokens = 0;
  let outputTokens = 0;
  let estimatedProviderCost = 0;
  let successCount = 0;
  let failureCount = 0;
  let http499Count = 0;
  let timeoutCount = 0;
  let abortCount = 0;

  for (const row of filtered) {
    inputTokens += numberValue(row.inputTokens);
    cachedTokens += numberValue(row.cachedTokens);
    outputTokens += numberValue(row.outputTokens);
    estimatedProviderCost += numberValue(row.estimatedProviderCost);
    if (row.failureType) failureCount += 1; else successCount += 1;
    if (row.httpStatus === 499) http499Count += 1;
    if (row.timedOut) timeoutCount += 1;
    if (row.aborted) abortCount += 1;
    if (row.helper || row.background) helperBackgroundCallCount += 1;
    if (row.customerVisible) customerVisibleCallCount += 1;
    if (NO_SEND_OUTCOMES.has(row.finalSendOutcome)) noSendFailedCallCount += 1;
    if (isBackgroundNoCustomerMessage(row)) backgroundNoCustomerMessageCallCount += 1;
    if (isCustomerVisibleProblem(row)) customerVisibleFailedOrBlockedCallCount += 1;
    if (row.category === "summary") summaryCallCount += 1;
    if (row.category === "retry" || row.category === "repair") retryRepairCallCount += 1;
    if (row.chargeOutcome === "charged") chargedCallCount += 1;
    if (NO_REVENUE_CHARGE_OUTCOMES.has(row.chargeOutcome)) noChargeUnknownCallCount += 1;
    if (isConfirmedSentWithoutMatchedCharge(row)) confirmedSentWithoutMatchedChargeCount += 1;
    expectedWalletChargeTotal = Number((expectedWalletChargeTotal + numberValue(row.expectedWalletCharge)).toFixed(6));

    const purpose = clean(row.purpose || "unknown", 120) || "unknown";
    byPurpose[purpose] = byPurpose[purpose] || makeCounterRow(purpose, { purpose, category: row.category || "unknown" });
    addLedgerStats(byPurpose[purpose], row);

    const category = clean(row.category || "unknown", 80) || "unknown";
    byCategory[category] = byCategory[category] || makeCounterRow(category, { category });
    addLedgerStats(byCategory[category], row);

    const chargeOutcome = clean(row.chargeOutcome || "unknown", 40) || "unknown";
    byChargeOutcome[chargeOutcome] = byChargeOutcome[chargeOutcome] || makeCounterRow(chargeOutcome, { chargeOutcome });
    addLedgerStats(byChargeOutcome[chargeOutcome], row);

    const finalSendOutcome = clean(row.finalSendOutcome || "unknown", 40) || "unknown";
    bySendOutcome[finalSendOutcome] = bySendOutcome[finalSendOutcome] || makeCounterRow(finalSendOutcome, { finalSendOutcome });
    addLedgerStats(bySendOutcome[finalSendOutcome], row);

    const walletChargeCategory = clean(row.walletChargeCategory || "none", 100) || "none";
    byWalletChargeCategory[walletChargeCategory] = byWalletChargeCategory[walletChargeCategory] || makeCounterRow(walletChargeCategory, { walletChargeCategory });
    addLedgerStats(byWalletChargeCategory[walletChargeCategory], row);

    const accountId = clean(row.accountId, 100);
    if (accountId) {
      const profile = accountProfiles[accountId] || {};
      const base = {
        accountId,
        name: clean(profile.name || profile.email || accountId, 140),
        email: clean(profile.email, 140),
        plan: clean(profile.plan, 80),
        paidWalletUsage: numberValue(profile.paidWalletUsage),
        freeCreditUsage: numberValue(profile.freeCreditUsage),
        totalUsageCharges: numberValue(profile.totalUsageCharges),
      };
      byAccount[accountId] = byAccount[accountId] || makeCounterRow(accountId, base);
      addLedgerStats(byAccount[accountId], row);
      if (row.helper || row.background) {
        byHelperAccount[accountId] = byHelperAccount[accountId] || makeCounterRow(accountId, base);
        addLedgerStats(byHelperAccount[accountId], row);
      }
      if (NO_SEND_OUTCOMES.has(row.finalSendOutcome)) {
        byNoSendAccount[accountId] = byNoSendAccount[accountId] || makeCounterRow(accountId, base);
        addLedgerStats(byNoSendAccount[accountId], row);
      }
    }
  }

  const helperShare = filtered.length ? Number((helperBackgroundCallCount / filtered.length).toFixed(4)) : 0;
  const noSendShare = filtered.length ? Number((noSendFailedCallCount / filtered.length).toFixed(4)) : 0;
  const backgroundNoCustomerMessageShare = filtered.length ? Number((backgroundNoCustomerMessageCallCount / filtered.length).toFixed(4)) : 0;
  const customerVisibleProblemShare = filtered.length ? Number((customerVisibleFailedOrBlockedCallCount / filtered.length).toFixed(4)) : 0;

  return {
    label: "diagnostic_estimated_provider_call_ledger",
    note: "Provider-call ledger counts are diagnostic and do not equal Google invoice cost or wallet revenue.",
    ownerFriendlyNote: "Internal AI work is normal for summaries, learning, and repairs. Unreconciled or legacy calls need metadata review and are not automatically uncharged.",
    reconciliationHelpText: "These calls do not contain enough ledger metadata to confirm a matching wallet charge. This does not automatically mean they were uncharged.",
    ledgerLimitationNote: "Historical DeepInfra spending is available from the provider import. Purpose and account attribution is available only for calls recorded after the DeepInfra ledger was enabled.",
    totalProviderCallLedgerCount: filtered.length,
    helperBackgroundCallCount,
    internalAiWorkCallCount: helperBackgroundCallCount,
    customerVisibleCallCount,
    noSendFailedCallCount,
    backgroundNoCustomerMessageCallCount,
    customerVisibleFailedOrBlockedCallCount,
    summaryCallCount,
    retryRepairCallCount,
    chargedCallCount,
    noChargeUnknownCallCount,
    notLinkedToWalletChargeCallCount: noChargeUnknownCallCount,
    unreconciledOrLegacyCallCount: noChargeUnknownCallCount,
    confirmedSentWithoutMatchedChargeCount,
    expectedWalletChargeTotal,
    inputTokens,
    cachedTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedProviderCost: Number(estimatedProviderCost.toFixed(9)),
    successCount,
    failureCount,
    http499Count,
    timeoutCount,
    abortCount,
    helperBackgroundShare: helperShare,
    internalAiWorkShare: helperShare,
    noSendFailedShare: noSendShare,
    backgroundNoCustomerMessageShare,
    customerVisibleProblemShare,
    ownerSummary: buildOwnerSummary({
      total: filtered.length,
      helper: helperBackgroundCallCount,
      customerVisible: customerVisibleCallCount,
      backgroundNoCustomerMessage: backgroundNoCustomerMessageCallCount,
      customerVisibleProblem: customerVisibleFailedOrBlockedCallCount,
      charged: chargedCallCount,
      notLinked: noChargeUnknownCallCount,
    }),
    displayLabels: {
      helperBackgroundCalls: "Internal AI work",
      noSendFailedCalls: "No customer message / failed send",
      backgroundNoCustomerMessageCalls: "Normal background AI, no customer message",
      customerVisibleFailedOrBlockedCalls: "Customer-visible failed or blocked",
      noChargeCalls: "Unreconciled or legacy calls",
      expectedWalletCharge: "Expected wallet value",
    },
    topPurposesByCallCount: sortByCount(byPurpose, 20),
    topCategoriesByCallCount: sortByCount(byCategory, 20),
    topAccountsByAiCallCount: sortByCount(byAccount, 20),
    topHelperBackgroundAccounts: sortByRisk(byHelperAccount, 20),
    topNoSendFailedAccounts: sortByRisk(byNoSendAccount, 20),
    chargeOutcomeBreakdown: sortByCount(byChargeOutcome, 12),
    finalSendOutcomeBreakdown: sortByCount(bySendOutcome, 12),
    walletChargeCategoryBreakdown: sortByCount(byWalletChargeCategory, 12),
  };
}
