import { upsertCustomerSummaryMetadataLine } from "./customer-summary-metadata-service.ts";

export type CustomerReplyLanguage = string;

const URDU_SCRIPT_RE = /[\u0600-\u06ff]/;
const ROMAN_URDU_HINTS = new Set([
  "aap",
  "ap",
  "hai",
  "hain",
  "kya",
  "chahiye",
  "karna",
  "krna",
  "mujhe",
  "muje",
  "mjy",
  "bhej",
  "bhejna",
  "kitna",
  "salam",
  "assalam",
  "ji",
  "nahi",
  "nahin",
  "kesy",
  "kaise",
  "urdu",
]);

function clean(value: any) {
  return String(value || "").trim();
}

function normalizePreferredLanguage(value: any): CustomerReplyLanguage {
  const preferred = clean(value).toLowerCase();
  if (!preferred) return "english";
  if (preferred==='urdu'||preferred==='ur'||preferred.includes("urdu script") || preferred.includes("urdu text")) return "urdu";
  if (preferred.includes("urdu")) return "roman_urdu";
  return preferred.replace(/[^a-z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim() || "english";
}

export function detectExplicitLanguageRequest(value: any): CustomerReplyLanguage | null {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if (/(?:reply|speak|talk|respond|answer|jawab|baat).{0,25}english|english\s+(?:please|mein|me)|انگریزی\s*میں/i.test(text)) return 'english';
  if (/roman\s+urdu|urdu\s+(mein|me|main)\s+roman|roman\s+me/i.test(text)) return "roman_urdu";
  if (/urdu\s+script|urdu\s+text|اردو\s*میں/i.test(text)) return 'urdu';
  if (/(please\s+)?(talk|speak|reply|baat|bat)\s+(in\s+)?urdu|urdu\s+(me|mein|main)\s+(baat|bat|reply|jawab|bolo|bolen|karein|karen)|urdu\s+please|talk\s+urdu/i.test(text)) return "roman_urdu";
  if (/urdu\s+script|urdu\s+text/i.test(text)) return "urdu";
  return null;
}

export function detectCustomerActualLanguage(value: any): CustomerReplyLanguage | null {
  const text = clean(value);
  if (!text || /^\[(voice|audio|image|media|unreadable)/i.test(text)) return null;
  const explicit = detectExplicitLanguageRequest(text);
  if (explicit) return explicit;
  if (URDU_SCRIPT_RE.test(text)) return "urdu";

  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return null;
  const hintCount = words.filter((word) => ROMAN_URDU_HINTS.has(word)).length;
  if (hintCount >= 2) return "roman_urdu";
  return "english";
}

function upsertLanguageSummary(summary: any, language: CustomerReplyLanguage, source: string) {
  return upsertCustomerSummaryMetadataLine(summary, "Language preference", `${language} (${source})`);
}

export function resolveCustomerReplyLanguage(input: {
  profile?: any;
  preferredLanguage?: any;
  latestText?: any;
}) {
  const profile = input.profile || {};
  const preferred = normalizePreferredLanguage(input.preferredLanguage);
  const stored = normalizePreferredLanguage(profile.customerLanguagePreference);
  const current: CustomerReplyLanguage = clean(profile.customerLanguagePreference) ? stored : preferred;
  const explicitRequest = detectExplicitLanguageRequest(input.latestText);
  const actual = explicitRequest || detectCustomerActualLanguage(input.latestText);

  let nextLanguage = current;
  let mismatchCount = 0;
  let source = stored ? "saved from customer messages" : "instance setting";

  if (explicitRequest) {
    nextLanguage = explicitRequest;
    mismatchCount = 0;
    source = "explicit customer request";
  } else if (actual) {
    const lastActual = clean(profile.lastDetectedCustomerLanguage);
    const previousMismatch = Number(profile.customerLanguageMismatchCount || 0) || 0;
    mismatchCount = actual !== current
      ? (lastActual === actual ? previousMismatch + 1 : 1)
      : 0;

    if (actual !== current && mismatchCount >= 2) {
      nextLanguage = actual;
      mismatchCount = 0;
      source = "adapted from repeated customer messages";
    }
  }

  const patch: any = {
    preferredLanguageSetting: preferred,
    preferredLanguage: preferred,
    effectiveReplyLanguage: nextLanguage,
    lastDetectedCustomerLanguage: actual || profile.lastDetectedCustomerLanguage || "",
    detectedLanguage: actual || profile.detectedLanguage || "",
    customerLanguageMismatchCount: mismatchCount,
    customerLanguagePreference: nextLanguage,
    languagePreference: nextLanguage,
    languagePreferenceUpdatedAt: Math.floor(Date.now() / 1000),
  };
  const nextSummary = upsertLanguageSummary(profile.chatSummary, nextLanguage, source);
  if (nextSummary && nextSummary !== clean(profile.chatSummary)) {
    patch.chatSummary = nextSummary;
  }

  return {
    language: nextLanguage,
    actualLanguage: actual,
    preferredLanguage: preferred,
    changed: nextLanguage !== current,
    patch,
  };
}
