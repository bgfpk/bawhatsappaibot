import {
  buildAutomationBillingEventId,
  buildAutomationTemplateKey,
  canSendBillableAutomation,
  chargeAutomationSendUsage,
  type AutomationSendBillingAction,
} from "./automation-send-billing-service.ts";
import {
  appendOutboundReceiptAlert,
  createOutboundReceiptAttempt,
  findOutboundReceiptByIdempotencyKey,
  updateOutboundReceipt,
} from "./outbound-send-receipt-service.ts";
import { buildOutboundChargeDescription } from "./universal-outbound-send-service.ts";

type UniversalAutomationRelayInput = {
  userId?: string;
  botId?: string;
  customerJid: string;
  billingAction: AutomationSendBillingAction;
  idempotencyKey: string;
  messageType: string;
  contextType: string;
  contextId?: string;
  campaignType?: string;
  sequenceKey?: string;
  mediaTitle?: string;
  source?: string;
  template: any;
  relay: (messageId: string) => Promise<void>;
  saveMessage?: (messageId: string) => Promise<void>;
  buildMessageId: () => string;
};

function clean(value: any) {
  return String(value || "").trim();
}

const PENDING_RECEIPT_BLOCK_MS = 15 * 60 * 1000;

function safeUpdateReceipt(receiptId: string, patch: any, meta: { idempotencyKey: string; botId?: string; customerJid: string; messageId?: string; reason?: string }) {
  try {
    updateOutboundReceipt(receiptId, patch);
  } catch (error: any) {
    appendOutboundReceiptAlert("automation_receipt_update_failed", {
      receiptId,
      idempotencyKey: meta.idempotencyKey,
      botId: meta.botId,
      customerJid: meta.customerJid,
      messageId: meta.messageId,
      reason: meta.reason || error?.message || "receipt_update_failed",
    });
  }
}

export async function sendUniversalAutomationRelay(input: UniversalAutomationRelayInput) {
  const existing = findOutboundReceiptByIdempotencyKey(input.idempotencyKey);
  if (existing?.sendStatus === "sent" && existing.messageId) {
    return {
      status: "duplicate" as const,
      receiptId: existing.receiptId,
      messageId: existing.messageId,
      charged: existing.charged,
      duplicateCharge: existing.duplicateCharge,
    };
  }
  if (
    existing &&
    (existing.sendStatus === "queued" || existing.sendStatus === "sending") &&
    Date.now() - Number(existing.updatedAt || existing.createdAt || 0) <= PENDING_RECEIPT_BLOCK_MS
  ) {
    return {
      status: "skipped" as const,
      receiptId: existing.receiptId,
      reason: "pending_receipt_manual_review",
      charged: existing.charged,
      duplicateCharge: existing.duplicateCharge,
    };
  }

  const allowance = await canSendBillableAutomation(input.userId, input.billingAction);
  const receipt = createOutboundReceiptAttempt({
    userId: input.userId,
    botId: input.botId,
    customerJid: input.customerJid,
    messageType: input.messageType,
    contextType: input.contextType,
    contextId: input.contextId || input.idempotencyKey,
    campaignType: input.campaignType || input.source || input.billingAction,
    billingAction: input.billingAction,
    walletChargeAmount: Number(allowance?.required || 0),
    idempotencyKey: input.idempotencyKey,
  });
  safeUpdateReceipt(receipt.receiptId, { sendStatus: "sending", errorReason: "" }, {
    idempotencyKey: input.idempotencyKey,
    botId: input.botId,
    customerJid: input.customerJid,
  });

  if (!allowance.allowed) {
    safeUpdateReceipt(receipt.receiptId, {
      sendStatus: "skipped",
      errorReason: clean(allowance.reason) || "insufficient_wallet",
    }, {
      idempotencyKey: input.idempotencyKey,
      botId: input.botId,
      customerJid: input.customerJid,
      reason: clean(allowance.reason) || "insufficient_wallet",
    });
    return {
      status: "skipped" as const,
      receiptId: receipt.receiptId,
      reason: clean(allowance.reason) || "insufficient_wallet",
    };
  }

  const messageId = clean(input.buildMessageId());
  try {
    await input.relay(messageId);
    try {
      await input.saveMessage?.(messageId);
    } catch (error: any) {
      appendOutboundReceiptAlert("automation_save_message_failed_after_send", {
        receiptId: receipt.receiptId,
        idempotencyKey: input.idempotencyKey,
        botId: input.botId,
        customerJid: input.customerJid,
        messageId,
        reason: clean(error?.message || error) || "save_message_failed",
      });
    }
    const charge: any = await chargeAutomationSendUsage(input.billingAction, {
      userId: input.userId,
      botId: input.botId,
      customerJid: input.customerJid,
      eventId: input.contextId || buildAutomationBillingEventId([
        input.customerJid,
        buildAutomationTemplateKey(input.template),
        input.sequenceKey,
        input.mediaTitle,
        input.source,
      ]),
      messageId,
      sequenceKey: input.sequenceKey,
      templateKey: buildAutomationTemplateKey(input.template),
      mediaTitle: input.mediaTitle,
      source: input.source,
      description: buildOutboundChargeDescription({
        action: input.billingAction,
        receiptId: receipt.receiptId,
        messageId,
      }),
    });
    safeUpdateReceipt(receipt.receiptId, {
      sendStatus: "sent",
      messageId,
      remoteJid: input.customerJid,
      sentTimestamp: Date.now(),
      chargeDedupeKey: clean(charge?.dedupeKey),
      charged: charge?.charged === true,
      duplicateCharge: charge?.duplicate === true,
      errorReason: "",
    }, {
      idempotencyKey: input.idempotencyKey,
      botId: input.botId,
      customerJid: input.customerJid,
      messageId,
    });
    return {
      status: "sent" as const,
      receiptId: receipt.receiptId,
      messageId,
      charged: charge?.charged === true,
      duplicateCharge: charge?.duplicate === true,
    };
  } catch (error: any) {
    safeUpdateReceipt(receipt.receiptId, {
      sendStatus: "failed",
      errorReason: clean(error?.message || error) || "send_failed",
    }, {
      idempotencyKey: input.idempotencyKey,
      botId: input.botId,
      customerJid: input.customerJid,
      messageId,
      reason: clean(error?.message || error) || "send_failed",
    });
    throw error;
  }
}
