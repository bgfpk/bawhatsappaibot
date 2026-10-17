import { sanitizeCustomerFacingReply } from "./reply-style-service.ts";
import { replaceBannedGenericFallback } from "./outbound-fallback-guard-service.ts";

const INTERNAL_STATUS_PATTERNS = [
  /\[\s*(image|video|voice|audio|document|sticker)\s+sequence\s+template\s+sent\s*\]/gi,
  /\[\s*sequence\s+template\s+sent\s*\]/gi,
  /\[\s*welcome\s+sequence\s+template\s+sent\s*\]/gi,
  /\bsequence\s+['"][^'"]+['"]\s+template\s+sent\b/gi,
  /\bwelcome\s+sequence\s+template\s+sent\b/gi,
  /\b(tool|template|sequence)\s+status\s*[:：-].*$/gim,
  /\b(debug|internal|hidden)\s+(text|note|status|instruction)\b.*$/gim,
];

function clean(value: any) {
  return String(value || "").trim();
}

function stripInternalStatusText(value: string) {
  let next = value;
  for (const pattern of INTERNAL_STATUS_PATTERNS) {
    next = next.replace(pattern, "");
  }
  return next
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeOutgoingWhatsAppText(text: any) {
  const stripped = stripInternalStatusText(clean(text));
  if (!stripped) return "";
  return sanitizeCustomerFacingReply(replaceBannedGenericFallback(stripped, "", stripped));
}

export function prepareOutgoingWhatsAppText(text: any) {
  const originalText = clean(text);
  const sanitizedText = sanitizeOutgoingWhatsAppText(originalText);
  if (sanitizedText) {
    return {
      text: sanitizedText,
      strippedUnsafeText: sanitizedText !== originalText,
      usedFallback: false,
    };
  }

  if (!originalText) {
    return {
      text: "",
      strippedUnsafeText: false,
      usedFallback: false,
    };
  }

  return {
    text: "",
    strippedUnsafeText: true,
    usedFallback: false,
  };
}
