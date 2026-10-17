// src/services/whatsapp-cloud-api-recipient.ts
//
// Pure recipient normalizer for WhatsApp Cloud API.
//
// Converts internal BlackArrow customer identifiers (e.g. contact-e4ed32210a80@example.invalid,
// +923001234567, 923001234567) into the normalized digit-only phone number expected
// by Meta's "to" field (E.164 without leading plus).
//
// Rejects:
//   - WhatsApp Web Group JIDs (@g.us)
//   - Broadcast JIDs (@broadcast)
//   - Empty, non-phone, or malformed values

export type CloudApiRecipientResult =
  | { ok: true; to: string; reason?: undefined }
  | { ok: false; reason: string; to?: undefined };

/**
 * Normalizes an internal BlackArrow customer identifier or phone number
 * into the required Meta Cloud API recipient format.
 */
export function normalizeCloudApiRecipient(jidOrPhone: unknown): CloudApiRecipientResult {
  const raw = String(jidOrPhone ?? "").trim();
  if (!raw) {
    return { ok: false, reason: "empty_recipient" };
  }

  // Reject group JIDs explicitly
  if (raw.endsWith("@g.us") || raw.includes("@g.us")) {
    return { ok: false, reason: "group_jid_not_supported_on_cloud_api" };
  }

  // Reject broadcast JIDs
  if (raw.endsWith("@broadcast") || raw.includes("@broadcast")) {
    return { ok: false, reason: "broadcast_jid_not_supported_on_cloud_api" };
  }

  // Strip standard individual WhatsApp JID suffix if present
  let clean = raw;
  if (clean.includes("@")) {
    const parts = clean.split("@");
    if (parts[1] && parts[1].toLowerCase() !== "s.whatsapp.net" && parts[1].toLowerCase() !== "c.us") {
      return { ok: false, reason: `unsupported_jid_domain_${parts[1]}` };
    }
    clean = parts[0];
  }

  // Strip leading +, spaces, dashes, parentheses
  clean = clean.replace(/[\s\-()]/g, "");
  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  // Strip any leading 00 international prefix if present (e.g. 0092300...)
  if (clean.startsWith("00") && clean.length > 10) {
    clean = clean.slice(2);
  }

  // Verify only digits remain
  if (!/^\d+$/.test(clean)) {
    return { ok: false, reason: "malformed_recipient_non_digits" };
  }

  // E.164 length check: valid phone numbers are generally between 7 and 15 digits
  if (clean.length < 7 || clean.length > 15) {
    return { ok: false, reason: `invalid_recipient_length_${clean.length}` };
  }

  return { ok: true, to: clean };
}
