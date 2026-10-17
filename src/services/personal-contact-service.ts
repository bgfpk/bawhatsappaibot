/**
 * Personal Contact Core Service
 * 
 * Provides the central interface for Personal Contact lifecycle, identity
 * resolution, memory operations, and passive inbound message ingestion.
 */

import crypto from "node:crypto";
import type { CanonicalContactIdentityInput } from "./whatsapp-contact-identity-resolver.ts";
import type {
  PersonalContact,
  PersonalContactRelationship,
  PersonalContactRelationshipProvenance,
  PersonalContactCommunicationStatus,
  PersonalContactIdentityAlias,
  PersonalContactSummaryContext,
} from "./personal-contact-types.ts";
import { PERSONAL_CONTACT_SCHEMA_VERSION } from "./personal-contact-types.ts";
import {
  getPersonalContactDoc,
  savePersonalContactDoc,
  deletePersonalContactDoc,
  findContactIdByAlias,
  recordContactAlias,
  removeContactAlias,
  listPersonalContactIds,
  recordPersonalContactIndex,
  invalidatePersonalContactCache,
} from "./personal-contact-storage-service.ts";
import {
  normalizePersonalInboundIdentity,
  computeContactDisplayName,
  canAutoMergePersonalContacts,
  mergeIdentityAlias,
  doPhonesMatch,
} from "./personal-contact-identity-service.ts";
import {
  addContactFact,
  removeContactFact,
  addContactOwnerNote,
  removeContactOwnerNote,
  clearPersonalContactMemory as clearMemoryHelper,
  getPersonalContactContext as getContextHelper,
  type AddFactInput,
} from "./personal-contact-memory-service.ts";

function generateContactId(tenantId: string, now: number): string {
  const seed = `${tenantId}:${now}:${Math.random()}`;
  return `pc_${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

/**
 * Retrieves a Personal Contact by contact ID with tenant ownership check.
 */
export async function getPersonalContact(
  accountId: string,
  contactId: string
): Promise<PersonalContact | null> {
  return getPersonalContactDoc(accountId, contactId);
}

/**
 * Finds a Personal Contact matching a WhatsApp identity (JID or canonical phone).
 */
export async function findPersonalContactByWhatsAppIdentity(
  accountId: string,
  input: CanonicalContactIdentityInput
): Promise<PersonalContact | null> {
  const normalized = await normalizePersonalInboundIdentity(input, accountId);

  // 1. Try phone alias lookup if trusted phone resolved
  if (normalized.phoneAliasKey) {
    const contactId = await findContactIdByAlias(accountId, normalized.phoneAliasKey);
    if (contactId) {
      const contact = await getPersonalContactDoc(accountId, contactId);
      if (contact) return contact;
    }
  }

  // 2. Try JID alias lookup
  if (normalized.jidAliasKey) {
    const contactId = await findContactIdByAlias(accountId, normalized.jidAliasKey);
    if (contactId) {
      const contact = await getPersonalContactDoc(accountId, contactId);
      if (contact) return contact;
    }
  }

  return null;
}

export interface ResolveOrCreateContactOptions {
  personalInstanceId?: string;
  source?: string;
  now?: number;
}

/**
 * Resolves an existing Personal Contact by identity aliases or safely creates a new one.
 * If contact initially arrived as LID and is later resolved to PN, reuses the SAME contact.
 * NEVER creates duplicate contacts based on name similarity.
 */
export async function resolveOrCreatePersonalContact(
  accountId: string,
  input: CanonicalContactIdentityInput,
  options: ResolveOrCreateContactOptions = {}
): Promise<{ contact: PersonalContact; isNew: boolean }> {
  const now = options.now || Date.now();
  const normalized = await normalizePersonalInboundIdentity(input, accountId);
  const instanceId = options.personalInstanceId || "default_personal";

  // Check existing by phone or JID alias
  let contact = await findPersonalContactByWhatsAppIdentity(accountId, input);

  const incomingAlias: PersonalContactIdentityAlias = {
    personalInstanceId: instanceId,
    jid: normalized.remoteJid,
    jidType: normalized.jidType,
    canonicalPhone: normalized.canonicalPhone,
    pushName: normalized.pushName,
    notifyName: normalized.notifyName,
    firstSeenAt: now,
    lastSeenAt: now,
    source: options.source || "inbound_whatsapp",
  };

  if (contact) {
    // Existing contact: update aliases and last seen metadata
    const updatedAliases = mergeIdentityAlias(contact.whatsappIdentities || [], incomingAlias);
    const updatedMeta = {
      ...contact.conversationMetadata,
      lastInteractionAt: now,
      messageCount: (contact.conversationMetadata?.messageCount || 0) + 1,
    };

    const updatedContact: PersonalContact = {
      ...contact,
      whatsappIdentities: updatedAliases,
      conversationMetadata: updatedMeta,
      displayName: computeContactDisplayName({
        ...contact,
        whatsappIdentities: updatedAliases,
      }),
      updatedAt: now,
    };

    // Ensure all alias mappings are registered
    if (normalized.phoneAliasKey) {
      await recordContactAlias(accountId, normalized.phoneAliasKey, contact.contactId);
    }
    if (normalized.jidAliasKey) {
      await recordContactAlias(accountId, normalized.jidAliasKey, contact.contactId);
    }

    const saved = await savePersonalContactDoc(updatedContact);
    return { contact: saved, isNew: false };
  }

  // Create new contact
  const contactId = generateContactId(accountId, now);
  const newContact: PersonalContact = {
    contactId,
    schemaVersion: PERSONAL_CONTACT_SCHEMA_VERSION,
    revision: 1,
    accountId,
    status: "active",
    displayName: normalized.pushName || (normalized.displayPhone ? normalized.displayPhone : "Personal Contact"),
    relationship: "acquaintance",
    relationshipProvenance: "unknown",
    communicationPreferences: {
      contactCommunicationStatus: "active",
    },
    whatsappIdentities: [incomingAlias],
    durableFacts: [],
    ownerNotes: [],
    conversationMetadata: {
      firstSeenAt: now,
      lastInteractionAt: now,
      lastInboundMessageAt: now,
      messageCount: 1,
    },
    createdAt: now,
    updatedAt: now,
  };

  newContact.displayName = computeContactDisplayName(newContact);

  // Register aliases
  if (normalized.phoneAliasKey) {
    await recordContactAlias(accountId, normalized.phoneAliasKey, contactId);
  }
  if (normalized.jidAliasKey) {
    await recordContactAlias(accountId, normalized.jidAliasKey, contactId);
  }

  await recordPersonalContactIndex(accountId, contactId, "add");
  const saved = await savePersonalContactDoc(newContact);

  return { contact: saved, isNew: true };
}

/**
 * Lists all Personal Contacts for a tenant, with optional status and search filter.
 */
export async function listPersonalContacts(
  accountId: string,
  filter?: { status?: "active" | "archived"; search?: string }
): Promise<PersonalContact[]> {
  const contactIds = await listPersonalContactIds(accountId);
  const contacts: PersonalContact[] = [];

  for (const id of contactIds) {
    const contact = await getPersonalContactDoc(accountId, id);
    if (!contact) continue;

    if (filter?.status && contact.status !== filter.status) {
      continue;
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      const nameMatch = contact.displayName.toLowerCase().includes(q);
      const relMatch = contact.relationship.toLowerCase().includes(q);
      const noteMatch = contact.ownerNotes.some((n) => n.text.toLowerCase().includes(q));
      const phoneMatch = contact.whatsappIdentities.some(
        (a) => doPhonesMatch(filter.search, a.canonicalPhone) || doPhonesMatch(filter.search, a.jid) || (a.canonicalPhone && a.canonicalPhone.includes(q))
      );
      if (!nameMatch && !relMatch && !noteMatch && !phoneMatch) {
        continue;
      }
    }

    contacts.push(contact);
  }

  return contacts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Updates an owner-assigned relationship for a Personal Contact.
 */
export async function setContactRelationship(
  accountId: string,
  contactId: string,
  relationship: PersonalContactRelationship,
  customLabel?: string,
  provenance: PersonalContactRelationshipProvenance = "owner_provided"
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const updated: PersonalContact = {
    ...contact,
    relationship,
    customRelationshipLabel: customLabel ? String(customLabel).trim() : undefined,
    relationshipProvenance: provenance,
    revision: (contact.revision || 0) + 1,
    updatedAt: Date.now(),
  };

  return savePersonalContactDoc(updated);
}

/**
 * Sets communication status (active, do_not_contact, blocked_by_owner).
 */
export async function setContactCommunicationStatus(
  accountId: string,
  contactId: string,
  status: PersonalContactCommunicationStatus
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const updated: PersonalContact = {
    ...contact,
    communicationPreferences: {
      ...contact.communicationPreferences,
      contactCommunicationStatus: status,
      doNotContact: status === "do_not_contact" || status === "blocked_by_owner",
    },
    revision: (contact.revision || 0) + 1,
    updatedAt: Date.now(),
  };

  return savePersonalContactDoc(updated);
}

/**
 * Archives a Personal Contact.
 */
export async function archivePersonalContact(
  accountId: string,
  contactId: string
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const updated: PersonalContact = {
    ...contact,
    status: "archived",
    revision: (contact.revision || 0) + 1,
    updatedAt: Date.now(),
  };

  return savePersonalContactDoc(updated);
}

/**
 * Merges two contacts when authorized by canonical phone match or explicit confirmation.
 */
export async function mergePersonalContacts(
  accountId: string,
  targetContactId: string,
  sourceContactId: string,
  options: { isOwnerConfirmed?: boolean } = {}
): Promise<PersonalContact> {
  const target = await getPersonalContactDoc(accountId, targetContactId);
  const source = await getPersonalContactDoc(accountId, sourceContactId);
  if (!target || !source) {
    throw new Error("Both target and source contacts must exist to perform a merge.");
  }

  const auth = canAutoMergePersonalContacts(target, source);
  if (!auth.canMerge && !options.isOwnerConfirmed) {
    throw new Error(`Cannot merge contacts: ${auth.reason}`);
  }

  const now = Date.now();

  // Combine aliases
  let combinedAliases = [...(target.whatsappIdentities || [])];
  for (const alias of source.whatsappIdentities || []) {
    combinedAliases = mergeIdentityAlias(combinedAliases, alias);
  }

  // Combine facts
  const combinedFacts = [...(target.durableFacts || [])];
  for (const fact of source.durableFacts || []) {
    combinedFacts.push(fact);
  }

  // Combine notes
  const combinedNotes = [...(target.ownerNotes || []), ...(source.ownerNotes || [])];

  const mergedTarget: PersonalContact = {
    ...target,
    whatsappIdentities: combinedAliases,
    durableFacts: combinedFacts,
    ownerNotes: combinedNotes,
    displayName: computeContactDisplayName({
      ...target,
      whatsappIdentities: combinedAliases,
    }),
    revision: (target.revision || 0) + 1,
    updatedAt: now,
  };

  // Re-point all source aliases to target contact ID
  for (const alias of source.whatsappIdentities || []) {
    if (alias.canonicalPhone) {
      await recordContactAlias(accountId, `phone:${alias.canonicalPhone}`, targetContactId);
    }
    await recordContactAlias(accountId, `jid:${alias.jid.toLowerCase()}`, targetContactId);
  }

  // Save merged target and remove source from index
  await savePersonalContactDoc(mergedTarget);
  await deletePersonalContactDoc(accountId, sourceContactId);
  await recordPersonalContactIndex(accountId, sourceContactId, "remove");

  return mergedTarget;
}

/**
 * Passive inbound message ingestion (Section 21).
 * Ingests inbound message, registers/updates contact and aliases,
 * updates messageCount, and returns resolved contact.
 * Outbound AI reply is strictly dormant.
 */
export async function ingestPersonalContactInboundMessage(
  accountId: string,
  botConfig: any,
  messagePayload: {
    remoteJid: string;
    pushName?: string;
    text?: string;
    timestamp?: number;
    remoteJidAlt?: string;
    participant?: string;
    participantAlt?: string;
    senderPn?: string;
    participantPn?: string;
  }
): Promise<{ contact: PersonalContact; isNew: boolean }> {
  const instanceId = String(botConfig?.$id || botConfig?.id || "personal_instance");
  const now = messagePayload.timestamp ? messagePayload.timestamp * 1000 : Date.now();

  const input: CanonicalContactIdentityInput = {
    remoteJid: messagePayload.remoteJid,
    remoteJidAlt: messagePayload.remoteJidAlt,
    participant: messagePayload.participant,
    participantAlt: messagePayload.participantAlt,
    senderPn: messagePayload.senderPn,
    participantPn: messagePayload.participantPn,
    profile: {
      name: messagePayload.pushName,
      pushName: messagePayload.pushName,
    },
    dataOwnerKey: accountId,
  };

  const result = await resolveOrCreatePersonalContact(accountId, input, {
    personalInstanceId: instanceId,
    now,
    source: "inbound_whatsapp",
  });

  return result;
}

// Re-export memory and context operations through service boundary
export async function addPersonalContactFact(
  accountId: string,
  contactId: string,
  input: AddFactInput
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const res = addContactFact(contact, input);
  return savePersonalContactDoc(res.contact);
}

export async function removePersonalContactFact(
  accountId: string,
  contactId: string,
  factId: string
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const updated = removeContactFact(contact, factId);
  return savePersonalContactDoc(updated);
}

export async function addPersonalContactNote(
  accountId: string,
  contactId: string,
  text: string,
  provenance: "owner_dashboard" | "owner_business_whatsapp" = "owner_dashboard"
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const res = addContactOwnerNote(contact, text, provenance);
  return savePersonalContactDoc(res.contact);
}

export async function removePersonalContactNote(
  accountId: string,
  contactId: string,
  noteId: string
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const updated = removeContactOwnerNote(contact, noteId);
  return savePersonalContactDoc(updated);
}

export async function clearPersonalContactMemory(
  accountId: string,
  contactId: string
): Promise<PersonalContact> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const updated = clearMemoryHelper(contact);
  return savePersonalContactDoc(updated);
}

export async function getPersonalContactContext(
  accountId: string,
  contactId: string
): Promise<PersonalContactSummaryContext | null> {
  const contact = await getPersonalContactDoc(accountId, contactId);
  if (!contact) return null;
  return getContextHelper(contact);
}

export { invalidatePersonalContactCache };
