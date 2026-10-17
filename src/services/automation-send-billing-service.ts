import crypto from "crypto";

import * as dbService from "./db-service.ts";
import { getUsageBillingDefinition, type BillableUsageAction } from "../config/pricing.ts";
import { buildUsageChargeDescription } from "../config/pricing-display.ts";

export type AutomationSendBillingAction = "sequence_template_send" | "media_group_file_send";

type AutomationSendBillingContext = {
  userId?: string;
  botId?: string;
  customerJid?: string;
  eventId?: string;
  messageId?: string;
  sequenceKey?: string;
  templateKey?: string;
  mediaTitle?: string;
  source?: string;
  description?: string;
};

const automationBillingDeps = {
  getUser: dbService.getUser,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  chargeUsageAction: dbService.chargeUsageAction,
  buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
  logUsageChargeFailure: dbService.logUsageChargeFailure,
};

export function __setAutomationSendBillingTestDeps(overrides: Partial<typeof automationBillingDeps>) {
  Object.assign(automationBillingDeps, overrides || {});
  if (overrides.getUser && !overrides.canSendCustomerFacingMessage) {
    automationBillingDeps.canSendCustomerFacingMessage = async () => ({ allowed: true, reason: "" });
  }
}

export function __resetAutomationSendBillingTestDeps() {
  Object.assign(automationBillingDeps, {
    getUser: dbService.getUser,
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
    chargeUsageAction: dbService.chargeUsageAction,
    buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
    logUsageChargeFailure: dbService.logUsageChargeFailure,
  });
}

function normalizeBillingPart(value: any) {
  return String(value || "").trim().toLowerCase();
}

export function buildAutomationTemplateKey(template: any) {
  const message = template?.message || template?.originalMessage || template || {};
  const payload = JSON.stringify({
    id: template?.key?.id || template?.message?.key?.id || message?.key?.id || "",
    caption: message?.conversation || message?.imageMessage?.caption || message?.videoMessage?.caption || message?.documentMessage?.caption || "",
    type: Object.keys(message || {}).sort(),
  });
  return crypto.createHash("sha1").update(payload).digest("hex").slice(0, 20);
}

export function buildAutomationBillingEventId(parts: Array<string | number | null | undefined>) {
  const normalized = parts.map(normalizeBillingPart).filter(Boolean).join("|");
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 24);
}

function buildAutomationChargeDescription(action: AutomationSendBillingAction, amount = 1) {
  return buildUsageChargeDescription({ action, amount });
}

export async function canSendBillableAutomation(userId: string | undefined, action: AutomationSendBillingAction, amount = 1) {
  if (!userId) return { allowed: true, reason: "no_user" };
  const user = await automationBillingDeps.getUser(userId).catch(() => null) as any;
  if (!user) return { allowed: false, reason: "user_not_found" };
  const access = await automationBillingDeps.canSendCustomerFacingMessage(userId);
  if (!access.allowed) {
    automationBillingDeps.logUsageChargeFailure({
      action,
      userId,
      reason: access.reason || "account_access_expired",
    });
    return { allowed: false, reason: access.reason || "account_access_expired" };
  }
  const required = Number((Number(getUsageBillingDefinition(action).priceUsd || 0) * Math.max(1, Number(amount || 1))).toFixed(6));
  const balance = Math.max(0, Number(user.wallet_balance || 0));
  if (balance < required) {
    automationBillingDeps.logUsageChargeFailure({
      action,
      userId,
      reason: "insufficient_wallet",
    });
    return { allowed: false, reason: "insufficient_wallet", balance, required };
  }
  return { allowed: true, balance, required };
}

export async function chargeAutomationSendUsage(action: AutomationSendBillingAction, context: AutomationSendBillingContext) {
  if (!context.userId) return { charged: false, reason: "no_user", cost: 0 };
  const dedupeKey = automationBillingDeps.buildUsageChargeDedupeKey(action, [
    context.userId,
    context.botId,
    context.customerJid,
    context.eventId || context.messageId,
    context.sequenceKey,
    context.templateKey,
    context.mediaTitle,
    context.source,
    action,
  ]);
  try {
    const result = await automationBillingDeps.chargeUsageAction(context.userId, action, {
      amount: 1,
      dedupeKey,
      description: context.description || buildAutomationChargeDescription(action, 1),
    });
    if (!result?.charged && !result?.duplicate) {
      automationBillingDeps.logUsageChargeFailure({
        action,
        userId: context.userId,
        botId: context.botId,
        customerJid: context.customerJid,
        eventId: context.eventId,
        messageId: context.messageId,
        reason: result?.reason || result?.message || "not_charged",
      });
    }
    return result;
  } catch (error: any) {
    automationBillingDeps.logUsageChargeFailure({
      action,
      userId: context.userId,
      botId: context.botId,
      customerJid: context.customerJid,
      eventId: context.eventId,
      messageId: context.messageId,
      reason: "charge_exception",
    });
    return { charged: false, reason: "error", cost: 0 };
  }
}
