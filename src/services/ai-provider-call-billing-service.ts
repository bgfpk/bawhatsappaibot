import * as dbService from "./db-service.ts";
import { getUsageBillingDefinition, type BillableUsageAction } from "../config/pricing.ts";
import { updateAiProviderCallSendOutcome } from "./ai-provider-call-ledger-service.ts";

export type AiBillingPurposeResolution = {
  billable: boolean;
  action: BillableUsageAction;
  costUsd: number;
  label: string;
};

export function resolveAiProviderBillingAction(purpose?: string, explicitAction?: BillableUsageAction | string): BillableUsageAction | null {
  if (explicitAction === "business_assistant_ai_call" || explicitAction === "admin_business_assistant_message") {
    return "business_assistant_ai_call";
  }
  if (explicitAction === "personal_assistant_ai_call") {
    return "personal_assistant_ai_call";
  }
  const cleanPurpose = String(purpose || "").trim().toLowerCase();
  if (
    cleanPurpose.includes("admin_assistant") ||
    cleanPurpose.includes("business_assistant") ||
    cleanPurpose.includes("admin_business")
  ) {
    return "business_assistant_ai_call";
  }
  if (
    cleanPurpose.includes("personal_assistant") ||
    cleanPurpose.includes("personal_incoming") ||
    cleanPurpose.includes("personal_outbound") ||
    cleanPurpose.startsWith("personal_")
  ) {
    return "personal_assistant_ai_call";
  }
  return null;
}

const defaultDeps = {
  getUser: dbService.getUser,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  buildUsageChargeDedupeKey: dbService.buildUsageChargeDedupeKey,
  chargeUsageAction: dbService.chargeUsageAction,
  logUsageChargeFailure: dbService.logUsageChargeFailure,
  updateAiProviderCallSendOutcome,
};

const aiProviderCallBillingDeps = { ...defaultDeps };

export function __setAiProviderCallBillingTestDeps(overrides: Partial<typeof defaultDeps>) {
  Object.assign(aiProviderCallBillingDeps, overrides || {});
}

export function __resetAiProviderCallBillingTestDeps() {
  Object.assign(aiProviderCallBillingDeps, defaultDeps);
}

export async function previewAiProviderCallBilling(input: {
  accountId?: string;
  purpose?: string;
  billingAction?: BillableUsageAction | string;
}) {
  const action = resolveAiProviderBillingAction(input.purpose, input.billingAction);
  if (!action) {
    return { allowed: true, billable: false, cost: 0 };
  }
  const definition = getUsageBillingDefinition(action);
  const cost = definition.priceUsd;
  const accountId = String(input.accountId || "").trim();
  if (!accountId) {
    return { allowed: false, billable: true, action, cost, reason: "missing_user" };
  }
  const user = await aiProviderCallBillingDeps.getUser(accountId).catch(() => null) as any;
  if (!user) {
    return { allowed: false, billable: true, action, cost, reason: "user_not_found" };
  }
  const balance = Math.max(0, Number(user.wallet_balance || 0));
  if (balance < cost) {
    return { allowed: false, billable: true, action, cost, reason: "insufficient_wallet", balance };
  }
  return { allowed: true, billable: true, action, cost, balance };
}

export async function chargeAiProviderCallBilling(input: {
  accountId?: string;
  purpose?: string;
  billingAction?: BillableUsageAction | string;
  botId?: string;
  customerJid?: string;
  callId?: string;
  requestId?: string;
  description?: string;
}) {
  const action = resolveAiProviderBillingAction(input.purpose, input.billingAction);
  if (!action) {
    return { charged: false, billable: false, cost: 0 };
  }
  const accountId = String(input.accountId || "").trim();
  if (!accountId) {
    return { charged: false, billable: true, cost: 0, reason: "missing_account_id" };
  }
  const definition = getUsageBillingDefinition(action);
  const cost = definition.priceUsd;
  const callIdentity = input.callId || input.requestId || `${input.purpose || action}_${Date.now()}`;
  const dedupeKey = aiProviderCallBillingDeps.buildUsageChargeDedupeKey(action, [
    accountId,
    input.botId || "assistant",
    input.customerJid || "admin",
    callIdentity,
    action,
  ]);

  try {
    const result = await aiProviderCallBillingDeps.chargeUsageAction(accountId, action, {
      amount: 1,
      dedupeKey,
      description: input.description || `${definition.label} debit`,
    });
    if (!result?.charged && !result?.duplicate) {
      aiProviderCallBillingDeps.logUsageChargeFailure({
        action,
        userId: accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        eventId: callIdentity,
        reason: result?.reason || result?.message || "not_charged",
      });
      await aiProviderCallBillingDeps.updateAiProviderCallSendOutcome({
        accountId,
        userId: accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        idempotencyKey: input.requestId || input.callId || callIdentity,
        eventId: callIdentity,
        finalSendOutcome: "no_send",
        chargeOutcome: result?.reason === "insufficient_funds" ? "skipped" : "unknown",
        reasonLabel: result?.reason || "not_charged",
      }).catch(() => {});
    } else if (result?.charged) {
      await aiProviderCallBillingDeps.updateAiProviderCallSendOutcome({
        accountId,
        userId: accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        idempotencyKey: input.requestId || input.callId || callIdentity,
        eventId: callIdentity,
        finalSendOutcome: "no_send",
        chargeOutcome: "charged",
        reasonLabel: "assistant_ai_charged",
      }).catch(() => {});
    } else if (result?.duplicate) {
      await aiProviderCallBillingDeps.updateAiProviderCallSendOutcome({
        accountId,
        userId: accountId,
        botId: input.botId,
        customerJid: input.customerJid,
        idempotencyKey: input.requestId || input.callId || callIdentity,
        eventId: callIdentity,
        finalSendOutcome: "no_send",
        chargeOutcome: "no_charge",
        reasonLabel: "duplicate_charge_ignored",
      }).catch(() => {});
    }
    return {
      charged: result?.charged === true,
      duplicate: result?.duplicate === true,
      cost,
      dedupeKey,
      result,
    };
  } catch (error: any) {
    aiProviderCallBillingDeps.logUsageChargeFailure({
      action,
      userId: accountId,
      botId: input.botId,
      customerJid: input.customerJid,
      eventId: callIdentity,
      reason: "charge_exception",
    });
    await aiProviderCallBillingDeps.updateAiProviderCallSendOutcome({
      accountId,
      userId: accountId,
      botId: input.botId,
      customerJid: input.customerJid,
      idempotencyKey: input.requestId || input.callId || callIdentity,
      eventId: callIdentity,
      finalSendOutcome: "no_send",
      chargeOutcome: "unknown",
      reasonLabel: "charge_exception",
    }).catch(() => {});
    return {
      charged: false,
      billable: true,
      cost,
      dedupeKey,
      reason: "charge_exception",
    };
  }
}
