/**
 * Personal Contact Identity & Alias Service
 * 
 * Manages WhatsApp identity aliases, PN/LID canonicalization, display name
 * resolution, and merge-authority verification for Personal Contacts.
 */

import {
  resolveCanonicalContactIdentity,
  isLidJid,
  isPhoneJid,
  extractPhoneDigits,
  recordLidPnMapping,
  type CanonicalContactIdentityInput,
  type CanonicalContactIdentity,
} from "./whatsapp-contact-identity-resolver.ts";
import { formatInternationalPhone } from "../utils/contact-identity.ts";
import type {
  PersonalContact,
  PersonalContactIdentityAlias,
} from "./personal-contact-types.ts";

export interface NormalizedInboundIdentity {
  remoteJid: string;
  jidType: "pn" | "lid";
  canonicalPhone: string | null;
  displayPhone: string | null;
  pushName: string | null;
  notifyName: string | null;
  resolutionSource: CanonicalContactIdentity["resolutionSource"];
  phoneAliasKey: string | null;
  jidAliasKey: string;
}

/**
 * Normalizes an inbound message or WhatsApp event into trusted identity primitives.
 */
export async function normalizePersonalInboundIdentity(
  input: CanonicalContactIdentityInput,
  tenantId?: string
): Promise<NormalizedInboundIdentity> {
  const resolved = await resolveCanonicalContactIdentity({
    ...input,
    dataOwnerKey: tenantId,
  });

  const rawJid = String(input.remoteJid || input.participant || resolved.canonicalJid || "").trim().toLowerCase();
  const jidType: "pn" | "lid" = isLidJid(rawJid) || resolved.lidJid === rawJid ? "lid" : "pn";

  let canonicalPhone: string | null = null;
  if (resolved.phoneNumber) {
    canonicalPhone = resolved.phoneNumber;
  } else if (resolved.phoneJid) {
    canonicalPhone = extractPhoneDigits(resolved.phoneJid);
  } else if (input.senderPn) {
    canonicalPhone = extractPhoneDigits(input.senderPn);
  } else if (input.participantPn) {
    canonicalPhone = extractPhoneDigits(input.participantPn);
  } else if (jidType === "pn") {
    canonicalPhone = extractPhoneDigits(rawJid);
  }

  // Record mapping if both LID and Phone exist
  if (resolved.lidJid && resolved.phoneJid && tenantId) {
    try {
      recordLidPnMapping({
        dataOwnerKey: tenantId,
        lid: resolved.lidJid,
        pn: resolved.phoneJid,
        source: "persisted_lid_mapping",
      });
    } catch {}
  }

  const displayPhone = canonicalPhone ? formatInternationalPhone(canonicalPhone, { trusted: true }) : null;
  const pushName = input.profile?.name || input.profile?.pushName || input.profile?.notify || null;

  return {
    remoteJid: rawJid,
    jidType,
    canonicalPhone,
    displayPhone,
    pushName: pushName ? String(pushName).trim() : null,
    notifyName: input.profile?.notify ? String(input.profile.notify).trim() : null,
    resolutionSource: resolved.resolutionSource,
    phoneAliasKey: canonicalPhone ? `phone:${canonicalPhone}` : null,
    jidAliasKey: `jid:${rawJid}`,
  };
}

/**
 * Computes deterministic contact display name according to Section 8 priority:
 * 1. explicit owner-assigned contact name
 * 2. explicitly saved contact name
 * 3. reliable WhatsApp push/notify name
 * 4. safe phone-based fallback
 * 5. generic Personal Contact fallback
 * NEVER displays raw LID digits.
 */
export function computeContactDisplayName(contact: Partial<PersonalContact>): string {
  // 1. Owner assigned name
  if (contact.ownerAssignedName && contact.ownerAssignedName.trim()) {
    return contact.ownerAssignedName.trim();
  }

  // 2. Saved name
  if (contact.savedName && contact.savedName.trim()) {
    return contact.savedName.trim();
  }

  // 3. Reliable pushName / notifyName from identities
  if (Array.isArray(contact.whatsappIdentities)) {
    for (const identity of contact.whatsappIdentities) {
      const candidate = identity.pushName || identity.notifyName;
      if (candidate && isValidHumanDisplayName(candidate)) {
        return candidate.trim();
      }
    }
  }

  // 4. Safe phone-based fallback
  const trustedPhone = getContactTrustedPhone(contact);
  if (trustedPhone) {
    return formatInternationalPhone(trustedPhone, { trusted: true });
  }

  // 5. Generic fallback
  return "Personal Contact";
}

/**
 * Validates whether a candidate name is a usable person name,
 * rejecting phone numbers, raw JIDs, or technical sentinels.
 */
export function isValidHumanDisplayName(val: any): boolean {
  const text = String(val || "").trim();
  if (!text) return false;
  if (text.length < 2 || text.length > 80) return false;
  if (/@(?:s\.whatsapp\.net|lid|hosted\.lid|g\.us|broadcast)$/i.test(text)) return false;
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return false;
  const lowered = text.toLowerCase();
  if (["unknown", "unknown contact", "null", "undefined", "personal contact", "whatsapp contact"].includes(lowered)) {
    return false;
  }
  return /[\p{L}]/u.test(text);
}

/**
 * Extracts trusted phone number digits from a Personal Contact if available.
 * Never returns LID digits as a phone number.
 */
export function getContactTrustedPhone(contact: Partial<PersonalContact>): string | null {
  if (!contact.whatsappIdentities || !Array.isArray(contact.whatsappIdentities)) {
    return null;
  }
  for (const alias of contact.whatsappIdentities) {
    if (alias.canonicalPhone && alias.canonicalPhone.length >= 8 && alias.canonicalPhone.length <= 15) {
      return alias.canonicalPhone;
    }
    if (alias.jidType === "pn" && isPhoneJid(alias.jid)) {
      const digits = extractPhoneDigits(alias.jid);
      if (digits) return digits;
    }
  }
  return null;
}

/**
 * Returns a human-safe phone representation or fallback label.
 * Never treats or displays raw LID numbers as a telephone.
 */
export function formatSafeContactPhoneDisplay(contact: Partial<PersonalContact>): string {
  const phone = getContactTrustedPhone(contact);
  if (phone) {
    return formatInternationalPhone(phone, { trusted: true }) || "Number unavailable";
  }
  return "Number unavailable";
}

/**
 * Tests whether two contacts are allowed to be merged.
 * Hard rule: Name similarity alone NEVER authorizes a merge.
 * Merge authority requires trusted canonical phone number match or explicit owner confirmation.
 */
export function canAutoMergePersonalContacts(
  target: PersonalContact,
  source: PersonalContact
): { canMerge: boolean; reason: string } {
  // Tenant check
  if (target.accountId !== source.accountId) {
    return { canMerge: false, reason: "Cross-tenant merge is strictly forbidden." };
  }

  const targetPhone = getContactTrustedPhone(target);
  const sourcePhone = getContactTrustedPhone(source);

  if (targetPhone && sourcePhone && targetPhone === sourcePhone) {
    return { canMerge: true, reason: "Verified canonical phone identity match." };
  }

  return {
    canMerge: false,
    reason: "Automatic merge requires trusted canonical phone match. Merging by name alone is strictly forbidden.",
  };
}

/**
 * Updates or merges an identity alias into a Personal Contact's identities list.
 */
export function mergeIdentityAlias(
  existingAliases: PersonalContactIdentityAlias[],
  newAlias: PersonalContactIdentityAlias
): PersonalContactIdentityAlias[] {
  const list = [...existingAliases];
  const matchIndex = list.findIndex(
    (a) => a.jid.toLowerCase() === newAlias.jid.toLowerCase() && a.personalInstanceId === newAlias.personalInstanceId
  );

  if (matchIndex >= 0) {
    const prev = list[matchIndex];
    list[matchIndex] = {
      ...prev,
      canonicalPhone: newAlias.canonicalPhone || prev.canonicalPhone,
      pushName: newAlias.pushName || prev.pushName,
      notifyName: newAlias.notifyName || prev.notifyName,
      lastSeenAt: Math.max(prev.lastSeenAt || 0, newAlias.lastSeenAt || 0),
    };
  } else {
    list.push(newAlias);
  }

  return list;
}

/**
 * Normalizes any phone number string or JID into canonical comparison tokens.
 * Strips all formatting, spaces, dashes, punctuation, and leading international prefixes (00 or +).
 * Extracts national suffixes to enable reliable matching across national and international formats.
 */
export function normalizePhoneForMatching(phoneOrJid: string | null | undefined): {
  digits: string;
  national10?: string;
  national9?: string;
  national7?: string;
} {
  const raw = String(phoneOrJid || "").trim();
  if (!raw || isLidJid(raw)) {
    return { digits: "" };
  }
  let digits = raw.split("@")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // If Pakistani format: 0325... (11 digits) or 325... (10 digits), normalize to 923...
  if (digits.startsWith("0") && digits.length === 11 && digits.startsWith("03")) {
    digits = `92${digits.slice(1)}`;
  } else if (digits.startsWith("3") && digits.length === 10) {
    digits = `92${digits}`;
  }

  const national10 = digits.length >= 10 ? digits.slice(-10) : undefined;
  const national9 = digits.length >= 9 ? digits.slice(-9) : undefined;
  const national7 = digits.length >= 7 ? digits.slice(-7) : undefined;

  return { digits, national10, national9, national7 };
}

/**
 * Robustly tests if two candidate phone representations refer to the same phone number.
 * Handles spaces, punctuation, leading 00/+, local vs international prefixes, and JIDs.
 * NEVER matches LID numbers.
 */
export function doPhonesMatch(phoneA: string | null | undefined, phoneB: string | null | undefined): boolean {
  if (!phoneA || !phoneB) return false;
  if (isLidJid(phoneA) || isLidJid(phoneB)) return false;

  const a = normalizePhoneForMatching(phoneA);
  const b = normalizePhoneForMatching(phoneB);

  if (!a.digits || !b.digits) return false;
  if (a.digits.length < 7 || b.digits.length < 7) return false;

  // Direct digits match
  if (a.digits === b.digits) return true;

  // Suffix matching (e.g. 923250872796 and 03250872796 or 3250872796)
  if (a.national10 && b.national10 && a.national10 === b.national10) return true;
  if (a.national9 && b.national9 && a.national9 === b.national9) return true;

  // Check if one ends with the other (if both are >= 8 digits)
  if (a.digits.length >= 8 && b.digits.length >= 8) {
    if (a.digits.endsWith(b.digits) || b.digits.endsWith(a.digits)) return true;
  }

  return false;
}
