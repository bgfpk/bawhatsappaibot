/**
 * Personal Contact Admin Business Assistant Tools
 * 
 * Implements server-authoritative tools allowing owners to manage Personal Contacts
 * and Contact Memory through the Business WhatsApp Admin BA channel.
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import { formatSafeContactPhoneDisplay, doPhonesMatch } from "./personal-contact-identity-service.ts";
import { extractPhoneDigits } from "./whatsapp-contact-identity-resolver.ts";
import { formatInternationalPhone } from "../utils/contact-identity.ts";
import type { PersonalContact, PersonalContactRelationship } from "./personal-contact-types.ts";

export interface ContactTargetResolution {
  contact?: PersonalContact;
  directRecipient?: {
    displayName: string;
    canonicalPhone: string;
    jid: string;
    isDirectNumber: boolean;
  };
  ambiguousChoices?: string[];
  error?: string;
}

export const contactAdminDeps = {
  listPersonalContacts: (accountId: string, filter?: any) => personalContactService.listPersonalContacts(accountId, filter),
  getPersonalContact: (accountId: string, contactId: string) => personalContactService.getPersonalContact(accountId, contactId),
};

export function __setContactAdminTestDeps(overrides: Partial<typeof contactAdminDeps>) {
  Object.assign(contactAdminDeps, overrides);
}

export function __resetContactAdminTestDeps() {
  Object.assign(contactAdminDeps, {
    listPersonalContacts: (accountId: string, filter?: any) => personalContactService.listPersonalContacts(accountId, filter),
    getPersonalContact: (accountId: string, contactId: string) => personalContactService.getPersonalContact(accountId, contactId),
  });
}

/**
 * Helper to resolve a target contact by ID, name, or phone with ambiguity detection.
 * Supports direct unsaved valid phone numbers (Section 4 & 22).
 */
export async function resolveContactTarget(
  accountId: string,
  identifier?: string
): Promise<ContactTargetResolution> {
  const query = String(identifier || "").trim();
  if (!query) {
    return { error: "Please specify a contact name, phone number, or ID." };
  }

  // Check direct contact ID
  if (query.startsWith("pc_")) {
    const direct = await contactAdminDeps.getPersonalContact(accountId, query);
    if (direct) return { contact: direct };
  }

  // Search contacts
  const contacts = await contactAdminDeps.listPersonalContacts(accountId);
  const q = query.toLowerCase();

  // Exact name or phone match using canonical matching
  const exactMatches = contacts.filter((c) => {
    if (c.displayName.toLowerCase() === q) return true;
    if (c.ownerAssignedName && c.ownerAssignedName.toLowerCase() === q) return true;
    return c.whatsappIdentities.some((a) => doPhonesMatch(query, a.canonicalPhone) || doPhonesMatch(query, a.jid));
  });

  if (exactMatches.length === 1) {
    return { contact: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return {
      ambiguousChoices: exactMatches.map(
        (c) => `${c.displayName} (${formatSafeContactPhoneDisplay(c)}) [ID: ${c.contactId}]`
      ),
    };
  }

  // Partial / fuzzy match
  const partialMatches = contacts.filter((c) => {
    if (c.displayName.toLowerCase().includes(q)) return true;
    if (c.relationship.toLowerCase().includes(q)) return true;
    if (c.customRelationshipLabel && c.customRelationshipLabel.toLowerCase().includes(q)) return true;
    return c.whatsappIdentities.some((a) => doPhonesMatch(query, a.canonicalPhone) || doPhonesMatch(query, a.jid) || (a.canonicalPhone && a.canonicalPhone.includes(q)));
  });

  if (partialMatches.length === 1) {
    return { contact: partialMatches[0] };
  }
  if (partialMatches.length > 1) {
    return {
      ambiguousChoices: partialMatches.map(
        (c) => `${c.displayName} (${formatSafeContactPhoneDisplay(c)}) [ID: ${c.contactId}]`
      ),
    };
  }

  // Check if query is a valid direct telephone number (Section 4 & 22: Direct number must not require saved contact)
  const phoneDigits = extractPhoneDigits(query);
  if (phoneDigits && phoneDigits.length >= 8 && phoneDigits.length <= 15) {
    const canonicalPhone = `+${phoneDigits}`;
    const displayPhone = formatInternationalPhone(canonicalPhone) || canonicalPhone;
    return {
      directRecipient: {
        displayName: displayPhone,
        canonicalPhone,
        jid: `${phoneDigits}@s.whatsapp.net`,
        isDirectNumber: true,
      },
    };
  }

  return { error: `No Personal Contact found matching "${query}".` };
}

// ---------------------------------------------------------------------------
// 1. Find Personal Contact
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "find_personal_contact",
  category: "personal_contacts",
  label: "Find Personal Contact",
  description: "Searches for a Personal Contact by name, phone number, or relationship.",
  riskLevel: "READ",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_searched",
  handler: async (context, params) => {
    const query = String(params?.query || params?.name || "").trim();
    const resolution = await resolveContactTarget(context.accountId, query);

    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${query}"*\n\nPlease specify which contact you mean:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }

    if (resolution.directRecipient) {
      const rec = resolution.directRecipient;
      return {
        success: true,
        message: `📱 *Direct Phone Number: ${rec.displayName}*\n\nThis number is not yet saved in your Personal Contacts. You can message them directly by saying "message ${rec.displayName}" or ask me to save them as a contact.`,
        data: { directRecipient: rec, phone: rec.canonicalPhone },
      };
    }

    if (resolution.error || !resolution.contact) {
      return {
        success: false,
        message: `ℹ️ ${resolution.error || "Contact not found."}`,
      };
    }

    const c = resolution.contact;
    const phone = formatSafeContactPhoneDisplay(c);
    let msg = `👤 *Personal Contact: ${c.displayName}*\n\n`;
    msg += `• *Phone:* ${phone}\n`;
    msg += `• *Relationship:* ${c.customRelationshipLabel || c.relationship}\n`;
    msg += `• *Status:* ${c.communicationPreferences?.contactCommunicationStatus || "active"}\n`;
    msg += `• *Saved Facts:* ${c.durableFacts?.length || 0}\n`;
    msg += `• *Owner Notes:* ${c.ownerNotes?.length || 0}\n`;
    msg += `• *Total Messages:* ${c.conversationMetadata?.messageCount || 0}`;

    return {
      success: true,
      message: msg.trim(),
      data: { contact: c },
    };
  },
});

// ---------------------------------------------------------------------------
// 2. List Personal Contacts
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "list_personal_contacts",
  category: "personal_contacts",
  label: "List Personal Contacts",
  description: "Lists all Personal Contacts with their safe phone numbers, relationships, and fact counts.",
  riskLevel: "READ",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contacts_listed",
  handler: async (context) => {
    const contacts = await personalContactService.listPersonalContacts(context.accountId, { status: "active" });
    if (contacts.length === 0) {
      return {
        success: true,
        message: `ℹ️ No Personal Contacts found yet for this account.`,
      };
    }

    let msg = `👥 *Personal Contacts (${contacts.length})*\n\n`;
    contacts.slice(0, 15).forEach((c, idx) => {
      const phone = formatSafeContactPhoneDisplay(c);
      const rel = c.customRelationshipLabel || c.relationship;
      msg += `${idx + 1}. *${c.displayName}* (${rel})\n   Phone: ${phone} | Facts: ${c.durableFacts.length}\n`;
    });

    if (contacts.length > 15) {
      msg += `\n_Showing first 15 of ${contacts.length} contacts._`;
    }

    return {
      success: true,
      message: msg.trim(),
      data: { contacts },
    };
  },
});

// ---------------------------------------------------------------------------
// 3. Get Personal Contact Memory
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "get_personal_contact_memory",
  category: "personal_contacts",
  label: "Get Contact Memory",
  description: "Returns what is known about a Personal Contact (facts, notes, relationship, and communication status). Use for 'What do we know about Ahmed?'.",
  riskLevel: "READ",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_memory_viewed",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const resolution = await resolveContactTarget(context.accountId, target);

    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact you mean:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }

    if (resolution.error || !resolution.contact) {
      return {
        success: false,
        message: `ℹ️ ${resolution.error || "Contact not found."}`,
      };
    }

    const summary = await personalContactService.getPersonalContactContext(context.accountId, resolution.contact.contactId);
    if (!summary) {
      return { success: false, message: "Failed to build contact context." };
    }

    let msg = `🧠 *Memory Context: ${summary.displayName}*\n\n`;
    msg += `• *Relationship:* ${summary.customRelationshipLabel || summary.relationship}\n`;
    msg += `• *Phone:* ${summary.trustedPhone || "Number unavailable"}\n`;
    msg += `• *Communication Status:* ${summary.communicationStatus}\n\n`;

    if (summary.currentDurableFacts.length > 0) {
      msg += `*Current Facts:*\n`;
      summary.currentDurableFacts.forEach((f) => {
        msg += `• *${f.label}:* ${f.value} [${f.category}]\n`;
      });
      msg += `\n`;
    } else {
      msg += `*Current Facts:* None saved\n\n`;
    }

    if (summary.activeTemporaryFacts.length > 0) {
      msg += `*Active Temporary Facts:*\n`;
      summary.activeTemporaryFacts.forEach((f) => {
        msg += `• *${f.label}:* ${f.value}\n`;
      });
      msg += `\n`;
    }

    if (summary.ownerNotes.length > 0) {
      msg += `*Private Owner Notes:*\n`;
      summary.ownerNotes.forEach((n) => {
        msg += `• ${n}\n`;
      });
    }

    return {
      success: true,
      message: msg.trim(),
      data: { summary },
    };
  },
});

// ---------------------------------------------------------------------------
// 4. Set Personal Contact Relationship
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "set_personal_contact_relationship",
  category: "personal_contacts",
  label: "Set Contact Relationship",
  description: "Sets or updates the owner-defined relationship for a Personal Contact (e.g. friend, supplier, client).",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_relationship_updated",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const relationship = (params?.relationship || "other") as PersonalContactRelationship;
    const customLabel = params?.customLabel || params?.label;

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    const updated = await personalContactService.setContactRelationship(
      context.accountId,
      resolution.contact.contactId,
      relationship,
      customLabel,
      "owner_provided"
    );

    return {
      success: true,
      message: `✅ Updated relationship for *${updated.displayName}* to *${customLabel || relationship}*.`,
      data: { contact: updated },
    };
  },
});

// ---------------------------------------------------------------------------
// 5. Save Personal Contact Note
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "save_personal_contact_note",
  category: "personal_contacts",
  label: "Save Contact Note",
  description: "Saves a private owner note about a Personal Contact.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: false,
  auditEventType: "personal_contact_note_saved",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const text = String(params?.text || params?.note || "").trim();

    if (!text) {
      return { success: false, message: "❌ Please provide the note text to save." };
    }

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    try {
      const updated = await personalContactService.addPersonalContactNote(
        context.accountId,
        resolution.contact.contactId,
        text,
        "owner_business_whatsapp"
      );
      return {
        success: true,
        message: `📝 Saved note for *${updated.displayName}*:\n"${text}"`,
        data: { contact: updated },
      };
    } catch (e: any) {
      return { success: false, message: `❌ ${e.message}` };
    }
  },
});

// ---------------------------------------------------------------------------
// 6. Save Personal Contact Fact
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "save_personal_contact_fact",
  category: "personal_contacts",
  label: "Save Contact Fact",
  description: "Explicitly stores a factual statement about a Personal Contact (e.g. 'Ahmed is an accountant', 'Ali prefers WhatsApp').",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_fact_saved",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const label = String(params?.label || "").trim();
    const value = String(params?.value || "").trim();
    const category = params?.category || "custom";

    if (!label || !value) {
      return { success: false, message: "❌ Please specify both what to remember (label) and its detail (value)." };
    }

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    try {
      const updated = await personalContactService.addPersonalContactFact(
        context.accountId,
        resolution.contact.contactId,
        {
          label,
          value,
          category,
          source: "owner_business_whatsapp",
          validUntil: params?.validUntil,
        }
      );
      return {
        success: true,
        message: `✅ Remembered for *${updated.displayName}*:\n• *${label}:* ${value}`,
        data: { contact: updated },
      };
    } catch (e: any) {
      return { success: false, message: `❌ ${e.message}` };
    }
  },
});

// ---------------------------------------------------------------------------
// 7. Correct Personal Contact Fact
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "correct_personal_contact_fact",
  category: "personal_contacts",
  label: "Correct Contact Fact",
  description: "Updates or supersedes a previously stored fact about a Personal Contact.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_fact_corrected",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const label = String(params?.label || "").trim();
    const newValue = String(params?.value || params?.newValue || "").trim();

    if (!label || !newValue) {
      return { success: false, message: "❌ Please specify both the fact label and the new corrected value." };
    }

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    try {
      const updated = await personalContactService.addPersonalContactFact(
        context.accountId,
        resolution.contact.contactId,
        {
          label,
          value: newValue,
          category: "custom",
          source: "owner_business_whatsapp",
        }
      );
      return {
        success: true,
        message: `✅ Corrected fact for *${updated.displayName}*:\n• *${label}:* ${newValue} (supersedes previous value)`,
        data: { contact: updated },
      };
    } catch (e: any) {
      return { success: false, message: `❌ ${e.message}` };
    }
  },
});

// ---------------------------------------------------------------------------
// 8. Remove Personal Contact Fact
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "remove_personal_contact_fact",
  category: "personal_contacts",
  label: "Remove Contact Fact",
  description: "Deletes a targeted memory fact from a Personal Contact.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_fact_removed",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const factIdOrLabel = String(params?.factId || params?.label || "").trim();

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    const c = resolution.contact;
    const match = c.durableFacts.find(
      (f) => f.factId === factIdOrLabel || f.label.toLowerCase() === factIdOrLabel.toLowerCase()
    );

    if (!match) {
      return { success: false, message: `ℹ️ No fact matching "${factIdOrLabel}" found on ${c.displayName}.` };
    }

    const updated = await personalContactService.removePersonalContactFact(
      context.accountId,
      c.contactId,
      match.factId
    );

    return {
      success: true,
      message: `🗑️ Removed fact *${match.label}* from *${updated.displayName}*.`,
      data: { contact: updated },
    };
  },
});

// ---------------------------------------------------------------------------
// 9. Set Do Not Contact / Communication Status
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "set_personal_contact_do_not_contact",
  category: "personal_contacts",
  label: "Set Contact Do-Not-Contact",
  description: "Sets the communication status for a Personal Contact (active, do_not_contact, blocked_by_owner).",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_status_updated",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();
    const status = params?.status || "do_not_contact";

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    const updated = await personalContactService.setContactCommunicationStatus(
      context.accountId,
      resolution.contact.contactId,
      status
    );

    return {
      success: true,
      message: `🛡️ Set communication status for *${updated.displayName}* to *${status}*.`,
      data: { contact: updated },
    };
  },
});

// ---------------------------------------------------------------------------
// 10. Archive Personal Contact
// ---------------------------------------------------------------------------
registerAdminAction({
  actionId: "archive_personal_contact",
  category: "personal_contacts",
  label: "Archive Personal Contact",
  description: "Archives a Personal Contact without deleting underlying message history.",
  riskLevel: "SAFE_WRITE",
  requiredRole: "owner",
  requiresConfirmation: false,
  idempotent: true,
  auditEventType: "personal_contact_archived",
  handler: async (context, params) => {
    const target = String(params?.contactId || params?.name || params?.query || "").trim();

    const resolution = await resolveContactTarget(context.accountId, target);
    if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
      return {
        success: true,
        message: `🔍 *Multiple Contacts Found for "${target}"*\n\nPlease specify which contact:\n${resolution.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
      };
    }
    if (resolution.error || !resolution.contact) {
      return { success: false, message: `ℹ️ ${resolution.error || "Contact not found."}` };
    }

    const updated = await personalContactService.archivePersonalContact(
      context.accountId,
      resolution.contact.contactId
    );

    return {
      success: true,
      message: `📦 Archived Personal Contact *${updated.displayName}*.`,
      data: { contact: updated },
    };
  },
});
