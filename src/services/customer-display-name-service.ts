import { getProfilePhone, isLikelyPhoneNumber, jidToCustomerId, normalizePhoneDigits } from "../utils/whatsapp-jid.ts";
import { isLidJid, extractPhoneDigits } from "./whatsapp-contact-identity-resolver.ts";

function clean(value: any) {
  return String(value || "").trim();
}

export function isUsableCustomerName(value: string): boolean {
  const text = clean(value);
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (["whatsapp contact", "unknown", "unknown customer", "no phone linked", "n/a", "na", "null", "undefined", "customer"].includes(lowered)) {
    return false;
  }
  if (/@(?:s\.whatsapp\.net|lid|hosted\.lid|g\.us|broadcast)$/i.test(text)) {
    return false;
  }
  if (isLidJid(text)) {
    return false;
  }
  // If it's a generic placeholder like "Customer 4073" or "Customer ••••4073"
  if (/^Customer\s+(?:••••|\d{3,})/i.test(text)) {
    return false;
  }
  // If purely numeric or phone-like digits
  const stripped = text.replace(/[^0-9]/g, "");
  if (stripped.length >= 8 && /^[+\d\s().-]+$/.test(text)) {
    return false;
  }
  // Must contain at least one letter
  if (!/[\p{L}]/u.test(text)) {
    return false;
  }
  return true;
}

export function getExplicitSavedCustomerName(profile: any, fallbackName?: string): string {
  const candidates = [
    fallbackName,
    profile?.savedName,
    profile?.customerName,
    profile?.name,
  ];
  return candidates.map(clean).find(isUsableCustomerName) || "";
}

export function getWhatsAppDisplayName(profile: any, pushName?: string): string {
  const candidates = [
    pushName,
    profile?.verifiedName,
    profile?.businessName,
    profile?.pushName,
    profile?.notify,
    profile?.notifyName,
    profile?.whatsappName,
    profile?.displayName,
  ];
  return candidates.map(clean).find(isUsableCustomerName) || "";
}

export function formatCustomerFallback(seed?: any): string {
  const text = clean(seed);
  const digits = extractPhoneDigits(text) || normalizePhoneDigits(text);
  const rawIdDigits = text.split("@")[0].replace(/\D/g, "");
  const numDigits = digits || rawIdDigits;
  if (numDigits && numDigits.length >= 4) {
    return `Customer ••••${numDigits.slice(-4)}`;
  }
  const cleanId = jidToCustomerId(text).replace(/[^a-zA-Z0-9]/g, "");
  if (cleanId.length >= 4) {
    return `Customer ••••${cleanId.slice(-4)}`;
  }
  return "Customer";
}

/**
 * Customer Display Name Priority:
 * 1. Explicit/original saved customer name
 * 2. WhatsApp display name (pushName, notify, verifiedName)
 * 3. Existing valid saved display name
 * 4. Fallback: Customer ••••1234
 *
 * CRITICAL: NEVER overwrite an explicit saved customer name with pushName!
 */
export function buildCustomerDisplayName(input: {
  jid?: string;
  customer_id?: string;
  profile?: any;
  pushName?: string;
  fallback?: string;
  phone?: string;
}): string {
  const profile = input.profile || {};

  // 1. Explicit saved customer name
  const savedName = getExplicitSavedCustomerName(profile, input.fallback);
  if (savedName) return savedName;

  // 2. WhatsApp display name (pushName, notify, etc.)
  const waName = getWhatsAppDisplayName(profile, input.pushName);
  if (waName) return waName;

  // 3. Fallback to formatted Customer ••••1234
  const phone = extractPhoneDigits(input.phone || profile?.phoneJid || profile?.phoneNumber || profile?.whatsapp_number || input.jid || input.customer_id);
  if (phone) {
    return formatCustomerFallback(phone);
  }

  return formatCustomerFallback(input.jid || input.customer_id || profile?.customer_id || profile?.jid || profile?.lidJid);
}

export function getProfileDisplayName(profile: any): string {
  const savedName = getExplicitSavedCustomerName(profile);
  if (savedName) return savedName;
  const waName = getWhatsAppDisplayName(profile);
  if (waName) return waName;
  return "";
}
