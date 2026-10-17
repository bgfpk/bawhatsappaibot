import crypto from "node:crypto";
import {
  type Owner360Profile,
  type OwnerAddress,
  type OwnerContactMethod,
  type OwnerCustomFact,
  type OwnerDataPrivacyPolicy,
  type OwnerDataProvenance,
  type OwnerIdentity,
  type SafeOwnerTaskContext,
  OWNER_PROFILE_SCHEMA_VERSION,
  DEFAULT_OWNER_DATA_PRIVACY_POLICY,
  Owner360Error,
} from "./owner360-types.ts";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";

// ---------------------------------------------------------------------------
// 1. BLOCKED CREDENTIAL CATEGORIES (Prompt 2 Requirement 13)
// ---------------------------------------------------------------------------
const BLOCKED_SECRET_PATTERNS = [
  "password",
  "passcode",
  "pin",
  "otp",
  "cvv",
  "cvc",
  "card_security_code",
  "security_code",
  "api_key",
  "apikey",
  "secret",
  "auth_token",
  "access_token",
  "refresh_token",
  "oauth_token",
  "authentication_code",
  "auth_code",
  "private_key",
  "bank_login",
  "credit_card",
  "debit_card",
];

export function isBlockedSecretKeyOrCategory(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const pattern of BLOCKED_SECRET_PATTERNS) {
    const cleanPattern = pattern.replace(/[^a-z0-9]/g, "");
    if (normalized.includes(cleanPattern)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 2. PRIVACY NORMALIZATION & POLICY CHECKS (Prompt 2 Requirements 14 & 15)
// ---------------------------------------------------------------------------
export function normalizePrivacyPolicy(raw: any): OwnerDataPrivacyPolicy {
  if (typeof raw === "string") {
    const trimmed = raw.trim().toUpperCase();
    if (trimmed === "ASK_BEFORE_SHARE" || trimmed === "ASK_ME_BEFORE_SHARING" || trimmed === "ASK") {
      return "ASK_BEFORE_SHARE";
    }
    if (
      trimmed === "ALLOW_FOR_AUTHORIZED_TASK" ||
      trimmed === "AUTHORIZED_TASK" ||
      trimmed === "ALLOW" ||
      trimmed === "AUTHORIZED"
    ) {
      return "ALLOW_FOR_AUTHORIZED_TASK";
    }
    if (trimmed === "PRIVATE") {
      return "PRIVATE";
    }
  }
  // Deny by default: missing or unknown value -> PRIVATE
  return DEFAULT_OWNER_DATA_PRIVACY_POLICY;
}

// ---------------------------------------------------------------------------
// 3. TIMEZONE VALIDATION (Prompt 2 Requirement 8)
// ---------------------------------------------------------------------------
export function validateTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  const trimmed = tz.trim();
  // Reject ambiguous / non-IANA labels
  if (trimmed.toLowerCase().includes("time") && !trimmed.includes("/")) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 4. ADDRESS VALIDATION (Prompt 2 Requirement 7)
// ---------------------------------------------------------------------------
export function validateAddress(address: Partial<OwnerAddress>): void {
  if (!address.label || !address.label.trim()) {
    throw new Owner360Error("Address label is required (e.g. Home, Office)", "INVALID_ADDRESS", 400);
  }
  if (!address.addressLine1 || !address.addressLine1.trim()) {
    throw new Owner360Error("Address line 1 is required", "INVALID_ADDRESS", 400);
  }
  if (!address.city || !address.city.trim()) {
    throw new Owner360Error("City is required", "INVALID_ADDRESS", 400);
  }
  if (!address.country || !address.country.trim()) {
    throw new Owner360Error("Country is required", "INVALID_ADDRESS", 400);
  }
}

// ---------------------------------------------------------------------------
// 5. STORAGE DOC ID BUILDER (Prompt 2 Requirement 19)
// ---------------------------------------------------------------------------
export function buildOwnerProfileDocId(accountId: string): string {
  const clean = String(accountId || "").replace(/[^a-zA-Z0-9_]/g, "_");
  if (clean.length > 0 && clean.length <= 20) {
    return `owner360_${clean}`;
  }
  const hash = crypto.createHash("sha256").update(String(accountId || "")).digest("hex").substring(0, 18);
  return `owner360_${clean.substring(0, 8)}_${hash}`;
}

// ---------------------------------------------------------------------------
// 6. DEFAULT OWNER360 PROFILE FACTORY (Prompt 2 Requirement 4)
// ---------------------------------------------------------------------------
export function createDefaultOwner360Profile(accountId: string): Owner360Profile {
  const now = Date.now();
  return {
    schemaVersion: OWNER_PROFILE_SCHEMA_VERSION,
    revision: 1,
    accountId,
    createdAt: now,
    updatedAt: now,
    identity: {
      privacyPolicy: "PRIVATE",
      source: "system",
    },
    contactMethods: [],
    addresses: [],
    locale: {
      timezone: "UTC",
      locale: "en-US",
      preferredLanguages: ["en"],
      defaultCurrency: "USD",
    },
    communicationPreferences: {
      formality: "neutral",
      tone: "professional",
      brevity: "balanced",
      useEmojis: true,
      allowVoiceNotes: false,
    },
    assistantRepresentation: {
      assistantDisplayName: "Personal Assistant",
      identityDisclosure: "always_disclose_ai",
    },
    availabilityPreferences: {
      preferredMeetingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      preferredMeetingWindows: [{ start: "09:00", end: "17:00" }],
      minimumNoticeHours: 24,
      defaultMeetingDurationMinutes: 30,
      preferredMeetingFormat: "google_meet",
      bufferMinutes: 15,
    },
    commercePreferences: {
      preferredCurrency: "USD",
      deliveryPreference: "standard",
    },
    customFacts: [],
  };
}

// ---------------------------------------------------------------------------
// 7. PLUGGABLE DEPENDENCIES (for unit testing and live Appwrite)
// ---------------------------------------------------------------------------
export interface Owner360ServiceDeps {
  getDocument: (databaseId: string, collectionId: string, documentId: string) => Promise<any>;
  createDocument: (databaseId: string, collectionId: string, documentId: string, data: any) => Promise<any>;
  updateDocument: (databaseId: string, collectionId: string, documentId: string, data: any) => Promise<any>;
  deleteDocument: (databaseId: string, collectionId: string, documentId: string) => Promise<any>;
}

export const owner360Deps: Owner360ServiceDeps = {
  getDocument: (dbId, collId, docId) => databases.getDocument(dbId, collId, docId),
  createDocument: (dbId, collId, docId, data) => databases.createDocument(dbId, collId, docId, data),
  updateDocument: (dbId, collId, docId, data) => databases.updateDocument(dbId, collId, docId, data),
  deleteDocument: (dbId, collId, docId) => databases.deleteDocument(dbId, collId, docId),
};

// In-memory caching for performance with write-through invalidation
const OWNER_PROFILE_CACHE = new Map<string, { profile: Owner360Profile; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

function getCachedProfile(accountId: string): Owner360Profile | null {
  const hit = OWNER_PROFILE_CACHE.get(accountId);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
    OWNER_PROFILE_CACHE.delete(accountId);
    return null;
  }
  return JSON.parse(JSON.stringify(hit.profile));
}

function setCachedProfile(accountId: string, profile: Owner360Profile): void {
  OWNER_PROFILE_CACHE.set(accountId, {
    profile: JSON.parse(JSON.stringify(profile)),
    cachedAt: Date.now(),
  });
}

export function invalidateOwnerProfileCache(accountId?: string): void {
  if (accountId) {
    OWNER_PROFILE_CACHE.delete(accountId);
  } else {
    OWNER_PROFILE_CACHE.clear();
  }
}

// ---------------------------------------------------------------------------
// 8. CORE CRUD OPERATIONS (Prompt 2 Requirements 17, 18, 20)
// ---------------------------------------------------------------------------

/**
 * Retrieves the canonical Owner360 profile for an account.
 * Creates and returns default profile if not yet persisted.
 */
export async function getOwnerProfile(accountId: string): Promise<Owner360Profile> {
  if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
    throw new Owner360Error("Account ID is required to access Owner360 profile", "FORBIDDEN", 400);
  }

  const cached = getCachedProfile(accountId);
  if (cached) {
    return cached;
  }

  const docId = buildOwnerProfileDocId(accountId);
  try {
    const doc = await owner360Deps.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId);
    if (doc?.value) {
      const parsed = JSON.parse(doc.value);
      // Ensure canonical structure and deny-by-default fields
      const normalized = reconcileOwnerProfileStructure(accountId, parsed);
      setCachedProfile(accountId, normalized);
      return normalized;
    }
  } catch (e: any) {
    // 404 or missing doc -> return newly initialized default
  }

  const defaultProfile = createDefaultOwner360Profile(accountId);
  setCachedProfile(accountId, defaultProfile);
  return defaultProfile;
}

/**
 * Reconciles and ensures all nested properties, privacy defaults, and types are safe.
 */
function reconcileOwnerProfileStructure(accountId: string, raw: any): Owner360Profile {
  const base = createDefaultOwner360Profile(accountId);
  if (!raw || typeof raw !== "object") return base;

  return {
    schemaVersion: Number(raw.schemaVersion || base.schemaVersion),
    revision: Number(raw.revision || base.revision),
    accountId,
    createdAt: Number(raw.createdAt || base.createdAt),
    updatedAt: Number(raw.updatedAt || base.updatedAt),
    identity: {
      preferredName: raw.identity?.preferredName || undefined,
      fullName: raw.identity?.fullName || undefined,
      title: raw.identity?.title || undefined,
      preferredReference: raw.identity?.preferredReference || undefined,
      source: raw.identity?.source || base.identity.source,
      privacyPolicy: normalizePrivacyPolicy(raw.identity?.privacyPolicy),
    },
    contactMethods: Array.isArray(raw.contactMethods)
      ? raw.contactMethods.map((c: any) => ({
          id: String(c.id || crypto.randomUUID()),
          type: c.type === "phone" ? "phone" : "email",
          label: String(c.label || "Personal"),
          value: String(c.value || ""),
          verified: Boolean(c.verified),
          source: c.source || "owner_dashboard",
          privacyPolicy: normalizePrivacyPolicy(c.privacyPolicy),
          isDefault: Boolean(c.isDefault),
        }))
      : [],
    addresses: Array.isArray(raw.addresses)
      ? raw.addresses.map((a: any) => ({
          id: String(a.id || crypto.randomUUID()),
          label: String(a.label || "Home"),
          recipientName: a.recipientName || undefined,
          addressLine1: String(a.addressLine1 || ""),
          addressLine2: a.addressLine2 || undefined,
          city: String(a.city || ""),
          region: a.region || undefined,
          postalCode: a.postalCode || undefined,
          country: String(a.country || "Pakistan"),
          deliveryInstructions: a.deliveryInstructions || undefined,
          isDefault: Boolean(a.isDefault),
          privacyPolicy: normalizePrivacyPolicy(a.privacyPolicy),
          source: a.source || "owner_dashboard",
        }))
      : [],
    locale: {
      timezone: validateTimezone(raw.locale?.timezone) ? raw.locale.timezone : base.locale.timezone,
      locale: String(raw.locale?.locale || base.locale.locale),
      preferredLanguages: Array.isArray(raw.locale?.preferredLanguages)
        ? raw.locale.preferredLanguages.map(String)
        : base.locale.preferredLanguages,
      defaultCurrency: String(raw.locale?.defaultCurrency || base.locale.defaultCurrency).toUpperCase(),
    },
    communicationPreferences: {
      formality: ["formal", "neutral", "casual"].includes(raw.communicationPreferences?.formality)
        ? raw.communicationPreferences.formality
        : base.communicationPreferences.formality,
      tone: String(raw.communicationPreferences?.tone || base.communicationPreferences.tone),
      brevity: ["concise", "balanced", "detailed"].includes(raw.communicationPreferences?.brevity)
        ? raw.communicationPreferences.brevity
        : base.communicationPreferences.brevity,
      preferredGreeting: raw.communicationPreferences?.preferredGreeting || undefined,
      preferredSignoff: raw.communicationPreferences?.preferredSignoff || undefined,
      useEmojis: raw.communicationPreferences?.useEmojis !== undefined ? Boolean(raw.communicationPreferences.useEmojis) : true,
      allowVoiceNotes: Boolean(raw.communicationPreferences?.allowVoiceNotes),
      assistantOwnerReference: raw.communicationPreferences?.assistantOwnerReference || undefined,
    },
    assistantRepresentation: {
      assistantDisplayName: String(
        raw.assistantRepresentation?.assistantDisplayName || base.assistantRepresentation.assistantDisplayName
      ),
      identityDisclosure: ["always_disclose_ai", "disclose_as_assistant", "transparent"].includes(
        raw.assistantRepresentation?.identityDisclosure
      )
        ? raw.assistantRepresentation.identityDisclosure
        : base.assistantRepresentation.identityDisclosure,
    },
    availabilityPreferences: {
      preferredMeetingDays: Array.isArray(raw.availabilityPreferences?.preferredMeetingDays)
        ? raw.availabilityPreferences.preferredMeetingDays.map(String)
        : base.availabilityPreferences.preferredMeetingDays,
      preferredMeetingWindows: Array.isArray(raw.availabilityPreferences?.preferredMeetingWindows)
        ? raw.availabilityPreferences.preferredMeetingWindows
        : base.availabilityPreferences.preferredMeetingWindows,
      minimumNoticeHours: Number(raw.availabilityPreferences?.minimumNoticeHours ?? base.availabilityPreferences.minimumNoticeHours),
      defaultMeetingDurationMinutes: Number(
        raw.availabilityPreferences?.defaultMeetingDurationMinutes ?? base.availabilityPreferences.defaultMeetingDurationMinutes
      ),
      preferredMeetingFormat: ["google_meet", "zoom", "in_person", "phone"].includes(
        raw.availabilityPreferences?.preferredMeetingFormat
      )
        ? raw.availabilityPreferences.preferredMeetingFormat
        : base.availabilityPreferences.preferredMeetingFormat,
      bufferMinutes: Number(raw.availabilityPreferences?.bufferMinutes ?? base.availabilityPreferences.bufferMinutes),
    },
    commercePreferences: {
      preferredCurrency: raw.commercePreferences?.preferredCurrency || base.commercePreferences.preferredCurrency,
      deliveryPreference: raw.commercePreferences?.deliveryPreference || base.commercePreferences.deliveryPreference,
      budgetPreference: raw.commercePreferences?.budgetPreference || undefined,
      preferredContactMethod: raw.commercePreferences?.preferredContactMethod || undefined,
      preferredDeliveryAddressId: raw.commercePreferences?.preferredDeliveryAddressId || undefined,
      allowedDeliveryWindows: Array.isArray(raw.commercePreferences?.allowedDeliveryWindows)
        ? raw.commercePreferences.allowedDeliveryWindows
        : undefined,
      paymentPreference: raw.commercePreferences?.paymentPreference || undefined,
    },
    customFacts: Array.isArray(raw.customFacts)
      ? raw.customFacts
          .filter(
            (f: any) =>
              !isBlockedSecretKeyOrCategory(f.label) &&
              !isBlockedSecretKeyOrCategory(f.category) &&
              !isBlockedSecretKeyOrCategory(f.value)
          )
          .map((f: any) => ({
            factId: String(f.factId || crypto.randomUUID()),
            label: String(f.label || ""),
            category: String(f.category || "general"),
            value: String(f.value || ""),
            privacyPolicy: normalizePrivacyPolicy(f.privacyPolicy),
            source: f.source || "owner_dashboard",
            createdAt: Number(f.createdAt || Date.now()),
            updatedAt: Number(f.updatedAt || Date.now()),
          }))
      : [],
  };
}

/**
 * Saves or updates an Owner360 profile with optimistic concurrency protection.
 */
export async function saveOwnerProfile(
  profile: Owner360Profile,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const accountId = profile.accountId;
  if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
    throw new Owner360Error("Valid accountId required on profile", "FORBIDDEN", 400);
  }

  // Load existing profile to check revision and preserve audit
  const existing = await getOwnerProfile(accountId);

  // Optimistic concurrency check
  if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
    throw new Owner360Error(
      `Profile was modified by another action. Current revision: ${existing.revision}, expected: ${expectedRevision}`,
      "REVISION_CONFLICT",
      409,
      { currentRevision: existing.revision, expectedRevision }
    );
  }

  // Validate locale / timezone
  if (profile.locale?.timezone && !validateTimezone(profile.locale.timezone)) {
    throw new Owner360Error(
      `Invalid IANA timezone "${profile.locale.timezone}". Please use standard timezone names (e.g. Asia/Karachi, America/New_York)`,
      "INVALID_TIMEZONE",
      400
    );
  }

  // Normalize currency to uppercase ISO code
  if (profile.locale?.defaultCurrency) {
    profile.locale.defaultCurrency = String(profile.locale.defaultCurrency).trim().toUpperCase();
  }

  // Validate addresses & enforce single default
  if (Array.isArray(profile.addresses)) {
    let defaultCount = 0;
    for (const addr of profile.addresses) {
      validateAddress(addr);
      if (addr.isDefault) {
        defaultCount++;
      }
    }
    if (defaultCount > 1) {
      throw new Owner360Error("Only one default address is allowed", "INVALID_ADDRESS", 400);
    }
  }

  // Validate custom facts against blocked credential categories
  if (Array.isArray(profile.customFacts)) {
    for (const fact of profile.customFacts) {
      if (
        isBlockedSecretKeyOrCategory(fact.label) ||
        isBlockedSecretKeyOrCategory(fact.category) ||
        isBlockedSecretKeyOrCategory(fact.value)
      ) {
        throw new Owner360Error(
          `Storing sensitive credentials (passwords, PINs, OTPs, CVV, API keys) in custom facts is strictly prohibited.`,
          "SENSITIVE_SECRET_NOT_ALLOWED",
          400
        );
      }
    }
  }

  // Increment revision and timestamp
  const nextRevision = existing.revision + 1;
  const now = Date.now();

  const prepared: Owner360Profile = {
    ...profile,
    schemaVersion: OWNER_PROFILE_SCHEMA_VERSION,
    revision: nextRevision,
    accountId,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  const docId = buildOwnerProfileDocId(accountId);
  const data = {
    value: JSON.stringify(prepared),
    updated_at: now,
  };

  try {
    await owner360Deps.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, data);
  } catch (e: any) {
    if (e?.code === 404 || Number(e?.status || 0) === 404) {
      await owner360Deps.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, data);
    } else {
      throw e;
    }
  }

  setCachedProfile(accountId, prepared);
  return prepared;
}

/**
 * Updates partial fields on an Owner360 profile.
 */
export async function updateOwnerProfile(
  accountId: string,
  patch: Partial<Owner360Profile>,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);

  const updated: Owner360Profile = {
    ...current,
    identity: patch.identity ? { ...current.identity, ...patch.identity } : current.identity,
    contactMethods: patch.contactMethods !== undefined ? patch.contactMethods : current.contactMethods,
    addresses: patch.addresses !== undefined ? patch.addresses : current.addresses,
    locale: patch.locale ? { ...current.locale, ...patch.locale } : current.locale,
    communicationPreferences: patch.communicationPreferences
      ? { ...current.communicationPreferences, ...patch.communicationPreferences }
      : current.communicationPreferences,
    assistantRepresentation: patch.assistantRepresentation
      ? { ...current.assistantRepresentation, ...patch.assistantRepresentation }
      : current.assistantRepresentation,
    availabilityPreferences: patch.availabilityPreferences
      ? { ...current.availabilityPreferences, ...patch.availabilityPreferences }
      : current.availabilityPreferences,
    commercePreferences: patch.commercePreferences
      ? { ...current.commercePreferences, ...patch.commercePreferences }
      : current.commercePreferences,
    customFacts: patch.customFacts !== undefined ? patch.customFacts : current.customFacts,
  };

  return await saveOwnerProfile(updated, expectedRevision);
}

/**
 * Sets identity fields (preferredName, fullName, title, preferredReference).
 */
export async function setOwnerIdentity(
  accountId: string,
  identity: Partial<OwnerIdentity>,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const mergedIdentity: OwnerIdentity = {
    ...current.identity,
    ...identity,
    privacyPolicy: identity.privacyPolicy ? normalizePrivacyPolicy(identity.privacyPolicy) : current.identity.privacyPolicy,
    source: identity.source || current.identity.source || "owner_dashboard",
  };
  return await updateOwnerProfile(accountId, { identity: mergedIdentity }, expectedRevision);
}

/**
 * Adds a contact method (email or phone).
 */
export async function addOwnerContactMethod(
  accountId: string,
  contact: Omit<OwnerContactMethod, "id">,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const newId = crypto.randomUUID();

  let methods = [...current.contactMethods];
  if (contact.isDefault) {
    methods = methods.map((m) => (m.type === contact.type ? { ...m, isDefault: false } : m));
  }

  const newMethod: OwnerContactMethod = {
    id: newId,
    type: contact.type,
    label: contact.label.trim(),
    value: contact.value.trim(),
    verified: Boolean(contact.verified),
    source: contact.source || "owner_dashboard",
    privacyPolicy: normalizePrivacyPolicy(contact.privacyPolicy),
    isDefault: Boolean(contact.isDefault),
  };

  methods.push(newMethod);
  return await updateOwnerProfile(accountId, { contactMethods: methods }, expectedRevision);
}

/**
 * Updates an existing contact method.
 */
export async function updateOwnerContactMethod(
  accountId: string,
  contactId: string,
  patch: Partial<OwnerContactMethod>,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const existingIndex = current.contactMethods.findIndex((m) => m.id === contactId);
  if (existingIndex === -1) {
    throw new Owner360Error(`Contact method not found: ${contactId}`, "OWNER_PROFILE_NOT_FOUND", 404);
  }

  let methods = [...current.contactMethods];
  const target = methods[existingIndex];

  if (patch.isDefault && !target.isDefault) {
    methods = methods.map((m) => (m.type === target.type ? { ...m, isDefault: false } : m));
  }

  methods[existingIndex] = {
    ...target,
    ...patch,
    label: patch.label ? patch.label.trim() : target.label,
    value: patch.value ? patch.value.trim() : target.value,
    privacyPolicy: patch.privacyPolicy ? normalizePrivacyPolicy(patch.privacyPolicy) : target.privacyPolicy,
  };

  return await updateOwnerProfile(accountId, { contactMethods: methods }, expectedRevision);
}

/**
 * Removes a contact method.
 */
export async function removeOwnerContactMethod(
  accountId: string,
  contactId: string,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const filtered = current.contactMethods.filter((m) => m.id !== contactId);
  return await updateOwnerProfile(accountId, { contactMethods: filtered }, expectedRevision);
}

/**
 * Adds an address.
 */
export async function addOwnerAddress(
  accountId: string,
  address: Omit<OwnerAddress, "id">,
  expectedRevision?: number
): Promise<Owner360Profile> {
  validateAddress(address);
  const current = await getOwnerProfile(accountId);
  const newId = crypto.randomUUID();

  let addresses = [...current.addresses];
  if (address.isDefault) {
    addresses = addresses.map((a) => ({ ...a, isDefault: false }));
  }

  const newAddress: OwnerAddress = {
    id: newId,
    label: address.label.trim(),
    recipientName: address.recipientName?.trim(),
    addressLine1: address.addressLine1.trim(),
    addressLine2: address.addressLine2?.trim(),
    city: address.city.trim(),
    region: address.region?.trim(),
    postalCode: address.postalCode?.trim(),
    country: address.country.trim(),
    deliveryInstructions: address.deliveryInstructions?.trim(),
    isDefault: Boolean(address.isDefault || addresses.length === 0), // Default to true if first address
    privacyPolicy: normalizePrivacyPolicy(address.privacyPolicy),
    source: address.source || "owner_dashboard",
  };

  addresses.push(newAddress);
  return await updateOwnerProfile(accountId, { addresses }, expectedRevision);
}

/**
 * Updates an address.
 */
export async function updateOwnerAddress(
  accountId: string,
  addressId: string,
  patch: Partial<OwnerAddress>,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const index = current.addresses.findIndex((a) => a.id === addressId);
  if (index === -1) {
    throw new Owner360Error(`Address not found: ${addressId}`, "OWNER_PROFILE_NOT_FOUND", 404);
  }

  let addresses = [...current.addresses];
  const target = addresses[index];

  if (patch.isDefault) {
    addresses = addresses.map((a) => ({ ...a, isDefault: false }));
  }

  const merged = {
    ...target,
    ...patch,
    label: patch.label ? patch.label.trim() : target.label,
    addressLine1: patch.addressLine1 ? patch.addressLine1.trim() : target.addressLine1,
    city: patch.city ? patch.city.trim() : target.city,
    country: patch.country ? patch.country.trim() : target.country,
    privacyPolicy: patch.privacyPolicy ? normalizePrivacyPolicy(patch.privacyPolicy) : target.privacyPolicy,
  };
  validateAddress(merged);

  addresses[index] = merged;
  return await updateOwnerProfile(accountId, { addresses }, expectedRevision);
}

/**
 * Removes an address.
 */
export async function removeOwnerAddress(
  accountId: string,
  addressId: string,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const filtered = current.addresses.filter((a) => a.id !== addressId);
  // If removed address was default and others remain, make first one default
  if (current.addresses.find((a) => a.id === addressId)?.isDefault && filtered.length > 0) {
    filtered[0].isDefault = true;
  }
  return await updateOwnerProfile(accountId, { addresses: filtered }, expectedRevision);
}

/**
 * Adds a custom owner fact with secret blacklist protection.
 */
export async function addOwnerFact(
  accountId: string,
  fact: Omit<OwnerCustomFact, "factId" | "createdAt" | "updatedAt">,
  expectedRevision?: number
): Promise<Owner360Profile> {
  if (
    isBlockedSecretKeyOrCategory(fact.label) ||
    isBlockedSecretKeyOrCategory(fact.category) ||
    isBlockedSecretKeyOrCategory(fact.value)
  ) {
    throw new Owner360Error(
      `Cannot store sensitive credentials (passwords, PINs, OTPs, CVV, API keys) in custom facts`,
      "SENSITIVE_SECRET_NOT_ALLOWED",
      400
    );
  }

  const current = await getOwnerProfile(accountId);
  const now = Date.now();
  const newFact: OwnerCustomFact = {
    factId: crypto.randomUUID(),
    label: fact.label.trim(),
    category: (fact.category || "general").trim(),
    value: fact.value.trim(),
    privacyPolicy: normalizePrivacyPolicy(fact.privacyPolicy),
    source: fact.source || "owner_dashboard",
    createdAt: now,
    updatedAt: now,
  };

  const facts = [...current.customFacts, newFact];
  return await updateOwnerProfile(accountId, { customFacts: facts }, expectedRevision);
}

/**
 * Updates a custom owner fact.
 */
export async function updateOwnerFact(
  accountId: string,
  factId: string,
  patch: Partial<OwnerCustomFact>,
  expectedRevision?: number
): Promise<Owner360Profile> {
  if (
    (patch.label && isBlockedSecretKeyOrCategory(patch.label)) ||
    (patch.category && isBlockedSecretKeyOrCategory(patch.category)) ||
    (patch.value && isBlockedSecretKeyOrCategory(patch.value))
  ) {
    throw new Owner360Error(
      `Cannot store sensitive credentials in custom facts`,
      "SENSITIVE_SECRET_NOT_ALLOWED",
      400
    );
  }

  const current = await getOwnerProfile(accountId);
  const index = current.customFacts.findIndex((f) => f.factId === factId);
  if (index === -1) {
    throw new Owner360Error(`Custom fact not found: ${factId}`, "OWNER_PROFILE_NOT_FOUND", 404);
  }

  const facts = [...current.customFacts];
  facts[index] = {
    ...facts[index],
    ...patch,
    label: patch.label ? patch.label.trim() : facts[index].label,
    category: patch.category ? patch.category.trim() : facts[index].category,
    value: patch.value ? patch.value.trim() : facts[index].value,
    privacyPolicy: patch.privacyPolicy ? normalizePrivacyPolicy(patch.privacyPolicy) : facts[index].privacyPolicy,
    updatedAt: Date.now(),
  };

  return await updateOwnerProfile(accountId, { customFacts: facts }, expectedRevision);
}

/**
 * Removes a custom owner fact.
 */
export async function removeOwnerFact(
  accountId: string,
  factId: string,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const current = await getOwnerProfile(accountId);
  const filtered = current.customFacts.filter((f) => f.factId !== factId);
  return await updateOwnerProfile(accountId, { customFacts: filtered }, expectedRevision);
}

/**
 * Clears the Owner360 profile back to defaults (Prompt 2 Requirement 33).
 */
export async function clearOwnerProfile(
  accountId: string,
  expectedRevision?: number
): Promise<Owner360Profile> {
  const defaultProfile = createDefaultOwner360Profile(accountId);
  return await saveOwnerProfile(defaultProfile, expectedRevision);
}

// ---------------------------------------------------------------------------
// 9. NORMALIZED SAFE READ VIEW FOR TASKS (Prompt 2 Requirement 21)
// ---------------------------------------------------------------------------
export async function getOwnerContextForTask(accountId: string): Promise<SafeOwnerTaskContext> {
  const profile = await getOwnerProfile(accountId);

  return {
    accountId: profile.accountId,
    identity: {
      preferredName: profile.identity.preferredName
        ? {
            value: profile.identity.preferredName,
            privacyPolicy: profile.identity.privacyPolicy,
            source: profile.identity.source,
          }
        : undefined,
      fullName: profile.identity.fullName
        ? {
            value: profile.identity.fullName,
            privacyPolicy: profile.identity.privacyPolicy,
            source: profile.identity.source,
          }
        : undefined,
      title: profile.identity.title
        ? {
            value: profile.identity.title,
            privacyPolicy: profile.identity.privacyPolicy,
            source: profile.identity.source,
          }
        : undefined,
      preferredReference: profile.identity.preferredReference
        ? {
            value: profile.identity.preferredReference,
            privacyPolicy: profile.identity.privacyPolicy,
            source: profile.identity.source,
          }
        : undefined,
    },
    contactMethods: profile.contactMethods.map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label,
      value: c.value,
      privacyPolicy: c.privacyPolicy,
      source: c.source,
      isDefault: c.isDefault,
    })),
    addresses: profile.addresses.map((a) => ({
      id: a.id,
      label: a.label,
      recipientName: a.recipientName,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2,
      city: a.city,
      region: a.region,
      postalCode: a.postalCode,
      country: a.country,
      deliveryInstructions: a.deliveryInstructions,
      isDefault: a.isDefault,
      privacyPolicy: a.privacyPolicy,
      source: a.source,
    })),
    locale: { ...profile.locale },
    communicationPreferences: { ...profile.communicationPreferences },
    assistantRepresentation: { ...profile.assistantRepresentation },
    availabilityPreferences: { ...profile.availabilityPreferences },
    commercePreferences: { ...profile.commercePreferences },
    customFacts: profile.customFacts.map((f) => ({
      factId: f.factId,
      label: f.label,
      category: f.category,
      value: f.value,
      privacyPolicy: f.privacyPolicy,
      source: f.source,
    })),
  };
}
