import { containsBadListFormatting, isProbablyIncompleteCustomerReply, sanitizeCustomerFacingReply } from "./reply-style-service.ts";

export type CustomerFacingValidationResult = {
  ok: boolean;
  text: string;
  reason?: string;
};

const BROKEN_CUSTOMER_REPLY_PATTERNS = [
  /\balready saved\b/i,
  /\bsaved hai\b/i,
  /\/time\b/i,
  /\/date\b/i,
  /\/field\b/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bNaN\b/i,
  /\[object Object\]/i,
  /\bcustom field\b/i,
  /\binternal\b/i,
  /\btool\b/i,
  /\bCRM says\b/i,
  /\brecord says\b/i,
  /\bsource:\b/i,
  /\bappointment \/time\b/i,
  /\bfee Rs already saved\b/i,
  /\bRs already saved\b/i,
  /\bko s Mon-Sat\b/i,
  /\bforwarded this to the team\b/i,
  /^(?:this\s+)?needs confirmation from the team\.?$/i,
  /\bforwarded this to the admin\b/i,
  /^(?:yeh\s+)?team se confirmation\.?$/i,
];

export function containsBrokenCustomerFacingText(text: any) {
  const value = String(text || "").trim();
  if (!value) return false;
  return BROKEN_CUSTOMER_REPLY_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsBadCustomerFacingListFormatting(text: any) {
  return containsBadListFormatting(text);
}

export function validateCompleteCustomerFacingText(text: any): CustomerFacingValidationResult {
  const cleaned = sanitizeCustomerFacingReply(text);
  if (!cleaned) {
    return { ok: false, text: "", reason: "empty_output" };
  }
  if (containsBrokenCustomerFacingText(cleaned)) {
    return { ok: false, text: cleaned, reason: "internal_or_broken_text" };
  }
  if (isProbablyIncompleteCustomerReply(cleaned)) {
    return { ok: false, text: cleaned, reason: "incomplete_output" };
  }
  return { ok: true, text: cleaned };
}

export function assertCompleteCustomerFacingText(text: any, code = "incomplete_output") {
  const result = validateCompleteCustomerFacingText(text);
  if (!result.ok) {
    const error: any = new Error(result.reason || code);
    error.code = code;
    error.reason = result.reason || code;
    error.safeText = result.text;
    throw error;
  }
  return result.text;
}
