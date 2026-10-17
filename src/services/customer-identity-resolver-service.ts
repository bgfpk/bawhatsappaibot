import crypto from "crypto";
import { formatInternationalPhone, normalizeTrustedPhoneDigits } from "../utils/contact-identity.ts";
import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";
import { acquireAtomicClaim, __clearMemoryClaimsForTest } from "./canonical-claim-service.ts";

export type CustomerIdentityResolverInput = {
  jid?: any;
  lid?: any;
  phone?: any;
  importedPhone?: any;
  crmLeadPhone?: any;
  whatsappProfilePhone?: any;
  profile?: any;
  record?: any;
  aliases?: any[];
};

export type ResolvedCustomerIdentity = {
  canonicalCustomerKey: string;
  canonicalCustomerId: string;
  canonicalPhone: string;
  activeSendJid: string;
  aliases: string[];
  linkedAliasCount: number;
  displayIdentity: {
    displayName: string;
    displayPhone: string;
    displayJid: string;
    isLidOnly: boolean;
    phoneIsTrusted: boolean;
    aliasLabel: string;
  };
};

export type VerifiedAliasType =
  | "pn_jid"
  | "lid"
  | "verified_phone"
  | "alternate_whatsapp_identity"
  | "customer_validated_phone";

export interface VerifiedCustomerAliasItem {
  alias: string;
  type: VerifiedAliasType;
  verifiedAt: number;
  source: string;
}

export interface CanonicalCustomerIdentityRecord {
  canonicalCustomerId: string;
  accountId: string;
  canonicalPhone: string;
  activeSendJid: string;
  displayName: string;
  verifiedAliases: VerifiedCustomerAliasItem[];
  updatedAt: number;
  hasConflict?: boolean;
  conflictReview?: boolean;
  conflictDetails?: {
    conflictingAlias: string;
    attemptedCustomerId: string;
    existingCustomerId: string;
    timestamp: number;
  };
  provenance?: {
    unifiedFromCustomerId?: string;
    authoritativeEvidence?: string;
    unifiedAt?: number;
  };
  isSuperseded?: boolean;
  supersededBy?: string;
}

function clean(value: any) {
  return String(value || "").trim();
}

function parseObject(value: any) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isLid(value: any) {
  const text = clean(value).toLowerCase();
  return text.endsWith("@lid") || text.endsWith("@hosted.lid");
}

function isPhoneJid(value: any) {
  return /^\d{8,15}@s\.whatsapp\.net$/i.test(clean(value));
}

function localDigits(value: any) {
  return clean(value).split("@")[0].replace(/\D/g, "");
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map(clean).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function deterministicHash16(str: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as any).createHash === "function") {
      return (crypto as any).createHash("sha256").update(str).digest("hex").slice(0, 16);
    }
  } catch {}
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c64e6d ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}`;
}

function firstUsefulName(...values: any[]) {
  return values
    .map((value) => clean(value))
    .find((value) => value && !/^\d+$/.test(value) && !/@(?:lid|hosted\.lid|s\.whatsapp\.net|g\.us|broadcast)$/i.test(value)) || "";
}

function collectAliases(input: CustomerIdentityResolverInput, profile: any, record: any) {
  return unique([
    input.jid,
    input.lid,
    profile.jid,
    profile.customerJid,
    profile.phoneJid,
    profile.lid,
    profile.lidJid,
    profile.hostedLid,
    profile.whatsappLid,
    record.jid,
    record.customerJid,
    record.customer_jid,
    record.chat_jid,
    record.customer_id,
    ...arrayValue(profile.linkedJids),
    ...arrayValue(profile.aliases),
    ...(Array.isArray(input.aliases) ? input.aliases : []),
  ].map(clean).filter(Boolean));
}

function lidDigitSet(aliases: string[]) {
  return new Set(aliases.filter(isLid).map(localDigits).filter(Boolean));
}

function normalizeTrustedPhoneCandidate(value: any, source: string, blocked: Set<string>) {
  const raw = clean(value);
  if (!raw) return "";
  if (source === "contact-d26ce7788f39@example.invalid" && !isPhoneJid(raw)) return "";
  if (blocked.has(localDigits(raw))) return "";
  const extraTrusted = /imported|business_card|businessCard/i.test(source);
  return normalizeTrustedPhoneDigits(raw, { source, trusted: extraTrusted, blockedDigits: blocked });
}

function collectTrustedPhones(input: CustomerIdentityResolverInput, profile: any, record: any, blocked: Set<string>) {
  const candidates: Array<[any, string]> = [
    [input.phone, "profile.phone"],
    [input.importedPhone, "profile.importedPhone"],
    [input.crmLeadPhone, "lead.phone"],
    [input.whatsappProfilePhone, "profile.whatsapp_number"],
    [input.jid, "contact-d26ce7788f39@example.invalid"],
    [profile.phone, "profile.phone"],
    [profile.phoneNumber, "profile.phoneNumber"],
    [profile.customerPhone, "profile.customerPhone"],
    [profile.shippingPhone, "profile.shippingPhone"],
    [profile.whatsapp_number, "profile.whatsapp_number"],
    [profile.whatsappNumber, "profile.whatsappNumber"],
    [profile.importedPhone, "profile.importedPhone"],
    [profile.crmLeadPhone, "profile.crmLeadPhone"],
    [record.phone, "record.phone"],
    [record.customerPhone, "record.customerPhone"],
    [record.customer_phone, "record.customer_phone"],
    [record.importedPhone, "record.importedPhone"],
    [record.crmLeadPhone, "record.crmLeadPhone"],
    [record.whatsappProfilePhone, "record.whatsappProfilePhone"],
  ];
  const phones: string[] = [];
  for (const [cand, source] of candidates) {
    const normalized = normalizeTrustedPhoneCandidate(cand, source, blocked);
    if (normalized && !phones.includes(normalized)) phones.push(normalized);
  }
  return phones;
}

function buildInputFromRecord(record: any) {
  const profile = parseObject(record?.profile || {});
  return {
    jid: record?.jid || record?.customerJid || record?.customer_jid || record?.chat_jid || record?.customer_id || profile.customerJid || profile.jid,
    lid: record?.lid || profile.lidJid || profile.lid || profile.hostedLid || profile.whatsappLid,
    phone: record?.phone || record?.customerPhone || record?.customer_phone,
    importedPhone: record?.importedPhone || profile.importedPhone,
    crmLeadPhone: record?.crmLeadPhone || profile.crmLeadPhone,
    whatsappProfilePhone: record?.whatsappProfilePhone || profile.whatsapp_number || profile.whatsappNumber,
    profile,
    record,
    aliases: [...arrayValue(profile.linkedJids), ...arrayValue(profile.aliases)],
  };
}

export function resolveCustomerIdentity(input: CustomerIdentityResolverInput): ResolvedCustomerIdentity {
  const profile = parseObject(input.profile || input.record?.profile || {});
  const record = input.record || {};
  const aliasesFromRecord = collectAliases(input, profile, record);
  const blocked = lidDigitSet(aliasesFromRecord);
  const phones = collectTrustedPhones(input, profile, record, blocked);
  const canonicalPhone = phones[0] || "";
  const phoneJid = canonicalPhone ? normalizeWhatsAppJid(canonicalPhone) : "";
  const rawJid = clean(input.jid || profile.customerJid || profile.jid || record.customerJid || record.customer_jid || record.chat_jid || record.customer_id);
  const normalizedRawJid = rawJid.includes("@") ? normalizeWhatsAppJid(rawJid) : "";
  const activeSendJid = normalizedRawJid || phoneJid || clean(input.lid || profile.lidJid || profile.lid || profile.hostedLid || profile.whatsappLid);
  const phoneAliases = unique([phoneJid, ...phones.map((phone) => normalizeWhatsAppJid(phone)), ...aliasesFromRecord.filter(isPhoneJid)].filter(Boolean));
  const aliases = unique([...phoneAliases, ...aliasesFromRecord]);

  // Stable immutable canonical customer ID
  const recordId = clean(record.$id || record.id || record.customerId || record._id || (input as any).id);
  const seed = canonicalPhone || activeSendJid || aliases[0] || (recordId ? `record:${recordId}` : "unknown");
  const canonicalCustomerId = `cust_${deterministicHash16(seed)}`;
  const canonicalCustomerKey = canonicalPhone ? `phone:${canonicalPhone}` : activeSendJid ? `jid:${activeSendJid}` : aliases[0] ? `alias:${aliases[0]}` : (recordId || "");
  const displayName = firstUsefulName(record.name, record.customerName, profile.savedName, profile.customerName, profile.name, profile.verifiedName, profile.businessName, profile.pushName, profile.notify, profile.displayName);
  const displayPhone = canonicalPhone ? formatInternationalPhone(canonicalPhone, { trusted: true }) : "";

  return {
    canonicalCustomerKey,
    canonicalCustomerId,
    canonicalPhone,
    activeSendJid,
    aliases,
    linkedAliasCount: aliases.length,
    displayIdentity: {
      displayName,
      displayPhone,
      displayJid: activeSendJid,
      isLidOnly: Boolean(activeSendJid && isLid(activeSendJid) && !canonicalPhone),
      phoneIsTrusted: Boolean(canonicalPhone),
      aliasLabel: canonicalPhone ? "" : activeSendJid && isLid(activeSendJid) ? "Alias contact" : "Unknown alias",
    },
  };
}

function recordAliasSet(record: any) {
  const identity = resolveCustomerIdentity(buildInputFromRecord(record));
  const set = new Set<string>();
  if (identity.canonicalCustomerKey && (identity.canonicalCustomerKey.startsWith("phone:") || identity.canonicalCustomerKey.startsWith("jid:") || identity.canonicalCustomerKey.startsWith("alias:"))) {
    set.add(identity.canonicalCustomerKey.toLowerCase());
  }
  if (identity.activeSendJid) set.add(identity.activeSendJid.toLowerCase());
  if (identity.canonicalPhone) set.add(identity.canonicalPhone.toLowerCase());
  for (const alias of identity.aliases) {
    if (alias) set.add(clean(alias).toLowerCase());
  }
  return set;
}

function hasAliasOverlap(left: Set<string>, right: Set<string>) {
  for (const item of left) if (right.has(item)) return true;
  return false;
}

export function groupCustomerRecordsByCanonicalIdentity(records: any[] = []) {
  const groups: Array<{ identity: ResolvedCustomerIdentity; records: any[]; aliasSet: Set<string> }> = [];
  for (const record of records || []) {
    const identity = resolveCustomerIdentity(buildInputFromRecord(record));
    const aliasSet = recordAliasSet(record);
    let existing = groups.find((group) => (identity.canonicalPhone && group.identity.canonicalPhone === identity.canonicalPhone) || hasAliasOverlap(group.aliasSet, aliasSet));
    if (!existing) {
      existing = { identity, records: [], aliasSet: new Set<string>() };
      groups.push(existing);
    }
    existing.records.push(record);
    for (const alias of aliasSet) existing.aliasSet.add(alias);
    existing.identity.aliases = unique([...existing.identity.aliases, ...identity.aliases]);
    existing.identity.linkedAliasCount = existing.identity.aliases.length;
    if (!existing.identity.canonicalPhone && identity.canonicalPhone) {
      existing.identity.canonicalPhone = identity.canonicalPhone;
      existing.identity.canonicalCustomerKey = `phone:${identity.canonicalPhone}`;
      existing.identity.displayIdentity.displayPhone = identity.displayIdentity.displayPhone;
      existing.identity.displayIdentity.phoneIsTrusted = true;
      existing.identity.displayIdentity.aliasLabel = "";
    }
    if (!existing.identity.activeSendJid && identity.activeSendJid) existing.identity.activeSendJid = identity.activeSendJid;
    if (!existing.identity.displayIdentity.displayName && identity.displayIdentity.displayName) existing.identity.displayIdentity.displayName = identity.displayIdentity.displayName;
  }
  return groups.map(({ identity, records }) => ({ identity, records }));
}

export function maskCustomerAliasForAdmin(value: any) {
  const text = clean(value);
  if (!text) return "";
  const [local, domain] = text.split("@");
  const maskedLocal = local.length <= 6 ? `${local.slice(0, 2)}***` : `${local.slice(0, 3)}...${local.slice(-2)}`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

// ---------------------------------------------------------------------------
// Canonical Durable Identity Alias Persistence (Appwrite SYSTEM_CONFIGS Backed)
// ---------------------------------------------------------------------------

type IdentityPersistenceDeps = {
  getSystemConfig: (key: string) => Promise<string | null>;
  setSystemConfig: (key: string, value: string) => Promise<void>;
};

let persistenceDeps: Partial<IdentityPersistenceDeps> | null = null;
const volatileTestConfigStore = new Map<string, string>();

export function __setCustomerIdentityPersistenceDeps(overrides: Partial<IdentityPersistenceDeps> | null) {
  persistenceDeps = overrides;
  if (!overrides) {
    volatileTestConfigStore.clear();
  }
}

export function __resetCustomerIdentityPersistenceDeps(inMemory = true) {
  if (inMemory) {
    persistenceDeps = {
      getSystemConfig: async (key: string) => volatileTestConfigStore.get(key) || null,
      setSystemConfig: async (key: string, value: string) => {
        volatileTestConfigStore.set(key, value);
      },
    };
  } else {
    persistenceDeps = null;
  }
  volatileTestConfigStore.clear();
}

async function resolveIdentityPersistenceDeps(): Promise<IdentityPersistenceDeps> {
  if (persistenceDeps?.getSystemConfig && persistenceDeps?.setSystemConfig) {
    return persistenceDeps as IdentityPersistenceDeps;
  }
  try {
    const dbService = await import("./db-service.ts");
    return {
      getSystemConfig: dbService.getSystemConfig,
      setSystemConfig: dbService.setSystemConfig,
    };
  } catch {
    return {
      getSystemConfig: async (key: string) => volatileTestConfigStore.get(key) || null,
      setSystemConfig: async (key: string, value: string) => {
        volatileTestConfigStore.set(key, value);
      },
    };
  }
}

const memoryAliasesByAccount = new Map<string, Map<string, CanonicalCustomerIdentityRecord>>();
const memoryAliasLookupByAccount = new Map<string, Map<string, string>>();

function getSafeAccountKey(accountId?: string): string {
  const raw = clean(accountId) || "global";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

function buildStorageKey(accountId?: string): string {
  return `customer_aliases:${getSafeAccountKey(accountId)}`;
}

export function loadPersistedCustomerAliases(accountId?: string): Map<string, CanonicalCustomerIdentityRecord> {
  const safeOwner = getSafeAccountKey(accountId);
  if (memoryAliasesByAccount.has(safeOwner)) {
    return memoryAliasesByAccount.get(safeOwner)!;
  }
  const records = new Map<string, CanonicalCustomerIdentityRecord>();
  const lookup = new Map<string, string>();
  memoryAliasesByAccount.set(safeOwner, records);
  memoryAliasLookupByAccount.set(safeOwner, lookup);

  // Synchronous initial load from volatile memory cache or test config store
  const storageKey = buildStorageKey(accountId);
  const raw = volatileTestConfigStore.get(storageKey);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.canonicalCustomerId) {
            records.set(item.canonicalCustomerId, item);
            lookup.set(item.canonicalCustomerId.toLowerCase(), item.canonicalCustomerId);
            if (item.canonicalPhone) {
              lookup.set(item.canonicalPhone.toLowerCase(), item.canonicalCustomerId);
              lookup.set(`phone:${item.canonicalPhone}`.toLowerCase(), item.canonicalCustomerId);
            }
            if (item.activeSendJid) {
              lookup.set(item.activeSendJid.toLowerCase(), item.canonicalCustomerId);
            }
            if (Array.isArray(item.verifiedAliases)) {
              for (const aliasItem of item.verifiedAliases) {
                if (aliasItem?.alias) {
                  lookup.set(aliasItem.alias.toLowerCase(), item.canonicalCustomerId);
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  return records;
}

export async function loadPersistedCustomerAliasesAsync(accountId?: string): Promise<Map<string, CanonicalCustomerIdentityRecord>> {
  const safeOwner = getSafeAccountKey(accountId);
  const records = memoryAliasesByAccount.get(safeOwner) || new Map<string, CanonicalCustomerIdentityRecord>();
  const lookup = memoryAliasLookupByAccount.get(safeOwner) || new Map<string, string>();
  memoryAliasesByAccount.set(safeOwner, records);
  memoryAliasLookupByAccount.set(safeOwner, lookup);

  const deps = await resolveIdentityPersistenceDeps();
  const raw = await deps.getSystemConfig(buildStorageKey(accountId));
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.canonicalCustomerId) {
            records.set(item.canonicalCustomerId, item);
            lookup.set(item.canonicalCustomerId.toLowerCase(), item.canonicalCustomerId);
            if (item.canonicalPhone) {
              lookup.set(item.canonicalPhone.toLowerCase(), item.canonicalCustomerId);
              lookup.set(`phone:${item.canonicalPhone}`.toLowerCase(), item.canonicalCustomerId);
            }
            if (item.activeSendJid) {
              lookup.set(item.activeSendJid.toLowerCase(), item.canonicalCustomerId);
            }
            if (Array.isArray(item.verifiedAliases)) {
              for (const aliasItem of item.verifiedAliases) {
                if (aliasItem?.alias) {
                  lookup.set(aliasItem.alias.toLowerCase(), item.canonicalCustomerId);
                }
              }
            }
          }
        }
      }
    } catch {}
  }
  return records;
}

export interface GranularCustomerAliasRecord {
  accountId: string;
  canonicalCustomerId: string;
  aliasType: VerifiedAliasType;
  aliasValue: string;
  normalizedAlias: string;
  verified: boolean;
  verificationSource: string;
  firstSeenAt: number;
  lastSeenAt: number;
  confidence?: number;
  provenance?: {
    unifiedFromCustomerId?: string;
    authoritativeEvidence?: string;
    unifiedAt?: number;
  };
  hasConflict?: boolean;
  conflictReview?: boolean;
  conflictDetails?: {
    conflictingAlias: string;
    attemptedCustomerId: string;
    existingCustomerId: string;
    timestamp: number;
  };
  isSuperseded?: boolean;
  supersededBy?: string;
}

export function buildGranularAliasDocumentId(accountId: string, normalizedAlias: string): string {
  const norm = clean(normalizedAlias).toLowerCase();
  const safeAccount = getSafeAccountKey(accountId);
  const hash = crypto.createHash("sha256").update(`${safeAccount}:${norm}`).digest("hex").slice(0, 26);
  return `als_${hash}`;
}

export function buildGranularCustomerDocId(accountId: string, canonicalCustomerId: string): string {
  const safeAccount = getSafeAccountKey(accountId);
  const safeCustId = clean(canonicalCustomerId).toLowerCase();
  const hash = crypto.createHash("sha256").update(`${safeAccount}:${safeCustId}`).digest("hex").slice(0, 26);
  return `cid_${hash}`;
}

export async function saveGranularCustomerAlias(aliasRecord: GranularCustomerAliasRecord): Promise<void> {
  const deps = await resolveIdentityPersistenceDeps();
  const docId = buildGranularAliasDocumentId(aliasRecord.accountId, aliasRecord.normalizedAlias);
  const json = JSON.stringify(aliasRecord);
  volatileTestConfigStore.set(docId, json);
  await deps.setSystemConfig(docId, json);
}

export async function getGranularCustomerAlias(accountId: string, normalizedAlias: string): Promise<GranularCustomerAliasRecord | null> {
  const deps = await resolveIdentityPersistenceDeps();
  const docId = buildGranularAliasDocumentId(accountId, normalizedAlias);
  const raw = volatileTestConfigStore.get(docId) || await deps.getSystemConfig(docId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveGranularCustomerRecord(record: CanonicalCustomerIdentityRecord): Promise<void> {
  const deps = await resolveIdentityPersistenceDeps();
  const docId = buildGranularCustomerDocId(record.accountId, record.canonicalCustomerId);
  const json = JSON.stringify(record);
  volatileTestConfigStore.set(docId, json);
  await deps.setSystemConfig(docId, json);
}

export async function getGranularCustomerRecord(accountId: string, canonicalCustomerId: string): Promise<CanonicalCustomerIdentityRecord | null> {
  const deps = await resolveIdentityPersistenceDeps();
  const docId = buildGranularCustomerDocId(accountId, canonicalCustomerId);
  const raw = volatileTestConfigStore.get(docId) || await deps.getSystemConfig(docId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function savePersistedCustomerAliases(accountId?: string): void {
  const safeOwner = getSafeAccountKey(accountId);
  const records = memoryAliasesByAccount.get(safeOwner);
  if (!records) return;

  const list = Array.from(records.values());
  const json = JSON.stringify(list, null, 2);
  const storageKey = buildStorageKey(accountId);

  volatileTestConfigStore.set(storageKey, json);
  resolveIdentityPersistenceDeps().then((deps) => {
    deps.setSystemConfig(storageKey, json).catch(() => {});
    // Granularly persist each alias and customer record
    for (const rec of list) {
      const custDocId = buildGranularCustomerDocId(rec.accountId, rec.canonicalCustomerId);
      deps.setSystemConfig(custDocId, JSON.stringify(rec)).catch(() => {});
      for (const va of rec.verifiedAliases) {
        const aliasDocId = buildGranularAliasDocumentId(rec.accountId, va.alias);
        const aliasDoc: GranularCustomerAliasRecord = {
          accountId: rec.accountId,
          canonicalCustomerId: rec.canonicalCustomerId,
          aliasType: va.type,
          aliasValue: va.alias,
          normalizedAlias: va.alias.toLowerCase(),
          verified: true,
          verificationSource: va.source || "sync",
          firstSeenAt: va.verifiedAt,
          lastSeenAt: rec.updatedAt,
          confidence: 1.0,
          provenance: rec.provenance,
          hasConflict: rec.hasConflict,
          conflictReview: rec.conflictReview,
          conflictDetails: rec.conflictDetails,
          isSuperseded: rec.isSuperseded,
          supersededBy: rec.supersededBy,
        };
        deps.setSystemConfig(aliasDocId, JSON.stringify(aliasDoc)).catch(() => {});
      }
    }
  }).catch(() => {});
}

export async function savePersistedCustomerAliasesAsync(accountId?: string): Promise<void> {
  const safeOwner = getSafeAccountKey(accountId);
  const records = memoryAliasesByAccount.get(safeOwner);
  if (!records) return;

  const list = Array.from(records.values());
  const json = JSON.stringify(list, null, 2);
  const storageKey = buildStorageKey(accountId);

  volatileTestConfigStore.set(storageKey, json);
  const deps = await resolveIdentityPersistenceDeps();
  await deps.setSystemConfig(storageKey, json);
  // Persist granular records
  for (const rec of list) {
    const custDocId = buildGranularCustomerDocId(rec.accountId, rec.canonicalCustomerId);
    await deps.setSystemConfig(custDocId, JSON.stringify(rec));
    for (const va of rec.verifiedAliases) {
      const aliasDocId = buildGranularAliasDocumentId(rec.accountId, va.alias);
      const aliasDoc: GranularCustomerAliasRecord = {
        accountId: rec.accountId,
        canonicalCustomerId: rec.canonicalCustomerId,
        aliasType: va.type,
        aliasValue: va.alias,
        normalizedAlias: va.alias.toLowerCase(),
        verified: true,
        verificationSource: va.source || "sync",
        firstSeenAt: va.verifiedAt,
        lastSeenAt: rec.updatedAt,
        confidence: 1.0,
        provenance: rec.provenance,
        hasConflict: rec.hasConflict,
        conflictReview: rec.conflictReview,
        conflictDetails: rec.conflictDetails,
        isSuperseded: rec.isSuperseded,
        supersededBy: rec.supersededBy,
      };
      await deps.setSystemConfig(aliasDocId, JSON.stringify(aliasDoc));
    }
  }
}

export function recordVerifiedCustomerAlias(input: {
  accountId: string;
  canonicalCustomerId?: string;
  alias: string;
  type: VerifiedAliasType;
  phone?: string;
  displayName?: string;
  source?: string;
  authoritativeMapping?: boolean;
  nowMs?: number;
}): CanonicalCustomerIdentityRecord {
  const accountId = clean(input.accountId) || "global";
  const safeOwner = getSafeAccountKey(accountId);
  loadPersistedCustomerAliases(accountId);

  const records = memoryAliasesByAccount.get(safeOwner)!;
  const lookup = memoryAliasLookupByAccount.get(safeOwner)!;
  const normAlias = clean(input.alias);
  const nowMs = input.nowMs || Date.now();

  const phoneDigits = input.phone
    ? normalizeTrustedPhoneDigits(input.phone, { trusted: true })
    : (isPhoneJid(normAlias) ? localDigits(normAlias) : "");
  const canonicalPhone = phoneDigits || "";

  // Check if alias was already mapped to an immutable canonical customer ID
  const existingCanonicalId = lookup.get(normAlias.toLowerCase()) || (canonicalPhone ? lookup.get(canonicalPhone.toLowerCase()) : null);

  // Conflict handling (Requirement #17 & #7):
  // If alias was already mapped to Customer A, and input specifies Customer B:
  // - If NOT authoritative: DO NOT silently merge! Flag conflict and protect Customer A.
  // - If authoritative: Safely unify aliases to authoritative ID with clear provenance.
  if (existingCanonicalId && input.canonicalCustomerId && existingCanonicalId !== input.canonicalCustomerId) {
    if (!input.authoritativeMapping) {
      const existingRec = records.get(existingCanonicalId);
      if (existingRec) {
        existingRec.hasConflict = true;
        existingRec.conflictReview = true;
        existingRec.conflictDetails = {
          conflictingAlias: normAlias,
          attemptedCustomerId: input.canonicalCustomerId,
          existingCustomerId: existingCanonicalId,
          timestamp: nowMs,
        };
        savePersistedCustomerAliases(accountId);
        return existingRec;
      }
    } else {
      // Authoritative mapping provided: safe canonical resolution with provenance
      const existingRec = records.get(existingCanonicalId);
      if (existingRec) {
        existingRec.hasConflict = false;
        existingRec.conflictReview = false;
        existingRec.isSuperseded = true;
        existingRec.supersededBy = input.canonicalCustomerId;
        const targetRec = records.get(input.canonicalCustomerId) || {
          canonicalCustomerId: input.canonicalCustomerId,
          accountId,
          canonicalPhone: existingRec.canonicalPhone || canonicalPhone,
          activeSendJid: existingRec.activeSendJid || normAlias,
          displayName: existingRec.displayName || input.displayName || "",
          verifiedAliases: [],
          updatedAt: nowMs,
        };
        for (const va of existingRec.verifiedAliases) {
          if (!targetRec.verifiedAliases.some((a) => a.alias.toLowerCase() === va.alias.toLowerCase())) {
            targetRec.verifiedAliases.push({ ...va });
          }
        }
        targetRec.hasConflict = false;
        targetRec.conflictReview = false;
        targetRec.provenance = {
          unifiedFromCustomerId: existingCanonicalId,
          authoritativeEvidence: input.source || "authoritative_whatsapp_mapping",
          unifiedAt: nowMs,
        };
        records.set(input.canonicalCustomerId, targetRec);
        for (const va of existingRec.verifiedAliases) {
          lookup.set(va.alias.toLowerCase(), input.canonicalCustomerId);
        }
        lookup.set(existingCanonicalId.toLowerCase(), input.canonicalCustomerId);
      }
    }
  }

  // Immutable Canonical Customer ID Resolution (Requirement #2):
  // 1. Explicit ID provided
  // 2. Existing ID resolved from alias lookup
  const canonicalCustomerId = input.canonicalCustomerId || existingCanonicalId || `cust_${deterministicHash16(`${accountId}:${normAlias}`)}`;

  let rec = records.get(canonicalCustomerId);
  if (!rec) {
    rec = {
      canonicalCustomerId,
      accountId,
      canonicalPhone,
      activeSendJid: normAlias.includes("@") ? normAlias : (canonicalPhone ? `${canonicalPhone}@s.whatsapp.net` : normAlias),
      displayName: input.displayName || "",
      verifiedAliases: [],
      updatedAt: nowMs,
    };
    records.set(canonicalCustomerId, rec);
  }

  // Attach / improve aliases without altering immutable canonicalCustomerId
  if (canonicalPhone && !rec.canonicalPhone) {
    rec.canonicalPhone = canonicalPhone;
  }
  if (input.displayName && !rec.displayName) {
    rec.displayName = input.displayName;
  }
  if (normAlias.includes("@") && !rec.activeSendJid) {
    rec.activeSendJid = normAlias;
  }

  // Add alias to verified list if not already present
  const aliasLower = normAlias.toLowerCase();
  const existingAlias = rec.verifiedAliases.find((a) => a.alias.toLowerCase() === aliasLower);
  if (!existingAlias && normAlias) {
    rec.verifiedAliases.push({
      alias: normAlias,
      type: input.type,
      verifiedAt: nowMs,
      source: input.source || "verified_inbound",
    });
  }

  rec.updatedAt = nowMs;

  // Update reverse lookup indexes
  lookup.set(normAlias.toLowerCase(), canonicalCustomerId);
  lookup.set(canonicalCustomerId.toLowerCase(), canonicalCustomerId);
  if (canonicalPhone) {
    lookup.set(canonicalPhone.toLowerCase(), canonicalCustomerId);
    lookup.set(`phone:${canonicalPhone}`.toLowerCase(), canonicalCustomerId);
  }
  if (rec.activeSendJid) {
    lookup.set(rec.activeSendJid.toLowerCase(), canonicalCustomerId);
  }

  savePersistedCustomerAliases(accountId);
  return rec;
}

export function resolveCanonicalCustomerIdForAlias(input: {
  accountId: string;
  alias: string;
}): string | null {
  const accountId = clean(input.accountId) || "global";
  const safeOwner = getSafeAccountKey(accountId);
  loadPersistedCustomerAliases(accountId);

  const lookup = memoryAliasLookupByAccount.get(safeOwner);
  if (!lookup) return null;
  const key = clean(input.alias).toLowerCase();
  const direct = lookup.get(key);
  if (direct) return direct;

  // Fallback to granular alias document
  const docId = buildGranularAliasDocumentId(accountId, input.alias);
  const raw = volatileTestConfigStore.get(docId);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.canonicalCustomerId) {
        lookup.set(key, parsed.canonicalCustomerId);
        return parsed.canonicalCustomerId;
      }
    } catch {}
  }
  return null;
}

export function getCanonicalCustomerRecord(input: {
  accountId: string;
  canonicalCustomerId: string;
}): CanonicalCustomerIdentityRecord | null {
  const accountId = clean(input.accountId) || "global";
  const safeOwner = getSafeAccountKey(accountId);
  loadPersistedCustomerAliases(accountId);

  const records = memoryAliasesByAccount.get(safeOwner);
  return records?.get(input.canonicalCustomerId) || null;
}

export function clearCustomerAliasMemoryCache(): void {
  memoryAliasesByAccount.clear();
  memoryAliasLookupByAccount.clear();
}

export function clearCustomerAliasStore(): void {
  memoryAliasesByAccount.clear();
  memoryAliasLookupByAccount.clear();
  volatileTestConfigStore.clear();
}

// ---------------------------------------------------------------------------
// Canonical Cross-Identity Inbound Message Deduplication (Atomic Claims)
// ---------------------------------------------------------------------------

const memoryMessageDedup = new Map<string, { claimKey: string; claimedAt: number }>();

export function buildCrossIdentityDedupKey(params: {
  accountId?: string;
  botId?: string;
  direction?: "inbound" | "outbound";
  messageId: string;
}): string {
  const account = clean(params.accountId) || "default";
  const bot = clean(params.botId) || "default";
  const dir = clean(params.direction) || "inbound";
  const msgId = clean(params.messageId);
  return `${account}_${bot}_${dir}_${msgId}`;
}

export function claimCrossIdentityMessage(params: {
  accountId?: string;
  botId?: string;
  direction?: "inbound" | "outbound";
  messageId: string;
  timestamp?: number;
}): { isDuplicate: boolean; claimKey: string; claimedAt: number } {
  const claimKey = buildCrossIdentityDedupKey(params);
  const now = params.timestamp || Date.now();

  // Fast in-memory check
  const existing = memoryMessageDedup.get(claimKey);
  if (existing) {
    return { isDuplicate: true, claimKey, claimedAt: existing.claimedAt };
  }

  // Record atomic claim (synchronous volatile register + background atomic claim)
  const claimRecord = { claimKey, claimedAt: now };
  memoryMessageDedup.set(claimKey, claimRecord);

  // Trigger canonical atomic storage claim
  acquireAtomicClaim(`inbound_dedup:${claimKey}`, params.botId || "inbound_worker", 7 * 24 * 60 * 60 * 1000, now).catch(() => {});

  return { isDuplicate: false, claimKey, claimedAt: now };
}

export async function claimCrossIdentityMessageAsync(params: {
  accountId?: string;
  botId?: string;
  direction?: "inbound" | "outbound";
  messageId: string;
  timestamp?: number;
}): Promise<{ isDuplicate: boolean; claimKey: string; claimedAt: number }> {
  const claimKey = buildCrossIdentityDedupKey(params);
  const now = params.timestamp || Date.now();

  const existing = memoryMessageDedup.get(claimKey);
  if (existing) {
    return { isDuplicate: true, claimKey, claimedAt: existing.claimedAt };
  }

  // Globally atomic claim via canonical storage
  const claimResult = await acquireAtomicClaim(
    `inbound_dedup:${claimKey}`,
    params.botId || "inbound_worker",
    7 * 24 * 60 * 60 * 1000,
    now
  );

  if (!claimResult.acquired) {
    return { isDuplicate: true, claimKey, claimedAt: now };
  }

  memoryMessageDedup.set(claimKey, { claimKey, claimedAt: now });
  return { isDuplicate: false, claimKey, claimedAt: now };
}

export function clearCrossIdentityMessageClaims(): void {
  memoryMessageDedup.clear();
  __clearMemoryClaimsForTest();
}

// ---------------------------------------------------------------------------
// Customer List Deduplication (Preserving Audit Provenance)
// ---------------------------------------------------------------------------

export function deduplicateCustomerList(records: any[] = []): any[] {
  const groups = groupCustomerRecordsByCanonicalIdentity(records);
  return groups.map(({ identity, records: groupRecords }) => {
    // Sort group records by latest activity
    const sorted = [...groupRecords].sort((a, b) => {
      const timeA = Number(a.last_message_at || a.updated_at || a.$updatedAt || 0);
      const timeB = Number(b.last_message_at || b.updated_at || b.$updatedAt || 0);
      return timeB - timeA;
    });
    const primary = sorted[0] || {};
    // Merge all profiles
    const mergedProfile = groupRecords.reduce((acc, rec) => {
      const prof = parseObject(rec.profile);
      return { ...acc, ...prof };
    }, {} as any);

    // Link aliases and record provenance
    mergedProfile.aliases = identity.aliases;
    mergedProfile.linkedJids = identity.aliases;
    mergedProfile.mergedRecordIds = groupRecords.map((r) => r.$id || r.id).filter(Boolean);
    if (identity.canonicalPhone) {
      mergedProfile.phone = identity.canonicalPhone;
      mergedProfile.phoneNumber = identity.canonicalPhone;
      mergedProfile.whatsapp_number = identity.canonicalPhone;
      mergedProfile.phoneJid = `${identity.canonicalPhone}@s.whatsapp.net`;
    }
    if (identity.displayIdentity.displayName && !mergedProfile.name) {
      mergedProfile.name = identity.displayIdentity.displayName;
    }

    const trustedPhone = identity.canonicalPhone || (primary.phone && !isLid(primary.phone) && String(primary.phone).length <= 15 ? primary.phone : "");

    return {
      ...primary,
      name: identity.displayIdentity.displayName || primary.name || mergedProfile.name || "",
      phone: trustedPhone,
      profile: mergedProfile,
      canonicalCustomerId: identity.canonicalCustomerId || identity.canonicalCustomerKey,
      canonicalCustomerKey: identity.canonicalCustomerKey,
      linkedAliasCount: identity.linkedAliasCount,
      aliases: identity.aliases,
    };
  });
}
