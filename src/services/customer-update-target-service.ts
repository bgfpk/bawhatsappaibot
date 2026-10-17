import {
  getCustomerDisplayContact,
  getCustomerDisplayName,
  normalizePhoneDigits,
  normalizeWhatsAppJid,
  parseCustomerProfile,
  resolveCustomerChatJid,
} from "../utils/whatsapp-jid.ts";

export type CustomerUpdateTargetResolution = {
  customer: any | null;
  customerJid: string;
  isCustomTarget: boolean;
};

function normalizeLabel(value: any) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getContactKeys(customer: any) {
  const keys = new Set<string>();
  const add = (value: any) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const jid = normalizeWhatsAppJid(raw);
    if (jid) {
      keys.add(jid.toLowerCase());
      keys.add(jid.split("@")[0].toLowerCase());
    }
    const digits = normalizePhoneDigits(raw);
    if (digits) keys.add(digits);
  };

  const profile = parseCustomerProfile(customer?.profile);
  add(customer?.customer_id);
  add(customer?.jid);
  add(customer?.customer_jid);
  add(customer?.chat_jid);
  add(resolveCustomerChatJid(customer));
  add(profile?.jid);
  add(profile?.lidJid);
  add(profile?.phoneJid);
  add(profile?.whatsapp_number);
  add(profile?.phoneNumber);
  add(profile?.phone);
  add(profile?.customerPhone);
  return keys;
}

function getLabelKeys(customer: any) {
  const keys = new Set<string>();
  const name = getCustomerDisplayName(customer);
  const contact = getCustomerDisplayContact(customer);
  const profile = parseCustomerProfile(customer?.profile);
  [
    name,
    contact && contact !== name ? `${name} - ${contact}` : name,
    profile?.name,
    profile?.notify,
    profile?.verifiedName,
    profile?.pushName,
    profile?.customerName,
  ].forEach((value) => {
    const key = normalizeLabel(value);
    if (key) keys.add(key);
  });
  return keys;
}

function isDirectContactInput(raw: string, normalizedJid: string) {
  if (!normalizedJid) return false;
  if (raw.includes("@")) return true;
  const digits = normalizePhoneDigits(raw);
  return digits.length >= 8;
}

export function resolveCustomerUpdateTarget(customers: any[], target: any): CustomerUpdateTargetResolution | null {
  const raw = String(target || "").trim();
  if (!raw) return null;

  const normalizedJid = normalizeWhatsAppJid(raw);
  const directContactInput = isDirectContactInput(raw, normalizedJid);
  const normalizedDigits = normalizedJid ? normalizedJid.split("@")[0].toLowerCase() : normalizePhoneDigits(raw);

  if (directContactInput) {
    const matched = customers.find((customer) => {
      const keys = getContactKeys(customer);
      return keys.has(normalizedJid.toLowerCase()) || keys.has(normalizedDigits);
    });
    return {
      customer: matched || null,
      customerJid: matched ? resolveCustomerChatJid(matched) : normalizedJid,
      isCustomTarget: !matched,
    };
  }

  const targetLabel = normalizeLabel(raw);
  const matchedByLabel = customers.find((customer) => getLabelKeys(customer).has(targetLabel));
  if (!matchedByLabel) return null;

  const customerJid = resolveCustomerChatJid(matchedByLabel);
  return customerJid
    ? { customer: matchedByLabel, customerJid, isCustomTarget: false }
    : null;
}
