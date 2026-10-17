/**
 * Personal Outbound Target & Instance Resolution Service
 * 
 * Resolves targets and personal instances for Outbound Personal Missions:
 * - Direct contact resolution with ambiguity detection (safe distinctions, no raw IDs)
 * - Safe phone number normalization (rejects raw LID digits/arbitrary @lid)
 * - Personal instance resolution (auto-selects only if exactly 1 eligible, asks owner if multiple)
 * - Provenance tracking for new numbers (creates Personal Contact, never Business Customer)
 */

import * as personalContactService from "./personal-contact-service.ts";
import { formatSafeContactPhoneDisplay, doPhonesMatch } from "./personal-contact-identity-service.ts";
import { isPersonalInstance, getControlBusinessInstanceId } from "./instance-purpose-service.ts";
import { extractPhoneDigits, isLidJid } from "./whatsapp-contact-identity-resolver.ts";
import { formatInternationalPhone } from "../utils/contact-identity.ts";
import * as dbService from "./db-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type { PersonalOutboundTargetIdentity } from "./personal-outbound-types.ts";

export interface ResolvedPersonalInstanceResult {
  personalInstanceId?: string;
  personalBot?: any;
  error?: string;
  ambiguousInstances?: Array<{
    instanceId: string;
    name?: string;
    phone?: string;
  }>;
}

export interface ResolvedTargetResult {
  contact?: PersonalContact;
  targetIdentity?: PersonalOutboundTargetIdentity;
  isNewPhone?: boolean;
  ambiguousChoices?: Array<{
    displayName: string;
    relationship: string;
    displayPhone: string;
    contactId: string;
  }>;
  error?: string;
}

const targetServiceDeps = {
  getBotsByUser: dbService.getBotsByUser,
};

export function __setTargetServiceTestDeps(overrides: Partial<typeof targetServiceDeps>): void {
  Object.assign(targetServiceDeps, overrides || {});
}

export function __resetTargetServiceTestDeps(): void {
  Object.assign(targetServiceDeps, {
    getBotsByUser: dbService.getBotsByUser,
  });
}

/**
 * Resolves which Personal WhatsApp instance to use for an outbound mission.
 * - If owner specified instanceId: validates existence and personal purpose.
 * - If not specified: auto-selects if exactly ONE personal instance exists.
 * - If multiple personal instances exist: returns ambiguousInstances to ask owner.
 */
export async function resolvePersonalInstanceForMission(
  accountId: string,
  requestedInstanceId?: string,
  controlBusinessInstanceId?: string,
  injectedBots?: any[]
): Promise<ResolvedPersonalInstanceResult> {
  const bots = injectedBots || (await targetServiceDeps.getBotsByUser(accountId).catch(() => [])) as any[];
  const personalBots = bots.filter((b) => isPersonalInstance(b));

  if (personalBots.length === 0) {
    return { error: "No Personal WhatsApp instance found for this account. Please connect a Personal line first." };
  }

  // 1. Explicit requested instance
  if (requestedInstanceId && requestedInstanceId.trim()) {
    const cleanId = requestedInstanceId.trim();
    const match = personalBots.find((b) => (b.$id || b.bot_id) === cleanId);
    if (!match) {
      return { error: `Personal instance "${cleanId}" does not exist or is not a Personal WhatsApp line.` };
    }

    // Verify control link if provided
    if (controlBusinessInstanceId) {
      const linkedControl = getControlBusinessInstanceId(match);
      if (linkedControl && linkedControl !== controlBusinessInstanceId) {
        return { error: "Personal instance is linked to a different Business control instance." };
      }
    }

    return { personalInstanceId: match.$id || match.bot_id, personalBot: match };
  }

  // Filter by control business instance if available
  const eligibleBots = controlBusinessInstanceId
    ? personalBots.filter((b) => {
        const linked = getControlBusinessInstanceId(b);
        return !linked || linked === controlBusinessInstanceId;
      })
    : personalBots;

  if (eligibleBots.length === 1) {
    const single = eligibleBots[0];
    return { personalInstanceId: single.$id || single.bot_id, personalBot: single };
  }

  if (eligibleBots.length > 1) {
    return {
      error: "multiple_personal_instances",
      ambiguousInstances: eligibleBots.map((b) => ({
        instanceId: b.$id || b.bot_id,
        name: b.name || "Personal Line",
        phone: b.phone_number || b.phone || b.jid ? extractPhoneDigits(b.jid) : undefined,
      })),
    };
  }

  return { error: "No eligible Personal WhatsApp line found linked to this Business control instance." };
}

/**
 * Resolves target contact or phone number for an outbound mission.
 */
export async function resolveTargetForMission(
  accountId: string,
  personalInstanceId: string,
  targetQuery: string
): Promise<ResolvedTargetResult> {
  let query = String(targetQuery || "").trim();
  // Strip surrounding quotes if present
  query = query.replace(/^['"]+|['"]+$/g, "").trim();

  if (!query) {
    return { error: "Target recipient is missing. Please specify a contact name or phone number." };
  }

  // Guard against raw LID injection
  if (isLidJid(query) || (query.endsWith("@lid") && !query.includes("@s.whatsapp.net"))) {
    return { error: "Direct LID targeting is not supported. Please specify a phone number or contact name." };
  }

  // 1. Direct Contact ID lookup
  if (query.startsWith("pc_")) {
    const contact = await personalContactService.getPersonalContact(accountId, query);
    if (contact) {
      const targetIdentity = getPrimaryTargetIdentity(contact, personalInstanceId);
      return { contact, targetIdentity };
    }
  }

  // Extract phone candidate (if any) and clean name portion
  const extractedDigits = extractPhoneDigits(query);
  const cleanNamePortion = query
    .replace(/(?:\+[\d\s\-()]{7,18}\d|\b00[\d\s\-()]{7,18}\d|\b03[\d\s\-()]{8,14}\d|\b\d{8,15}\b)/g, "")
    .replace(/[()[\]'"]/g, " ")
    .trim();

  // 2. Search existing Personal Contacts
  const contacts = await personalContactService.listPersonalContacts(accountId);
  const qLower = query.toLowerCase();
  const effLower = (cleanNamePortion || query).toLowerCase();

  // Exact name or phone match
  const exactMatches = contacts.filter((c) => {
    if (c.displayName.toLowerCase() === effLower || c.displayName.toLowerCase() === qLower) return true;
    if (c.ownerAssignedName?.toLowerCase() === effLower || c.ownerAssignedName?.toLowerCase() === qLower) return true;
    if (extractedDigits && c.whatsappIdentities.some((a) => doPhonesMatch(extractedDigits, a.canonicalPhone) || doPhonesMatch(extractedDigits, a.jid))) return true;
    return c.whatsappIdentities.some((a) => {
      if (doPhonesMatch(query, a.canonicalPhone) || doPhonesMatch(query, a.jid)) return true;
      if (a.jid.toLowerCase() === qLower) return true;
      return false;
    });
  });

  if (exactMatches.length === 1) {
    const contact = exactMatches[0];
    return { contact, targetIdentity: getPrimaryTargetIdentity(contact, personalInstanceId) };
  }

  if (exactMatches.length > 1) {
    return {
      ambiguousChoices: exactMatches.map((c) => ({
        displayName: c.displayName,
        relationship: c.relationship || "contact",
        displayPhone: formatSafeContactPhoneDisplay(c),
        contactId: c.contactId,
      })),
    };
  }

  // Partial name match
  if (effLower) {
    const partialMatches = contacts.filter((c) => {
      if (c.displayName.toLowerCase().includes(effLower)) return true;
      if (c.ownerAssignedName?.toLowerCase().includes(effLower)) return true;
      return false;
    });

    if (partialMatches.length === 1) {
      const contact = partialMatches[0];
      return { contact, targetIdentity: getPrimaryTargetIdentity(contact, personalInstanceId) };
    }

    if (partialMatches.length > 1) {
      return {
        ambiguousChoices: partialMatches.map((c) => ({
          displayName: c.displayName,
          relationship: c.relationship || "contact",
          displayPhone: formatSafeContactPhoneDisplay(c),
          contactId: c.contactId,
        })),
      };
    }
  }

  // 3. New Phone Number resolution
  if (extractedDigits && extractedDigits.length >= 8 && extractedDigits.length <= 15) {
    const targetJid = `${extractedDigits}@s.whatsapp.net`;
    const canonicalPhone = `+${extractedDigits}`;
    const displayPhone = formatInternationalPhone(canonicalPhone) || canonicalPhone;
    const finalDisplayName = cleanNamePortion || displayPhone;

    return {
      isNewPhone: true,
      targetIdentity: {
        jid: targetJid,
        canonicalPhone,
        pushName: finalDisplayName,
        displayName: finalDisplayName,
      },
    };
  }

  return { error: `Could not resolve "${query}" to a contact or valid phone number.` };
}

function getPrimaryTargetIdentity(contact: PersonalContact, personalInstanceId: string): PersonalOutboundTargetIdentity {
  const instanceAlias = contact.whatsappIdentities.find((a) => a.personalInstanceId === personalInstanceId);
  const primaryAlias = instanceAlias || contact.whatsappIdentities[0];

  const jid = primaryAlias?.jid || `${extractPhoneDigits(primaryAlias?.canonicalPhone || "")}@s.whatsapp.net`;
  return {
    jid,
    canonicalPhone: primaryAlias?.canonicalPhone || null,
    pushName: primaryAlias?.pushName || contact.displayName,
    displayName: contact.displayName,
  };
}

/**
 * Creates/reserves a new Personal Contact after an initial outbound send succeeds.
 * Provenance: owner_business_whatsapp.
 * NEVER creates Business Customer/Lead/Order.
 */
export async function reservePersonalContactForNewPhone(
  accountId: string,
  personalInstanceId: string,
  targetIdentity: PersonalOutboundTargetIdentity
): Promise<PersonalContact> {
  const result = await personalContactService.resolveOrCreatePersonalContact(accountId, {
    remoteJid: targetIdentity.jid,
    profile: {
      pushName: targetIdentity.pushName || targetIdentity.displayName || "Contact",
    },
    dataOwnerKey: accountId,
  });

  return result.contact;
}
