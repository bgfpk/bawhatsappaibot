import { getCustomerContactIdentity, getDisplayNameFromCustomer, normalizeTrustedPhoneDigits } from "./contact-identity";

export function isStatusBroadcastJid(jid: string) {
  return String(jid || "").toLowerCase() === "status@broadcast";
}

export function isWhatsappJid(value: any) {
  return /@(s\.whatsapp\.net|lid|hosted\.lid|g\.us|broadcast)$/i.test(String(value || "").trim());
}

export function isLidJid(value: any): boolean {
  const text = String(value || "").trim().toLowerCase();
  return text.endsWith("@lid") || text.endsWith("@hosted.lid");
}

export function isPhoneJid(value: any): boolean {
  const text = String(value || "").trim().toLowerCase();
  if (!text.endsWith("@s.whatsapp.net")) return false;
  const digits = text.split("@")[0].replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function isCustomerChatJid(value: any) {
  const jid = String(value || "").toLowerCase();
  return isWhatsappJid(jid) && !jid.endsWith("@g.us") && !isStatusBroadcastJid(jid);
}

export function jidToCustomerId(jid: any) {
  return String(jid || "").split("@")[0];
}

export function normalizePhoneDigits(value: any) {
  return String(value || "").replace(/[^0-9]/g, "");
}

export function isLikelyPhoneNumber(value: any) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

export function extractPhoneDigits(value: any): string | null {
  const text = String(value || "").trim();
  if (!text || isLidJid(text) || text.endsWith("@g.us") || text.endsWith("@broadcast")) {
    return null;
  }

  // 1. Direct phone JID format: e.g. "contact-9da9d2e33299@example.invalid"
  if (text.includes("@s.whatsapp.net")) {
    let digits = text.split("@")[0].replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 11 && digits.startsWith("03")) {
      digits = `92${digits.slice(1)}`;
    } else if (digits.startsWith("3") && digits.length === 10) {
      digits = `92${digits}`;
    }
    return (digits.length >= 8 && digits.length <= 15) ? digits : null;
  }

  // 2. Discrete phone number token extraction:
  // Look for international format (+923250872796, +1-555-0199) or local phone token (03250872796, 923250872796)
  // that is NOT concatenated with surrounding letters/words (e.g. "20k" must NOT concatenate with "+194019413064")
  const phoneTokenMatches = text.match(/(?:\+[\d\s\-()]{7,18}\d|\b00[\d\s\-()]{7,18}\d|\b03[\d\s\-()]{8,14}\d|\b\d{8,15}\b)/g);
  if (phoneTokenMatches && phoneTokenMatches.length > 0) {
    for (const candidate of phoneTokenMatches) {
      let candidateDigits = candidate.replace(/\D/g, "");
      if (candidateDigits.startsWith("00")) candidateDigits = candidateDigits.slice(2);
      if (candidateDigits.startsWith("0") && candidateDigits.length === 11 && candidateDigits.startsWith("03")) {
        candidateDigits = `92${candidateDigits.slice(1)}`;
      } else if (candidateDigits.startsWith("3") && candidateDigits.length === 10) {
        candidateDigits = `92${candidateDigits}`;
      }
      if (candidateDigits.length >= 8 && candidateDigits.length <= 15) {
        return candidateDigits;
      }
    }
  }

  // 3. Fallback for pure numeric/phone strings without alphabet letters (e.g. "+92 325 0872796" or "0325 0872796")
  if (!/[a-zA-Z]/.test(text)) {
    let digits = text.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 11 && digits.startsWith("03")) {
      digits = `92${digits.slice(1)}`;
    } else if (digits.startsWith("3") && digits.length === 10) {
      digits = `92${digits}`;
    }
    if (digits.length >= 8 && digits.length <= 15) {
      return digits;
    }
  }

  return null;
}

export function normalizeWhatsAppJid(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isWhatsappJid(raw)) return raw;
  let digits = normalizePhoneDigits(raw);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (isLikelyPhoneNumber(digits)) return `${digits}@s.whatsapp.net`;
  return "";
}

export function getCanonicalCustomerKey(value: any, profile: any = {}) {
  const directJid = normalizeWhatsAppJid(value);
  const phoneJid = normalizeWhatsAppJid(profile?.phoneJid || profile?.whatsapp_number || profile?.phoneNumber || profile?.customerPhone || profile?.phone);
  if (phoneJid.endsWith("@s.whatsapp.net")) return `phone:${normalizePhoneDigits(jidToCustomerId(phoneJid))}`;
  const profilePhone = getProfilePhone(profile);
  if (profilePhone) return `phone:${profilePhone}`;
  if (directJid.endsWith("@s.whatsapp.net")) return `phone:${normalizePhoneDigits(jidToCustomerId(directJid))}`;
  return directJid ? `jid:${directJid.toLowerCase()}` : `raw:${String(value || "").trim().toLowerCase()}`;
}

export function parseCustomerProfile(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export function getProfilePhone(profile: any) {
  return normalizeTrustedPhoneDigits(profile?.whatsapp_number || profile?.phoneNumber || profile?.shippingPhone || profile?.number || profile?.phone || profile?.customerPhone, { source: "profile.phone", trusted: true });
}

export function getCustomerDisplayName(customer: any) {
  return getDisplayNameFromCustomer(customer);
}

export function resolveCustomerChatJid(customer: any) {
  const profile = parseCustomerProfile(customer?.profile);
  const directJid = normalizeWhatsAppJid(profile.jid || customer?.jid || customer?.customer_jid || customer?.chat_jid || (String(customer?.customer_id || "").includes("@") ? customer.customer_id : ""));
  if (directJid) return directJid;
  const phone = getProfilePhone(profile);
  if (phone) return `${phone}@s.whatsapp.net`;
  return normalizeWhatsAppJid(customer?.customer_id);
}

export function buildPhoneProfilePatch(phoneJid: any) {
  const phone = normalizePhoneDigits(jidToCustomerId(phoneJid));
  return phone ? { phoneNumber: phone, whatsapp_number: phone, phone } : {};
}

export function getCustomerDisplayContact(customer: any) {
  const identity = getCustomerContactIdentity(customer);
  return identity.displayPhone || identity.contactLabel || "Number unavailable";
}
