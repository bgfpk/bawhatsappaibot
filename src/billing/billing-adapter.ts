import type { BillingTransactionItem, UsageRecordItem } from "./billing-model";
import { getUsageBillingDefinition } from "../config/pricing";
import { getWalletTransactionLabel, sanitizeBillingDescription } from "../services/billing-report-service.ts";

export function parseTimestampToEpochMs(val: any, fallbackAppwriteDate?: string): number {
  if (typeof val === "number" && !isNaN(val) && val > 0) {
    return val > 100000000000 ? val : val * 1000;
  }
  if (typeof val === "string" && val.trim()) {
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      return num > 100000000000 ? num : num * 1000;
    }
    const parsedDate = Date.parse(val);
    if (!isNaN(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
  }
  if (fallbackAppwriteDate && typeof fallbackAppwriteDate === "string") {
    const parsedDate = Date.parse(fallbackAppwriteDate);
    if (!isNaN(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
  }
  return 0;
}

export function buildBillingTransactionItems(rawTransactions: any[] = []): BillingTransactionItem[] {
  if (!Array.isArray(rawTransactions)) return [];

  return rawTransactions.map((tx, idx) => {
    const id = String(tx.$id || tx.id || `tx_${idx}`);
    const ts = parseTimestampToEpochMs(
      tx.timestamp || tx.created_at || tx.date,
      tx.$createdAt
    );

    const rawType = String(tx.type || tx.action || "").toLowerCase();
    const rawDesc = String(tx.description || tx.memo || "").toLowerCase();

    let type: BillingTransactionItem["type"] = "usage";

    if (rawType.includes("subscription") || rawType.includes("plan")) {
      type = "plan_purchase";
    } else if (rawType.includes("addon") || rawType.includes("setup")) {
      type = "addon_purchase";
    } else if (rawType.includes("topup") || rawType.includes("signup_credit") || rawType.includes("deposit") || rawType.includes("creem")) {
      type = "topup";
    } else if (rawType.includes("adjust") || rawType.includes("refund") || rawType.includes("reversal") || rawType.includes("manual")) {
      type = "adjustment";
    } else if (rawType.includes("ai_") || rawType.includes("usage") || rawDesc.includes("usage") || rawDesc.includes("debit")) {
      type = "usage";
    } else {
      type = Number(tx.amountUsd ?? tx.amount ?? 0) >= 0 ? "topup" : "adjustment";
    }

    const rawAmount = Number(tx.amountUsd ?? tx.amount ?? 0);
    let amountUsd = rawAmount;
    if (type === "usage" && rawAmount > 0) {
      amountUsd = -rawAmount;
    } else if (type === "topup" && rawAmount < 0) {
      amountUsd = Math.abs(rawAmount);
    }

    const categoryLabel = getWalletTransactionLabel(tx);
    const description = tx.description ? sanitizeBillingDescription(tx.description) : categoryLabel;

    return {
      id,
      timestamp: ts,
      type,
      description,
      amountUsd,
      runningBalanceUsd: tx.runningBalanceUsd ?? tx.running_balance ?? undefined,
      referenceId: tx.referenceId || tx.reference_id || undefined,
    };
  });
}

export function getCanonicalUsageCategoryLabel(category: string): string {
  const cat = String(category || "").toLowerCase().trim();
  if (cat === "customer_ai_text_reply" || cat === "text_reply" || cat === "ai_text") return "Customer AI Reply";
  if (cat === "customer_ai_extra_call") return "Customer AI Extra Call";
  if (cat === "business_assistant_ai_call" || cat === "admin_business_assistant_message" || cat === "business_assistant") return "Owner Assistant AI";
  if (cat === "personal_assistant_ai_call" || cat === "personal_assistant") return "Personal Assistant AI";
  if (cat === "customer_ai_audio_understanding" || cat === "audio_understanding" || cat === "voice_understanding") return "Voice Understanding";
  if (cat === "customer_ai_voice_reply" || cat === "voice_reply_generation" || cat === "voice_generation") return "Voice Generation";
  if (cat === "customer_ai_image_understanding" || cat === "image_understanding" || cat === "image_analysis") return "Image Analysis";
  if (cat === "broadcast_tracking_text" || cat === "broadcast") return "Broadcast Send";
  if (cat === "ai_smart_followup_text" || cat === "marketing_auto_bot_text" || cat === "customer_update_stock_text" || cat === "customer_update_scheduled_text" || cat === "followup") return "Smart Follow-up";
  if (cat === "sequence_template_send" || cat === "media_group_file_send") return "Media & Sequences";
  if (cat === "client_gemini_message_cycle") return "Custom Gemini AI Cycle";
  if (cat === "client_gemini_explicit_cache_boost") return "Gemini Cache Boost";
  if (cat === "customer_profile_intelligence_scan") return "Customer Intelligence Scan";
  if (cat === "smart_sales_engine_reply") return "Smart Sales Engine";
  const def = getUsageBillingDefinition(cat as any);
  if ((def as any)?.label) return (def as any).label;
  if ((def as any)?.name) return (def as any).name;
  return cat ? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Other Usage";
}

export function buildUsageRecordItems(rawAnalytics: any[] = []): UsageRecordItem[] {
  if (!Array.isArray(rawAnalytics)) return [];

  const items = rawAnalytics.map((rec, idx) => {
    const id = String(rec.$id || rec.id || `usage_${idx}`);
    const ts = parseTimestampToEpochMs(
      rec.timestamp || rec.created_at || rec.date,
      rec.$createdAt
    );

    const category = String(rec.category || rec.type || rec.action || "customer_ai_text_reply");
    const count = Math.max(1, Number(rec.count || rec.amount || 1));
    const totalUsd = Number(rec.totalUsd ?? rec.total ?? rec.cost ?? rec.amountUsd ?? 0);
    const unitPriceUsd = rec.unitPriceUsd ?? (count > 0 ? totalUsd / count : 0);
    const categoryLabel = rec.categoryLabel || rec.label || getCanonicalUsageCategoryLabel(category);

    return {
      id,
      timestamp: ts,
      category,
      categoryLabel,
      unitPriceUsd,
      count,
      totalUsd,
      instanceName: rec.instanceName || rec.instance || rec.bot_name || undefined,
    };
  });

  return items.sort((a, b) => b.timestamp - a.timestamp);
}
