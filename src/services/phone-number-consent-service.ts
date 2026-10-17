import {
  buildPhoneProfilePatch,
  getProfilePhone,
  jidToCustomerId,
  normalizeWhatsAppJid,
  normalizePhoneDigits,
  parseCustomerProfile,
  resolveCustomerChatJid,
} from "../utils/whatsapp-jid.ts";
import { unwrapMessageContent } from "./whatsapp-message-content.ts";

const SHARE_PHONE_NUMBER_PROTOCOL_TYPE = 11;
export const PHONE_NUMBER_REQUEST_COOLDOWN_SECONDS = 24 * 60 * 60;
export const PHONE_NUMBER_SHARE_WINDOW_SECONDS = 7 * 24 * 60 * 60;
export const PHONE_NUMBER_REQUEST_TEXT = "Your phone number is hidden by privacy settings. Please share your WhatsApp number so we can send call-backs, delivery updates, and important account messages. Please also confirm your name for delivery.";
export const PHONE_NUMBER_MANUAL_REQUEST_TEXT = PHONE_NUMBER_REQUEST_TEXT;

function getConsentPhone(profile: any) {
  const raw = profile?.whatsapp_number ||
    profile?.phoneNumber ||
    profile?.shippingPhone ||
    profile?.number ||
    profile?.phone ||
    profile?.customerPhone ||
    profile?.phoneJid ||
    (Array.isArray(profile?.linkedJids) ? profile.linkedJids.find((jid: any) => String(jid || "").endsWith("@s.whatsapp.net")) : "");
  const digits = normalizePhoneDigits(raw);
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function toWhatsAppPhoneDigits(value: any) {
  let digits = normalizePhoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

export function hasVerifiedPhoneNumber(profile: any) {
  return Boolean(getConsentPhone(profile) && (profile?.phoneConsentAt || profile?.phoneNumberVerifiedAt || profile?.phoneNumberVerified === true));
}

export function hasKnownPhoneNumber(profile: any) {
  return Boolean(getConsentPhone(profile) || getProfilePhone(profile));
}

export function isLidOnlyCustomer(jid: string, profile: any = {}) {
  const lower = String(jid || "").toLowerCase();
  return (lower.endsWith("@lid") || lower.endsWith("@hosted.lid")) && !hasKnownPhoneNumber(profile);
}

export function shouldRequestPhoneNumber(profile: any = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (hasKnownPhoneNumber(profile)) return false;
  const lastRequest = Number(profile?.phoneNumberRequestedAt || 0);
  return !lastRequest || (nowSeconds - lastRequest) >= PHONE_NUMBER_REQUEST_COOLDOWN_SECONDS;
}

export function buildPhoneNumberRequestPatch(profile: any = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    phoneNumberRequestedAt: nowSeconds,
    phoneNumberRequestCount: Number(profile?.phoneNumberRequestCount || 0) + 1,
    phoneNumberRequestReason: "delivery_updates_and_offers",
  };
}

export function buildPhoneConsentPatch(phone: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  const digits = toWhatsAppPhoneDigits(phone);
  const phonePatch = digits ? {
    ...buildPhoneProfilePatch(digits),
    phoneNumber: digits,
    whatsapp_number: digits,
    phone: digits,
    phoneJid: `${digits}@s.whatsapp.net`,
  } : {};
  return {
    ...phonePatch,
    phoneConsent: Boolean(digits),
    phoneConsentAt: nowSeconds,
    phoneNumberVerified: Boolean(digits),
    phoneNumberVerifiedAt: nowSeconds,
    phoneNumberSource: "native_whatsapp_share",
  };
}

function extractPhoneFromVcard(vcard = "") {
  const waid = vcard.match(/waid=(\d{8,15})/i)?.[1];
  if (waid) return waid;
  const tel = vcard.match(/TEL[^:\n]*:([+\d][^\n]*)/i)?.[1];
  return normalizePhoneDigits(tel);
}

function extractPhoneFromPhoneJid(jid = "") {
  return jid.endsWith("@s.whatsapp.net") ? normalizePhoneDigits(jidToCustomerId(jid)) : "";
}

export function extractPhoneNumberFromText(text = "") {
  const match = String(text || "").match(/(?:\+|00)?\d[\d\s().-]{8,18}\d/);
  if (!match) return "";
  const digits = normalizePhoneDigits(match[0]);
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

export function extractSharedPhoneNumber(msg: any) {
  const content = unwrapMessageContent(msg?.message);

  if (isNativePhoneNumberShareMessage(msg)) {
    return extractPhoneFromPhoneJid(msg?.key?.remoteJidAlt || "") ||
      extractPhoneFromPhoneJid(msg?.key?.remoteJid || "");
  }

  const contactPhone = extractPhoneFromVcard(content?.contactMessage?.vcard || "");
  if (contactPhone) return contactPhone;

  const contacts = content?.contactsArrayMessage?.contacts || [];
  for (const contact of contacts) {
    const phone = extractPhoneFromVcard(contact?.vcard || "");
    if (phone) return phone;
  }

  return "";
}

export function isNativePhoneNumberShareMessage(msg: any) {
  const content = unwrapMessageContent(msg?.message);
  return content?.protocolMessage?.type === SHARE_PHONE_NUMBER_PROTOCOL_TYPE;
}

export function isPhoneNumberShareMessage(msg: any) {
  return Boolean(extractSharedPhoneNumber(msg));
}

export function resolveMarketingChatJid(customer: any) {
  const profile = parseCustomerProfile(customer?.profile);
  const phone = hasVerifiedPhoneNumber(profile) ? toWhatsAppPhoneDigits(getConsentPhone(profile) || getProfilePhone(profile)) : "";
  if (phone) {
    return `${phone}@s.whatsapp.net`;
  }
  const storedChatJid = normalizeWhatsAppJid(
    profile.jid ||
    customer?.jid ||
    customer?.customer_jid ||
    customer?.chat_jid ||
    customer?.customer_id
  );
  return storedChatJid || resolveCustomerChatJid(customer);
}
