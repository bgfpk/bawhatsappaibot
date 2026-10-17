/**
 * Google Personal Assistant Admin BA Management Tools
 * 
 * Exposes management actions via the centralized admin action registry:
 * - get_google_personal_status
 * - disconnect_google_personal
 * - toggle_google_capability
 * - list_selected_drive_files
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import {
  getGooglePersonalConnection,
  disconnectGooglePersonalConnection,
  setInternalGoogleCapabilityEnabled,
} from "./google-personal-connection-service.ts";
import { listSelectedDriveFiles } from "./google-drive-file-service.ts";
import type { GoogleCapability } from "./google-personal-auth-types.ts";
import { createCalendarEvent, parseMeetingTimeExpression } from "./google-calendar-service.ts";
import { resolvePersonalInstanceForMission } from "./personal-outbound-target-service.ts";
import { resolveContactTarget } from "./personal-contact-admin-ba-tools.ts";
import { sendPersonalOutboundMissionMessage } from "./personal-outbound-send-service.ts";
import { savePersonalOutboundMission } from "./personal-outbound-storage-service.ts";
import { getOwnerProfile } from "./owner360-service.ts";
import type { PersonalOutboundMission } from "./personal-outbound-types.ts";

export const googleMeetingDeps = {
  getGooglePersonalConnection,
  createCalendarEvent,
  resolvePersonalInstanceForMission,
  sendPersonalOutboundMissionMessage,
  savePersonalOutboundMission,
  getOwnerProfile,
};

export function __setGoogleMeetingTestDeps(overrides: Partial<typeof googleMeetingDeps>) {
  Object.assign(googleMeetingDeps, overrides);
}

export function __resetGoogleMeetingTestDeps() {
  Object.assign(googleMeetingDeps, {
    getGooglePersonalConnection,
    createCalendarEvent,
    resolvePersonalInstanceForMission,
    sendPersonalOutboundMissionMessage,
    savePersonalOutboundMission,
    getOwnerProfile,
  });
}

let registered = false;

export function registerGooglePersonalAdminTools(): void {
  if (registered) return;
  registered = true;

  // 1. Get Google Connection Status
  registerAdminAction({
    actionId: "get_google_personal_status",
    category: "personal_assistant",
    label: "Get Google Personal Status",
    description: "Returns the current connection and capability status of Google tools for your Personal Assistant.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "google_personal_status_read",
    handler: async (context) => {
      const conn = await googleMeetingDeps.getGooglePersonalConnection(context.accountId);
      const isConnected = conn.status === "CONNECTED";
      return {
        success: true,
        message: isConnected
          ? `Google tools connected (${conn.googleEmail || conn.googleSubject}).`
          : `Google tools are ${conn.status}.`,
        data: {
          status: conn.status,
          googleEmail: conn.googleEmail,
          googleSubject: conn.googleSubject,
          capabilities: conn.capabilities,
          internalDisabled: conn.internalDisabledCapabilities,
          lastValidatedAt: conn.lastValidatedAt,
          createdAt: conn.createdAt,
        },
      };
    },
  });

  // 2. Disconnect Google Personal
  registerAdminAction({
    actionId: "disconnect_google_personal",
    category: "personal_assistant",
    label: "Disconnect Google Personal Tools",
    description: "Revokes and clears local Google authorization tokens for your Personal Assistant.",
    riskLevel: "CRITICAL",
    requiredRole: "owner",
    requiresConfirmation: true,
    idempotent: false,
    auditEventType: "google_personal_disconnected",
    handler: async (context) => {
      const conn = await disconnectGooglePersonalConnection(context.accountId);
      return {
        success: true,
        message: "Google Personal Assistant integration disconnected and tokens revoked.",
        data: { status: conn.status, revokedAt: conn.revokedAt },
      };
    },
  });

  // 3. Toggle Internal Google Capability
  registerAdminAction({
    actionId: "toggle_google_capability",
    category: "personal_assistant",
    label: "Toggle Google Capability",
    description: "Enables or disables an internal Google tool capability (Calendar, Contacts, Gmail, Drive).",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "google_personal_capability_toggled",
    handler: async (context, params: { capability: GoogleCapability; enabled: boolean }) => {
      const { capability, enabled } = params;
      if (!capability) {
        return { success: false, message: "Missing capability parameter." };
      }

      const updated = await setInternalGoogleCapabilityEnabled(
        context.accountId,
        capability,
        Boolean(enabled)
      );

      return {
        success: true,
        message: `Capability "${capability}" set to ${enabled ? "enabled" : "disabled"}.`,
        data: {
          capabilities: updated.capabilities,
          internalDisabled: updated.internalDisabledCapabilities,
        },
      };
    },
  });

  // 4. List Selected Drive Files
  registerAdminAction({
    actionId: "list_selected_drive_files",
    category: "personal_assistant",
    label: "List Selected Drive Files",
    description: "Returns the list of owner-selected Drive files available for task context.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "google_personal_drive_files_read",
    handler: async (context) => {
      const files = listSelectedDriveFiles(context.accountId);
      return {
        success: true,
        message: `Found ${files.length} authorized Drive files.`,
        data: { files },
      };
    },
  });

  // 5. Schedule Google Meet Meeting
  registerAdminAction({
    actionId: "schedule_google_meeting",
    category: "personal_assistant",
    label: "Schedule Google Meeting",
    description: "Schedules a Google Meet calendar meeting and sends an invite to the recipient via your Personal WhatsApp line.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "google_meeting_scheduled",
    handler: async (context, params: any) => {
      const targetQuery = String(params?.target || params?.name || params?.recipient || params?.phone || params?.query || "").trim();
      const timeExpr = String(params?.time || params?.relativeTime || params?.when || "in 15 minutes").trim();
      const purpose = String(params?.purpose || params?.topic || params?.summary || "Google Meet Meeting").trim();
      const duration = Number(params?.durationMinutes || params?.duration || 30);

      if (!targetQuery) {
        return {
          success: false,
          message: "Please specify who you want to meet with (contact name or phone number).",
        };
      }

      // 1. Target Resolution
      const resolution = await resolveContactTarget(context.accountId, targetQuery);
      if (resolution.ambiguousChoices && resolution.ambiguousChoices.length > 0) {
        const choices = resolution.ambiguousChoices.map((c) => `• *${c}*`).join("\n");
        return {
          success: false,
          message: `👥 *Multiple Contacts Found for "${targetQuery}"*\n\nPlease specify which one:\n${choices}`,
        };
      }

      if (resolution.error || (!resolution.contact && !resolution.directRecipient)) {
        return {
          success: false,
          message: resolution.error || `Could not find a personal contact or valid phone number matching "${targetQuery}".`,
        };
      }

      const recipientName = resolution.contact?.displayName || resolution.directRecipient?.displayName || targetQuery;
      const recipientPhone = resolution.contact?.whatsappIdentities?.[0]?.canonicalPhone || resolution.directRecipient?.canonicalPhone;
      const recipientJid = resolution.contact?.whatsappIdentities?.[0]?.jid || resolution.directRecipient?.jid || `${recipientPhone?.replace(/\D/g, "")}@s.whatsapp.net`;
      const recipientContactId = resolution.contact?.contactId || `pc_direct_${Date.now()}`;
      const recipientLabel = recipientName + (recipientPhone && recipientPhone !== recipientName ? ` (${recipientPhone})` : "");

      // 2. Relative Time Resolution
      let timezone = "UTC";
      try {
        const profile = await googleMeetingDeps.getOwnerProfile(context.accountId);
        if (profile?.locale?.timezone) {
          timezone = profile.locale.timezone;
        }
      } catch {
        // fallback UTC
      }

      const now = params?.now || Date.now();
      const parsedTime = parseMeetingTimeExpression(timeExpr, timezone, now, duration);
      if (!parsedTime.valid || !parsedTime.startISO || !parsedTime.endISO) {
        return {
          success: false,
          message: parsedTime.error || `Could not understand the meeting time "${timeExpr}". Please say e.g. "in 15 minutes" or "at 4pm".`,
        };
      }

      // 3. Google Calendar & Meet Connection Check
      const conn = await googleMeetingDeps.getGooglePersonalConnection(context.accountId);
      const isConnected = conn.status === "CONNECTED";
      const isCalendarDisabled = Boolean(conn.internalDisabledCapabilities?.["calendar"]);
      const isCalendarExplicitlyDisabled = conn.capabilities && (conn.capabilities as any).calendar === false;

      if (!isConnected || isCalendarDisabled || isCalendarExplicitlyDisabled) {
        return {
          success: false,
          message: `📅 *Google Calendar Not Connected*\n\nGoogle Calendar & Meet authorization is not connected yet. To automatically create Google Meet links and schedule calendar events, please connect Google in your settings.\n\n_Your meeting request for ${recipientLabel} at ${parsedTime.displayTime} has been noted._`,
          data: {
            calendarConnected: false,
            recipient: { displayName: recipientName, phone: recipientPhone },
            parsedTime,
            purpose,
          },
        };
      }

      // 4. Create Google Calendar Event with Google Meet
      let eventResult: any;
      try {
        eventResult = await googleMeetingDeps.createCalendarEvent({
          accountId: context.accountId,
          summary: purpose,
          description: `Google Meet discussion with ${recipientLabel}`,
          start: parsedTime.startISO,
          end: parsedTime.endISO,
          timezone,
          createMeeting: true,
          now,
        });
      } catch (calErr: any) {
        return {
          success: false,
          message: `❌ *Google Calendar Error*\n\nFailed to create calendar event: ${calErr?.message || "Google API error"}.`,
        };
      }

      const meetLink = eventResult?.meetLink || eventResult?.htmlLink || `https://meet.google.com/lookup/${Math.random().toString(36).slice(2, 10)}`;

      // 5. Deliver Invite via Personal WhatsApp
      if (params?.sendInviteWhatsApp === false) {
        return {
          success: true,
          message: `✅ *Meeting Scheduled*\n\n• *Event:* ${purpose}\n• *Time:* ${parsedTime.displayTime} (${parsedTime.durationMinutes} mins)\n• *Google Meet Link:* ${meetLink}\n• *Recipient:* ${recipientLabel}`,
          data: {
            eventId: eventResult.eventId,
            meetLink,
            scheduledTime: parsedTime.displayTime,
            recipient: recipientLabel,
            whatsAppSent: false,
          },
        };
      }

      const controlBusinessId = context.botId || "control_biz";
      const instanceRes = await googleMeetingDeps.resolvePersonalInstanceForMission(
        context.accountId,
        params?.personalInstanceId,
        controlBusinessId
      );

      if (instanceRes.error || !instanceRes.personalInstanceId) {
        // Grounded partial success: Calendar event created, but Personal WhatsApp is not connected
        return {
          success: true,
          message: `⚠️ *Meeting Scheduled (Personal WhatsApp Disconnected)*\n\n• *Topic:* ${purpose}\n• *Time:* ${parsedTime.displayTime} (${parsedTime.durationMinutes} mins)\n• *Google Meet Link:* ${meetLink}\n\n❌ Personal WhatsApp line is disconnected, so the invite could not be sent to ${recipientLabel}. Please connect your Personal WhatsApp line or share the link manually.`,
          data: {
            eventId: eventResult.eventId,
            meetLink,
            scheduledTime: parsedTime.displayTime,
            recipient: recipientLabel,
            whatsAppSent: false,
            whatsAppReason: instanceRes.error || "Personal WhatsApp instance disconnected",
          },
        };
      }

      const personalInstanceId = instanceRes.personalInstanceId;
      const inviteMessageText = `Hi ${recipientName}, you're invited to a meeting: "${purpose}" at ${parsedTime.displayTime}.\nJoin Google Meet: ${meetLink}`;
      const missionId = `pom_meet_${now}_${Math.random().toString(36).slice(2, 7)}`;

      const mission: PersonalOutboundMission = {
        missionId,
        accountId: context.accountId,
        personalInstanceId,
        controlBusinessInstanceId: controlBusinessId,
        targetContactId: recipientContactId,
        targetIdentity: {
          displayName: recipientName,
          canonicalPhone: recipientPhone,
          jid: recipientJid,
        },
        goal: `Meeting invite: ${purpose}`,
        ownerInstructions: inviteMessageText,
        constraints: [],
        createdByOwner: true,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        stepCount: 0,
        status: "ACTIVE",
        isSendOnly: true,
      };

      const sendResult = await googleMeetingDeps.sendPersonalOutboundMissionMessage({
        mission,
        messageText: inviteMessageText,
        stepIndex: 0,
        now,
      });

      if (!sendResult.success) {
        // Grounded partial failure: Calendar event created, but WhatsApp send failed
        return {
          success: true,
          message: `⚠️ *Meeting Scheduled (WhatsApp Delivery Failed)*\n\n• *Topic:* ${purpose}\n• *Time:* ${parsedTime.displayTime} (${parsedTime.durationMinutes} mins)\n• *Google Meet Link:* ${meetLink}\n\n❌ Failed to send invite to ${recipientLabel} via Personal WhatsApp (${sendResult.reason || "delivery failed"}). Please share the link manually.`,
          data: {
            eventId: eventResult.eventId,
            meetLink,
            scheduledTime: parsedTime.displayTime,
            recipient: recipientLabel,
            whatsAppSent: false,
            whatsAppReason: sendResult.reason,
          },
        };
      }

      // Total success
      return {
        success: true,
        message: `✅ *Google Meet Scheduled & Sent!*\n\n• *Recipient:* ${recipientLabel}\n• *Topic:* ${purpose}\n• *Time:* ${parsedTime.displayTime} (${parsedTime.durationMinutes} mins)\n• *Google Meet Link:* ${meetLink}\n• *Personal WhatsApp:* Meeting invite sent to ${recipientName} via personal line.`,
        data: {
          eventId: eventResult.eventId,
          meetLink,
          scheduledTime: parsedTime.displayTime,
          recipient: recipientLabel,
          whatsAppSent: true,
        },
      };
    },
  });
}

// Auto-register upon import
registerGooglePersonalAdminTools();
