/**
 * Personal Outbound Send & Owner Notification Service
 * 
 * Manages transmission of outbound mission messages and owner reporting:
 * - Pre-send eligibility checks (manual takeover, do_not_contact, blocked_by_owner)
 * - Strict send idempotency (one message per step maximum)
 * - Safe usage classification: personal_assistant_outbound_message (no customer $0.003 charge)
 * - Grounded owner result reporting via controlling Business WhatsApp ($0.003 standard charge)
 * - Deduplicated owner notifications (anti-spam cooldown)
 */

import { createHash } from "node:crypto";
import { sendUniversalOutboundText } from "./universal-outbound-send-service.ts";
import { isManualTakeoverActive } from "./personal-incoming-eligibility-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import { formatWhatsAppResponse } from "./whatsapp-ai-response-style-service.ts";
import { reservePersonalContactForNewPhone } from "./personal-outbound-target-service.ts";
import { getWorkerPort } from "./worker-port-registry-service.ts";
import { buildWorkerInternalHeaders } from "./worker-internal-auth-service.ts";
import {
  savePersonalOutboundMission,
  updateMissionStatus,
} from "./personal-outbound-storage-service.ts";
import { acquireAtomicClaim } from "./canonical-claim-service.ts";
import type {
  PersonalOutboundMission,
  PersonalOutboundSendEligibilityResult,
} from "./personal-outbound-types.ts";

// Deduplication tracking for owner notifications (30-min window)
const ownerNotificationDedupMap = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;

export async function validatePreSendEligibility(params: {
  mission: PersonalOutboundMission;
  now?: number;
}): Promise<PersonalOutboundSendEligibilityResult> {
  const { mission, now = Date.now() } = params;

  // 1. Mission Status Gate
  if (mission.status === "CANCELLED") {
    return { allowed: false, reason: "mission_cancelled", mission };
  }
  if (mission.status === "COMPLETED") {
    return { allowed: false, reason: "mission_already_completed", mission };
  }
  if (mission.status === "FAILED") {
    return { allowed: false, reason: "mission_failed", mission };
  }

  // 2. Manual Takeover Gate
  const takeover = isManualTakeoverActive(
    mission.accountId,
    mission.personalInstanceId,
    mission.targetContactId,
    now
  );
  if (takeover.active) {
    return { allowed: false, reason: "manual_takeover_active", mission };
  }

  // 3. Contact Communication Control Gate
  if (mission.targetContactId && !mission.targetContactId.startsWith("pc_new_")) {
    const contact = await personalContactService.getPersonalContact(
      mission.accountId,
      mission.targetContactId
    );
    if (contact) {
      const prefs = contact.communicationPreferences;
      if (prefs?.contactCommunicationStatus === "blocked_by_owner") {
        return { allowed: false, reason: "contact_blocked_by_owner", mission };
      }
      if (prefs?.contactCommunicationStatus === "do_not_contact" || prefs?.doNotContact) {
        return { allowed: false, reason: "contact_do_not_contact", mission };
      }
      if (prefs?.contactCommunicationStatus === "paused_by_owner") {
        return { allowed: false, reason: "contact_paused_by_owner", mission };
      }
      if (contact.status === "archived") {
        return { allowed: false, reason: "contact_archived", mission };
      }
    }
  }

  return { allowed: true, mission };
}

export interface SendMissionMessageParams {
  mission: PersonalOutboundMission;
  messageText: string;
  stepIndex: number;
  sock?: any;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
  now?: number;
}

export async function sendPersonalOutboundMissionMessage(
  params: SendMissionMessageParams
): Promise<{ success: boolean; messageId?: string; reason?: string; mission: PersonalOutboundMission }> {
  const { mission, messageText, stepIndex, sock, sendBusinessNotification, now = Date.now() } = params;

  // 1. Verify Pre-Send Eligibility
  const preCheck = await validatePreSendEligibility({ mission, now });
  if (!preCheck.allowed) {
    return { success: false, reason: preCheck.reason, mission };
  }

  // 2. Format message cleanly for WhatsApp
  const cleanText = formatWhatsAppResponse(messageText);
  if (!cleanText.trim()) {
    return { success: false, reason: "empty_message", mission };
  }

  // 3. Idempotency Key
  const idempotencyKey = `pom_send:${mission.missionId}:${stepIndex}:${mission.targetIdentity.jid}`;

  // 4. Send via Canonical Universal Outbound Path
  let sentMessageId: string | undefined;
  try {
    const sendResult = await sendUniversalOutboundText({
      userId: mission.accountId,
      botId: mission.personalInstanceId,
      customerJid: mission.targetIdentity.jid,
      messageText: cleanText,
      idempotencyKey,
      contextType: "personal_assistant_outbound_mission",
      contextId: mission.missionId,
      sendText: async (targetJid, text) => {
        // Direct local Baileys socket if available
        if (sock && typeof sock.sendMessage === "function") {
          const sent = await sock.sendMessage(targetJid, { text });
          const id = sent?.key?.id;
          if (!id) throw new Error("WhatsApp socket returned no message ID");
          return { messageId: id };
        }

        // Cross-process worker dispatch to Personal WhatsApp instance
        const port = getWorkerPort(mission.personalInstanceId);
        if (port) {
          const url = `http://127.0.0.1:${port}/api/bot/send-message`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...buildWorkerInternalHeaders() },
            body: JSON.stringify({ to: targetJid, text, accountId: mission.accountId }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data?.sentMessageId) {
              return { messageId: String(data.sentMessageId) };
            }
            throw new Error("Personal worker responded without sentMessageId");
          }
          const errText = await res.text().catch(() => "");
          throw new Error(`Personal worker HTTP error ${res.status}: ${errText || res.statusText}`);
        }

        // Strict grounding: Never simulate send success
        throw new Error(`transport_unavailable: Personal WhatsApp instance ${mission.personalInstanceId} is not connected or worker unavailable`);
      },
    });

    if (sendResult.status !== "sent" && sendResult.status !== "duplicate") {
      console.warn("[PersonalOutboundSend] Send failed:", sendResult.reason);
      mission.status = "FAILED";
      mission.statusReason = `send_failed: ${sendResult.reason || sendResult.status}`;
      await savePersonalOutboundMission(mission);
      return { success: false, reason: sendResult.reason || sendResult.status, mission };
    }

    sentMessageId = sendResult.messageId;
  } catch (sendErr: any) {
    console.error("[PersonalOutboundSend] Exception sending message:", sendErr?.message || sendErr);
    mission.status = "FAILED";
    mission.statusReason = `send_exception: ${sendErr?.message || sendErr}`;
    await savePersonalOutboundMission(mission);
    return { success: false, reason: sendErr?.message || "send_exception", mission };
  }

  // 5. If new phone number, reserve/create Personal Contact with provenance owner_business_whatsapp
  if (mission.targetContactId.startsWith("pc_new_") || !mission.targetContactId) {
    try {
      const createdContact = await reservePersonalContactForNewPhone(
        mission.accountId,
        mission.personalInstanceId,
        mission.targetIdentity
      );
      mission.targetContactId = createdContact.contactId;
    } catch (contactErr) {
      console.warn("[PersonalOutboundSend] Note: Contact reservation error:", contactErr);
    }
  }

  // 6. Update Mission State
  mission.stepCount = stepIndex + 1;
  mission.lastOutboundMessageId = sentMessageId;
  mission.lastActivityAt = now;

  if (mission.isSendOnly || mission.status === "COMPLETED") {
    mission.status = "COMPLETED";
    mission.resultSummary = mission.resultSummary || "Message delivered to recipient.";
  } else if (mission.status === "NEEDS_OWNER") {
    // Retain NEEDS_OWNER status when sending acknowledgment or notification
  } else if (mission.status === "CANCELLED") {
    // Retain CANCELLED status when sending opt-out acknowledgment
  } else {
    // Initial message or continuation successfully sent and awaiting response from recipient
    mission.status = "WAITING_FOR_REPLY";
  }

  await savePersonalOutboundMission(mission);

  // 7. If send-only mission completed, notify owner
  if (mission.isSendOnly && typeof sendBusinessNotification === "function") {
    await notifyOwnerMissionEvent({
      mission,
      eventType: "COMPLETED",
      summary: `Delivered your message: "${cleanText.slice(0, 80)}"`,
      sendBusinessNotification,
      now,
    });
  }

  return { success: true, messageId: sentMessageId, mission };
}

export interface NotifyOwnerEventParams {
  mission: PersonalOutboundMission;
  eventType: "COMPLETED" | "NEEDS_OWNER" | "FAILED";
  summary: string;
  unresolvedQuestion?: string;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
  now?: number;
}

export async function notifyOwnerMissionEvent(
  params: NotifyOwnerEventParams
): Promise<{ sent: boolean; isDuplicate: boolean }> {
  const { mission, eventType, summary, unresolvedQuestion, sendBusinessNotification, now = Date.now() } = params;

  if (typeof sendBusinessNotification !== "function") {
    return { sent: false, isDuplicate: false };
  }

  // Deduplication check
  const dedupContent = `${mission.missionId}:${eventType}:${unresolvedQuestion || summary}`;
  const dedupKey = createHash("sha256").update(dedupContent).digest("hex").slice(0, 16);

  const lastSent = ownerNotificationDedupMap.get(dedupKey);
  if (lastSent && now - lastSent < NOTIFICATION_COOLDOWN_MS) {
    return { sent: false, isDuplicate: true };
  }

  const claimKey = `pnotif:${dedupKey}`;
  const claim = await acquireAtomicClaim(claimKey, "owner_notif", NOTIFICATION_COOLDOWN_MS, now).catch(() => ({ acquired: true }));
  if (!claim.acquired) {
    return { sent: false, isDuplicate: true };
  }

  ownerNotificationDedupMap.set(dedupKey, now);

  const recipientLabel = mission.targetIdentity.displayName || mission.targetIdentity.canonicalPhone || "Contact";
  let noticeText = "";

  if (eventType === "COMPLETED") {
    noticeText = formatWhatsAppResponse(`
🎯 *Personal Mission Completed*

• *Recipient:* ${recipientLabel}
• *Goal:* ${mission.goal}
• *Result:* ${summary}

_Mission marked complete. No further auto-replies will be sent for this request._
    `.trim());
  } else if (eventType === "NEEDS_OWNER") {
    noticeText = formatWhatsAppResponse(`
❓ *Personal Mission Needs Your Input*

• *Recipient:* ${recipientLabel}
• *Goal:* ${mission.goal}
• *Question from Recipient:* ${unresolvedQuestion || summary}

_To answer, reply to this Business Assistant with: "Answer for ${recipientLabel}: [Your answer]"_
    `.trim());
  } else {
    noticeText = formatWhatsAppResponse(`
⚠️ *Personal Mission Notice*

• *Recipient:* ${recipientLabel}
• *Goal:* ${mission.goal}
• *Issue:* ${summary}
    `.trim());
  }

  try {
    const res = await sendBusinessNotification(noticeText);
    return { sent: Boolean(res?.success), isDuplicate: false };
  } catch (err: any) {
    console.warn("[PersonalOutboundSend] Failed notifying owner:", err?.message || err);
    return { sent: false, isDuplicate: false };
  }
}

export function __clearSendDedupForTest(): void {
  ownerNotificationDedupMap.clear();
}
