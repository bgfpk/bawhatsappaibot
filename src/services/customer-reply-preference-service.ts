import { upsertCustomerSummaryMetadataLine } from "./customer-summary-metadata-service.ts";

export type CustomerReplyPreference = "voice_only" | "text_only" | "";

function normalize(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VOICE_ONLY_PATTERNS = [
  /\bonly voice\b/,
  /\bvoice only\b/,
  /\balways voice\b/,
  /\bhamesha voice\b/,
  /\bvoice mein reply\b/,
  /\bvoice me reply\b/,
  /\bvoice main reply\b/,
  /\bsirf voice\b/,
  /\bsirf audio\b/,
  /\baudio only\b/,
  /\bonly audio\b/,
  /\bhamesha audio\b/,
  /\bawaz mein reply\b/,
  /\bawaaz mein reply\b/,
];

const TEXT_ONLY_PATTERNS = [
  /\bonly text\b/,
  /\btext only\b/,
  /\btext me\b/,
  /\btext me now\b/,
  /\bmessage me\b/,
  /\bmessage me now\b/,
  /\balways text\b/,
  /\bhamesha text\b/,
  /\btext mein reply\b/,
  /\btext me reply\b/,
  /\btext main reply\b/,
  /\breply in text\b/,
  /\breply by text\b/,
  /\bsend text\b/,
  /\btype it\b/,
  /\btype reply\b/,
  /\bno voice\b/,
  /\bdon t send voice\b/,
  /\bdont send voice\b/,
  /\bno audio\b/,
  /\bsirf text\b/,
  /\bsirf message\b/,
  /\bmessage only\b/,
  /\btyping mein reply\b/,
];

export function detectCustomerReplyPreference(text: any): CustomerReplyPreference {
  const value = normalize(text);
  if (!value) return "";
  if (TEXT_ONLY_PATTERNS.some((pattern) => pattern.test(value))) return "text_only";
  if (VOICE_ONLY_PATTERNS.some((pattern) => pattern.test(value))) return "voice_only";
  return "";
}

export function getSavedCustomerReplyPreference(profile: any = {}): CustomerReplyPreference {
  const value = String(profile?.customerReplyPreference || profile?.replyPreference || "").trim();
  return value === "voice_only" || value === "text_only" ? value : "";
}

export function buildCustomerReplyPreferencePatch(
  preference: CustomerReplyPreference,
  existingSummary = "",
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!preference) return null;
  const label = preference === "voice_only" ? "voice only" : "text only";
  return {
    customerReplyPreference: preference,
    customerReplyPreferenceUpdatedAt: nowSeconds,
    chatSummary: upsertCustomerSummaryMetadataLine(existingSummary, "Reply preference", label),
  };
}

export function resolveEffectiveReplyBehavior(instanceBehavior: any, profile: any = {}) {
  const behavior = String(instanceBehavior || "text_preferred").trim() || "text_preferred";
  if (behavior === "voice_only" || behavior === "text_only" || behavior === "text_preferred") return behavior;
  const savedPreference = getSavedCustomerReplyPreference(profile);
  if (savedPreference) return savedPreference;
  return behavior;
}
