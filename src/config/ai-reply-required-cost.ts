import {
  buildCustomerAiUsageActions,
  getUsageBillingDefinition,
  type BillableUsageAction,
} from "./pricing.ts";

export type RequiredAiReplyCostInput = {
  purpose?: string;
  billingAction?: BillableUsageAction | string;
  usageAction?: BillableUsageAction | string;
  usageActions?: Array<BillableUsageAction | string>;
  hasIncomingImage?: boolean;
  hasIncomingAudio?: boolean;
  sendsTextReply?: boolean;
  sendsVoiceReply?: boolean;
};

const BILLABLE_ACTIONS = new Set<BillableUsageAction>([
  "customer_ai_text_reply",
  "customer_ai_image_understanding",
  "customer_ai_audio_understanding",
  "customer_ai_voice_reply",
  "ai_smart_followup_text",
  "client_gemini_message_cycle",
  "client_gemini_explicit_cache_boost",
  "agent_mode_rule_action",
  "agent_mode_ai_action",
  "admin_business_assistant_message",
  "business_assistant_ai_call",
  "personal_assistant_ai_call",
]);

function clean(value: any) {
  return String(value || "").trim();
}

function isBillableUsageAction(value: any): value is BillableUsageAction {
  return BILLABLE_ACTIONS.has(clean(value) as BillableUsageAction);
}

function actionFromPurpose(purpose: any): BillableUsageAction {
  const value = clean(purpose).toLowerCase();
  if (value.includes("smart_followup") || value.includes("wait_check") || value.includes("nudge")) return "ai_smart_followup_text";
  if (value.includes("image") || value.includes("vision")) return "customer_ai_image_understanding";
  if (value.includes("audio") || value.includes("voice_note")) return "customer_ai_audio_understanding";
  if (value.includes("voice_reply") || value.includes("tts")) return "customer_ai_voice_reply";
  return "customer_ai_text_reply";
}

function price(action: BillableUsageAction) {
  return Math.max(0, Number(getUsageBillingDefinition(action).priceUsd || 0));
}

export function getRequiredAiReplyCostForPurpose(input: RequiredAiReplyCostInput = {}) {
  if (Array.isArray(input.usageActions) && input.usageActions.length > 0) {
    return Number(input.usageActions.reduce((sum, action) => (
      sum + (isBillableUsageAction(action) ? price(action) : 0)
    ), 0).toFixed(6));
  }

  const scenarioActions = buildCustomerAiUsageActions({
    hasIncomingImage: input.hasIncomingImage,
    hasIncomingAudio: input.hasIncomingAudio,
    sendsTextReply: input.sendsTextReply,
    sendsVoiceReply: input.sendsVoiceReply,
  });
  if (scenarioActions.length > 0) {
    return Number(scenarioActions.reduce((sum, action) => sum + price(action), 0).toFixed(6));
  }

  const explicitAction = clean(input.billingAction || input.usageAction);
  if (isBillableUsageAction(explicitAction)) return price(explicitAction);

  return price(actionFromPurpose(input.purpose));
}
