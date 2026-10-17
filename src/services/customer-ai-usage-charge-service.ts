import type { BillableUsageAction } from "../config/pricing.ts";

export function buildAdditionalCustomerAiUsageActions(input: {
  hasIncomingImage?: boolean;
  hasIncomingAudio?: boolean;
  sentTextReply?: boolean;
  sentVoiceReply?: boolean;
  textReceiptId?: string;
  voiceReceiptId?: string;
}): BillableUsageAction[] {
  const actions: BillableUsageAction[] = [];
  if (input.sentVoiceReply) actions.push("customer_ai_voice_reply");
  return actions;
}

export function buildCustomerReplyUsageActions(input: {
  hasIncomingImage?: boolean;
  hasIncomingAudio?: boolean;
  sentTextReply?: boolean;
  sentVoiceReply?: boolean;
  textReceiptId?: string;
  voiceReceiptId?: string;
  smartSalesUsed?: boolean;
  skipPlatformAiUsageCharges?: boolean;
}): BillableUsageAction[] {
  const actions = input.skipPlatformAiUsageCharges ? [] : buildAdditionalCustomerAiUsageActions(input);
  if (input.smartSalesUsed) actions.push("smart_sales_engine_reply");
  return actions;
}
