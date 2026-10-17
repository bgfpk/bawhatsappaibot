/**
 * Personal Incoming Assistant Admin Business Assistant Tools
 * 
 * Provides server-authoritative Admin BA tools allowing authorized owners to configure
 * and control Incoming Personal Assistant behavior exclusively through the Business WhatsApp channel.
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import { getIncomingPersonalAssistantSettings, saveIncomingPersonalAssistantSettings } from "./personal-incoming-settings-service.ts";
import { clearManualTakeover } from "./personal-incoming-eligibility-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import { formatSafeContactPhoneDisplay } from "./personal-contact-identity-service.ts";
import { isPersonalAssistantFeatureEnabled } from "./personal-assistant-config-service.ts";
import * as dbService from "./db-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";

/**
 * Helper to resolve target contact by name, phone, or ID with ambiguity handling.
 */
async function resolveTargetContact(
  accountId: string,
  identifier?: string
): Promise<{ contact?: PersonalContact; ambiguousChoices?: string[]; error?: string }> {
  const query = String(identifier || "").trim();
  if (!query) {
    return { error: "Please specify a personal contact name, phone number, or ID." };
  }

  if (query.startsWith("pc_")) {
    const direct = await personalContactService.getPersonalContact(accountId, query);
    if (direct) return { contact: direct };
  }

  const contacts = await personalContactService.listPersonalContacts(accountId);
  const q = query.toLowerCase();

  const exact = contacts.filter((c) => {
    if (c.displayName.toLowerCase() === q) return true;
    if (c.ownerAssignedName?.toLowerCase() === q) return true;
    return c.whatsappIdentities.some((a) => a.canonicalPhone === q || a.canonicalPhone?.endsWith(q));
  });

  if (exact.length === 1) return { contact: exact[0] };
  if (exact.length > 1) {
    return {
      ambiguousChoices: exact.map((c) => `${c.displayName} (${formatSafeContactPhoneDisplay(c)}) [ID: ${c.contactId}]`),
    };
  }

  const partial = contacts.filter((c) => {
    if (c.displayName.toLowerCase().includes(q)) return true;
    return c.whatsappIdentities.some((a) => a.canonicalPhone?.includes(q));
  });

  if (partial.length === 1) return { contact: partial[0] };
  if (partial.length > 1) {
    return {
      ambiguousChoices: partial.map((c) => `${c.displayName} (${formatSafeContactPhoneDisplay(c)}) [ID: ${c.contactId}]`),
    };
  }

  return { error: `No personal contact found matching "${query}".` };
}

/**
 * Registers all Incoming Personal Assistant Admin BA tools into the registry.
 */
export function registerPersonalIncomingAdminTools(): void {
  // 1. ENABLE INCOMING ASSISTANT
  registerAdminAction({
    actionId: "enable_incoming_personal_assistant",
    category: "personal_assistant",
    label: "Enable Incoming Personal Assistant",
    description: "Enables incoming auto-replies for a Personal WhatsApp instance.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "incoming_personal_assistant_enabled",
    handler: async (context, params) => {
      if (!isPersonalAssistantFeatureEnabled()) {
        return { success: false, message: "Personal Assistant feature is currently disabled." };
      }
      const instanceId = String(params?.instanceId || "default_personal");
      const replyMode = params?.replyMode === "all_private_contacts" ? "all_private_contacts" : "known_contacts_only";

      const updated = await saveIncomingPersonalAssistantSettings(context.accountId, instanceId, {
        enabled: true,
        incomingReplyMode: replyMode,
      });

      return {
        success: true,
        message: `✅ *Incoming Personal Assistant Enabled*\n\n• *Instance:* \`${instanceId}\`\n• *Reply Scope:* ${updated.incomingReplyMode === "all_private_contacts" ? "All Private 1-to-1 Contacts" : "Known Contacts Only"}\n• *Assistant Name:* ${updated.assistantDisplayName}\n\n_Auto-replies will now trigger for eligible incoming private messages._`,
        data: updated,
      };
    },
  });

  // 2. DISABLE INCOMING ASSISTANT
  registerAdminAction({
    actionId: "disable_incoming_personal_assistant",
    category: "personal_assistant",
    label: "Disable Incoming Personal Assistant",
    description: "Disables incoming auto-replies for a Personal WhatsApp instance.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "incoming_personal_assistant_disabled",
    handler: async (context, params) => {
      const instanceId = String(params?.instanceId || "default_personal");
      const updated = await saveIncomingPersonalAssistantSettings(context.accountId, instanceId, {
        enabled: false,
        incomingReplyMode: "off",
      });

      return {
        success: true,
        message: `🛑 *Incoming Personal Assistant Disabled*\n\n• *Instance:* \`${instanceId}\`\n• *Status:* OFF\n\n_Auto-replies are paused. Inbound messages will only be saved to chat history._`,
        data: updated,
      };
    },
  });

  // 3. GET SETTINGS
  registerAdminAction({
    actionId: "get_incoming_personal_assistant_settings",
    category: "personal_assistant",
    label: "Get Incoming Personal Assistant Settings",
    description: "Views technical configuration settings of the incoming Personal Assistant (takeover duration, reply scope, owner escalation). DO NOT use for general capability questions or when the user asks what the Personal Assistant can do.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "incoming_personal_assistant_settings_viewed",
    handler: async (context, params) => {
      const instanceId = String(params?.instanceId || "default_personal");
      const settings = await getIncomingPersonalAssistantSettings(context.accountId, instanceId);

      const statusEmoji = settings.enabled ? "🟢 Active" : "🔴 Inactive (Off)";
      const scopeLabel = settings.incomingReplyMode === "all_private_contacts"
        ? "All Private Contacts"
        : settings.incomingReplyMode === "known_contacts_only"
        ? "Known Contacts Only"
        : "Off";

      const instructionsPreview = settings.globalInstructions?.trim()
        ? `"${settings.globalInstructions.slice(0, 120)}${settings.globalInstructions.length > 120 ? "..." : ""}"`
        : "_None configured_";

      return {
        success: true,
        message: `⚙️ *Incoming Personal Assistant Settings*\n\n• *Status:* ${statusEmoji}\n• *Reply Scope:* ${scopeLabel}\n• *Assistant Name:* ${settings.assistantDisplayName}\n• *Manual Takeover Duration:* ${settings.manualTakeoverDurationMinutes} minutes\n• *Escalations to Owner:* ${settings.ownerEscalationEnabled ? "Enabled" : "Disabled"}\n• *Global Instructions:* ${instructionsPreview}\n\n_Manage settings via natural commands (e.g. "turn assistant on", "pause for Ahmed")._`,
        data: settings,
      };
    },
  });

  // 4. UPDATE SETTINGS
  registerAdminAction({
    actionId: "update_incoming_personal_assistant_settings",
    category: "personal_assistant",
    label: "Update Incoming Personal Assistant Settings",
    description: "Updates instructions, assistant name, or takeover duration for Incoming Personal Assistant.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "incoming_personal_assistant_settings_updated",
    handler: async (context, params) => {
      const instanceId = String(params?.instanceId || "default_personal");
      const patch: any = {};
      if (typeof params?.instructions === "string") patch.globalInstructions = params.instructions;
      if (typeof params?.assistantDisplayName === "string") patch.assistantDisplayName = params.assistantDisplayName;
      if (typeof params?.manualTakeoverDurationMinutes === "number") patch.manualTakeoverDurationMinutes = params.manualTakeoverDurationMinutes;
      if (params?.replyMode) patch.incomingReplyMode = params.replyMode;

      const updated = await saveIncomingPersonalAssistantSettings(context.accountId, instanceId, patch);

      return {
        success: true,
        message: `✅ *Settings Updated for Personal Assistant*\n\n• *Assistant Name:* ${updated.assistantDisplayName}\n• *Reply Scope:* ${updated.incomingReplyMode}\n• *Takeover Window:* ${updated.manualTakeoverDurationMinutes} min\n• *Instructions Updated:* ${params?.instructions ? "Yes" : "Unchanged"}`,
        data: updated,
      };
    },
  });

  // 5. PAUSE FOR CONTACT
  registerAdminAction({
    actionId: "pause_personal_assistant_for_contact",
    category: "personal_assistant",
    label: "Pause Personal Assistant for Contact",
    description: "Pauses Personal Assistant auto-replies for a specific contact.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_assistant_paused_for_contact",
    handler: async (context, params) => {
      const resolved = await resolveTargetContact(context.accountId, params?.name);
      if (resolved.error) return { success: false, message: resolved.error };
      if (resolved.ambiguousChoices) {
        return {
          success: false,
          message: `Multiple matching contacts found. Please specify exact name or ID:\n${resolved.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
        };
      }

      const contact = resolved.contact!;
      const updated = await personalContactService.setContactCommunicationStatus(
        context.accountId,
        contact.contactId,
        "paused_by_owner"
      );

      return {
        success: true,
        message: `⏸️ *Personal Assistant Paused for ${contact.displayName}*\n\n_Auto-replies will not trigger for this contact until you resume them._`,
        data: updated,
      };
    },
  });

  // 6. RESUME FOR CONTACT
  registerAdminAction({
    actionId: "resume_personal_assistant_for_contact",
    category: "personal_assistant",
    label: "Resume Personal Assistant for Contact",
    description: "Resumes Personal Assistant auto-replies for a specific contact.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_assistant_resumed_for_contact",
    handler: async (context, params) => {
      const resolved = await resolveTargetContact(context.accountId, params?.name);
      if (resolved.error) return { success: false, message: resolved.error };
      if (resolved.ambiguousChoices) {
        return {
          success: false,
          message: `Multiple matching contacts found. Please specify exact name or ID:\n${resolved.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
        };
      }

      const contact = resolved.contact!;
      const instanceId = "default_personal";
      await clearManualTakeover(context.accountId, instanceId, contact.contactId);

      const updated = await personalContactService.setContactCommunicationStatus(
        context.accountId,
        contact.contactId,
        "active"
      );

      return {
        success: true,
        message: `▶️ *Personal Assistant Resumed for ${contact.displayName}*\n\n_Active manual takeover cleared. Eligible incoming messages will now receive assistant replies._`,
        data: updated,
      };
    },
  });

  // 7. LIST PAUSED CONTACTS
  registerAdminAction({
    actionId: "list_paused_personal_contacts",
    category: "personal_assistant",
    label: "List Paused Personal Contacts",
    description: "Lists personal contacts where Personal Assistant auto-replies are currently paused.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "paused_personal_contacts_listed",
    handler: async (context) => {
      const contacts = await personalContactService.listPersonalContacts(context.accountId);
      const paused = contacts.filter((c) => c.communicationPreferences?.contactCommunicationStatus === "paused_by_owner");

      if (paused.length === 0) {
        return {
          success: true,
          message: "ℹ️ *No Paused Contacts*\n\nPersonal Assistant is not paused for any contact.",
        };
      }

      const listStr = paused
        .map((c) => `• *${c.displayName}* (${formatSafeContactPhoneDisplay(c)})`)
        .join("\n");

      return {
        success: true,
        message: `📋 *Paused Personal Contacts (${paused.length})*\n\n${listStr}\n\n_To resume, say "resume assistant for [Name]"._`,
        data: paused,
      };
    },
  });

  // 8. GET RECENT MESSAGES
  registerAdminAction({
    actionId: "get_personal_contact_recent_messages",
    category: "personal_assistant",
    label: "Get Personal Contact Recent Messages",
    description: "Retrieves recent chat messages with a personal contact.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_contact_recent_messages_viewed",
    handler: async (context, params) => {
      const resolved = await resolveTargetContact(context.accountId, params?.name);
      if (resolved.error) return { success: false, message: resolved.error };
      if (resolved.ambiguousChoices) {
        return {
          success: false,
          message: `Multiple matching contacts found:\n${resolved.ambiguousChoices.map((c) => `• ${c}`).join("\n")}`,
        };
      }

      const contact = resolved.contact!;
      const limit = Math.min(20, Math.max(1, Number(params?.limit) || 5));
      const primaryJid = contact.whatsappIdentities[0]?.jid;
      if (!primaryJid) {
        return { success: false, message: `No WhatsApp identity registered for ${contact.displayName}.` };
      }

      const history = await dbService.getChatHistory(context.accountId, primaryJid, limit).catch(() => []);
      if (!history || history.length === 0) {
        return {
          success: true,
          message: `💬 *Chat History with ${contact.displayName}*\n\n_No recent messages found._`,
        };
      }

      const lines = history.map((m: any) => {
        const sender = m.role === "user" ? contact.displayName : "Assistant";
        return `• *${sender}:* ${m.text || "[media]"}`;
      }).join("\n");

      return {
        success: true,
        message: `💬 *Recent Messages with ${contact.displayName}*\n\n${lines}`,
        data: history,
      };
    },
  });
}

// Auto-register tools on module import
registerPersonalIncomingAdminTools();
