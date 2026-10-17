/**
 * Personal Contact Memory Service
 * 
 * Governs structured durable memory, time-sensitive facts, owner notes,
 * secret sanitization, deduplication, supersession, and context budgeting.
 */

import crypto from "node:crypto";
import type {
  PersonalContact,
  PersonalContactMemoryFact,
  PersonalContactOwnerNote,
  PersonalContactFactCategory,
  PersonalContactFactSource,
  PersonalContactSummaryContext,
  PersonalContactCommercialInfo,
} from "./personal-contact-types.ts";

// Blacklist for secret credentials
const BLOCKED_SECRET_PATTERNS = [
  /password/i,
  /passcode/i,
  /\bpin\b/i,
  /\botp\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /card_security_code/i,
  /security_code/i,
  /api_?key/i,
  /\bsecret\b/i,
  /auth_?token/i,
  /access_?token/i,
  /refresh_?token/i,
  /oauth_?token/i,
  /authentication_?code/i,
  /auth_?code/i,
  /private_?key/i,
  /bank_?login/i,
  /credit_?card/i,
  /debit_?card/i,
];

// Sensitive attributes that cannot be autonomously inferred or stored
const BLOCKED_INFERRED_ATTRIBUTES = [
  /health_condition/i,
  /medical_history/i,
  /religion/i,
  /religious_belief/i,
  /politics/i,
  /political_affiliation/i,
  /sexual_orientation/i,
  /criminal_history/i,
];

export function isBlockedContactSecret(text: string): boolean {
  if (!text) return false;
  const clean = String(text).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  for (const pattern of BLOCKED_SECRET_PATTERNS) {
    if (pattern.test(text) || pattern.test(clean)) return true;
  }
  return false;
}

export function isBlockedSensitiveAttribute(text: string): boolean {
  if (!text) return false;
  for (const pattern of BLOCKED_INFERRED_ATTRIBUTES) {
    if (pattern.test(text)) return true;
  }
  return false;
}

export function normalizeFactText(val: string): string {
  return String(val || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function generateFactId(category: string, label: string, now: number): string {
  const seed = `${category}:${label}:${now}:${Math.random()}`;
  return `fct_${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

export function generateNoteId(now: number): string {
  const seed = `note:${now}:${Math.random()}`;
  return `not_${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

export interface AddFactInput {
  category: PersonalContactFactCategory;
  label: string;
  value: string;
  source: PersonalContactFactSource;
  sourceTimestamp?: number;
  validUntil?: number;
  staleAfter?: number;
  sensitivity?: "standard" | "sensitive";
  commercialInfo?: PersonalContactCommercialInfo;
}

/**
 * Validates and attaches a new fact to a contact, handling:
 * - Secret rejection
 * - Inferred sensitive attribute rejection
 * - Deduplication
 * - Supersession of older facts with same category and label
 */
export function addContactFact(
  contact: PersonalContact,
  input: AddFactInput,
  now = Date.now()
): { contact: PersonalContact; factId: string; wasDeduped: boolean } {
  const label = String(input.label || "").trim();
  const value = String(input.value || "").trim();
  const category = input.category || "custom";

  if (!label || !value) {
    throw new Error("Fact must include non-empty label and value");
  }

  // Secret credential check
  if (isBlockedContactSecret(label) || isBlockedContactSecret(value) || isBlockedContactSecret(category)) {
    throw new Error("Sensitive credentials (passwords, PINs, OTPs, CVVs, API keys, tokens) cannot be stored in contact memory.");
  }

  // Sensitive inferred attribute check
  if (isBlockedSensitiveAttribute(label) || isBlockedSensitiveAttribute(category)) {
    throw new Error("Protected sensitive attributes (health, religion, politics, etc.) cannot be stored in contact memory.");
  }

  const normalizedLabel = normalizeFactText(label);
  const normalizedValue = normalizeFactText(value);

  const facts = [...(contact.durableFacts || [])];

  // Check for exact duplicate among current facts
  const exactDuplicate = facts.find(
    (f) =>
      f.status === "current" &&
      f.category === category &&
      normalizeFactText(f.label) === normalizedLabel &&
      normalizeFactText(f.value) === normalizedValue
  );

  if (exactDuplicate) {
    // Refresh confirmation timestamp without creating duplicate
    exactDuplicate.lastConfirmedAt = now;
    exactDuplicate.updatedAt = now;
    return { contact: { ...contact, durableFacts: facts }, factId: exactDuplicate.factId, wasDeduped: true };
  }

  // Check if an existing current fact with the same category and label is being superseded
  let supersededId: string | undefined;
  for (const fact of facts) {
    if (fact.status === "current" && fact.category === category && normalizeFactText(fact.label) === normalizedLabel) {
      fact.status = "superseded";
      fact.updatedAt = now;
      supersededId = fact.factId;
    }
  }

  const newFactId = generateFactId(category, label, now);
  const newFact: PersonalContactMemoryFact = {
    factId: newFactId,
    category,
    label,
    value,
    source: input.source,
    sourceTimestamp: input.sourceTimestamp || now,
    createdAt: now,
    updatedAt: now,
    lastConfirmedAt: now,
    status: "current",
    supersedesFactId: supersededId,
    validUntil: input.validUntil,
    staleAfter: input.staleAfter,
    sensitivity: input.sensitivity || "standard",
    commercialInfo: input.commercialInfo,
  };

  facts.push(newFact);

  return {
    contact: {
      ...contact,
      durableFacts: facts,
      revision: (contact.revision || 0) + 1,
      updatedAt: now,
    },
    factId: newFactId,
    wasDeduped: false,
  };
}

/**
 * Removes a specific fact by ID from durable facts.
 */
export function removeContactFact(
  contact: PersonalContact,
  factId: string,
  now = Date.now()
): PersonalContact {
  const filtered = (contact.durableFacts || []).filter((f) => f.factId !== factId);
  return {
    ...contact,
    durableFacts: filtered,
    revision: (contact.revision || 0) + 1,
    updatedAt: now,
  };
}

/**
 * Adds a private owner note to a contact.
 */
export function addContactOwnerNote(
  contact: PersonalContact,
  text: string,
  provenance: "owner_dashboard" | "owner_business_whatsapp",
  now = Date.now()
): { contact: PersonalContact; noteId: string } {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Note text cannot be empty");
  }

  if (isBlockedContactSecret(cleanText)) {
    throw new Error("Credentials cannot be stored in owner notes.");
  }

  const noteId = generateNoteId(now);
  const newNote: PersonalContactOwnerNote = {
    noteId,
    text: cleanText,
    createdAt: now,
    updatedAt: now,
    provenance,
  };

  const notes = [...(contact.ownerNotes || []), newNote];
  return {
    contact: {
      ...contact,
      ownerNotes: notes,
      revision: (contact.revision || 0) + 1,
      updatedAt: now,
    },
    noteId,
  };
}

/**
 * Removes an owner note by note ID.
 */
export function removeContactOwnerNote(
  contact: PersonalContact,
  noteId: string,
  now = Date.now()
): PersonalContact {
  const filtered = (contact.ownerNotes || []).filter((n) => n.noteId !== noteId);
  return {
    ...contact,
    ownerNotes: filtered,
    revision: (contact.revision || 0) + 1,
    updatedAt: now,
  };
}

/**
 * Safely clears all memory facts and owner notes from a contact
 * without touching underlying WhatsApp conversation messages or Owner360.
 */
export function clearPersonalContactMemory(
  contact: PersonalContact,
  now = Date.now()
): PersonalContact {
  return {
    ...contact,
    durableFacts: [],
    ownerNotes: [],
    revision: (contact.revision || 0) + 1,
    updatedAt: now,
  };
}

/**
 * Synthesizes a safe read context for the contact with deterministic token budgeting.
 * Filters out superseded facts and expired temporary facts (validUntil < now).
 * Does not expose raw DB collection IDs.
 */
export function getPersonalContactContext(
  contact: PersonalContact,
  now = Date.now()
): PersonalContactSummaryContext {
  const allFacts = contact.durableFacts || [];

  // Filter current facts that are not expired
  const activeFacts = allFacts.filter((f) => {
    if (f.status !== "current") return false;
    if (f.validUntil && f.validUntil < now) return false;
    return true;
  });

  // Separate temporary / time-sensitive facts from durable facts
  const currentDurableFacts = activeFacts
    .filter((f) => !f.validUntil)
    .slice(0, 20)
    .map((f) => ({
      factId: f.factId,
      category: f.category,
      label: f.label,
      value: f.value,
      source: f.source,
      lastConfirmedAt: f.lastConfirmedAt,
    }));

  const activeTemporaryFacts = activeFacts
    .filter((f) => Boolean(f.validUntil))
    .slice(0, 10)
    .map((f) => ({
      factId: f.factId,
      category: f.category,
      label: f.label,
      value: f.value,
      validUntil: f.validUntil,
    }));

  const ownerNotes = (contact.ownerNotes || []).slice(0, 10).map((n) => n.text);

  let trustedPhone: string | null = null;
  if (Array.isArray(contact.whatsappIdentities)) {
    for (const alias of contact.whatsappIdentities) {
      if (alias.canonicalPhone) {
        trustedPhone = alias.canonicalPhone;
        break;
      }
    }
  }

  return {
    contactId: contact.contactId,
    displayName: contact.displayName,
    relationship: contact.relationship,
    customRelationshipLabel: contact.customRelationshipLabel,
    communicationStatus: contact.communicationPreferences?.contactCommunicationStatus || "active",
    preferredLanguage: contact.communicationPreferences?.preferredLanguage,
    formality: contact.communicationPreferences?.formality,
    trustedPhone,
    currentDurableFacts,
    activeTemporaryFacts,
    ownerNotes,
    messageCount: contact.conversationMetadata?.messageCount || 0,
    lastActiveAt: contact.conversationMetadata?.lastInteractionAt,
  };
}
