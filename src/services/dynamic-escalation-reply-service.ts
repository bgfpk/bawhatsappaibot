import type { EscalationReasonCategory } from "./business-training-scope-guard-service.ts";

type AdminAlertInput = {
  customerName?: any;
  customerPhone?: any;
  sender: string;
  latestUserText?: any;
  reasonCategory: EscalationReasonCategory;
  topic?: string;
  customerReplyText?: any;
  issueSummary?: any;
  suggestedAction?: any;
};

function clean(value: any, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function compactInternationalPhone(value: any) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 11 || digits.length > 15) return "";
  return `+${digits}`;
}

function normalizeTopic(value: any) {
  const topic = clean(value, 80);
  if (!topic) return "";
  if (topic.length > 60) return "";
  if (topic.split(/\s+/).length > 8) return "";
  if (/[`"'“”]/.test(topic)) return "";
  return topic;
}

function topicSuffix(value: any) {
  const topic = normalizeTopic(value);
  return topic ? ` about ${topic}` : "";
}

export function buildDynamicAdminIssueSummary(input: AdminAlertInput) {
  switch (input.reasonCategory) {
    case "human_requested": return `Customer requested to speak with a human or admin${topicSuffix(input.topic)}.`;
    case "unsupported_business_question": return `Customer asked an unverified business question${topicSuffix(input.topic)}.`;
    case "high_risk_unverified_question": return `Customer needs direct verification${topicSuffix(input.topic)}.`;
    case "repeated_unclear_question": return "Customer is still unclear after repeated replies";
    case "bargaining_or_price_push": return `Customer is asking for a final price or discount${topicSuffix(input.topic)}.`;
    case "broken_customer_reply": return "Bot reply contained broken or internal-style text";
    case "broken_customer_reply_unrepairable": return "Bot reply could not be safely repaired for the customer";
    case "bot_reply_unrelated": return `Bot reply drifted away from the latest customer question${topicSuffix(input.topic)}.`;
    case "appointment_or_order_confirmation_risk": return `Customer needs help with a confirmation request${topicSuffix(input.topic)}.`;
    default: return `Customer needs help${topicSuffix(input.topic)}.`;
  }
}

export function buildDynamicAdminSuggestedAction(input: AdminAlertInput) {
  const topic = normalizeTopic(input.topic);
  switch (input.reasonCategory) {
    case "human_requested": return topic ? `Please reply personally about ${topic} or arrange a handoff.` : "Please reply personally or arrange a handoff.";
    case "unsupported_business_question": return topic ? `Please confirm the correct answer for ${topic} before replying.` : "Please confirm the correct answer before replying.";
    case "high_risk_unverified_question": return topic ? `Please verify ${topic} directly before replying.` : "Please verify the answer directly before replying.";
    case "repeated_unclear_question": return "Send one clearer explanation and correct any misunderstanding in the bot guidance.";
    case "bargaining_or_price_push": return topic ? `Please confirm the allowed final price or discount for ${topic}.` : "Please confirm the allowed final price or discount.";
    case "broken_customer_reply": return "Review the latest bot reply and provide the clean customer-facing answer.";
    case "broken_customer_reply_unrepairable": return "Please send the clean customer-facing answer directly.";
    case "bot_reply_unrelated": return topic ? `Please answer ${topic} directly and ignore stale context.` : "Please answer the latest question directly and ignore stale context.";
    case "appointment_or_order_confirmation_risk": return topic ? `Please verify the real status of ${topic} before confirming anything.` : "Please verify the real status before confirming anything.";
    default: return topic ? `Please review ${topic} and provide the approved answer.` : "Please review the latest message and provide the approved answer.";
  }
}

export function buildShortAdminAlertMessage(input: AdminAlertInput & { customerReplyText?: any }) {
  const name = clean(input.customerName, 80) || "Unknown";
  const phone = compactInternationalPhone(input.customerPhone);
  const issue = clean(input.issueSummary || buildDynamicAdminIssueSummary(input), 180);
  const action = clean(input.suggestedAction || buildDynamicAdminSuggestedAction(input), 160);
  const message = [
    "Admin Help Needed",
    "",
    `Customer: ${name}`,
    phone ? `Phone: ${phone}` : "",
    "",
    "Issue:",
    issue,
    "",
    "Suggested action:",
    action,
  ].filter(Boolean).join("\n");
  return message.slice(0, 500).trim();
}
