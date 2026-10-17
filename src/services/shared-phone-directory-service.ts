import * as dbService from "./db-service.ts";
import { Query } from "node-appwrite";
import { buildImportedContactIdentity } from "./contact-import-utils.ts";
import {
  buildPhoneProfilePatch,
  getProfilePhone,
  isCustomerChatJid,
  normalizePhoneDigits,
  normalizeWhatsAppJid,
  parseCustomerProfile,
} from "../utils/whatsapp-jid.ts";

export const SHARED_PHONE_DIRECTORY_OWNER = "contact-caeab6b12bbd@example.invalid";

function toWhatsAppPhoneDigits(value: any) {
  let digits = normalizePhoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `92${digits.slice(1)}`;
  if (digits.startsWith("3") && digits.length === 10) digits = `92${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function uniqueJids(values: any[]) {
  return Array.from(new Set(values.map(normalizeWhatsAppJid).filter(isCustomerChatJid)));
}

function phonePatch(phone: string, source: string, nowSeconds: number) {
  const phoneJid = `${phone}@s.whatsapp.net`;
  return {
    ...buildPhoneProfilePatch(phoneJid),
    phoneNumber: phone,
    whatsapp_number: phone,
    phone,
    phoneJid,
    phoneNumberVerified: true,
    phoneNumberVerifiedAt: nowSeconds,
    phoneNumberSource: source,
  };
}

export async function publishSharedPhoneIdentity(input: {
  jid: string;
  phone?: string;
  profilePatch?: any;
  source?: string;
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const primaryJid = normalizeWhatsAppJid(input.jid || input.profilePatch?.jid);
  const phone = toWhatsAppPhoneDigits(input.phone || getProfilePhone(input.profilePatch || {}) || input.profilePatch?.phoneJid);
  if (!primaryJid || !phone) return { published: false };

  const phoneJid = `${phone}@s.whatsapp.net`;
  const linkedJids = uniqueJids([
    primaryJid,
    ...(Array.isArray(input.profilePatch?.linkedJids) ? input.profilePatch.linkedJids : []),
    input.profilePatch?.lidJid,
    input.profilePatch?.phoneJid,
    phoneJid,
  ]);
  const lidJid = linkedJids.find((jid) => jid.endsWith("@lid") || jid.endsWith("@hosted.lid")) || "";
  const source = input.source || "shared_customer_directory";
  const displayName = String(input.profilePatch?.name || input.profilePatch?.customerName || "").trim();
  const basePatch = {
    ...phonePatch(phone, source, nowSeconds),
    linkedJids,
    ...(lidJid ? { lidJid } : {}),
    ...(displayName ? { name: displayName, customerName: displayName } : {}),
    sharedPhoneDirectoryUpdatedAt: nowSeconds,
    sharedPhoneDirectorySource: source,
    sharedPhoneDirectorySourceJid: primaryJid,
  };

  for (const jid of linkedJids) {
    await dbService.updateCustomerProfile(SHARED_PHONE_DIRECTORY_OWNER, jid, {
      ...basePatch,
      jid,
    }).catch(() => {});
  }

  return { published: true, phone, phoneJid, linkedJids };
}

function csvEscape(value: any) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDate(value: any) {
  const num = Number(value);
  if (!num) return "";
  return new Date(num * 1000).toISOString();
}

function cleanName(value: any) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.toLowerCase() === "whatsapp contact" || text.toLowerCase() === "unknown") return "";
  if (/@(?:s\.whatsapp\.net|lid|hosted\.lid)$/i.test(text)) return "";
  if (/^\d{8,}$/.test(text.replace(/[^0-9]/g, ""))) return "";
  if (!/[\p{L}\p{N}]/u.test(text)) return "";
  return text;
}

function getSharedDirectoryName(profile: any) {
  return [
    profile.name,
    profile.pushName,
    profile.notify,
    profile.verifiedName,
    profile.whatsappName,
    profile.customerName,
    profile.deliveryName,
    profile.recipientName,
    profile.orderCustomerName,
    profile.importedName,
  ].map(cleanName).find(Boolean) || "";
}

function normalizeSharedDirectoryDoc(doc: any) {
  const profile = parseCustomerProfile(doc?.profile);
  const lookupJid = normalizeWhatsAppJid(profile.jid || doc?.customer_id);
  const phone = toWhatsAppPhoneDigits(getProfilePhone(profile));
  const linkedJids = uniqueJids([lookupJid, profile.phoneJid, profile.lidJid, ...(profile.linkedJids || [])]);
  return {
    id: doc?.$id || doc?.id || "",
    lookupJid,
    phone,
    phoneJid: phone ? `${phone}@s.whatsapp.net` : (profile.phoneJid || ""),
    lidJid: profile.lidJid || linkedJids.find((jid) => jid.endsWith("@lid") || jid.endsWith("@hosted.lid")) || "",
    name: getSharedDirectoryName(profile),
    linkedJids,
    source: profile.sharedPhoneDirectorySource || profile.phoneNumberSource || "",
    updatedAt: Number(profile.sharedPhoneDirectoryUpdatedAt || doc?.last_message_at || doc?.updated_at || 0),
  };
}

export async function listSharedPhoneDirectory(options: { query?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 1000), 1), 5000);
  const response = await dbService.databases.listDocuments(dbService.DATABASE_ID, dbService.COLLECTIONS.CUSTOMERS, [
    Query.equal("bot_id", SHARED_PHONE_DIRECTORY_OWNER),
    Query.orderDesc("last_message_at"),
    Query.limit(limit),
  ]).catch(() => ({ documents: [] } as any));

  const grouped = new Map<string, any>();
  for (const doc of response.documents as any[]) {
    const entry = normalizeSharedDirectoryDoc(doc);
    const key = entry.phone ? `phone:${entry.phone}` : `jid:${entry.lookupJid || entry.id}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, lookupCount: 1 });
      continue;
    }
    existing.lookupCount += 1;
    existing.linkedJids = uniqueJids([...existing.linkedJids, ...entry.linkedJids]);
    existing.updatedAt = Math.max(Number(existing.updatedAt || 0), Number(entry.updatedAt || 0));
    if (!existing.lidJid && entry.lidJid) existing.lidJid = entry.lidJid;
    if (!existing.name || existing.name === existing.lookupJid) existing.name = entry.name;
  }

  const needle = String(options.query || "").trim().toLowerCase();
  const rows = Array.from(grouped.values())
    .filter((entry) => {
      if (!needle) return true;
      return [entry.name, entry.phone, entry.phoneJid, entry.lidJid, ...(entry.linkedJids || [])]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  return { rows, total: rows.length, rawLookupRows: response.documents.length };
}

export async function exportSharedPhoneDirectoryCsv() {
  const directory = await listSharedPhoneDirectory({ limit: 5000 });
  const headers = ["name", "phone", "phone_jid", "lid_jid", "linked_jids", "lookup_count", "source", "updated_at"];
  const lines = directory.rows.map((entry: any) => [
    entry.name,
    entry.phone,
    entry.phoneJid,
    entry.lidJid,
    (entry.linkedJids || []).join("|"),
    entry.lookupCount,
    entry.source,
    formatDate(entry.updatedAt),
  ].map(csvEscape).join(","));
  return [headers.join(","), ...lines].join("\n");
}

export async function importSharedPhoneDirectoryRows(rows: any[]) {
  if (!Array.isArray(rows)) throw new Error("Rows must be an array");
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const identity = buildImportedContactIdentity(row);
    if (!identity?.phone) {
      skipped++;
      errors.push(`Row ${index + 1}: phone is required for the shared lookup directory`);
      continue;
    }

    const result = await publishSharedPhoneIdentity({
      jid: identity.primaryJid,
      phone: identity.phone,
      profilePatch: identity.profilePatch,
      source: "admin_csv",
    }).catch(() => ({ published: false }));

    if ((result as any)?.published) imported++;
    else {
      skipped++;
      errors.push(`Row ${index + 1}: could not save shared lookup`);
    }
  }

  return { imported, skipped, errors: errors.slice(0, 25) };
}

export async function hydrateSharedPhoneForCustomer(input: {
  dataOwnerKey: string;
  jid: string;
  profile?: any;
  linkedJids?: string[];
}) {
  const profile = input.profile || {};
  const existingPhone = toWhatsAppPhoneDigits(getProfilePhone(profile));
  if (existingPhone) {
    publishSharedPhoneIdentity({ jid: input.jid, phone: existingPhone, profilePatch: profile }).catch(() => {});
    return { profile, applied: false };
  }

  const candidates = uniqueJids([input.jid, ...(input.linkedJids || []), profile?.lidJid, profile?.phoneJid]);
  for (const candidate of candidates) {
    if (candidate === input.jid) continue;
    const accountProfile = await dbService.getCustomerProfile(input.dataOwnerKey, candidate).catch(() => null);
    const accountPhone = toWhatsAppPhoneDigits(getProfilePhone(accountProfile || {}));
    if (!accountPhone) continue;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const patch = {
      ...phonePatch(accountPhone, "linked_account_customer_profile", nowSeconds),
      jid: input.jid,
      ...(input.jid.endsWith("@lid") || input.jid.endsWith("@hosted.lid") ? { lidJid: input.jid } : {}),
      ...(accountProfile?.lidJid ? { lidJid: accountProfile.lidJid } : {}),
      linkedAccountPhoneSyncedAt: nowSeconds,
    };
    await dbService.updateCustomerProfile(input.dataOwnerKey, input.jid, patch).catch(() => {});
    publishSharedPhoneIdentity({ jid: input.jid, phone: accountPhone, profilePatch: patch }).catch(() => {});
    return { profile: { ...profile, ...patch }, applied: true, phone: accountPhone };
  }

  for (const candidate of candidates) {
    const shared = await dbService.getCustomerProfile(SHARED_PHONE_DIRECTORY_OWNER, candidate).catch(() => null);
    const sharedPhone = toWhatsAppPhoneDigits(getProfilePhone(shared || {}));
    if (!sharedPhone) continue;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const patch = {
      ...phonePatch(sharedPhone, "shared_customer_directory", nowSeconds),
      jid: input.jid,
      ...(input.jid.endsWith("@lid") || input.jid.endsWith("@hosted.lid") ? { lidJid: input.jid } : {}),
      ...(shared?.lidJid ? { lidJid: shared.lidJid } : {}),
      sharedPhoneDirectorySyncedAt: nowSeconds,
    };
    await dbService.updateCustomerProfile(input.dataOwnerKey, input.jid, patch).catch(() => {});
    return { profile: { ...profile, ...patch }, applied: true, phone: sharedPhone };
  }

  return { profile, applied: false };
}
