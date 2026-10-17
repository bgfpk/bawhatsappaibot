export type GeminiHistoryRole = "user" | "model";

const INTERNAL_HISTORY_PATTERNS = [
  /^\[(?:image|video|voice|audio|document|sticker)\s+sequence\s+template\s+sent\]$/i,
  /\bsequence\s+template\s+sent\b/i,
  /\bwelcome\s+sequence\s+template\s+sent\b/i,
];

export function normalizeGeminiHistoryRole(role: any): GeminiHistoryRole | "" {
  const value = String(role || "").toLowerCase();
  if (value === "user") return "user";
  if (value === "model" || value === "assistant") return "model";
  return "";
}

export function isInternalHistoryText(text: any) {
  const value = String(text || "").trim();
  return value ? INTERNAL_HISTORY_PATTERNS.some((pattern) => pattern.test(value)) : false;
}

export function toVisibleChatHistoryMessage(message: any) {
  const role = normalizeGeminiHistoryRole(message?.role);
  const text = String(message?.text || "").trim();
  if (!role || !text || isInternalHistoryText(text)) return null;
  return {
    messageId: message?.message_id || message?.messageId,
    role,
    text,
    timestamp: message?.timestamp,
    // Expose senderName so the inbox identity resolver can pick up pushName from inbound messages
    senderName: message?.sender_name || message?.senderName || undefined,
  };
}

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}\s?]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function classifyQuotedQuestionField(quotedText: any) {
  const text = normalize(quotedText);
  if (!text) return "";
  if (/\b(name|full name|naam|apna naam|customer name)\b/.test(text)) return "name";
  if (/\b(color|colour|option|variation|variant|size|rang)\b/.test(text)) return "option";
  if (/\b(address|delivery address|street|house|area|landmark|pata|addr)\b/.test(text)) return "address";
  if (/\b(city|location|shehar|shahar)\b/.test(text)) return "city";
  if (/\b(payment|cod|cash|advance|transfer|pay)\b/.test(text)) return "payment";
  if (/\b(confirm|confirmation|final|proceed|order|book|done|ok|theek)\b|\?$/.test(text)) return "confirmation";
  return "";
}

export function isShortConfirmationAnswer(value: any) {
  const text = normalize(value);
  return /^(ok|okay|yes|y|ji|g|gg|ggg|gggg|han|haan|theek|thik|done|confirm|confirmed)$/.test(text);
}

export function extractQuotedReplyContext(value: any) {
  const text = clean(value);
  const match = text.match(/^\[Replying to:\s*"([\s\S]*?)"\]\s*\n+([\s\S]+)$/i);
  if (!match) {
    return {
      originalText: text,
      customerAnswer: text,
      quotedText: "",
      quotedField: "",
      isShortAnswer: false,
      isConfirmation: isShortConfirmationAnswer(text),
    };
  }

  const quotedText = clean(match[1]);
  const customerAnswer = clean(match[2]);
  const answerWords = customerAnswer.split(/\s+/).filter(Boolean).length;
  const isShortAnswer = Boolean(customerAnswer && answerWords <= 24);
  const quotedField = classifyQuotedQuestionField(quotedText);
  return {
    originalText: text,
    customerAnswer: customerAnswer || text,
    quotedText,
    quotedField,
    isShortAnswer,
    isConfirmation: isShortConfirmationAnswer(customerAnswer) && (!quotedField || quotedField === "confirmation"),
  };
}

export function extractCustomerAnswerFromQuotedMessage(value: any) {
  const context = extractQuotedReplyContext(value);
  return context.isShortAnswer ? context.customerAnswer : context.originalText;
}
