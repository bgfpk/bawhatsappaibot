import type { FollowupDeliveryStatus } from "./followup-delivery-evidence.ts";
import { sendUniversalOutboundText } from "./universal-outbound-send-service.ts";

type FollowupBillingPreview = {
  allowed: boolean;
  action?: string;
  cost?: number;
  reason?: string;
  balance?: number;
};

type FollowupBillingChargeResult = {
  charged?: boolean;
  duplicate?: boolean;
  reason?: string;
  cost?: number;
};

type SendMarketingFollowupInput = {
  botId: string;
  customerJid: string;
  messageText: string;
  eventId: string;
  userId?: string;
  previewBilling: () => Promise<FollowupBillingPreview>;
  sendText: (jid: string, text: string) => Promise<{ messageId: string }>;
  saveMessage: (jid: string, text: string, messageId: string) => Promise<void>;
  chargeBilling: (context: { customerJid: string; eventId: string; messageId: string }) => Promise<FollowupBillingChargeResult>;
};

export type MarketingFollowupSendResult = {
  status: FollowupDeliveryStatus;
  sentMessageId?: string;
  finalText?: string;
  reason?: string;
  charged?: boolean;
  duplicateCharge?: boolean;
  chargeAmount?: number;
};

function clean(value: any) {
  return String(value || "").trim();
}

export async function sendMarketingFollowupMessage(input: SendMarketingFollowupInput): Promise<MarketingFollowupSendResult> {
  const preview = await input.previewBilling();
  const universal = await sendUniversalOutboundText({
    userId: input.userId,
    botId: input.botId,
    customerJid: input.customerJid,
    messageText: input.messageText,
    idempotencyKey: input.eventId,
    billingAction: String(preview?.action || "").includes("ai_smart_followup") ? "ai_smart_followup_text" : "marketing_auto_bot_text",
    contextType: "followup_campaign",
    contextId: input.eventId,
    campaignType: String(preview?.action || "").includes("ai_smart_followup") ? "ai_smart_followup" : "fixed_message",
    sendText: input.sendText,
    saveMessage: input.saveMessage,
  });
  if (universal.status === "skipped") {
    return {
      status: "skipped",
      finalText: universal.finalText,
      reason: clean(universal.reason) || "insufficient_wallet",
      chargeAmount: Number(universal.chargeAmount || 0),
    };
  }
  if (universal.status === "failed") {
    return {
      status: "failed",
      finalText: universal.finalText,
      reason: clean(universal.reason) || "Marketing follow-up send failed.",
      chargeAmount: Number(universal.chargeAmount || 0),
    };
  }
  if (universal.status === "duplicate") {
    return {
      status: "skipped",
      sentMessageId: clean(universal.messageId),
      finalText: universal.finalText,
      charged: universal.charged === true,
      duplicateCharge: universal.duplicateCharge === true,
      reason: "duplicate_not_resent",
      chargeAmount: Number(universal.chargeAmount || 0),
    };
  }
  const sentMessageId = clean(universal.messageId);
  return {
    status: "sent",
    sentMessageId,
    finalText: universal.finalText,
    charged: universal.charged === true,
    duplicateCharge: universal.duplicateCharge === true,
    reason: universal.charged || universal.duplicateCharge ? "" : clean(universal.reason),
    chargeAmount: Number(universal.chargeAmount || 0),
  };
}
