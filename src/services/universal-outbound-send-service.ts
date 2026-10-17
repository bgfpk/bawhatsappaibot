import { getUsageBillingDefinition, type BillableUsageAction } from "../config/pricing.ts";
import { buildUsageChargeDescription } from "../config/pricing-display.ts";
import { prepareOutgoingWhatsAppText } from "./outbound-message-sanitizer.ts";
import {
  appendOutboundReceiptAlert,
  buildOutboundMessageFingerprint,
  createOutboundReceiptAttempt,
  findOutboundReceiptByIdempotencyKey,
  updateOutboundReceipt,
} from "./outbound-send-receipt-service.ts";
import { chargeUsageBillingAction, previewUsageBillingAction } from "./outbound-message-billing-service.ts";
import { containsBannedGenericFallback } from "./outbound-fallback-guard-service.ts";
import { emitLiveConsoleEvent, type LiveConsoleEventType } from "./live-console-event-service.ts";
import { updateAiProviderCallSendOutcome } from "./ai-provider-call-ledger-service.ts";
import { getTurnExtraAiCallsCount, getTurnExtraAiCallsCountAsync } from "./customer-turn-ai-call-ledger-service.ts";

import * as dbService from "./db-service.ts";
import { createDurableBillingReconciliationRecord } from "./billing-reconciliation-service.ts";

type UniversalTextSendInput = {
  userId?: string;
  botId: string;
  customerJid: string;
  messageText: string;
  idempotencyKey: string;
  billingAction?: BillableUsageAction;
  customerTurnId?: string;
  extraAiCallsCount?: number;
  messageType?: string;
  contextType?: string;
  contextId?: string;
  campaignType?: string;
  provider?: string;
  template?: {
    name: string;
    language?: string;
    components?: any[];
  };
  sendText: (jid: string, text: string) => Promise<{ messageId: string; remoteJid?: string; timestamp?: number }>;
  saveMessage?: (jid: string, text: string, messageId: string) => Promise<void>;
};

export type UniversalTextSendResult = {
  status: "sent" | "failed" | "skipped" | "duplicate";
  receiptId?: string;
  messageId?: string;
  finalText?: string;
  reason?: string;
  billingAction?: string;
  charged?: boolean;
  duplicateCharge?: boolean;
  chargeAmount?: number;
};

const universalOutboundDeps = {
  previewUsageBillingAction,
  chargeUsageBillingAction,
  findOutboundReceiptByIdempotencyKey,
  createOutboundReceiptAttempt,
  updateOutboundReceipt,
  canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
  createDurableBillingReconciliationRecord,
};

export function __setUniversalOutboundSendTestDeps(overrides: Partial<typeof universalOutboundDeps>) {
  Object.assign(universalOutboundDeps, overrides || {});
}

export function __resetUniversalOutboundSendTestDeps() {
  Object.assign(universalOutboundDeps, {
    previewUsageBillingAction,
    chargeUsageBillingAction,
    findOutboundReceiptByIdempotencyKey,
    createOutboundReceiptAttempt,
    updateOutboundReceipt,
    canSendCustomerFacingMessage: dbService.canSendCustomerFacingMessage,
    createDurableBillingReconciliationRecord,
  });
}

function clean(value: any) {
  return String(value || "").trim();
}

function nowMs() {
  return Date.now();
}

function shortRef(value: any) {
  const text = clean(value);
  return text ? text.slice(0, 12) : "";
}

const PENDING_RECEIPT_BLOCK_MS = 15 * 60 * 1000;
const REPEATED_FALLBACK_BLOCK_MS = 6 * 60 * 60 * 1000;
const recentBlockedFallbacks = new Map<string, number>();

function classifySendEvent(contextType: any, fallback: LiveConsoleEventType) {
  const value = clean(contextType).toLowerCase();
  if (value.includes("sequence")) return fallback === "ai_reply_sent" ? "sequence_item_sent" : fallback === "ai_reply_failed" ? "sequence_item_failed" : "sequence_item_skipped";
  if (value.includes("followup") || value.includes("follow-up") || value.includes("wait_check")) return fallback === "ai_reply_sent" ? "followup_sent" : fallback === "ai_reply_failed" ? "followup_failed" : "followup_skipped";
  return fallback;
}

function emitOutboundEvent(input: UniversalTextSendInput, type: LiveConsoleEventType, level: "info" | "warn" | "error" | "success", title: string, message: string, reason = "", metadata: Record<string, any> = {}) {
  emitLiveConsoleEvent({
    type,
    level,
    scope: "bot",
    accountId: input.userId,
    botId: input.botId,
    customerJid: input.customerJid,
    title,
    message,
    reason,
    metadata: {
      contextType: input.contextType || "",
      campaignType: input.campaignType || "",
      billingAction: input.billingAction || "",
      ...metadata,
    },
  });
}

function safeUpdateReceipt(receiptId: string, patch: any, meta: { idempotencyKey: string; botId: string; customerJid: string; messageId?: string; reason?: string }) {
  try {
    universalOutboundDeps.updateOutboundReceipt(receiptId, patch);
  } catch (error: any) {
    appendOutboundReceiptAlert("receipt_update_failed", {
      receiptId,
      idempotencyKey: meta.idempotencyKey,
      botId: meta.botId,
      customerJid: meta.customerJid,
      messageId: meta.messageId,
      reason: meta.reason || error?.message || "receipt_update_failed",
    });
  }
}

function safeUpdateAiProviderOutcome(input: UniversalTextSendInput, outcome: {
  idempotencyKey: string;
  receiptId?: string;
  messageId?: string;
  finalSendOutcome: "sent" | "failed" | "skipped" | "blocked";
  chargeOutcome: "charged" | "no_charge" | "skipped" | "unknown";
  reasonLabel?: string;
}) {
  if (!input.billingAction) return;
  updateAiProviderCallSendOutcome({
    accountId: input.userId,
    userId: input.userId,
    botId: input.botId,
    customerJid: input.customerJid,
    idempotencyKey: outcome.idempotencyKey,
    receiptId: outcome.receiptId,
    messageId: outcome.messageId,
    finalSendOutcome: outcome.finalSendOutcome,
    chargeOutcome: outcome.chargeOutcome,
    reasonLabel: outcome.reasonLabel,
  }).catch(() => {});
}

export function buildOutboundChargeDescription(input: {
  action: BillableUsageAction;
  receiptId: string;
  messageId: string;
}) {
  return buildUsageChargeDescription({
    action: input.action,
    amount: 1,
    extraParts: [`receipt:${input.receiptId}`, `message:${input.messageId}`],
  });
}

export async function sendUniversalOutboundText(input: UniversalTextSendInput): Promise<UniversalTextSendResult> {
  const prepared = prepareOutgoingWhatsAppText(input.messageText);
  if (!prepared.text) {
    emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_failed"), "error", "Outgoing text failed", "Message became empty after sanitization.", "empty_after_sanitization");
    return { status: "failed", reason: "Message became empty after sanitization." };
  }
  const hadBannedGenericFallback = containsBannedGenericFallback(input.messageText);
  if (hadBannedGenericFallback) {
    const fallbackKey = `${input.botId}:${input.customerJid}:${buildOutboundMessageFingerprint(prepared.text)}`;
    const lastBlocked = Number(recentBlockedFallbacks.get(fallbackKey) || 0);
    if (lastBlocked && nowMs() - lastBlocked <= REPEATED_FALLBACK_BLOCK_MS) {
      emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_skipped"), "warn", "Generic fallback skipped", "Repeated generic fallback was blocked.", "repeated_generic_fallback_blocked");
      return {
        status: "skipped",
        finalText: prepared.text,
        reason: "repeated_generic_fallback_blocked",
        billingAction: clean(input.billingAction),
        chargeAmount: 0,
      };
    }
    recentBlockedFallbacks.set(fallbackKey, nowMs());
  }

  const fingerprint = buildOutboundMessageFingerprint(prepared.text);
  let effectiveIdempotencyKey = input.idempotencyKey;
  const existing = universalOutboundDeps.findOutboundReceiptByIdempotencyKey(input.idempotencyKey);
  if (existing?.sendStatus === "sent" && existing.messageId) {
    if (existing.messageFingerprint && existing.messageFingerprint !== fingerprint) {
      effectiveIdempotencyKey = `${input.idempotencyKey}:${fingerprint}`;
    } else {
      emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_skipped"), "info", "Duplicate send skipped", "Message already has a successful receipt.", "duplicate_attempt", {
        chargeStatus: existing.duplicateCharge ? "duplicate" : existing.charged ? "charged" : "not_charged",
        eventRef: shortRef(input.idempotencyKey),
      });
      return {
        status: "duplicate",
        receiptId: existing.receiptId,
        messageId: existing.messageId,
        finalText: prepared.text,
        reason: "duplicate_attempt",
        billingAction: existing.billingAction,
        charged: existing.charged,
        duplicateCharge: existing.duplicateCharge,
        chargeAmount: existing.walletChargeAmount,
      };
    }
  } else if (
    existing &&
    (existing.sendStatus === "queued" || existing.sendStatus === "sending") &&
    nowMs() - Number(existing.updatedAt || existing.createdAt || 0) <= PENDING_RECEIPT_BLOCK_MS
  ) {
    emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_skipped"), "warn", "Send skipped", "Pending receipt requires manual review.", "pending_receipt_manual_review");
    return {
      status: "skipped",
      receiptId: existing.receiptId,
      finalText: prepared.text,
      reason: "pending_receipt_manual_review",
      billingAction: existing.billingAction,
      charged: existing.charged,
      duplicateCharge: existing.duplicateCharge,
      chargeAmount: existing.walletChargeAmount,
    };
  }

  const effectiveExisting = effectiveIdempotencyKey === input.idempotencyKey
    ? existing
    : universalOutboundDeps.findOutboundReceiptByIdempotencyKey(effectiveIdempotencyKey);
  if (effectiveExisting?.sendStatus === "sent" && effectiveExisting.messageId) {
    emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_skipped"), "info", "Duplicate send skipped", "Message already has a successful receipt.", "duplicate_attempt", {
      chargeStatus: effectiveExisting.duplicateCharge ? "duplicate" : effectiveExisting.charged ? "charged" : "not_charged",
      eventRef: shortRef(effectiveIdempotencyKey),
    });
    return {
      status: "duplicate",
      receiptId: effectiveExisting.receiptId,
      messageId: effectiveExisting.messageId,
      finalText: prepared.text,
      reason: "duplicate_attempt",
      billingAction: effectiveExisting.billingAction,
      charged: effectiveExisting.charged,
      duplicateCharge: effectiveExisting.duplicateCharge,
      chargeAmount: effectiveExisting.walletChargeAmount,
    };
  }

  const billing = input.billingAction ? await universalOutboundDeps.previewUsageBillingAction(input.userId, input.billingAction) : null;
  if (!billing && input.userId) {
    const access = await universalOutboundDeps.canSendCustomerFacingMessage(input.userId);
    if (!access.allowed) {
      const deniedReason = clean(access.reason) || "account_access_expired";
      const blockType: LiveConsoleEventType = deniedReason.includes("trial") ? "trial_expired_block" : "subscription_expired_block";
      emitOutboundEvent(input, blockType, "warn", "Outbound send blocked", "Account entitlement is expired or inactive.", deniedReason, { chargeAmount: 0, chargeStatus: "not_charged", eventRef: shortRef(effectiveIdempotencyKey) });
      return {
        status: "skipped",
        finalText: prepared.text,
        reason: deniedReason,
        billingAction: clean(input.billingAction),
        chargeAmount: 0,
      };
    }
  }

  const turnId = String(input.customerTurnId || input.contextId || input.idempotencyKey || "");
  const recordedExtra = turnId ? await getTurnExtraAiCallsCountAsync(turnId) : 0;
  const extraCalls = Math.max(0, Math.max(Number(input.extraAiCallsCount || 0), recordedExtra));
  const extraCallsCost = Number((extraCalls * 0.001).toFixed(6));
  const baseChargeAmount = Number(billing?.cost || 0);
  const totalChargeAmount = Number((baseChargeAmount + extraCallsCost).toFixed(6));

  if (billing && billing.allowed && extraCalls > 0 && typeof (billing as any).balance === "number" && (billing as any).balance < totalChargeAmount) {
    billing.allowed = false;
    (billing as any).reason = "insufficient_wallet";
  }

  const chargeAmount = totalChargeAmount;
  const receipt = universalOutboundDeps.createOutboundReceiptAttempt({
    userId: input.userId,
    botId: input.botId,
    customerJid: input.customerJid,
    messageType: clean(input.template ? "template" : (input.messageType || "text")),
    contextType: clean(input.contextType || "generic"),
    contextId: clean(input.contextId),
    campaignType: clean(input.campaignType),
    billingAction: clean(input.billingAction),
    walletChargeAmount: chargeAmount,
    idempotencyKey: effectiveIdempotencyKey,
    messageFingerprint: fingerprint,
    provider: clean(input.provider) || undefined,
    templateName: input.template?.name,
    templateLanguage: input.template?.language,
  });
  safeUpdateReceipt(receipt.receiptId, { sendStatus: "sending", errorReason: "" }, {
    idempotencyKey: effectiveIdempotencyKey,
    botId: input.botId,
    customerJid: input.customerJid,
  });

  if (billing && !billing.allowed) {
    const deniedReason = clean(billing.reason) || "insufficient_wallet";
    const blockType: LiveConsoleEventType = deniedReason.includes("trial") ? "trial_expired_block" :
      deniedReason.includes("subscription") || deniedReason.includes("account_access") ? "subscription_expired_block" :
      deniedReason.includes("wallet") || deniedReason.includes("fund") ? "insufficient_wallet" :
      "wallet_not_charged";
    emitOutboundEvent(input, blockType, "warn", "Wallet charge blocked", "Outbound message was skipped before send; no wallet charge was created.", deniedReason, { chargeAmount, chargeStatus: "not_charged", action: input.billingAction || "", amount: chargeAmount, eventRef: shortRef(effectiveIdempotencyKey) });
    safeUpdateReceipt(receipt.receiptId, {
      sendStatus: "skipped",
      errorReason: deniedReason,
    }, {
      idempotencyKey: effectiveIdempotencyKey,
      botId: input.botId,
      customerJid: input.customerJid,
      reason: deniedReason,
    });
    safeUpdateAiProviderOutcome(input, {
      idempotencyKey: effectiveIdempotencyKey,
      receiptId: receipt.receiptId,
      finalSendOutcome: "blocked",
      chargeOutcome: "skipped",
      reasonLabel: deniedReason,
    });
    return {
      status: "skipped",
      receiptId: receipt.receiptId,
      finalText: prepared.text,
      reason: deniedReason,
      billingAction: clean(input.billingAction),
      chargeAmount,
    };
  }

  try {
    const sent = await input.sendText(input.customerJid, prepared.text);
    const messageId = clean(sent?.messageId);
    if (!messageId) {
      emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_failed"), "error", "Send failed", "WhatsApp send returned no message id.", "missing_message_id");
      safeUpdateReceipt(receipt.receiptId, { sendStatus: "failed", errorReason: "missing_message_id" }, {
        idempotencyKey: effectiveIdempotencyKey,
        botId: input.botId,
        customerJid: input.customerJid,
        reason: "missing_message_id",
      });
      safeUpdateAiProviderOutcome(input, {
        idempotencyKey: effectiveIdempotencyKey,
        receiptId: receipt.receiptId,
        finalSendOutcome: "failed",
        chargeOutcome: "no_charge",
        reasonLabel: "missing_message_id",
      });
      return { status: "failed", receiptId: receipt.receiptId, finalText: prepared.text, reason: "missing_message_id" };
    }

    try {
      await input.saveMessage?.(input.customerJid, prepared.text, messageId);
    } catch (error: any) {
      appendOutboundReceiptAlert("save_message_failed_after_send", {
        receiptId: receipt.receiptId,
        idempotencyKey: effectiveIdempotencyKey,
        botId: input.botId,
        customerJid: input.customerJid,
        messageId,
        reason: clean(error?.message || error) || "save_message_failed",
      });
    }
    let charged = false;
    let duplicateCharge = false;
    let actualChargedAmount = 0;
    if (input.billingAction) {
      const charge = await universalOutboundDeps.chargeUsageBillingAction(
        input.userId,
        input.billingAction,
        {
          botId: input.botId,
          customerJid: input.customerJid,
          eventId: effectiveIdempotencyKey,
          messageId,
        },
        buildOutboundChargeDescription({ action: input.billingAction, receiptId: receipt.receiptId, messageId }),
      );
      charged = charge?.charged === true;
      duplicateCharge = charge?.duplicate === true;
      if (charged) {
        actualChargedAmount += baseChargeAmount;
      }

      // If extra qualifying AI calls were made during this turn, charge them too
      if (charged && extraCalls > 0) {
        const extraCharge = await universalOutboundDeps.chargeUsageBillingAction(
          input.userId,
          "customer_ai_extra_call",
          {
            botId: input.botId,
            customerJid: input.customerJid,
            eventId: `${effectiveIdempotencyKey}:extra_calls`,
            messageId,
          },
          buildUsageChargeDescription({
            action: "customer_ai_extra_call",
            amount: extraCalls,
            extraParts: [`receipt:${receipt.receiptId}`, `message:${messageId}`],
          }),
          extraCalls,
        );
        if (extraCharge?.charged) {
          actualChargedAmount += extraCallsCost;
        }
      }

      const effectiveFinalCharge = charged ? actualChargedAmount : (duplicateCharge ? totalChargeAmount : 0);
      const chargeStatus = charged ? "charged" : duplicateCharge ? "duplicate" : "not_charged";
      const chargeTitle = charged ? "Wallet charged" : duplicateCharge ? "Duplicate charge ignored" : "Wallet not charged";
      const chargeMessage = charged ? "Usage charge recorded for successful send." : duplicateCharge ? "Wallet charge already recorded; no new debit." : "Successful send did not create a usage charge.";
      emitOutboundEvent(input, charged ? "wallet_charged" : "wallet_not_charged", charged ? "success" : duplicateCharge ? "info" : "warn", chargeTitle, chargeMessage, charge?.reason || "", {
        action: input.billingAction || "",
        amount: effectiveFinalCharge,
        chargeAmount: effectiveFinalCharge,
        chargeStatus,
        duplicateCharge,
        eventRef: shortRef(effectiveIdempotencyKey),
        dedupeRef: shortRef(charge?.dedupeKey),
        messageId,
        source: input.contextType || input.campaignType || "outbound_send",
      });
      if (!charged && !duplicateCharge) {
        // Diagnostic only filesystem alert (filesystem financial authority: NO)
        appendOutboundReceiptAlert("billing_reconciliation_pending", {
          receiptId: receipt.receiptId,
          idempotencyKey: effectiveIdempotencyKey,
          botId: input.botId,
          customerJid: input.customerJid,
          messageId,
          billingAction: input.billingAction,
          chargeAmount: totalChargeAmount,
          reason: clean(charge?.reason || "post_send_charge_failed"),
        });

        // Durable Appwrite financial reconciliation record (authoritative; Appwrite financial reconciliation authority: YES)
        try {
          await universalOutboundDeps.createDurableBillingReconciliationRecord({
            accountId: String(input.userId || ""),
            botId: input.botId,
            customerJid: input.customerJid,
            customerTurnId: turnId,
            messageId,
            receiptId: receipt.receiptId,
            billingAction: input.billingAction,
            successfulQualifyingAiCalls: extraCalls + 1,
            expectedCharge: totalChargeAmount,
            chargeDedupeKey: clean(charge?.dedupeKey) || dbService.buildUsageChargeDedupeKey(input.billingAction, [
              input.userId,
              input.botId,
              input.customerJid,
              effectiveIdempotencyKey,
              input.billingAction,
            ]),
            failureReason: clean(charge?.reason || "post_send_charge_failed"),
          });
        } catch (reconcileError: any) {
          const errMsg = clean(reconcileError?.message || reconcileError) || "reconciliation_creation_failed";
          console.error(`[CRITICAL_BILLING_ERROR] Failed to persist Appwrite reconciliation for sent message ${messageId}: ${errMsg}`, {
            accountId: input.userId,
            botId: input.botId,
            customerJid: input.customerJid,
            messageId,
            receiptId: receipt.receiptId,
            billingAction: input.billingAction,
            expectedCharge: totalChargeAmount,
            idempotencyKey: effectiveIdempotencyKey,
          });
          emitOutboundEvent(input, "wallet_not_charged", "error", "Critical Billing Reconciliation Persistence Failure",
            "Message was delivered to WhatsApp but durable billing reconciliation could not be created in Appwrite.", errMsg, {
              receiptId: receipt.receiptId,
              messageId,
              action: input.billingAction,
              chargeAmount: totalChargeAmount,
              eventRef: shortRef(effectiveIdempotencyKey),
            });
        }
      }
      safeUpdateReceipt(receipt.receiptId, {
        chargeDedupeKey: clean(charge?.dedupeKey),
        walletChargeAmount: effectiveFinalCharge,
      }, {
        idempotencyKey: effectiveIdempotencyKey,
        botId: input.botId,
        customerJid: input.customerJid,
        messageId,
      });
    }

    const effectiveResultCharge = charged ? actualChargedAmount : (duplicateCharge ? totalChargeAmount : chargeAmount);
    safeUpdateReceipt(receipt.receiptId, {
      sendStatus: "sent",
      messageId,
      remoteJid: clean(sent?.remoteJid || input.customerJid),
      sentTimestamp: Number(sent?.timestamp || nowMs()),
      billingAction: clean(input.billingAction),
      walletChargeAmount: effectiveResultCharge,
      charged,
      duplicateCharge,
      errorReason: "",
    }, {
      idempotencyKey: effectiveIdempotencyKey,
      botId: input.botId,
      customerJid: input.customerJid,
      messageId,
    });
    emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_sent"), "success", "Message sent", "WhatsApp message sent successfully.", "", {
      messageId,
      charged,
      duplicateCharge,
    });
    safeUpdateAiProviderOutcome(input, {
      idempotencyKey: effectiveIdempotencyKey,
      receiptId: receipt.receiptId,
      messageId,
      finalSendOutcome: "sent",
      chargeOutcome: charged || duplicateCharge ? "charged" : "unknown",
      reasonLabel: charged || duplicateCharge ? "" : "wallet_not_charged_after_send",
    });
    return {
      status: "sent",
      receiptId: receipt.receiptId,
      messageId,
      finalText: prepared.text,
      billingAction: clean(input.billingAction),
      charged,
      duplicateCharge,
      chargeAmount: charged ? actualChargedAmount : 0,
    };
  } catch (error: any) {
    const reason = clean(error?.message || error) || "send_failed";
    emitOutboundEvent(input, classifySendEvent(input.contextType, "ai_reply_failed"), "error", "Send failed", "WhatsApp send failed.", reason);
    safeUpdateReceipt(receipt.receiptId, {
      sendStatus: "failed",
      errorReason: reason,
    }, {
      idempotencyKey: effectiveIdempotencyKey,
      botId: input.botId,
      customerJid: input.customerJid,
      reason,
    });
    safeUpdateAiProviderOutcome(input, {
      idempotencyKey: effectiveIdempotencyKey,
      receiptId: receipt.receiptId,
      finalSendOutcome: "failed",
      chargeOutcome: "no_charge",
      reasonLabel: reason,
    });
    return {
      status: "failed",
      receiptId: receipt.receiptId,
      finalText: prepared.text,
      reason,
      billingAction: clean(input.billingAction),
      chargeAmount,
    };
  }
}
