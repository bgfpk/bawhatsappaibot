import { buildPhoneProfilePatch, isCustomerChatJid, normalizePhoneDigits, normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";

export type ImportedContactIdentity = {
  phone: string;
  phoneJid: string;
  jid: string;
  lidJid: string;
  primaryJid: string;
  linkedJids: string[];
  fullName: string;
  profilePatch: Record<string, any>;
};

function cleanText(value: any) {
  return String(value || "").trim();
}

function firstPresent(...values: any[]) {
  return values.map(cleanText).find(Boolean) || "";
}

export function normalizeImportPhone(value: any) {
  let digits = normalizePhoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `92${digits.slice(1)}`;
  if (digits.startsWith("3") && digits.length === 10) digits = `92${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function normalizeCustomerJid(value: any) {
  const jid = normalizeWhatsAppJid(value);
  return isCustomerChatJid(jid) ? jid : "";
}

function normalizeLidJid(value: any) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (/@(?:lid|hosted\.lid)$/i.test(raw)) return normalizeCustomerJid(raw);
  const digits = normalizePhoneDigits(raw);
  return digits ? `${digits}@lid` : "";
}

function parseLinkedJids(value: any) {
  if (Array.isArray(value)) return value.map(normalizeCustomerJid).filter(Boolean);
  return String(value || "")
    .split(/[,\s;|]+/)
    .map(normalizeCustomerJid)
    .filter(Boolean);
}

function uniqueJids(values: any[]) {
  return Array.from(new Set(values.map(normalizeCustomerJid).filter(Boolean)));
}

export function buildImportedContactIdentity(row: any): ImportedContactIdentity | null {
  const phone = normalizeImportPhone(firstPresent(row?.phone, row?.number, row?.mobile, row?.whatsapp, row?.whatsapp_number));
  const phoneJid = phone ? `${phone}@s.whatsapp.net` : "";
  const jid = normalizeCustomerJid(firstPresent(row?.jid, row?.customerJid, row?.customer_jid, row?.whatsapp_jid));
  const lidJid = normalizeLidJid(firstPresent(row?.lidJid, row?.lid_jid, row?.lid, row?.lid_number));
  const linkedJids = uniqueJids([
    phoneJid,
    jid,
    lidJid,
    ...parseLinkedJids(firstPresent(row?.linkedJids, row?.linked_jids)),
  ]);
  const primaryJid = phoneJid || jid || lidJid || linkedJids[0] || "";
  if (!primaryJid) return null;

  const fullName = firstPresent(row?.fullName, row?.full_name, row?.name, row?.customerName, row?.customer_name);
  const city = cleanText(row?.city);
  const country = cleanText(row?.country);
  const address = cleanText(row?.address);
  const extra = row?.extra && typeof row.extra === "object" ? row.extra : {};
  const profilePatch: Record<string, any> = {
    jid: primaryJid,
    linkedJids,
    ...(phone ? { ...buildPhoneProfilePatch(phoneJid), phoneJid } : {}),
    ...(lidJid ? { lidJid } : {}),
    ...(fullName ? { name: fullName, customerName: fullName } : {}),
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    ...(address ? { address } : {}),
    ...extra,
  };

  return { phone, phoneJid, jid, lidJid, primaryJid, linkedJids, fullName, profilePatch };
}
