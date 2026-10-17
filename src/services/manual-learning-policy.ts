import { MANUAL_LEARNING_COOLDOWN_SECONDS, compactAiText } from "./ai-cost-control-service.ts";

const IMPORTANT_TERMS = [
  "remember",
  "always",
  "never",
  "policy",
  "rule",
  "price",
  "rate",
  "delivery",
  "shipping",
  "stock",
  "order",
  "refund",
  "return",
  "warranty",
  "address",
  "payment",
  "discount",
  "offer",
  "learn",
  "note",
  "manual",
  "customer",
  "issue",
  "problem",
  "complaint",
  "غلط",
  "یاد",
  "قیمت",
  "آرڈر",
  "ڈیلیوری",
  "واپس",
];
const STRONG_REUSABLE_TERMS = [
  "remember",
  "always",
  "never",
  "policy",
  "rule",
  "learn",
  "note",
  "warranty",
  "refund",
  "return",
  "do not",
  "don't",
  "must",
  "only",
];

const LOW_VALUE_REPLIES = new Set([
  "ok",
  "okay",
  "yes",
  "no",
  "thanks",
  "thank you",
  "done",
  "sent",
  "g",
  "ji",
  "jee",
  "han",
  "haan",
  "theek",
  "👍",
]);

function normalize(value: any) {
  return compactAiText(value, 2000).toLowerCase();
}

function hasReusableTrainingShape(text: string) {
  if (!text) return false;
  if (LOW_VALUE_REPLIES.has(text)) return false;
  if (/^(price|rate|cost|send|sent|done|yes|no|ok|okay|thanks|thank you)[.!?]*$/i.test(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 6) return false;
  if (STRONG_REUSABLE_TERMS.some(term => text.includes(term))) return true;
  if (wordCount >= 18 && IMPORTANT_TERMS.some(term => text.includes(term))) return true;
  return wordCount >= 28;
}

export function shouldAnalyzeManualReply(input: {
  text: string;
  kind: string;
  profile?: any;
  nowSeconds?: number;
}) {
  const text = normalize(input.text);
  if (!text) return false;
  if (input.kind !== "text") return hasReusableTrainingShape(text);
  if (LOW_VALUE_REPLIES.has(text)) return false;

  const nowSeconds = input.nowSeconds || Math.floor(Date.now() / 1000);
  const lastAnalyzedAt = Number(input.profile?.manualLearningAnalyzedAt || 0);
  if (lastAnalyzedAt && nowSeconds - lastAnalyzedAt < MANUAL_LEARNING_COOLDOWN_SECONDS) return false;

  return hasReusableTrainingShape(text);
}
