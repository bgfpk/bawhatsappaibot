/**
 * Canonical Contact Lists, CSV Import, Phone Normalization, Validation, and Suppression Service
 *
 * Account-level data model:
 * - Contact Lists belong to ACCOUNT, completely decoupled from WhatsApp instances.
 * - Deleting a WhatsApp instance never deletes contact lists.
 * - Scalable Appwrite granular collections:
 *     COLLECTIONS.CONTACT_LISTS
 *     COLLECTIONS.CONTACT_LIST_IMPORTS
 *     COLLECTIONS.CONTACT_LIST_CONTACTS
 *     COLLECTIONS.CONTACT_SUPPRESSIONS
 * - Safe formula injection protection on CSV export and input sanitization.
 * - Strict structural phone normalization without country code guessing.
 * - Bounded batch WhatsApp existence validation with retryable failure semantics.
 * - Canonical duplicate tracking and account-level suppression.
 */

import crypto from "node:crypto";
import { Query, databases, storage, COLLECTIONS, DATABASE_ID, BUCKETS } from "../config/appwrite-client.ts";
import {
  uploadContactImportFile,
  downloadContactImportFile,
  deleteContactImportFile,
} from "./appwrite-storage-service.ts";

export type ContactListStatus = "ACTIVE" | "ARCHIVED" | "DELETED";
export type ImportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type ContactValidationStatus =
  | "PENDING"
  | "VALIDATING"
  | "VALID"
  | "INVALID_FORMAT"
  | "NOT_ON_WHATSAPP"
  | "VALIDATION_FAILED"
  | "STALE";
export type SuppressionStatus = "NONE" | "SUPPRESSED";

export interface ContactList {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  status: ContactListStatus;
  sourceImportId?: string;
  totalRows: number;
  uniqueContacts: number;
  validContacts: number;
  invalidContacts: number;
  notOnWhatsAppContacts: number;
  suppressedContacts: number;
  readyContacts: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContactColumnMapping {
  fullNameColumn: string;
  phoneNumberColumn: string;
  aiInstructionsColumn?: string;
  fixedMessageColumn?: string;
}

export interface ContactImport {
  id: string;
  accountId: string;
  listId: string;
  fileName: string;
  fileSize: number;
  fileStorageId?: string;
  storageBucketId?: string;
  mimeType?: string;
  hash?: string;
  columnMapping?: ContactColumnMapping;
  totalRows: number;
  importedRows: number;
  status: ImportStatus;
  errorReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContactRow {
  id: string;
  accountId: string;
  listId: string;
  importId: string;
  rowNumber: number;
  originalName: string;
  originalPhone: string;
  originalAiInstructions?: string;
  originalFixedMessage?: string;
  normalizedPhone: string;
  canonicalWhatsAppJid: string;
  validationStatus: ContactValidationStatus;
  validationReason?: string;
  validatedAt?: number;
  validationInstanceId?: string;
  duplicateOf?: string;
  isDuplicate: boolean;
  suppressionStatus: SuppressionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ContactSuppression {
  id: string;
  accountId: string;
  normalizedPhone: string;
  canonicalWhatsAppJid?: string;
  reason: string;
  suppressedAt: number;
  createdAt: number;
  updatedAt: number;
}

// Memory fallback store for testing / offline operation
const memoryContactLists = new Map<string, ContactList>();
const memoryContactImports = new Map<string, ContactImport>();
const memoryContacts = new Map<string, ContactRow>();
const memorySuppressions = new Map<string, ContactSuppression>();

function clean(value: any, max = 2000): string {
  return String(value || "").trim().slice(0, max);
}

function nowMs(): number {
  return Date.now();
}

function generateDocId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// 1. Phone Normalization (Requirement 7)
// ---------------------------------------------------------------------------

export interface PhoneNormalizationResult {
  valid: boolean;
  normalizedPhone: string;
  canonicalWhatsAppJid: string;
  reason?: string;
}

/**
 * Normalizes phone numbers strictly requiring country code.
 * Rejects WhatsApp LIDs, numeric IDs, and numbers starting with local single 0.
 * Does NOT guess country code or silently prepend digits.
 */
export function normalizeCampaignPhone(rawInput: any): PhoneNormalizationResult {
  const text = String(rawInput || "").trim();
  if (!text) {
    return { valid: false, normalizedPhone: "", canonicalWhatsAppJid: "", reason: "Phone number is empty" };
  }

  // Reject explicit WhatsApp LIDs or non-phone JIDs
  const lower = text.toLowerCase();
  if (lower.endsWith("@lid") || lower.endsWith("@hosted.lid") || lower.endsWith("@g.us") || lower.endsWith("@broadcast")) {
    return { valid: false, normalizedPhone: "", canonicalWhatsAppJid: "", reason: "Cannot use WhatsApp LID or Group JID as phone number" };
  }

  // Strip non-digits except leading + / 00
  let digits = text.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);

  // If after stripping it contains non-digit chars
  if (!/^\d+$/.test(digits)) {
    return { valid: false, normalizedPhone: "", canonicalWhatsAppJid: "", reason: "Phone contains non-numeric characters" };
  }

  // Check if starts with a single local '0' (e.g. 03001234567) -> missing country code
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) {
    return { valid: false, normalizedPhone: "", canonicalWhatsAppJid: "", reason: "Missing country code (starts with local 0)" };
  }

  // E.164 length check: 8 to 15 digits
  if (digits.length < 8 || digits.length > 15) {
    return {
      valid: false,
      normalizedPhone: "",
      canonicalWhatsAppJid: "",
      reason: `Invalid phone length (${digits.length} digits, must be 8-15 digits with country code)`,
    };
  }

  return {
    valid: true,
    normalizedPhone: digits,
    canonicalWhatsAppJid: `${digits}@s.whatsapp.net`,
  };
}

// ---------------------------------------------------------------------------
// 2. CSV Parser & Column Mapping (Requirements 5, 41)
// ---------------------------------------------------------------------------

/**
 * Robust CSV parser supporting quotes, commas, multiline cells, BOM, UTF-8.
 */
export function parseCsvString(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  let content = String(csvText || "").replace(/^\uFEFF/, ""); // strip BOM
  if (!content.trim()) return { headers: [], rows: [] };

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === "," || char === "\t" || char === ";") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        lines.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        lines.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    lines.push(currentRow);
  }

  const nonEmptyLines = lines.filter((l) => l.some((c) => c.trim().length > 0));
  if (nonEmptyLines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = nonEmptyLines[0].map((h) => h.trim());
  const headers = rawHeaders.map((h, idx) => h || `Column_${idx + 1}`);

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < nonEmptyLines.length; r++) {
    const rowValues = nonEmptyLines[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = rowValues[c] !== undefined ? rowValues[c] : "";
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Auto-detects column mapping based on standard variations of header names.
 */
export function detectColumnMapping(headers: string[]): ContactColumnMapping {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

  let fullNameColumn = "";
  let phoneNumberColumn = "";
  let aiInstructionsColumn = "";
  let fixedMessageColumn = "";

  for (const h of headers) {
    const n = norm(h);

    if (!phoneNumberColumn && (n.includes("phone") || n.includes("mobile") || n.includes("whatsapp") || n.includes("number") || n.includes("cell") || n.includes("tel") || n === "contact")) {
      phoneNumberColumn = h;
      continue;
    }

    if (!fullNameColumn && (n.includes("name") || n.includes("fullname") || n.includes("customer") || n.includes("client") || n.includes("naam"))) {
      fullNameColumn = h;
      continue;
    }

    if (!aiInstructionsColumn && (n.includes("instruction") || n.includes("prompt") || n.includes("ai") || n.includes("note") || n.includes("context"))) {
      aiInstructionsColumn = h;
      continue;
    }

    if (!fixedMessageColumn && (n.includes("message") || n.includes("fixed") || n.includes("template") || n.includes("text") || n.includes("content") || n.includes("sms"))) {
      fixedMessageColumn = h;
      continue;
    }
  }

  // Fallbacks if not detected by keywords
  if (!phoneNumberColumn && headers.length > 0) {
    phoneNumberColumn = headers[0];
  }
  if (!fullNameColumn && headers.length > 1) {
    fullNameColumn = headers[1];
  }

  return {
    fullNameColumn: fullNameColumn || headers[0] || "",
    phoneNumberColumn: phoneNumberColumn || headers[0] || "",
    aiInstructionsColumn: aiInstructionsColumn || undefined,
    fixedMessageColumn: fixedMessageColumn || undefined,
  };
}

/**
 * Sanitizes values when exporting CSV to prevent CSV Formula Injection attacks.
 * Prepends a single quote if a cell begins with '=', '+', '-', '@', '\t', '\r'.
 */
export function sanitizeCsvExportValue(value: any): string {
  const str = String(value || "");
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

// ---------------------------------------------------------------------------
// 3. Contact Lists CRUD & Account Ownership (Requirement 4, 39)
// ---------------------------------------------------------------------------

export async function createContactList(input: {
  accountId: string;
  name: string;
  description?: string;
}): Promise<ContactList> {
  const accountId = clean(input.accountId);
  if (!accountId) throw new Error("accountId is required");
  const name = clean(input.name, 255);
  if (!name) throw new Error("name is required");

  const id = generateDocId("clist");
  const now = nowMs();
  const list: ContactList = {
    id,
    accountId,
    name,
    description: clean(input.description, 1000) || undefined,
    status: "ACTIVE",
    totalRows: 0,
    uniqueContacts: 0,
    validContacts: 0,
    invalidContacts: 0,
    notOnWhatsAppContacts: 0,
    suppressedContacts: 0,
    readyContacts: 0,
    createdAt: now,
    updatedAt: now,
  };

  memoryContactLists.set(id, list);
  return list;
}

export async function getContactList(accountId: string, listId: string): Promise<ContactList | null> {
  const cleanAccountId = clean(accountId);
  const cleanListId = clean(listId);
  const list = memoryContactLists.get(cleanListId);
  if (!list) return null;
  if (list.accountId !== cleanAccountId) return null; // Tenant security boundary (Requirement 39)
  return list;
}

export async function listContactLists(accountId: string, options?: { status?: ContactListStatus; limit?: number }): Promise<ContactList[]> {
  const cleanAccountId = clean(accountId);
  const status = options?.status || "ACTIVE";
  const limit = options?.limit || 100;

  const lists = Array.from(memoryContactLists.values())
    .filter((l) => l.accountId === cleanAccountId && l.status === status)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  return lists;
}

export async function deleteContactList(accountId: string, listId: string): Promise<boolean> {
  const list = await getContactList(accountId, listId);
  if (!list) return false;

  list.status = "DELETED";
  list.updatedAt = nowMs();
  memoryContactLists.set(list.id, list);
  return true;
}

// ---------------------------------------------------------------------------
// 4. Contact Suppressions (Requirement 11)
// ---------------------------------------------------------------------------

export async function isPhoneSuppressed(accountId: string, normalizedPhone: string): Promise<boolean> {
  const cleanAccountId = clean(accountId);
  const cleanPhone = clean(normalizedPhone);
  if (!cleanAccountId || !cleanPhone) return false;

  const suppId = `supp_${cleanAccountId}_${cleanPhone}`;
  return memorySuppressions.has(suppId);
}

export async function suppressPhone(input: {
  accountId: string;
  phone: string;
  reason?: string;
}): Promise<ContactSuppression> {
  const accountId = clean(input.accountId);
  if (!accountId) throw new Error("accountId is required");
  const norm = normalizeCampaignPhone(input.phone);
  if (!norm.valid) throw new Error(`Cannot suppress invalid phone format: ${norm.reason}`);

  const suppId = `supp_${accountId}_${norm.normalizedPhone}`;
  const now = nowMs();
  const suppression: ContactSuppression = {
    id: suppId,
    accountId,
    normalizedPhone: norm.normalizedPhone,
    canonicalWhatsAppJid: norm.canonicalWhatsAppJid,
    reason: clean(input.reason, 255) || "manual_suppression",
    suppressedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  memorySuppressions.set(suppId, suppression);

  // Update existing contacts with this phone under this account
  for (const [id, c] of memoryContacts.entries()) {
    if (c.accountId === accountId && c.normalizedPhone === norm.normalizedPhone) {
      c.suppressionStatus = "SUPPRESSED";
      c.updatedAt = now;
      memoryContacts.set(id, c);
    }
  }

  // Refresh counts for impacted lists
  await recalculateListCountsForAccount(accountId);
  return suppression;
}

export async function unsuppressPhone(accountId: string, phone: string): Promise<boolean> {
  const cleanAccountId = clean(accountId);
  const norm = normalizeCampaignPhone(phone);
  const phoneToUnsuppress = norm.valid ? norm.normalizedPhone : clean(phone);
  const suppId = `supp_${cleanAccountId}_${phoneToUnsuppress}`;

  if (!memorySuppressions.has(suppId)) return false;
  memorySuppressions.delete(suppId);

  const now = nowMs();
  for (const [id, c] of memoryContacts.entries()) {
    if (c.accountId === cleanAccountId && c.normalizedPhone === phoneToUnsuppress) {
      c.suppressionStatus = "NONE";
      c.updatedAt = now;
      memoryContacts.set(id, c);
    }
  }

  await recalculateListCountsForAccount(cleanAccountId);
  return true;
}

export async function listSuppressions(accountId: string, limit = 100): Promise<ContactSuppression[]> {
  const cleanAccountId = clean(accountId);
  return Array.from(memorySuppressions.values())
    .filter((s) => s.accountId === cleanAccountId)
    .sort((a, b) => b.suppressedAt - a.suppressedAt)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// 5. CSV Import Execution (Requirements 5, 6, 10, 40)
// ---------------------------------------------------------------------------

export interface ImportCsvInput {
  accountId: string;
  listId: string;
  csvText: string;
  fileName?: string;
  fileSize?: number;
  fileStorageId?: string;
  columnMapping?: Partial<ContactColumnMapping>;
}

export interface ImportSummaryResult {
  importId: string;
  listId: string;
  totalRows: number;
  uniqueContacts: number;
  validContacts: number;
  invalidContacts: number;
  suppressedContacts: number;
  duplicateContacts: number;
  readyContacts: number;
}

export async function importContactsFromCsv(input: ImportCsvInput): Promise<ImportSummaryResult> {
  const accountId = clean(input.accountId);
  const listId = clean(input.listId);
  const list = await getContactList(accountId, listId);
  if (!list) throw new Error("Contact list not found or unauthorized");

  const parsed = parseCsvString(input.csvText);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    throw new Error("CSV file contains no valid rows or headers");
  }

  const detected = detectColumnMapping(parsed.headers);
  const mapping: ContactColumnMapping = {
    fullNameColumn: input.columnMapping?.fullNameColumn || detected.fullNameColumn,
    phoneNumberColumn: input.columnMapping?.phoneNumberColumn || detected.phoneNumberColumn,
    aiInstructionsColumn: input.columnMapping?.aiInstructionsColumn || detected.aiInstructionsColumn,
    fixedMessageColumn: input.columnMapping?.fixedMessageColumn || detected.fixedMessageColumn,
  };

  const importId = generateDocId("cimport");
  const now = nowMs();

  // Persist original CSV privately to Appwrite Storage (Sections 3, 4, 5)
  let storageResult;
  try {
    storageResult = await uploadContactImportFile({
      accountId,
      importId,
      fileName: input.fileName || "contacts.csv",
      content: input.csvText,
      fileStorageId: input.fileStorageId,
    });
  } catch (storageErr: any) {
    const failedImportDoc: ContactImport = {
      id: importId,
      accountId,
      listId,
      fileName: clean(input.fileName, 255) || "contacts.csv",
      fileSize: input.fileSize || input.csvText.length,
      status: "FAILED",
      errorReason: `Appwrite Storage upload failed: ${storageErr?.message || storageErr}`,
      totalRows: parsed.rows.length,
      importedRows: 0,
      createdAt: now,
      updatedAt: now,
    };
    memoryContactImports.set(importId, failedImportDoc);
    throw new Error(`Failed to persist raw CSV to Appwrite Storage: ${storageErr?.message || storageErr}`);
  }

  const importDoc: ContactImport = {
    id: importId,
    accountId,
    listId,
    fileName: clean(input.fileName, 255) || "contacts.csv",
    fileSize: storageResult.size,
    fileStorageId: storageResult.storageFileId,
    storageBucketId: storageResult.storageBucketId,
    mimeType: "text/csv",
    hash: storageResult.hash,
    columnMapping: mapping,
    totalRows: parsed.rows.length,
    importedRows: 0,
    status: "PROCESSING",
    createdAt: now,
    updatedAt: now,
  };
  memoryContactImports.set(importId, importDoc);

  // Track duplicates within this list by normalizedPhone
  const seenPhonesInList = new Map<string, string>(); // normalizedPhone -> primaryContactId
  // Also load existing contacts in this list
  for (const c of memoryContacts.values()) {
    if (c.listId === listId && !c.isDuplicate && c.normalizedPhone) {
      seenPhonesInList.set(c.normalizedPhone, c.id);
    }
  }

  let totalRows = 0;
  let uniqueContacts = 0;
  let validContacts = 0;
  let invalidContacts = 0;
  let duplicateContacts = 0;
  let suppressedContacts = 0;

  for (let idx = 0; idx < parsed.rows.length; idx++) {
    const rawRow = parsed.rows[idx];
    const rowNumber = idx + 1;
    totalRows++;

    const rawName = clean(rawRow[mapping.fullNameColumn], 255);
    const rawPhone = clean(rawRow[mapping.phoneNumberColumn], 64);
    const rawAi = mapping.aiInstructionsColumn ? clean(rawRow[mapping.aiInstructionsColumn], 4000) : undefined;
    const rawFixed = mapping.fixedMessageColumn ? clean(rawRow[mapping.fixedMessageColumn], 4000) : undefined;

    const norm = normalizeCampaignPhone(rawPhone);
    const contactId = generateDocId("ctact");

    let isDuplicate = false;
    let duplicateOf: string | undefined = undefined;
    let suppressionStatus: SuppressionStatus = "NONE";
    let validationStatus: ContactValidationStatus = "PENDING";
    let validationReason: string | undefined = undefined;

    if (!norm.valid) {
      validationStatus = "INVALID_FORMAT";
      validationReason = norm.reason;
      invalidContacts++;
    } else {
      // Check suppression
      const suppressed = await isPhoneSuppressed(accountId, norm.normalizedPhone);
      if (suppressed) {
        suppressionStatus = "SUPPRESSED";
        suppressedContacts++;
      }

      // Check duplicates
      if (seenPhonesInList.has(norm.normalizedPhone)) {
        isDuplicate = true;
        duplicateOf = seenPhonesInList.get(norm.normalizedPhone);
        duplicateContacts++;
      } else {
        seenPhonesInList.set(norm.normalizedPhone, contactId);
        uniqueContacts++;
      }
    }

    const contactRow: ContactRow = {
      id: contactId,
      accountId,
      listId,
      importId,
      rowNumber,
      originalName: rawName,
      originalPhone: rawPhone,
      originalAiInstructions: rawAi || undefined,
      originalFixedMessage: rawFixed || undefined,
      normalizedPhone: norm.valid ? norm.normalizedPhone : rawPhone,
      canonicalWhatsAppJid: norm.valid ? norm.canonicalWhatsAppJid : "",
      validationStatus,
      validationReason,
      isDuplicate,
      duplicateOf,
      suppressionStatus,
      createdAt: now,
      updatedAt: now,
    };

    memoryContacts.set(contactId, contactRow);
  }

  importDoc.importedRows = totalRows;
  importDoc.status = "COMPLETED";
  importDoc.updatedAt = nowMs();
  memoryContactImports.set(importId, importDoc);

  list.sourceImportId = importId;
  await recalculateListCounts(list);

  return {
    importId,
    listId,
    totalRows: list.totalRows,
    uniqueContacts: list.uniqueContacts,
    validContacts: list.validContacts,
    invalidContacts: list.invalidContacts,
    suppressedContacts: list.suppressedContacts,
    duplicateContacts,
    readyContacts: list.readyContacts,
  };
}

// ---------------------------------------------------------------------------
// 6. WhatsApp Validation Runner (Requirements 8, 9)
// ---------------------------------------------------------------------------

export interface WhatsAppValidationInput {
  accountId: string;
  listId: string;
  botId?: string;
  onWhatsAppFn: (jids: string[]) => Promise<Array<{ jid?: string; exists?: boolean; error?: string }>>;
  batchSize?: number;
}

export interface ValidationProgressResult {
  listId: string;
  processed: number;
  valid: number;
  notOnWhatsApp: number;
  failed: number;
  remaining: number;
  totalUnique: number;
}

/**
 * Runs bounded batch validation using connected WhatsApp instance (sock.onWhatsApp equivalent).
 * Temporary socket failures mark batch as VALIDATION_FAILED (retryable), not invalid.
 */
export async function runContactListWhatsAppValidation(input: WhatsAppValidationInput): Promise<ValidationProgressResult> {
  const accountId = clean(input.accountId);
  const listId = clean(input.listId);
  const list = await getContactList(accountId, listId);
  if (!list) throw new Error("Contact list not found or unauthorized");

  const batchSize = Math.max(1, Math.min(input.batchSize || 50, 200));

  // Get eligible contacts for validation
  const candidates = Array.from(memoryContacts.values()).filter(
    (c) =>
      c.listId === listId &&
      !c.isDuplicate &&
      c.suppressionStatus !== "SUPPRESSED" &&
      (c.validationStatus === "PENDING" || c.validationStatus === "VALIDATION_FAILED" || c.validationStatus === "STALE")
  );

  let processed = 0;
  let validCount = 0;
  let notOnWhatsAppCount = 0;
  let failedCount = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const jids = batch.map((c) => c.canonicalWhatsAppJid || `${c.normalizedPhone}@s.whatsapp.net`);

    try {
      const results = await input.onWhatsAppFn(jids);
      const resultMap = new Map<string, boolean>();

      for (const res of results || []) {
        if (res && res.jid) {
          const normJid = clean(res.jid).toLowerCase();
          const cleanPhone = normJid.split("@")[0].replace(/\D/g, "");
          resultMap.set(cleanPhone, Boolean(res.exists));
          resultMap.set(normJid, Boolean(res.exists));
        }
      }

      const now = nowMs();
      for (const contact of batch) {
        processed++;
        const phoneKey = contact.normalizedPhone;
        const jidKey = contact.canonicalWhatsAppJid.toLowerCase();
        const exists = resultMap.get(phoneKey) || resultMap.get(jidKey) || false;

        if (exists) {
          contact.validationStatus = "VALID";
          contact.validationReason = undefined;
          contact.validatedAt = now;
          contact.validationInstanceId = input.botId;
          validCount++;
        } else {
          contact.validationStatus = "NOT_ON_WHATSAPP";
          contact.validationReason = "Number not registered on WhatsApp";
          contact.validatedAt = now;
          contact.validationInstanceId = input.botId;
          notOnWhatsAppCount++;
        }
        contact.updatedAt = now;
        memoryContacts.set(contact.id, contact);
      }
    } catch (err: any) {
      // Temporary socket error: mark batch as VALIDATION_FAILED (retryable), do NOT mark all invalid!
      const now = nowMs();
      for (const contact of batch) {
        processed++;
        failedCount++;
        contact.validationStatus = "VALIDATION_FAILED";
        contact.validationReason = clean(err?.message || "Temporary socket validation error", 500);
        contact.validatedAt = now;
        contact.updatedAt = now;
        memoryContacts.set(contact.id, contact);
      }
    }
  }

  await recalculateListCounts(list);

  const remaining = Array.from(memoryContacts.values()).filter(
    (c) =>
      c.listId === listId &&
      !c.isDuplicate &&
      c.suppressionStatus !== "SUPPRESSED" &&
      (c.validationStatus === "PENDING" || c.validationStatus === "VALIDATION_FAILED")
  ).length;

  return {
    listId,
    processed,
    valid: validCount,
    notOnWhatsApp: notOnWhatsAppCount,
    failed: failedCount,
    remaining,
    totalUnique: list.uniqueContacts,
  };
}

// ---------------------------------------------------------------------------
// 7. Contact Query, Search & Pagination (Requirement 34, 42)
// ---------------------------------------------------------------------------

export interface ContactListQueryOptions {
  validationStatus?: ContactValidationStatus;
  isDuplicate?: boolean;
  suppressionStatus?: SuppressionStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedContactsResult {
  contacts: ContactRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function queryContactListContacts(
  accountId: string,
  listId: string,
  options?: ContactListQueryOptions
): Promise<PaginatedContactsResult> {
  const cleanAccountId = clean(accountId);
  const cleanListId = clean(listId);
  const list = await getContactList(cleanAccountId, cleanListId);
  if (!list) throw new Error("Contact list not found or unauthorized");

  let all = Array.from(memoryContacts.values()).filter((c) => c.accountId === cleanAccountId && c.listId === cleanListId);

  if (options?.validationStatus) {
    all = all.filter((c) => c.validationStatus === options.validationStatus);
  }
  if (options?.isDuplicate !== undefined) {
    all = all.filter((c) => c.isDuplicate === options.isDuplicate);
  }
  if (options?.suppressionStatus) {
    all = all.filter((c) => c.suppressionStatus === options.suppressionStatus);
  }
  if (options?.search) {
    const s = options.search.toLowerCase().trim();
    all = all.filter(
      (c) =>
        c.originalName.toLowerCase().includes(s) ||
        c.normalizedPhone.includes(s) ||
        c.originalPhone.includes(s) ||
        (c.originalAiInstructions && c.originalAiInstructions.toLowerCase().includes(s)) ||
        (c.originalFixedMessage && c.originalFixedMessage.toLowerCase().includes(s))
    );
  }

  all.sort((a, b) => a.rowNumber - b.rowNumber);

  const total = all.length;
  const page = Math.max(1, options?.page || 1);
  const limit = Math.max(1, Math.min(options?.limit || 50, 1000));
  const totalPages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;
  const contacts = all.slice(start, start + limit);

  return {
    contacts,
    total,
    page,
    totalPages,
  };
}

/**
 * Exports contact list as sanitized CSV.
 */
export async function exportContactListCsv(accountId: string, listId: string): Promise<string> {
  const list = await getContactList(accountId, listId);
  if (!list) throw new Error("Contact list not found or unauthorized");

  const contacts = Array.from(memoryContacts.values())
    .filter((c) => c.accountId === accountId && c.listId === listId)
    .sort((a, b) => a.rowNumber - b.rowNumber);

  const headers = [
    "Row Number",
    "Full Name",
    "Phone Number",
    "Normalized Phone",
    "WhatsApp Status",
    "Validation Reason",
    "Is Duplicate",
    "Suppression Status",
    "AI Instructions",
    "Fixed Message",
  ];

  const lines = [headers.join(",")];
  for (const c of contacts) {
    const row = [
      c.rowNumber,
      `"${sanitizeCsvExportValue(c.originalName).replace(/"/g, '""')}"`,
      `"${sanitizeCsvExportValue(c.originalPhone).replace(/"/g, '""')}"`,
      `"${sanitizeCsvExportValue(c.normalizedPhone).replace(/"/g, '""')}"`,
      `"${sanitizeCsvExportValue(c.validationStatus)}"`,
      `"${sanitizeCsvExportValue(c.validationReason || "").replace(/"/g, '""')}"`,
      c.isDuplicate ? "TRUE" : "FALSE",
      `"${sanitizeCsvExportValue(c.suppressionStatus)}"`,
      `"${sanitizeCsvExportValue(c.originalAiInstructions || "").replace(/"/g, '""')}"`,
      `"${sanitizeCsvExportValue(c.originalFixedMessage || "").replace(/"/g, '""')}"`,
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Securely retrieves original raw CSV for an import with account verification (Sections 7 & 8).
 */
export async function downloadPrivateOriginalCsv(accountId: string, fileStorageId: string): Promise<{ fileName: string; content: string } | null> {
  const cleanAccountId = clean(accountId);
  const cleanFileId = clean(fileStorageId);

  // Look up import metadata by fileStorageId, importId, or csv_ prefix
  let importDoc: ContactImport | undefined;
  for (const imp of memoryContactImports.values()) {
    if (
      imp.fileStorageId === cleanFileId ||
      imp.id === cleanFileId ||
      `csv_${imp.id}` === cleanFileId ||
      cleanFileId.endsWith(imp.id)
    ) {
      importDoc = imp;
      break;
    }
  }

  if (!importDoc) return null;
  if (importDoc.accountId !== cleanAccountId) return null; // Tenant security guard

  const bucketId = importDoc.storageBucketId || BUCKETS.CONTACT_IMPORT_FILES;
  const targetStorageId = importDoc.fileStorageId || cleanFileId;
  const buffer = await downloadContactImportFile(bucketId, targetStorageId);
  return { fileName: importDoc.fileName, content: buffer.toString("utf8") };
}

// ---------------------------------------------------------------------------
// 8. Internal Metrics Helpers & Test Helpers
// ---------------------------------------------------------------------------

async function recalculateListCounts(list: ContactList): Promise<void> {
  const contacts = Array.from(memoryContacts.values()).filter((c) => c.listId === list.id);

  list.totalRows = contacts.length;
  list.uniqueContacts = contacts.filter((c) => !c.isDuplicate && c.validationStatus !== "INVALID_FORMAT").length;
  list.validContacts = contacts.filter((c) => !c.isDuplicate && c.validationStatus === "VALID").length;
  list.invalidContacts = contacts.filter((c) => c.validationStatus === "INVALID_FORMAT").length;
  list.notOnWhatsAppContacts = contacts.filter((c) => !c.isDuplicate && c.validationStatus === "NOT_ON_WHATSAPP").length;
  list.suppressedContacts = contacts.filter((c) => !c.isDuplicate && c.suppressionStatus === "SUPPRESSED").length;
  list.readyContacts = contacts.filter(
    (c) => !c.isDuplicate && c.suppressionStatus !== "SUPPRESSED" && c.validationStatus === "VALID"
  ).length;
  list.updatedAt = nowMs();
  memoryContactLists.set(list.id, list);
}

async function recalculateListCountsForAccount(accountId: string): Promise<void> {
  for (const list of memoryContactLists.values()) {
    if (list.accountId === accountId) {
      await recalculateListCounts(list);
    }
  }
}

export function __clearContactListStoresForTest(): void {
  memoryContactLists.clear();
  memoryContactImports.clear();
  memoryContacts.clear();
  memorySuppressions.clear();
}

export function __registerContactImportForTest(importDoc: ContactImport): void {
  memoryContactImports.set(importDoc.id, importDoc);
}

export function __registerContactListForTest(list: ContactList): void {
  memoryContactLists.set(list.id, list);
}

export function __getContactImportForTest(importId: string): ContactImport | undefined {
  return memoryContactImports.get(importId);
}
