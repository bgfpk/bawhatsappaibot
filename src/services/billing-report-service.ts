import { describeUsageAnalyticsType, getUsageAnalyticsBucket } from "../config/pricing.ts";
import { buildUsageCompactChargeLabel, buildUsageSavingsLabel, resolveUsageBillingAction } from "../config/pricing-display.ts";

export type BillingUsageSummary = {
  key: string;
  label: string;
  amount: number;
  cost: number;
  averageCost: number;
  bucket: string;
  rawTypes: string[];
};

export type BillingStatementRow = {
  date: string;
  type: string;
  amount: number;
  description: string;
};

export type BillingTransparencyRow = {
  timestamp: number;
  source: "usage_analytics" | "wallet_transaction" | "receipt";
  category: string;
  status: string;
  amount: number;
  units: number;
  reason: string;
  evidence: string;
  description: string;
};

const RECEIPT_RETENTION_DAYS = 45;

function clean(value: any) {
  return String(value ?? "").trim();
}

function hasEmbeddedDiscountCopy(value: string) {
  const lower = clean(value).toLowerCase();
  return lower.includes("regular $") || lower.includes("saved $") || lower.includes("charged $");
}

function buildDiscountAwareUsageDescription(label: string, type: any, amount = 1) {
  const action = resolveUsageBillingAction(type) || resolveUsageBillingAction(label);
  if (!action) return label;
  const summary = buildUsageCompactChargeLabel(action);
  const savings = buildUsageSavingsLabel(action);
  const unitPart = `${label} (${amount} unit${amount === 1 ? "" : "s"})`;
  return [unitPart, summary, savings].filter(Boolean).join(" · ");
}

export function normalizeBillingTimestamp(value: any) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export function buildBillingRange(fromMs: number, toMs: number) {
  const from = Math.max(0, Math.floor(Number(fromMs || 0) / 1000));
  const to = Math.max(from, Math.floor(Number(toMs || Date.now()) / 1000));
  return { from, to };
}

export function dateKeyFromSeconds(seconds: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function getUsageCategoryLabel(type: any) {
  const value = clean(type).toLowerCase();
  if (value === "customer_ai_text_reply") return "Normal AI text reply";
  if (value === "customer_ai_image_understanding") return "Image understanding";
  if (value === "customer_ai_audio_understanding") return "Voice message understanding";
  if (value === "customer_ai_voice_reply") return "Voice reply generation";
  if (value === "smart_sales_engine_reply") return "Smart Sales Engine";
  if (value === "sequence_template_send") return "Sequence/template send";
  if (value === "media_group_file_send") return "Media/group file send";
  if (value === "marketing_auto_bot_text") return "Fixed follow-up";
  if (value === "ai_smart_followup_text") return "AI smart follow-up";
  if (value === "customer_update_stock_text") return "Customer update stock";
  if (value === "customer_update_scheduled_text") return "Customer update scheduled";
  if (value === "broadcast_tracking_text") return "Broadcast/courier tracking update";
  if (value === "customer_profile_intelligence_scan") return "Customer Intelligence Scan";
  if (value === "agent_mode_rule_action") return "Agent Mode rule action";
  if (value === "agent_mode_ai_action") return "Agent Mode AI action";
  if (value === "crm_agent_mode_action") return "CRM Agent Mode action (legacy)";
  if (value === "helper_chat_reply") return "Helper chat reply";
  if (value === "text_reply") return "Normal AI text reply";
  if (value === "image_understanding") return "Image understanding";
  if (value === "audio_understanding") return "Voice message understanding";
  if (value === "voice_reply_generation") return "Voice reply generation";
  if (value === "smart_sales_engine_reply") return "Smart Sales Engine";
  if (value === "sequence_template_send") return "Sequence/template send";
  if (value === "media_group_file_send") return "Media/group file send";
  if (value === "marketing_auto_bot_text") return "Fixed follow-up";
  if (value === "ai_smart_followup_text") return "AI smart follow-up";
  if (value === "customer_update_stock_text") return "Customer update stock";
  if (value === "customer_update_scheduled_text") return "Customer update scheduled";
  if (value === "broadcast_tracking_text") return "Broadcast/courier tracking update";
  if (value === "customer_profile_intelligence_scan") return "Customer Intelligence Scan";
  if (value === "agent_mode_rule_action") return "Agent Mode rule action";
  if (value === "agent_mode_ai_action") return "Agent Mode AI action";
  if (value === "crm_agent_mode_action") return "CRM Agent Mode action (legacy)";
  if (value === "legacy_helper_chat") return "Helper chat reply";
  if (value.includes("notification")) return "Notification";
  return describeUsageAnalyticsType(type);
}

export function getUsageCategoryKey(type: any) {
  return getUsageCategoryLabel(type).replace(/[^a-z0-9]+/gi, "_").toLowerCase().replace(/^_+|_+$/g, "") || "unknown";
}

export function getWalletTransactionLabel(transaction: any) {
  const type = clean(transaction?.type).toLowerCase();
  const description = clean(transaction?.description).toLowerCase();
  if (type.includes("signup_credit")) return "Signup/free credit";
  if (type.includes("topup") || description.includes("top-up") || description.includes("top up")) return "Wallet top-up/deposit";
  if (type.includes("creem_pending")) return "Creem checkout pending";
  if (type.includes("creem") || description.includes("creem")) return "Creem payment/deposit";
  if (type.includes("subscription")) return "Subscription charge/renewal";
  if (type.includes("addon")) return "Add-on charge";
  if (type.includes("setup")) return "Setup service";
  if (type.includes("refund") || description.includes("refund") || type.includes("reversal")) return "Refund/reversal";
  if (type.includes("ai_") || description.includes(" debit")) return "Usage wallet debit";
  if (description.includes("admin manual") || type.includes("manual")) return "Manual wallet adjustment";
  if (Number(transaction?.amount || 0) > 0) return "Wallet deposit";
  if (Number(transaction?.amount || 0) < 0) return "Wallet deduction";
  return "Wallet transaction";
}

export function sanitizeBillingDescription(value: any) {
  const raw = clean(value);
  const lower = raw.toLowerCase();
  if (lower.includes("gemini cache boost")) return "Gemini Cache Boost";
  if (lower.includes("customer intelligence scan")) return "Customer Intelligence Scan";
  if (lower.includes("client gemini api request") || lower.includes("custom gemini")) {
    if (lower.includes("follow-up") || lower.includes("followup") || lower.includes("smart_followup")) return "Custom Gemini: Follow-up";
    if (lower.includes("customer update") || lower.includes("customer_update")) return "Custom Gemini: Customer update";
    if (lower.includes("summary")) return "Custom Gemini: Summary";
    if (lower.includes("broadcast")) return "Custom Gemini: Broadcast";
    if (lower.includes("reply") || lower.includes("repair") || lower.includes("missing") || lower.includes("fallback")) return "Custom Gemini: AI reply";
    return "Custom Gemini AI cycle";
  }
  return raw
    .replace(/\b\d{8,15}@(?:s\.whatsapp\.net|c\.us|lid)\b/gi, "whatsapp_***")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "email_***")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "phone_***")
    .replace(/\bblackarrow_[a-z0-9_]+\b/gi, "blackarrow_***")
    .replace(/\b(?:creem|checkout|customer|subscription|transaction|payment|session|invoice|intent|charge|ch|sub|cus|txn|cs)_[a-z0-9_]+\b/gi, (match) => maskBillingToken(match, 4))
    .replace(/\b[a-f0-9]{16,}\b/gi, (match) => maskBillingToken(match, 4))
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, (match) => maskBillingToken(match, 4));
}

export function formatWalletTransactionDescription(transaction: any) {
  const base = sanitizeBillingDescription(transaction?.description || transaction?.type);
  if (hasEmbeddedDiscountCopy(base)) return base;
  const action = resolveUsageBillingAction(transaction?.type) || resolveUsageBillingAction(transaction?.description);
  if (!action) return base;
  return [base, buildUsageCompactChargeLabel(action), buildUsageSavingsLabel(action)].filter(Boolean).join(" | ");
}

export function isUsageWalletDebit(transaction: any) {
  const type = clean(transaction?.type).toLowerCase();
  const description = clean(transaction?.description).toLowerCase();
  return type.startsWith("ai_") || description.includes(" debit | receipt:") || description.includes(" usage ");
}

export function summarizeUsageRows(rows: any[] = []): BillingUsageSummary[] {
  const groups: Record<string, BillingUsageSummary> = {};
  for (const row of rows || []) {
    const type = clean(row?.type || "unknown");
    const cost = Math.max(0, Number(row?.cost || 0));
    if (cost <= 0) continue;
    const amount = Math.max(1, Number(row?.amount || 1));
    const key = getUsageCategoryKey(type);
    if (!groups[key]) {
      groups[key] = {
        key,
        label: getUsageCategoryLabel(type),
        amount: 0,
        cost: 0,
        averageCost: 0,
        bucket: getUsageAnalyticsBucket(type),
        rawTypes: [],
      };
    }
    if (type && !groups[key].rawTypes.includes(type)) groups[key].rawTypes.push(type);
    groups[key].amount += amount;
    groups[key].cost = Number((groups[key].cost + cost).toFixed(6));
  }
  return Object.values(groups)
    .map((item) => ({
      ...item,
      averageCost: item.amount > 0 ? Number((item.cost / item.amount).toFixed(6)) : 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildUsageDailySeries(rows: any[] = []) {
  const groups: Record<string, any> = {};
  for (const row of rows || []) {
    const timestamp = normalizeBillingTimestamp(row?.timestamp || row?.created_at || row?.$createdAt);
    const date = dateKeyFromSeconds(timestamp);
    if (!date) continue;
    if (!groups[date]) groups[date] = { date, timestamp, cost: 0 };
    const labelKey = getUsageCategoryKey(row?.type);
    groups[date][labelKey] = Number((Number(groups[date][labelKey] || 0) + Math.max(0, Number(row?.cost || 0))).toFixed(6));
    groups[date].cost = Number((groups[date].cost + Math.max(0, Number(row?.cost || 0))).toFixed(6));
  }
  return Object.values(groups).sort((a: any, b: any) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
}

export function buildAccountStatementRows(input: {
  usageRows?: any[];
  walletTransactions?: any[];
}) {
  const rows: BillingStatementRow[] = [];
  const usageGroups: Record<string, Record<string, { cost: number; amount: number; type: string; label: string }>> = {};
  for (const usage of input.usageRows || []) {
    const date = dateKeyFromSeconds(normalizeBillingTimestamp(usage?.timestamp));
    if (!date) continue;
    const label = getUsageCategoryLabel(usage?.type);
    if (!usageGroups[date]) usageGroups[date] = {};
    if (!usageGroups[date][label]) {
      usageGroups[date][label] = {
        cost: 0,
        amount: 0,
        type: clean(usage?.type),
        label,
      };
    }
    usageGroups[date][label].cost = Number((Number(usageGroups[date][label].cost || 0) + Math.max(0, Number(usage?.cost || 0))).toFixed(6));
    usageGroups[date][label].amount += Math.max(1, Number(usage?.amount || 1));
  }
  for (const [date, categories] of Object.entries(usageGroups)) {
    for (const item of Object.values(categories)) {
      if (item.cost <= 0) continue;
      rows.push({
        date,
        type: "Daily usage spend",
        amount: -Math.abs(item.cost),
        description: buildDiscountAwareUsageDescription(item.label, item.type, item.amount),
      });
    }
  }
  for (const transaction of input.walletTransactions || []) {
    if (isUsageWalletDebit(transaction)) continue;
    const date = dateKeyFromSeconds(normalizeBillingTimestamp(transaction?.created_at || transaction?.timestamp || transaction?.$createdAt));
    if (!date) continue;
    rows.push({
      date,
      type: getWalletTransactionLabel(transaction),
      amount: Number(transaction?.amount || 0),
      description: formatWalletTransactionDescription(transaction),
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
}

export function maskBillingToken(value: any, visible = 6) {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= visible * 2) return `${text.slice(0, Math.min(3, text.length))}...`;
  return `${text.slice(0, visible)}...${text.slice(-visible)}`;
}

export function buildTransparencyRows(input: {
  usageRows?: any[];
  walletTransactions?: any[];
  receipts?: any[];
}) {
  const rows: BillingTransparencyRow[] = [];
  for (const usage of input.usageRows || []) {
    rows.push({
      timestamp: normalizeBillingTimestamp(usage?.timestamp),
      source: "usage_analytics",
      category: getUsageCategoryLabel(usage?.type),
      status: Number(usage?.cost || 0) > 0 ? "charged" : "not_charged",
      amount: -Math.abs(Number(usage?.cost || 0)),
      units: Math.max(1, Number(usage?.amount || 1)),
      reason: "",
      evidence: "",
      description: buildDiscountAwareUsageDescription(getUsageCategoryLabel(usage?.type), usage?.type, Math.max(1, Number(usage?.amount || 1))),
    });
  }
  for (const transaction of input.walletTransactions || []) {
    rows.push({
      timestamp: normalizeBillingTimestamp(transaction?.created_at || transaction?.timestamp),
      source: "wallet_transaction",
      category: getWalletTransactionLabel(transaction),
      status: Number(transaction?.amount || 0) >= 0 ? "credit_or_status" : "debit",
      amount: Number(transaction?.amount || 0),
      units: 1,
      reason: "",
      evidence: maskBillingToken(transaction?.$id || transaction?.id),
      description: formatWalletTransactionDescription(transaction),
    });
  }
  for (const receipt of input.receipts || []) {
    rows.push({
      timestamp: normalizeBillingTimestamp(receipt?.sentTimestamp || receipt?.updatedAt || receipt?.createdAt),
      source: "receipt",
      category: getUsageCategoryLabel(receipt?.billingAction || receipt?.campaignType || receipt?.contextType),
      status: clean(receipt?.sendStatus || "unknown"),
      amount: receipt?.charged === true ? -Math.abs(Number(receipt?.walletChargeAmount || 0)) : 0,
      units: 1,
      reason: sanitizeBillingDescription(receipt?.errorReason || (receipt?.duplicateCharge ? "duplicate charge marker" : "")),
      evidence: [
        receipt?.receiptId ? `receipt:${maskBillingToken(receipt.receiptId)}` : "",
        receipt?.idempotencyKey ? `idempotency:${maskBillingToken(receipt.idempotencyKey)}` : "",
        receipt?.chargeDedupeKey ? `dedupe:${maskBillingToken(receipt.chargeDedupeKey)}` : "",
        receipt?.messageId ? `message:${maskBillingToken(receipt.messageId)}` : "",
      ].filter(Boolean).join(" "),
      description: buildDiscountAwareUsageDescription(
        getUsageCategoryLabel(receipt?.billingAction || receipt?.campaignType || receipt?.contextType),
        receipt?.billingAction || receipt?.campaignType || receipt?.contextType,
        1
      ),
    });
  }
  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

export function buildTransparencyText(input: {
  date: string;
  userLabel?: string;
  rows: BillingTransparencyRow[];
  receiptsAvailable?: boolean;
}) {
  const lines = [
    `BlackArrow Daily Transparency Logs for ${input.date}`,
    input.userLabel ? `Account: ${input.userLabel}` : "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "This file includes charged usage, wallet movement, and available outbound send receipt evidence.",
    input.receiptsAvailable === false
      ? `Receipt evidence may be unavailable for older logs because local receipt retention is about ${RECEIPT_RETENTION_DAYS} days.`
      : "",
    "",
    "Timestamp\tSource\tCategory/Action\tStatus\tUnits\tWallet Amount ($)\tReason\tEvidence\tDescription",
    "-".repeat(140),
  ].filter((line) => line !== "");

  for (const row of input.rows) {
    lines.push([
      row.timestamp ? new Date(row.timestamp * 1000).toISOString() : "",
      row.source,
      row.category,
      row.status,
      row.units,
      Number(row.amount || 0).toFixed(6),
      row.reason.replace(/\s+/g, " "),
      row.evidence,
      row.description.replace(/\s+/g, " "),
    ].join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: any) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildTransparencyCsv(input: {
  rows: BillingTransparencyRow[];
}) {
  const lines = [
    ["timestamp", "source", "category/action", "status", "amount", "reason", "evidence", "description"].map(csvCell).join(","),
  ];
  for (const row of input.rows) {
    lines.push([
      row.timestamp ? new Date(row.timestamp * 1000).toISOString() : "",
      row.source,
      row.category,
      row.status,
      Number(row.amount || 0).toFixed(6),
      row.reason,
      row.evidence,
      row.description,
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
