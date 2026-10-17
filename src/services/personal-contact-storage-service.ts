/**
 * Personal Contact Storage Service
 * 
 * Provides durable, tenant-scoped storage for Personal Contacts and alias mappings
 * in Appwrite COLLECTIONS.SYSTEM_CONFIGS.
 * 
 * Invariants:
 * - One Personal Contact document per real contact
 * - Fast O(1) alias lookups via mapping documents
 * - Strict tenant isolation on every read/write
 * - Optimistic concurrency revision tracking
 */

import crypto from "node:crypto";
import { databases, DATABASE_ID, COLLECTIONS } from "./db-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";

const defaultPersonalContactStorageDeps = {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  getDocument: async (dbId: string, collId: string, docId: string) => {
    return databases.getDocument(dbId, collId, docId);
  },
  createDocument: async (dbId: string, collId: string, docId: string, data: any) => {
    return databases.createDocument(dbId, collId, docId, data);
  },
  updateDocument: async (dbId: string, collId: string, docId: string, data: any) => {
    return databases.updateDocument(dbId, collId, docId, data);
  },
  deleteDocument: async (dbId: string, collId: string, docId: string) => {
    return databases.deleteDocument(dbId, collId, docId);
  },
  now: () => Date.now(),
};

export const personalContactStorageDeps = { ...defaultPersonalContactStorageDeps };

export function __setPersonalContactStorageTestDeps(overrides: Partial<typeof defaultPersonalContactStorageDeps>): void {
  Object.assign(personalContactStorageDeps, overrides || {});
}

export function __resetPersonalContactStorageTestDeps(): void {
  Object.assign(personalContactStorageDeps, defaultPersonalContactStorageDeps);
}

function hashString(val: string, length = 10): string {
  const clean = String(val || "").trim().toLowerCase();
  return crypto.createHash("sha256").update(clean).digest("hex").slice(0, length);
}

export function buildTenantHash(accountId: string): string {
  return hashString(accountId, 8);
}

export function buildContactDocId(accountId: string, contactId: string): string {
  const tHash = buildTenantHash(accountId);
  const cHash = hashString(contactId, 16);
  // Max 36 chars: "pct_" (4) + 8 + "_" (1) + 16 = 29 chars
  return `pct_${tHash}_${cHash}`;
}

export function buildAliasDocId(accountId: string, aliasKey: string): string {
  const tHash = buildTenantHash(accountId);
  const aHash = hashString(aliasKey, 16);
  // Max 36 chars: "pca_" (4) + 8 + "_" (1) + 16 = 29 chars
  return `pca_${tHash}_${aHash}`;
}

export function buildTenantIndexDocId(accountId: string): string {
  const tHash = buildTenantHash(accountId);
  // Max 36 chars: "pci_" (4) + 8 = 12 chars
  return `pci_${tHash}`;
}

// In-memory caches for rapid access
const contactCache = new Map<string, { contact: PersonalContact; cachedAt: number }>();
const aliasCache = new Map<string, string>(); // "accountId:aliasKey" -> contactId
const indexCache = new Map<string, string[]>(); // accountId -> contactIds[]

const CACHE_TTL_MS = 60 * 1000;

export function invalidatePersonalContactCache(accountId?: string, contactId?: string) {
  if (!accountId) {
    contactCache.clear();
    aliasCache.clear();
    indexCache.clear();
    return;
  }
  indexCache.delete(accountId);
  if (contactId) {
    contactCache.delete(`${accountId}:${contactId}`);
  } else {
    for (const key of contactCache.keys()) {
      if (key.startsWith(`${accountId}:`)) {
        contactCache.delete(key);
      }
    }
  }
  for (const key of aliasCache.keys()) {
    if (key.startsWith(`${accountId}:`)) {
      aliasCache.delete(key);
    }
  }
}

export async function getPersonalContactDoc(
  accountId: string,
  contactId: string
): Promise<PersonalContact | null> {
  const safeAccountId = String(accountId || "").trim();
  const safeContactId = String(contactId || "").trim();
  if (!safeAccountId || !safeContactId) return null;

  const cacheKey = `${safeAccountId}:${safeContactId}`;
  const cached = contactCache.get(cacheKey);
  if (cached && personalContactStorageDeps.now() - cached.cachedAt < CACHE_TTL_MS) {
    return JSON.parse(JSON.stringify(cached.contact));
  }

  const docId = buildContactDocId(safeAccountId, safeContactId);
  try {
    const doc: any = await personalContactStorageDeps.getDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
    if (!doc?.value) return null;
    const contact: PersonalContact = JSON.parse(doc.value);
    // Tenant ownership enforcement
    if (String(contact.accountId || "").trim() !== safeAccountId) {
      return null;
    }
    contactCache.set(cacheKey, { contact, cachedAt: personalContactStorageDeps.now() });
    return JSON.parse(JSON.stringify(contact));
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) return null;
    throw err;
  }
}

export async function savePersonalContactDoc(contact: PersonalContact): Promise<PersonalContact> {
  const safeAccountId = String(contact.accountId || "").trim();
  const safeContactId = String(contact.contactId || "").trim();
  if (!safeAccountId || !safeContactId) {
    throw new Error("Cannot save contact without valid accountId and contactId");
  }

  const docId = buildContactDocId(safeAccountId, safeContactId);
  const now = personalContactStorageDeps.now();
  const serialized = JSON.stringify(contact);

  try {
    await personalContactStorageDeps.updateDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId,
      { value: serialized, updated_at: now }
    );
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) {
      await personalContactStorageDeps.createDocument(
        personalContactStorageDeps.DATABASE_ID,
        personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        docId,
        { value: serialized, updated_at: now }
      );
    } else {
      throw err;
    }
  }

  // Update in-memory cache
  contactCache.set(`${safeAccountId}:${safeContactId}`, { contact, cachedAt: now });
  return contact;
}

export async function deletePersonalContactDoc(
  accountId: string,
  contactId: string
): Promise<boolean> {
  const safeAccountId = String(accountId || "").trim();
  const safeContactId = String(contactId || "").trim();
  if (!safeAccountId || !safeContactId) return false;

  const docId = buildContactDocId(safeAccountId, safeContactId);
  try {
    await personalContactStorageDeps.deleteDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
    contactCache.delete(`${safeAccountId}:${safeContactId}`);
    return true;
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) return false;
    throw err;
  }
}

export async function findContactIdByAlias(
  accountId: string,
  aliasKey: string
): Promise<string | null> {
  const safeAccountId = String(accountId || "").trim();
  const safeAlias = String(aliasKey || "").trim().toLowerCase();
  if (!safeAccountId || !safeAlias) return null;

  const cacheKey = `${safeAccountId}:${safeAlias}`;
  if (aliasCache.has(cacheKey)) {
    return aliasCache.get(cacheKey) || null;
  }

  const docId = buildAliasDocId(safeAccountId, safeAlias);
  try {
    const doc: any = await personalContactStorageDeps.getDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
    if (!doc?.value) return null;
    const data = JSON.parse(doc.value);
    if (String(data.accountId || "").trim() !== safeAccountId) return null;
    const contactId = String(data.contactId || "");
    if (contactId) {
      aliasCache.set(cacheKey, contactId);
      return contactId;
    }
    return null;
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) return null;
    throw err;
  }
}

export async function recordContactAlias(
  accountId: string,
  aliasKey: string,
  contactId: string
): Promise<void> {
  const safeAccountId = String(accountId || "").trim();
  const safeAlias = String(aliasKey || "").trim().toLowerCase();
  const safeContactId = String(contactId || "").trim();
  if (!safeAccountId || !safeAlias || !safeContactId) return;

  const docId = buildAliasDocId(safeAccountId, safeAlias);
  const now = personalContactStorageDeps.now();
  const payload = { accountId: safeAccountId, aliasKey: safeAlias, contactId: safeContactId };
  const serialized = JSON.stringify(payload);

  try {
    await personalContactStorageDeps.updateDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId,
      { value: serialized, updated_at: now }
    );
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) {
      await personalContactStorageDeps.createDocument(
        personalContactStorageDeps.DATABASE_ID,
        personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        docId,
        { value: serialized, updated_at: now }
      );
    } else {
      throw err;
    }
  }

  aliasCache.set(`${safeAccountId}:${safeAlias}`, safeContactId);
}

export async function removeContactAlias(accountId: string, aliasKey: string): Promise<void> {
  const safeAccountId = String(accountId || "").trim();
  const safeAlias = String(aliasKey || "").trim().toLowerCase();
  if (!safeAccountId || !safeAlias) return;

  const docId = buildAliasDocId(safeAccountId, safeAlias);
  try {
    await personalContactStorageDeps.deleteDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
  } catch (err: any) {
    if (err?.code !== 404 && err?.status !== 404) throw err;
  }
  aliasCache.delete(`${safeAccountId}:${safeAlias}`);
}

export async function listPersonalContactIds(accountId: string): Promise<string[]> {
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) return [];

  if (indexCache.has(safeAccountId)) {
    return [...(indexCache.get(safeAccountId) || [])];
  }

  const docId = buildTenantIndexDocId(safeAccountId);
  try {
    const doc: any = await personalContactStorageDeps.getDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
    if (!doc?.value) return [];
    const data = JSON.parse(doc.value);
    const ids: string[] = Array.isArray(data.contactIds) ? data.contactIds : [];
    indexCache.set(safeAccountId, ids);
    return ids;
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) return [];
    throw err;
  }
}

export async function recordPersonalContactIndex(
  accountId: string,
  contactId: string,
  action: "add" | "remove"
): Promise<void> {
  const safeAccountId = String(accountId || "").trim();
  const safeContactId = String(contactId || "").trim();
  if (!safeAccountId || !safeContactId) return;

  const existingIds = await listPersonalContactIds(safeAccountId);
  let updatedIds: string[];
  if (action === "add") {
    if (existingIds.includes(safeContactId)) return;
    updatedIds = [...existingIds, safeContactId];
  } else {
    updatedIds = existingIds.filter((id) => id !== safeContactId);
  }

  const docId = buildTenantIndexDocId(safeAccountId);
  const now = personalContactStorageDeps.now();
  const serialized = JSON.stringify({ contactIds: updatedIds, updatedAt: now });

  try {
    await personalContactStorageDeps.updateDocument(
      personalContactStorageDeps.DATABASE_ID,
      personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId,
      { value: serialized, updated_at: now }
    );
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) {
      await personalContactStorageDeps.createDocument(
        personalContactStorageDeps.DATABASE_ID,
        personalContactStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        docId,
        { value: serialized, updated_at: now }
      );
    } else {
      throw err;
    }
  }

  indexCache.set(safeAccountId, updatedIds);
}
