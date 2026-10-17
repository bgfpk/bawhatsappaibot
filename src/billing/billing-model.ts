import {
  USAGE_BILLING,
  BILLING_PLAN_DETAILS,
  BILLING_ADDONS,
  WALLET_TOPUP_AMOUNTS,
  FULL_SETUP_PRICE,
} from "../config/pricing";
import { isAdminRole } from "../config/billing-access";

export type BillingTabId = "overview" | "usage" | "plans" | "history";

export interface WalletOverviewData {
  balanceUsd: number;
  balanceFormatted: string;
  currency: string;
  planId: string;
  planName: string;
  planExpiry?: number;
  accountStatus: "active" | "trial" | "restricted" | "expired" | "past_due";
  trialRepliesLeft?: number;
  trialDaysLeft?: number;
  lowBalanceThreshold?: number;
  isLowBalance?: boolean;
}

export function mapBillingAccessToAccountStatus(
  accessStatus?: string,
  user?: any
): "active" | "trial" | "restricted" | "expired" | "past_due" {
  if (isAdminRole(user?.role)) {
    return "active";
  }
  const rawStatus = String(user?.plan_status || user?.account_status || user?.status || user?.billing_status || "").toLowerCase();
  if (user?.is_suspended === true || user?.suspended === true || ["suspended", "blocked", "disabled"].includes(rawStatus)) {
    return "restricted";
  }
  if (rawStatus === "past_due" || rawStatus === "pastdue") {
    return "past_due";
  }
  switch (accessStatus) {
    case "paid":
      return "active";
    case "trial":
      return "trial";
    case "trial_replies_used":
      return "restricted";
    case "trial_expired":
      return "expired";
    case "inactive":
    default:
      return "restricted";
  }
}

export interface UsageRecordItem {
  id: string;
  timestamp: number;
  category: string;
  categoryLabel: string;
  unitPriceUsd: number;
  count: number;
  totalUsd: number;
  instanceName?: string;
}

export interface BillingTransactionItem {
  id: string;
  timestamp: number;
  type: "topup" | "usage" | "plan_purchase" | "addon_purchase" | "adjustment";
  description: string;
  amountUsd: number; // positive for topup, negative for deduction
  runningBalanceUsd?: number;
  referenceId?: string;
}

export interface AccountSettingsData {
  businessName: string;
  billingEmail: string;
  currency: string;
  timezone: string;
}

export const DEFAULT_WALLET_CURRENCY = "USD";

export function formatAccountCurrency(amountUsd: number, currencyCode = DEFAULT_WALLET_CURRENCY): string {
  const num = Number(amountUsd || 0);
  if (currencyCode === "PKR") {
    // Standard PKR conversion or display
    const pkrValue = Math.round(num * 278);
    return `Rs. ${pkrValue.toLocaleString()}`;
  }
  if (num === 0 || Object.is(num, -0)) {
    return "$0.00";
  }
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const prefix = isNegative ? "-$" : "$";

  // If smaller than 1 cent but non-zero, format with microcharge precision (e.g. $0.003, $0.001, $0.0005)
  if (absNum < 0.01) {
    const fixed4 = absNum.toFixed(4);
    const trimmed = fixed4.replace(/0+$/, "");
    const formatted = trimmed.length <= 4 ? absNum.toFixed(3) : trimmed;
    return `${prefix}${formatted}`;
  }

  return `${prefix}${absNum.toFixed(2)}`;
}

export function matchesUsageCategory(category: string, filter: string): boolean {
  if (!filter || filter === "all") return true;
  const normCat = String(category || "").toLowerCase().trim();
  const normFilter = String(filter || "").toLowerCase().trim();
  if (normCat === normFilter) return true;

  if (normFilter === "customer_ai" || normFilter === "ai_text" || normFilter === "text") {
    return normCat.includes("customer_ai") || normCat.includes("text_reply") || normCat.includes("ai_text") || normCat.includes("smart_sales") || normCat.includes("gemini_message_cycle");
  }
  if (normFilter === "owner_assistant" || normFilter === "business_assistant") {
    return normCat.includes("business_assistant") || normCat.includes("admin_business");
  }
  if (normFilter === "personal_assistant") {
    return normCat.includes("personal_assistant");
  }
  if (normFilter === "voice") {
    return normCat.includes("voice") || normCat.includes("audio");
  }
  if (normFilter === "image") {
    return normCat.includes("image");
  }
  if (normFilter === "broadcast") {
    return normCat.includes("broadcast");
  }
  if (normFilter === "followup") {
    return normCat.includes("followup") || normCat.includes("marketing_auto") || normCat.includes("customer_update");
  }
  if (normFilter === "other") {
    return !matchesUsageCategory(category, "customer_ai") &&
      !matchesUsageCategory(category, "owner_assistant") &&
      !matchesUsageCategory(category, "personal_assistant") &&
      !matchesUsageCategory(category, "voice") &&
      !matchesUsageCategory(category, "image") &&
      !matchesUsageCategory(category, "broadcast") &&
      !matchesUsageCategory(category, "followup");
  }
  return false;
}

export function filterUsageRecords(
  records: UsageRecordItem[],
  query: string,
  categoryFilter: string
): UsageRecordItem[] {
  return records
    .filter((rec) => {
      const matchesCategory = matchesUsageCategory(rec.category, categoryFilter);
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        rec.categoryLabel.toLowerCase().includes(q) ||
        rec.category.toLowerCase().includes(q) ||
        (rec.instanceName && rec.instanceName.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function filterBillingTransactions(
  transactions: BillingTransactionItem[],
  query: string,
  typeFilter: string
): BillingTransactionItem[] {
  return transactions.filter((tx) => {
    const matchesType = typeFilter === "all" || tx.type === typeFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      tx.description.toLowerCase().includes(q) ||
      (tx.referenceId && tx.referenceId.toLowerCase().includes(q));
    return matchesType && matchesQuery;
  });
}

export { USAGE_BILLING, BILLING_PLAN_DETAILS, BILLING_ADDONS, WALLET_TOPUP_AMOUNTS, FULL_SETUP_PRICE };
