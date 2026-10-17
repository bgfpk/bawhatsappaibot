import { Query, databases, COLLECTIONS, DATABASE_ID } from "../config/appwrite-client.ts";
import { getUsageCategoryLabel, normalizeBillingTimestamp } from "./billing-report-service.ts";
import { summarizeClientGeminiCacheTelemetry } from "./client-gemini-cache-telemetry-service.ts";
import { getProviderCostSummary, type GoogleProviderCostSummary } from "./google-billing-bigquery-import-service.ts";
import { summarizeAiProviderCallLedger } from "./ai-provider-call-ledger-diagnostics-service.ts";
import { fetchDeepInfraUsage } from "./deepinfra-billing-import-service.ts";

const PAGE_LIMIT = 5000;
const SIGNUP_FREE_CREDIT_USD = 1;

type AccountingDeps = {
  listDocuments: typeof databases.listDocuments;
  getProviderCostSummary: typeof getProviderCostSummary;
  fetchDeepInfraUsage: typeof fetchDeepInfraUsage;
};

const accountingDeps: AccountingDeps = {
  listDocuments: databases.listDocuments.bind(databases) as any,
  getProviderCostSummary,
  fetchDeepInfraUsage,
};

export function __setAdminAccountingTestDeps(overrides: Partial<AccountingDeps>) {
  Object.assign(accountingDeps, overrides || {});
}

export function __resetAdminAccountingTestDeps() {
  Object.assign(accountingDeps, {
    listDocuments: databases.listDocuments.bind(databases) as any,
    getProviderCostSummary,
    fetchDeepInfraUsage,
  });
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function money(value: any) {
  return Number(Math.max(0, Number(value || 0)).toFixed(6));
}

function signedMoney(value: any) {
  return Number(Number(value || 0).toFixed(6));
}

function dateKey(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function isAdminRole(role: any) {
  const value = clean(role).toLowerCase();
  return value === "admin" || value === "super_admin" || value === "superadmin";
}

function isInternalTestUser(user: any) {
  const email = clean(user?.email).toLowerCase();
  return email.endsWith("@blackarrow-source.offline.invalid") || email.includes("test@") || email.includes("local.dev@");
}

function isFreeCreditTransaction(transaction: any) {
  const type = clean(transaction?.type).toLowerCase();
  const description = clean(transaction?.description).toLowerCase();
  const amount = Math.abs(Number(transaction?.amount || 0));
  if (type.includes("free_credit") || type.includes("signup_credit") || type.includes("welcome_credit")) return true;
  return amount <= SIGNUP_FREE_CREDIT_USD + 0.0001 &&
    description.includes("credit") &&
    /(free|signup|setup|welcome|starter|trial)/.test(description);
}

function revenueSource(transaction: any) {
  const type = clean(transaction?.type).toLowerCase();
  const description = clean(transaction?.description).toLowerCase();
  const amount = Number(transaction?.amount || 0);
  if (amount <= 0) return "";
  if (type === "topup" || description.includes("top-up") || description.includes("top up")) return "walletTopups";
  if (type.includes("subscription") || type.includes("plan") || description.includes("plan confirmed")) return "subscriptions";
  if (type.includes("addon") || type.includes("setup") || description.includes("add-on") || description.includes("setup")) return "addonsSetup";
  return "other";
}

function isPaymentError(transaction: any) {
  const type = clean(transaction?.type).toLowerCase();
  const description = clean(transaction?.description).toLowerCase();
  return type.includes("payment_status") ||
    type.includes("payment_error") ||
    type.includes("subscription_status") ||
    type.includes("billing_notification") ||
    /(failed|past_due|refund|chargeback|dispute|canceled|cancelled|expired)/.test(description);
}

function normalizeErrorText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/\b(id|ref|checkout|session|payment|subscription)[_:-]?[a-z0-9_-]{6,}\b/g, "$1")
    .replace(/\d{6,}/g, "#")
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

function hasActivePaidSubscription(userId: string, subscriptions: any[], currentTime: number) {
  return (subscriptions || []).some((sub: any) => {
    if (clean(sub?.user_id) !== userId) return false;
    if (Number(sub?.expires_at || 0) <= currentTime) return false;
    const type = clean(sub?.type).toLowerCase();
    return type.includes("plan") || Boolean(clean(sub?.creem_subscription_id || sub?.subscription_id || sub?.payment_id));
  });
}

function hasPaidPlanEvidence(userId: string, user: any, subscriptions: any[], walletTransactions: any[], currentTime: number) {
  if (hasActivePaidSubscription(userId, subscriptions, currentTime)) return true;
  if (clean(user?.creem_subscription_id || user?.subscription_id || user?.payment_id || user?.creem_customer_id)) return true;
  return (walletTransactions || []).some((transaction: any) => {
    if (clean(transaction?.user_id) !== userId) return false;
    if (Number(transaction?.amount || 0) <= 0) return false;
    const source = revenueSource(transaction);
    return source === "subscriptions";
  });
}

function hasAnyPaidAccessEvidence(userId: string, user: any, subscriptions: any[], walletTransactions: any[], currentTime: number) {
  if (hasPaidPlanEvidence(userId, user, subscriptions, walletTransactions, currentTime)) return true;
  if (money(user?.wallet_balance) > SIGNUP_FREE_CREDIT_USD + 0.000001) return true;
  return (walletTransactions || []).some((transaction: any) => {
    if (clean(transaction?.user_id) !== userId) return false;
    if (Number(transaction?.amount || 0) <= 0) return false;
    const source = revenueSource(transaction);
    return source === "walletTopups" || source === "subscriptions";
  });
}

function groupPaymentErrors(rows: any[], usersById: Map<string, any>) {
  const groups = new Map<string, any>();
  for (const row of rows) {
    const key = [
      row.userId,
      clean(row.type).toLowerCase(),
      row.date,
      normalizeErrorText(row.description),
    ].join("|");
    const existing = groups.get(key);
    const user = usersById.get(row.userId) || {};
    if (!existing) {
      groups.set(key, {
        userId: row.userId,
        account: clean(user.name || user.business_name || user.email || row.userId),
        email: clean(user.email),
        type: row.type,
        date: row.date,
        description: row.description,
        latestDescription: row.description,
        firstSeen: row.timestamp,
        lastSeen: row.timestamp,
        count: 1,
        amount: Number(row.amount || 0),
      });
    } else {
      existing.count += 1;
      existing.firstSeen = Math.min(existing.firstSeen, row.timestamp);
      if (row.timestamp >= existing.lastSeen) {
        existing.lastSeen = row.timestamp;
        existing.latestDescription = row.description;
        existing.description = row.description;
      }
      existing.amount = money(Number(existing.amount || 0) + Number(row.amount || 0));
    }
  }
  return Array.from(groups.values()).sort((a: any, b: any) => Number(b.lastSeen || 0) - Number(a.lastSeen || 0));
}

function normalizeRange(fromTime: number, toTime: number) {
  const from = Math.max(0, Math.floor(Number(fromTime || 0)));
  const to = Math.max(from, Math.floor(Number(toTime || Math.floor(Date.now() / 1000))));
  return { from, to };
}

function deepInfraMonth(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 7).replace("-", ".");
}

async function listAllDocuments(collection: string, queries: any[] = []) {
  const rows: any[] = [];
  let cursor = "";
  for (let page = 0; page < 40; page += 1) {
    const pageQueries = [...queries, Query.limit(PAGE_LIMIT)];
    if (cursor) pageQueries.push(Query.cursorAfter(cursor));
    const response = await accountingDeps.listDocuments(DATABASE_ID, collection, pageQueries);
    const docs = (response.documents || []) as any[];
    rows.push(...docs);
    if (docs.length < PAGE_LIMIT) break;
    cursor = docs[docs.length - 1]?.$id || docs[docs.length - 1]?.id || "";
    if (!cursor) break;
  }
  return rows;
}

function ensureDaily(rows: Record<string, any>, date: string) {
  if (!rows[date]) {
    rows[date] = {
      date,
      grossRevenue: 0,
      paidWalletUsage: 0,
      freeCreditUsage: 0,
      unknownUsage: 0,
      totalUsageCharges: 0,
      subscriptions: 0,
      walletTopups: 0,
      addonsSetup: 0,
      paymentErrors: 0,
      providerCost: 0,
      estimatedProfit: null,
    };
  }
  return rows[date];
}

function mergeProviderCostIntoDailyRows(dailyRows: any[], providerCost: GoogleProviderCostSummary | null) {
  const rowsByDate = new Map<string, any>();
  for (const row of dailyRows) rowsByDate.set(row.date, { ...row });
  for (const providerRow of providerCost?.dailyRows || []) {
    const existing = rowsByDate.get(providerRow.date) || ensureDaily({}, providerRow.date);
    existing.providerCost = money(providerRow.netProviderCost);
    existing.estimatedProfit = providerCost?.providerCostUnavailable
      ? null
      : money(Number(existing.grossRevenue || 0) - Number(providerRow.netProviderCost || 0));
    rowsByDate.set(providerRow.date, existing);
  }
  return Array.from(rowsByDate.values()).sort((a: any, b: any) => a.date.localeCompare(b.date));
}

export async function buildAdminAccountingReport(fromTime: number, toTime: number) {
  const range = normalizeRange(fromTime, toTime);
  const [users, usageRows, walletTransactions, subscriptions, paidEvidenceTransactions, cacheTelemetryDocs, deepinfraBillingUsage] = await Promise.all([
    listAllDocuments(COLLECTIONS.USERS),
    listAllDocuments(COLLECTIONS.USAGE_ANALYTICS, [
      Query.greaterThanEqual("timestamp", range.from),
      Query.lessThan("timestamp", range.to),
      Query.orderAsc("timestamp"),
    ]),
    listAllDocuments(COLLECTIONS.WALLET_TRANSACTIONS, [
      Query.greaterThanEqual("created_at", range.from),
      Query.lessThan("created_at", range.to),
      Query.orderAsc("created_at"),
    ]),
    listAllDocuments(COLLECTIONS.USER_SUBSCRIPTIONS).catch(() => []),
    listAllDocuments(COLLECTIONS.WALLET_TRANSACTIONS).catch(() => []),
    listAllDocuments(COLLECTIONS.SYSTEM_CONFIGS, [
      Query.greaterThanEqual("updated_at", range.from),
      Query.lessThan("updated_at", range.to),
      Query.orderAsc("updated_at"),
    ]).catch(() => []),
    accountingDeps.fetchDeepInfraUsage(false, {
      from: deepInfraMonth(range.from),
      to: deepInfraMonth(Math.max(range.from, range.to - 1)),
    }).catch((err) => ({
      rawTotalCost: null,
      rawCostUnit: null,
      totalCostUsd: null,
      currency: "USD" as const,
      costNormalizationSource: "unavailable",
      costNormalizationVerified: false,
      months: [],
      status: "error" as const,
      importedAt: Date.now(),
      source: err?.message || "error",
      selectedPeriod: { from: deepInfraMonth(range.from), to: deepInfraMonth(Math.max(range.from, range.to - 1)) },
    })),
  ]);

  const regularUsers = new Map<string, any>();
  const internalUsers = new Set<string>();
  for (const user of users) {
    const id = clean(user?.$id || user?.id);
    if (!id) continue;
    if (isInternalTestUser(user)) internalUsers.add(id);
    if (!isAdminRole(user?.role)) regularUsers.set(id, user);
  }

  const daily: Record<string, any> = {};
  const usageByCategory: Record<string, any> = {};
  const clientMap: Record<string, any> = {};
  const freeClientMap: Record<string, any> = {};
  const revenueBySource = { subscriptions: 0, walletTopups: 0, addonsSetup: 0, other: 0 };
  const paymentErrors: any[] = [];
  const subscriptionErrors: any[] = [];

  for (const transaction of walletTransactions) {
    const userId = clean(transaction?.user_id);
    if (!regularUsers.has(userId)) continue;
    const timestamp = normalizeBillingTimestamp(transaction?.created_at || transaction?.timestamp);
    const day = ensureDaily(daily, dateKey(timestamp));
    if (isPaymentError(transaction)) {
      const row = {
        timestamp,
        date: dateKey(timestamp),
        userId,
        type: clean(transaction?.type),
        description: clean(transaction?.description).slice(0, 220),
        amount: Number(transaction?.amount || 0),
      };
      paymentErrors.push(row);
      if (clean(transaction?.type).toLowerCase().includes("subscription")) subscriptionErrors.push(row);
      day.paymentErrors += 1;
    }
    if (isFreeCreditTransaction(transaction)) continue;
    const source = revenueSource(transaction);
    if (!source) continue;
    const amount = money(transaction?.amount);
    revenueBySource[source as keyof typeof revenueBySource] += amount;
    day[source] = money(Number(day[source] || 0) + amount);
    day.grossRevenue = money(Number(day.grossRevenue || 0) + amount);
  }

  const freeCreditRemaining: Record<string, number> = {};
  for (const usage of usageRows) {
    const userId = clean(usage?.user_id);
    if (!regularUsers.has(userId)) continue;
    if (freeCreditRemaining[userId] === undefined) freeCreditRemaining[userId] = SIGNUP_FREE_CREDIT_USD;
    const timestamp = normalizeBillingTimestamp(usage?.timestamp || usage?.created_at);
    const day = ensureDaily(daily, dateKey(timestamp));
    const rawCost = money(usage?.cost);
    const freeApplied = Math.min(freeCreditRemaining[userId], rawCost);
    freeCreditRemaining[userId] = money(freeCreditRemaining[userId] - freeApplied);
    const paidEstimated = money(rawCost - freeApplied);
    const label = getUsageCategoryLabel(usage?.type);
    const amount = Math.max(1, Number(usage?.amount || 1));

    day.freeCreditUsage = money(day.freeCreditUsage + freeApplied);
    day.paidWalletUsage = money(day.paidWalletUsage + paidEstimated);
    day.totalUsageCharges = money(day.totalUsageCharges + rawCost);
    day.unknownUsage = money(day.unknownUsage + (freeApplied > 0 && paidEstimated > 0 ? rawCost : 0));

    if (!usageByCategory[label]) usageByCategory[label] = { category: label, amount: 0, cost: 0 };
    usageByCategory[label].amount += amount;
    usageByCategory[label].cost = money(usageByCategory[label].cost + rawCost);

    if (!clientMap[userId]) {
      const user = regularUsers.get(userId) || {};
      clientMap[userId] = {
        userId,
        email: clean(user.email),
        name: clean(user.name || user.business_name || user.email),
        paidWalletUsage: 0,
        freeCreditUsage: 0,
        totalUsageCharges: 0,
        usageEvents: 0,
        splitStatus: "estimated",
        internalTest: internalUsers.has(userId),
      };
    }
    clientMap[userId].paidWalletUsage = money(clientMap[userId].paidWalletUsage + paidEstimated);
    clientMap[userId].freeCreditUsage = money(clientMap[userId].freeCreditUsage + freeApplied);
    clientMap[userId].totalUsageCharges = money(clientMap[userId].totalUsageCharges + rawCost);
    clientMap[userId].usageEvents += amount;
    if (freeApplied > 0) freeClientMap[userId] = clientMap[userId];
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const activePaidAccounts = Array.from(regularUsers.entries()).filter(([userId, user]) => {
    const plan = clean(user?.plan_id).toLowerCase();
    const expiry = Number(user?.plan_expiry || 0);
    return plan && plan !== "starter_plan" && expiry > currentTime && hasPaidPlanEvidence(userId, user, subscriptions, paidEvidenceTransactions, currentTime);
  }).length;
  const activeTrialAccounts = Array.from(regularUsers.entries()).filter(([userId, user]) => {
    return Number(user?.trial_expires_at || 0) > currentTime &&
      !hasAnyPaidAccessEvidence(userId, user, subscriptions, paidEvidenceTransactions, currentTime);
  }).length;
  const manualLegacyActiveAccounts = Array.from(regularUsers.entries()).filter(([userId, user]) => {
    const expiry = Number(user?.plan_expiry || 0);
    if (expiry <= currentTime) return false;
    if (Number(user?.trial_expires_at || 0) > currentTime) return false;
    return !hasPaidPlanEvidence(userId, user, subscriptions, paidEvidenceTransactions, currentTime);
  }).length;
  const starterFreeAccounts = Array.from(regularUsers.values()).filter((user) => {
    const plan = clean(user?.plan_id || "starter_plan").toLowerCase();
    const expiry = Number(user?.plan_expiry || 0);
    const trialExpiry = Number(user?.trial_expires_at || 0);
    return plan === "starter_plan" && trialExpiry <= currentTime && expiry <= currentTime;
  }).length;
  const activeSubscriptionRows = (subscriptions || []).filter((sub: any) => Number(sub?.expires_at || 0) > currentTime);

  const dailyRows = Object.values(daily).sort((a: any, b: any) => a.date.localeCompare(b.date));
  const totalPaidWalletUsage = money(dailyRows.reduce((sum: number, row: any) => sum + Number(row.paidWalletUsage || 0), 0));
  const totalFreeCreditUsage = money(dailyRows.reduce((sum: number, row: any) => sum + Number(row.freeCreditUsage || 0), 0));
  const totalUsageCharges = money(dailyRows.reduce((sum: number, row: any) => sum + Number(row.totalUsageCharges || 0), 0));
  const usageConsumptionBySource = {
    paidWallet: totalPaidWalletUsage,
    freeCredit: totalFreeCreditUsage,
    totalUsageCharges,
  };

  const grossRevenue = money(revenueBySource.subscriptions + revenueBySource.walletTopups + revenueBySource.addonsSetup + revenueBySource.other);
  const providerCost = await accountingDeps.getProviderCostSummary(range).catch((error: any) => ({
    providerCostUnavailable: true,
    unavailableReason: clean(error?.message) || "provider_cost_lookup_failed",
    providerCostSource: "google_cloud_billing_bigquery",
    providerCostStatus: "error",
    grossProviderCost: null,
    credits: null,
    netProviderCost: null,
    currency: "USD",
    dailyRows: [],
    serviceSkuBreakdown: [],
    providerCostBreakdown: [],
    totalGoogleCloudCost: null,
    totalGoogleCloudCredits: null,
    totalGoogleCloudNetCost: null,
    aiGeminiProviderCost: null,
    otherGoogleCloudCost: null,
    unclassifiedGoogleCost: null,
  } as GoogleProviderCostSummary));
  const providerCostAvailable = !providerCost.providerCostUnavailable && providerCost.netProviderCost !== null && providerCost.netProviderCost !== undefined;
  const dailyRowsWithProviderCost = mergeProviderCostIntoDailyRows(dailyRows, providerCost);
  const groupedPaymentErrors = groupPaymentErrors(paymentErrors, regularUsers);
  const groupedSubscriptionErrors = groupPaymentErrors(subscriptionErrors, regularUsers);
  const cacheTelemetryRows = (cacheTelemetryDocs || []).flatMap((doc: any) => {
    if (!String(doc?.$id || doc?.id || "").startsWith("cgct_")) return [];
    try {
      const parsed = JSON.parse(String(doc.value || "{}"));
      return regularUsers.has(clean(parsed.userId)) ? [parsed] : [];
    } catch {
      return [];
    }
  });
  const cacheBoostTelemetryStats = summarizeClientGeminiCacheTelemetry(cacheTelemetryRows);
  const accountProfiles = Object.fromEntries(
    Array.from(regularUsers.entries()).map(([userId, user]) => {
      const client = clientMap[userId] || {};
      return [userId, {
        accountId: userId,
        name: clean(user?.name || user?.business_name || user?.company_name || user?.email || userId),
        email: clean(user?.email),
        plan: clean(user?.plan_id || user?.plan || ""),
        paidWalletUsage: money(client.paidWalletUsage || 0),
        freeCreditUsage: money(client.freeCreditUsage || 0),
        totalUsageCharges: money(client.totalUsageCharges || 0),
      }];
    }),
  );
  const aiProviderCallLedgerDiagnostics = summarizeAiProviderCallLedger(
    cacheTelemetryDocs,
    new Set(regularUsers.keys()),
    accountProfiles,
  );
  const googleCloudCostUsd = providerCostAvailable ? Number(providerCost.totalGoogleCloudNetCost ?? providerCost.netProviderCost ?? 0) : null;
  const googleAiCostUsd = providerCostAvailable ? Number(providerCost.aiGeminiProviderCost ?? 0) : null;
  const deepInfraCostUsd = deepinfraBillingUsage.costNormalizationVerified ? deepinfraBillingUsage.totalCostUsd : null;
  const totalProviderCostUsd = googleCloudCostUsd === null || deepInfraCostUsd === null ? null : money(googleCloudCostUsd + deepInfraCostUsd);
  const totalAiProviderCostUsd = googleAiCostUsd === null || deepInfraCostUsd === null ? null : money(googleAiCostUsd + deepInfraCostUsd);
  const cashProfitLossUsd = totalProviderCostUsd === null ? null : signedMoney(grossRevenue - totalProviderCostUsd);
  const usagePricingMarginUsd = totalAiProviderCostUsd === null ? null : signedMoney(totalUsageCharges - totalAiProviderCostUsd);
  const currentMonth = new Date().toISOString().slice(0, 7).replace("-", ".");
  const includesCurrentDeepInfraMonth = deepinfraBillingUsage.months.some((month: any) => month.period === currentMonth);
  return {
    dateRange: { from: range.from, to: range.to, timezone: "UTC date boundaries from requested dates" },
    currency: "USD",
    excludesAdminAccounts: true,
    marksInternalTestAccounts: true,
    historicalSplitStatus: "estimated_or_unknown",
    summary: {
      grossRevenue,
      paidWalletUsage: totalPaidWalletUsage,
      freeCreditUsage: totalFreeCreditUsage,
      subscriptionRevenue: money(revenueBySource.subscriptions),
      walletTopupRevenue: money(revenueBySource.walletTopups),
      addonSetupRevenue: money(revenueBySource.addonsSetup),
      totalUsageCharges,
      googleCloudCostUsd,
      googleAiCostUsd,
      deepInfraCostUsd,
      totalProviderCostUsd,
      totalAiProviderCostUsd,
      cashProfitLossUsd,
      usagePricingMarginUsd,
      estimatedProviderCost: providerCostAvailable ? money(providerCost.netProviderCost) : null,
      estimatedProfit: providerCostAvailable ? money(grossRevenue - Number(providerCost.netProviderCost || 0)) : null,
      totalGoogleCloudCost: providerCost.totalGoogleCloudCost,
      totalGoogleCloudCredits: providerCost.totalGoogleCloudCredits,
      totalGoogleCloudNetCost: providerCost.totalGoogleCloudNetCost,
      aiGeminiProviderCost: providerCost.aiGeminiProviderCost,
      otherGoogleCloudCost: providerCost.otherGoogleCloudCost,
      unclassifiedGoogleCost: providerCost.unclassifiedGoogleCost,
      providerCostClassifierWarning: providerCost.classifierWarning || "",
      providerCostProjectFilterWarning: providerCost.projectFilterWarning || "",
      providerCostDiagnostics: providerCost.diagnostics || null,
      providerCostSource: providerCost.providerCostSource,
      providerCostStatus: providerCost.providerCostStatus,
      providerCostReliabilityStatus: providerCost.reliabilityStatus || (providerCostAvailable ? "current" : "incomplete_estimate"),
      providerCostActiveExportTable: providerCost.activeExportTable || "",
      providerCostExportType: providerCost.exportType || "",
      providerCostSelectedRangeRows: providerCost.selectedRangeRows ?? providerCost.diagnostics?.selectedRangeRows ?? 0,
      providerCostStandardTableStatus: providerCost.standardTableStatus || "",
      providerCostDetailedTableStatus: providerCost.detailedTableStatus || "",
      providerCostUnavailable: Boolean(providerCost.providerCostUnavailable),
      providerCostUnavailableReason: providerCost.unavailableReason || "",
      providerCostLastImportedAt: providerCost.importedAt || 0,
      providerCostCachedAt: providerCost.cachedAt || 0,
      providerCostRevenueMappingNote: "Provider AI/Gemini cost comes from Google Cloud Billing export and does not map one-to-one to wallet usage charges.",
      helperBackgroundAiCostNote: "Summaries, helper prompts, retries, repairs, image extraction, Smart Brain, and failed/skipped no-send attempts can create provider cost without a separate customer wallet charge.",
      aiProviderLedgerLabel: aiProviderCallLedgerDiagnostics.label,
      aiProviderLedgerNote: aiProviderCallLedgerDiagnostics.note,
      aiProviderLedgerCount: aiProviderCallLedgerDiagnostics.totalProviderCallLedgerCount,
      helperBackgroundAiCallCount: aiProviderCallLedgerDiagnostics.helperBackgroundCallCount,
      customerVisibleAiCallCount: aiProviderCallLedgerDiagnostics.customerVisibleCallCount,
      noSendFailedAiCallCount: aiProviderCallLedgerDiagnostics.noSendFailedCallCount,
      summaryAiCallCount: aiProviderCallLedgerDiagnostics.summaryCallCount,
      retryRepairAiCallCount: aiProviderCallLedgerDiagnostics.retryRepairCallCount,

      deepinfraBillingRawTotalCost: deepinfraBillingUsage.rawTotalCost,
      deepinfraBillingRawCostUnit: deepinfraBillingUsage.rawCostUnit,
      deepinfraBillingTotalCostUsd: deepinfraBillingUsage.totalCostUsd,
      deepinfraBillingCurrency: deepinfraBillingUsage.currency,
      deepinfraBillingCostNormalizationSource: deepinfraBillingUsage.costNormalizationSource,
      deepinfraBillingCostNormalizationVerified: deepinfraBillingUsage.costNormalizationVerified,
      deepinfraBillingVarianceUsd: deepinfraBillingUsage.totalCostUsd === null
        ? null
        : Number((deepinfraBillingUsage.totalCostUsd - aiProviderCallLedgerDiagnostics.estimatedProviderCost).toFixed(9)),
      deepinfraBillingMonths: deepinfraBillingUsage.months,
      deepinfraBillingStatus: deepinfraBillingUsage.status,
      deepinfraBillingSource: deepinfraBillingUsage.source,
      deepinfraBillingImportedAt: deepinfraBillingUsage.importedAt,
      deepinfraBillingSelectedPeriod: deepinfraBillingUsage.selectedPeriod,
      deepinfraSpendLabel: includesCurrentDeepInfraMonth ? "Current month-to-date DeepInfra spend" : "Monthly DeepInfra spend",

      activePaidAccounts,
      activeTrialAccounts,
      manualLegacyActiveAccounts,
      starterFreeAccounts,
      trialAccountsConsumingFreeCredit: Object.values(freeClientMap).length,
      paidAccountsConsumingWallet: Object.values(clientMap).filter((client: any) => client.paidWalletUsage > 0).length,
      totalFreeCreditConsumed: totalFreeCreditUsage,
      totalPaidCreditsConsumed: totalPaidWalletUsage,
      activeSubscriptionRows: activeSubscriptionRows.length,
    },
    dailyRows: dailyRowsWithProviderCost,
    providerCost,
    aiProviderCallLedgerDiagnostics,
    revenueBySource,
    usageConsumptionBySource,
    cacheBoostTelemetryStats,
    usageByCategory: Object.values(usageByCategory).sort((a: any, b: any) => b.cost - a.cost),
    freeVsPaidUsage: [
      { source: "free_credit", amount: totalFreeCreditUsage, status: "estimated" },
      { source: "paid_wallet", amount: totalPaidWalletUsage, status: "estimated" },
    ],
    topClients: Object.values(clientMap).sort((a: any, b: any) => b.totalUsageCharges - a.totalUsageCharges).slice(0, 25),
    topFreeCreditClients: Object.values(freeClientMap).sort((a: any, b: any) => b.freeCreditUsage - a.freeCreditUsage).slice(0, 25),
    paymentErrors: groupedPaymentErrors.slice(0, 100),
    subscriptionErrors: groupedSubscriptionErrors.slice(0, 100),
    reconciliationWarnings: [
      "Historical free-credit versus paid-wallet usage is estimated because old wallet balances were mixed.",
      providerCostAvailable
        ? "Provider cost is imported from Google Cloud Billing BigQuery export. Profit/loss uses AI/Gemini rows; total Google Cloud cost is shown separately."
        : "Provider cost unavailable until Google Cloud Billing BigQuery export is configured.",
      providerCost.classifierWarning || "",
      providerCost.projectFilterWarning || "",
      providerCostAvailable
        ? "Estimated profit/loss is gross cash revenue minus imported net provider cost."
        : "Profit is not shown until provider cost exists.",
      "Provider AI/Gemini cost is not a one-to-one map to customer wallet charges.",
      "Summaries, helper prompts, repairs, retries, image extraction, Smart Brain, and failed/skipped no-send attempts can create provider cost without separate customer wallet revenue.",
      "Revenue counts positive successful wallet transactions only; failed/refunded/status rows are listed separately.",
      "Manual/legacy active accounts have access but no linked paid payment record.",
    ].filter(Boolean),
  };
}
