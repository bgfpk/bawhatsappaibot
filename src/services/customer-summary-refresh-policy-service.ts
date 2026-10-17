import { compactAiText } from "./ai-cost-control-service.ts";
import { isVoiceNoteMeaningText, isVoiceTranscriptUnavailableText } from "./voice-note-history-service.ts";

function clean(value: any, limit = 500) {
  return compactAiText(value, limit);
}

function normalize(value: any) {
  return clean(value, 500)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value: any) {
  return String(value || "").replace(/\D+/g, "");
}

function hasEmojiOnly(text: string) {
  return Boolean(text) && !/[\p{L}\p{N}]/u.test(text);
}

function extractUserTexts(messages: any[] = []) {
  return messages
    .filter((message) => String(message?.role || "").toLowerCase() === "user")
    .map((message) => clean(message?.text || "", 500))
    .filter(Boolean);
}

function hasRepeatedValue(text: string, values: any[] = []) {
  const normalizedText = normalize(text);
  const digitText = digits(text);
  return values.some((value) => {
    const normalizedValue = normalize(value);
    const digitValue = digits(value);
    if (normalizedValue && normalizedText === normalizedValue) return true;
    if (digitValue.length >= 7 && digitText === digitValue) return true;
    return false;
  });
}

export function classifyCustomerSummaryRefreshNeed(input: {
  newMessages?: any[];
  profile?: any;
  existingSummary?: any;
  history?: any[];
}) {
  const userTexts = extractUserTexts(input.newMessages || []);
  if (userTexts.length === 0) return { needsAiSummary: false, reason: "no_new_customer_text" };

  const joined = userTexts.join(" ");
  const normalized = normalize(joined);
  const existingSummary = clean(input.existingSummary, 2500);
  const profile = input.profile || {};
  const repeatedValues = [
    profile.customerPhone,
    profile.phone,
    profile.phoneNumber,
    profile.whatsapp_number,
    profile.deliveryAddress,
    profile.address,
    profile.location,
    profile.city,
    profile.latestDeliveryAddress,
    profile.latestAddress,
  ].filter(Boolean);
  const previousTexts = extractUserTexts(input.history || []);
  const previousSeen = previousTexts
    .slice(0, -userTexts.length)
    .map(normalize)
    .filter(Boolean);

  if (userTexts.every(isVoiceTranscriptUnavailableText)) {
    return { needsAiSummary: false, reason: "voice_transcript_missing" };
  }
  if (userTexts.some(isVoiceNoteMeaningText)) {
    return { needsAiSummary: true, reason: "meaningful_voice_note" };
  }
  if (/^(ok|okay|k|g|gee|theek|thik|yes|yep|yeah|no|nope|ji|jee|haan|han|hmm|thanks|thank you|thx|done|fine|sure|alright|right|good)[.!?]*$/i.test(joined)) {
    return { needsAiSummary: false, reason: "short_confirmation" };
  }
  if (hasEmojiOnly(joined)) return { needsAiSummary: false, reason: "emoji_only" };
  if (normalized.length < 4) return { needsAiSummary: false, reason: "too_short" };
  if (previousSeen.includes(normalized)) return { needsAiSummary: false, reason: "duplicate_message" };
  if (existingSummary && hasRepeatedValue(joined, repeatedValues)) {
    return { needsAiSummary: false, reason: "repeated_known_detail" };
  }
  if (existingSummary && /^(same|same address|same number|same phone|deliver(y)? same|send (it )?there|as before)$/i.test(joined)) {
    return { needsAiSummary: false, reason: "repeated_delivery_request" };
  }
  if (existingSummary && /\b(deliver|delivery|address|phone|number|mobile)\b/i.test(joined) && normalized.length < 24) {
    return { needsAiSummary: false, reason: "short_repeated_delivery_or_contact" };
  }

  return { needsAiSummary: true, reason: "meaningful_customer_update" };
}
