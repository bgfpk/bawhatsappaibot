import { getMissingLeadFields, normalizeRecordType } from "./record-flow-service.ts";
import { getMissingOrderFields } from "./order-required-fields-service.ts";
import { filterMissingFieldsAgainstKnownValues } from "./customer-field-guard-service.ts";

export type CustomerAiRouterDecision =
  | { action: "skip_ai_no_reply"; reason: string; confidence: "high" }
  | { action: "reply_text"; reason: string; confidence: "high"; text: string }
  | { action: "send_media"; reason: string; confidence: "high"; media: any }
  | { action: "use_ai"; reason: string; confidence: "low" | "medium" };

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const FILLER_RE = /^(ok|okay|k|ji|jee|hmm|hm|thanks|thank you|thx|jazakallah|shukriya)[.!?]*$/i;
const YES_NO_RE = /^(yes|yep|yeah|han|haan|no|nope|done|sure|theek|thik)[.!?]*$/i;
const GREETING_RE = /^(hi|hello|hey|salam|assalam o alaikum|aoa|good morning|good evening)[.!?]*$/i;
const SENSITIVE_RE = /\b(refund|return|complaint|fraud|scam|fake|legal|court|police|lawsuit|angry|gussa|doctor|medical|emergency|pain|financial|loan|payment dispute)\b/i;
const HUMAN_RE = /\b(human|person|agent|admin|manager|owner|call me|representative|real person|insan|banda)\b/i;
const STOP_RE = /^(stop|unsubscribe|block|do not message|don't message|band karo|mat bhejo)$/i;

export function getMissingFieldsForActiveRecord(activeRecord: any, configuredFields: any[] = []) {
  if (!activeRecord) return [];
  const data = activeRecord?.order_data || activeRecord || {};
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.missingFields) && data.missingFields.length > 0) {
    return filterMissingFieldsAgainstKnownValues({ missingFields: data.missingFields.map(clean).filter(Boolean), latestOrder: data, record: data }).filtered;
  }
  const recordType = normalizeRecordType(data.recordType, data.businessFlow);
  return recordType === "lead"
    ? getMissingLeadFields(data, configuredFields)
    : getMissingOrderFields(data, configuredFields);
}

export function hasActiveIncompleteRecord(activeRecord: any, configuredFields: any[] = []) {
  if (!activeRecord) return false;
  const data = activeRecord?.order_data || activeRecord || {};
  if (!data || typeof data !== "object") return false;
  const status = normalize(data.recordStatus || data.transactionStatus || data.orderStatus);
  if (/\bcomplete\b|\bcompleted\b|\bconfirmed\b|\bconfirm\b/.test(status) && !/\bincomplete\b/.test(status)) return false;
  return status.includes("incomplete") || getMissingFieldsForActiveRecord(data, configuredFields).length > 0;
}

export function classifyCustomerText(text: any) {
  const raw = clean(text);
  const normalized = normalize(raw);
  const emojiOnly = Boolean(raw) && !/[\p{L}\p{N}]/u.test(raw);
  const asksPricingPackage = /\b(price|rate|cost|kitna|kitne|qeemat|rs|pkr|amount|charges?|package|plan|starter|growth|pro|subscription|monthly|limit|messages?)\b/i.test(raw);
  const asksBotName = /\b(your name|bot name|assistant name|who are you|aap ka naam|apka naam|tumhara naam)\b/i.test(raw);
  const isWaitingForReply = /\b(waiting (for )?(your )?reply|reply please|answer me|jawab|response|waiting)\b/i.test(raw);
  const describesBusiness = /\b(marketing|properties|property|sale|purchase|real estate|estate|business|service|services|school|clinic|agency|shop|store|ecommerce|factory|warehouse)\b/i.test(raw) && raw.length > 12;
  const asksDirectQuestion = /\?|\b(what|why|when|where|how|may i know|can you|could you|please tell|tell me|kya|kiya|kaise|kab|kahan)\b/i.test(raw) || asksPricingPackage || asksBotName || isWaitingForReply;
  return {
    raw,
    normalized,
    isFiller: FILLER_RE.test(raw) || emojiOnly,
    isGreeting: GREETING_RE.test(raw),
    isYesNo: YES_NO_RE.test(raw),
    isSensitive: SENSITIVE_RE.test(raw),
    wantsHuman: HUMAN_RE.test(raw),
    isStop: STOP_RE.test(raw),
    asksPrice: /\b(price|rate|cost|kitna|kitne|qeemat|rs|pkr|amount|charges?)\b/i.test(raw),
    asksPricingPackage,
    asksBotName,
    asksDirectQuestion,
    isWaitingForReply,
    describesBusiness,
    asksCatalog: /\b(catalog|catalogue|photos?|pictures?|pics?|images?|video|details?|options?|variety|collection|show me)\b/i.test(raw),
    asksOrderStatus: /\b(order status|tracking|track|delivered|delivery status|parcel|where is my order)\b/i.test(raw),
    asksLocationTimingPayment: /\b(location|address|timing|hours|open|close|payment|pay|advance|cod|cash|how to order|book|booking|appointment)\b/i.test(raw),
  };
}

export function decideTrivialAiRoute(input: {
  text: any;
  hasAudio?: boolean;
  hasImage?: boolean;
  hasMedia?: boolean;
  activeRecord?: any;
  configuredFields?: any[];
  autoReply?: boolean;
}): CustomerAiRouterDecision {
  const cls = classifyCustomerText(input.text);
  if (!cls.raw) return { action: "use_ai", reason: "empty_text", confidence: "low" };
  if (input.hasAudio || input.hasImage || input.hasMedia) return { action: "use_ai", reason: "media_or_voice_needs_existing_flow", confidence: "medium" };
  if (cls.isSensitive || cls.wantsHuman || cls.isStop) return { action: "use_ai", reason: "safety_or_handoff", confidence: "medium" };

  const activeIncomplete = hasActiveIncompleteRecord(input.activeRecord, input.configuredFields || []);
  if (activeIncomplete && (cls.asksDirectQuestion || cls.describesBusiness || cls.isWaitingForReply)) {
    return { action: "use_ai", reason: "answer_direct_before_field_collection", confidence: "medium" };
  }
  if (activeIncomplete && cls.isFiller) return { action: "use_ai", reason: "active_record_filler_needs_contextual_reply", confidence: "medium" };
  if (activeIncomplete) return { action: "use_ai", reason: "active_incomplete_record", confidence: "medium" };
  if (cls.isYesNo) return { action: "use_ai", reason: "ambiguous_confirmation_without_context", confidence: "medium" };
  if (cls.isFiller) return { action: "skip_ai_no_reply", reason: "high_confidence_filler", confidence: "high" };
  if (cls.isGreeting) {
    if (input.autoReply === false) return { action: "skip_ai_no_reply", reason: "auto_reply_disabled", confidence: "high" };
    return { action: "reply_text", reason: "high_confidence_greeting", confidence: "high", text: "Hi, how can I help you?" };
  }

  return { action: "use_ai", reason: "needs_semantic_reply", confidence: "medium" };
}
