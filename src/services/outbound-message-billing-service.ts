import * as dbService from "./db-service.ts";
import { getUsageBillingDefinition, type BillableUsageAction } from "../config/pricing.ts";

type OutboundBillingContext = {
  botId?: string;
  customerJid?: string;
  eventId?: string;
  messageId?: string;
  dedupeKey?: string;
};

export function resolveOutboundBillingAction(type = "text"): BillableUsageAction {
  return String(type || "").includes("ai_smart_followup") ? "ai_smart_followup_text" :
    String(type || "").includes("marketing_auto_bot") ? "marketing_auto_bot_text" :
    String(type || "").includes("customer_update_stock") ? "customer_update_stock_text" :
    String(type || "").includes("customer_update_scheduled") ? "customer_update_scheduled_text" :
    "broadcast_tracking_text";
}

const outboundBillingDeps = {
  getUser: dbService.getUser,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
  chargeUsageAction: dbService.chargeUsageAction,
  logUsageChargeFailure: dbService.logUsageChargeFailure,
};

export function __setOutboundMessageBillingTestDeps(overrides: Partial<typeof outboundBillingDeps>) {
  Object.assign(outboundBillingDeps, overrides || {});
}

export function __resetOutboundMessageBillingTestDeps() {
  Object.assign(outboundBillingDeps, {
    getUser: dbService.getUser,
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
    buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
    chargeUsageAction: dbService.chargeUsageAction,
    logUsageChargeFailure: dbService.logUsageChargeFailure,
  });
}

export async function previewUsageBillingAction(userId: string | undefined, action: BillableUsageAction) {
  const definition = getUsageBillingDefinition(action);
  if (!userId) return { allowed: false, action, cost: definition.priceUsd, reason: "missing_user" };
  const user = await outboundBillingDeps.getUser(userId).catch(() => null) as any;
  if (!user) return { allowed: false, action, cost: definition.priceUsd, reason: "user_not_found" };
  const access = await outboundBillingDeps.canSendCustomerFacingMessage(userId);
  if (!access.allowed) {
    return { allowed: false, action, cost: definition.priceUsd, reason: access.reason || "account_access_expired" };
  }
  const balance = Math.max(0, Number(user.wallet_balance || 0));
  if (balance < definition.priceUsd) {
    return { allowed: false, action, cost: definition.priceUsd, reason: "insufficient_wallet", balance };
  }
  return { allowed: true, action, cost: definition.priceUsd, balance };
}

export async function previewBillableOutboundText(userId: string | undefined, type = "text") {
  return previewUsageBillingAction(userId, resolveOutboundBillingAction(type));
}

export async function chargeUsageBillingAction(userId: string | undefined, action: BillableUsageAction, context: OutboundBillingContext = {}, description = "", amount = 1) {
  if (!userId) return;
  const dedupeKey = context.dedupeKey || outboundBillingDeps.buildUsageChargeDedupeKey(action, [
    userId,
    context.botId,
    context.customerJid,
    context.eventId || context.messageId,
    action,
  ]);
  try {
    const result = await outboundBillingDeps.chargeUsageAction(userId, action, {
      amount: Math.max(1, Number(amount || 1)),
      dedupeKey,
      description,
    });
    if (!result?.charged && !result?.duplicate) {
      outboundBillingDeps.logUsageChargeFailure({
        action,
        userId,
        botId: context.botId,
        customerJid: context.customerJid,
        eventId: context.eventId,
        messageId: context.messageId,
        reason: result?.reason || result?.message || "not_charged",
      });
    }
    return { ...result, dedupeKey };
  } catch (error: any) {
    outboundBillingDeps.logUsageChargeFailure({
      action,
      userId,
      botId: context.botId,
      customerJid: context.customerJid,
      eventId: context.eventId,
      messageId: context.messageId,
      reason: "charge_exception",
    });
    return { charged: false, reason: "error", cost: 0, dedupeKey };
  }
}

export async function chargeBillableOutboundText(userId: string | undefined, type = "text", context: OutboundBillingContext = {}) {
  const action = resolveOutboundBillingAction(type);
  return chargeUsageBillingAction(userId, action, context);
}

export function isBillableTextUsageType(type: any) {
  const value = String(type || "").toLowerCase();
  return value === "text" ||
    value.includes("text") ||
    value.includes("ai_smart_followup") ||
    value.includes("marketing_auto_bot") ||
    value.includes("customer_update");
}

export function describeUsageType(type: any) {
  const value = String(type || "text").toLowerCase();
  if (value.includes("ai_smart_followup")) return "AI smart follow-up text";
  if (value.includes("marketing_auto_bot")) return "Marketing Auto-Bot text";
  if (value.includes("customer_update_stock")) return "Customer Updates stock alert text";
  if (value.includes("customer_update_scheduled")) return "Customer Updates scheduled text";
  if (value.includes("customer_update")) return "Customer Updates text";
  if (value.includes("voice")) return "Voice message";
  if (value.includes("image")) return "Image processing";
  return "Text message";
}
