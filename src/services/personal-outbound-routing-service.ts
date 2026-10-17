/**
 * Personal Outbound Mission Routing Service
 * 
 * Enforces critical routing priority for incoming messages on Personal instances:
 * 1. Manual owner takeover suppresses all AI.
 * 2. Active Outbound Mission takes priority over generic Incoming Assistant.
 * 3. Fall through to generic Incoming Assistant only when NO active mission exists.
 * Guarantees at most ONE autonomous response per message batch.
 */

import {
  getActiveMissionForContact,
  savePersonalOutboundMission,
} from "./personal-outbound-storage-service.ts";
import { getActiveTaskForContact } from "./personal-task-storage-service.ts";
import { executeInboundReplyOnTask } from "./personal-task-executor.ts";
import {
  planMissionContinuationTurn,
} from "./personal-outbound-planner-service.ts";
import {
  sendPersonalOutboundMissionMessage,
  notifyOwnerMissionEvent,
} from "./personal-outbound-send-service.ts";
import { mapTaskStateToMissionStatus } from "./personal-task-migration.ts";
import { isManualTakeoverActive } from "./personal-incoming-eligibility-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import * as dbService from "./db-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type {
  PersonalOutboundMission,
  PersonalOutboundReplyResult,
} from "./personal-outbound-types.ts";

export interface RoutePersonalInboundMessageParams {
  tenantId: string;
  personalInstanceId: string;
  remoteJid: string;
  messageId: string;
  textContent: string;
  contact?: PersonalContact | null;
  sock?: any;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
  now?: number;
}

/**
 * Evaluates whether an incoming message belongs to an active Outbound Mission or Task.
 * If yes: handles the continuation and returns { handled: true }.
 * If no: returns { handled: false } so generic Incoming Assistant can proceed.
 */
export async function routePersonalInboundMessage(
  params: RoutePersonalInboundMessageParams
): Promise<PersonalOutboundReplyResult> {
  const {
    tenantId,
    personalInstanceId,
    remoteJid,
    messageId,
    textContent,
    contact,
    sock,
    sendBusinessNotification,
    now = Date.now(),
  } = params;

  const contactId = contact?.contactId || `pc_jid_${remoteJid}`;

  // 1. Manual Takeover Gate
  const takeover = isManualTakeoverActive(tenantId, personalInstanceId, contactId, now);
  if (takeover.active) {
    // Suppress all AI
    return { handled: true, reason: "manual_takeover_active" };
  }

  // 2. Check for Active Personal Task (Prompt 6)
  const activeTask = await getActiveTaskForContact(tenantId, personalInstanceId, contactId, remoteJid);
  if (activeTask) {
    const taskResult = await executeInboundReplyOnTask({
      task: activeTask,
      textContent,
      messageId,
      sock,
      sendBusinessNotification,
      now,
    });
    return {
      handled: taskResult.handled,
      missionId: activeTask.taskId,
      status: mapTaskStateToMissionStatus(taskResult.task?.currentState || activeTask.currentState),
      reason: taskResult.reason,
    };
  }

  // 3. Check for Active Outbound Mission (Prompt 5 Compatibility)
  const activeMission = await getActiveMissionForContact(tenantId, personalInstanceId, contactId);
  if (activeMission) {
    return await handleActiveMissionInboundReply({
      mission: activeMission,
      textContent,
      messageId,
      contact,
      sock,
      sendBusinessNotification,
      now,
    });
  }

  return { handled: false };
}

export async function handleActiveMissionInboundReply(params: {
  mission: PersonalOutboundMission;
  textContent: string;
  messageId: string;
  contact?: PersonalContact | null;
  sock?: any;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
  now?: number;
}): Promise<PersonalOutboundReplyResult> {
  const { mission, textContent, messageId, contact, sock, sendBusinessNotification, now = Date.now() } = params;

  // If mission already needs owner, do not generate competing autonomous reply
  if (mission.status === "NEEDS_OWNER") {
    mission.lastInboundMessageId = messageId;
    mission.lastActivityAt = now;
    await savePersonalOutboundMission(mission);
    return {
      handled: true,
      missionId: mission.missionId,
      status: "NEEDS_OWNER",
      reason: "waiting_for_owner_input",
    };
  }

  // Fetch recent conversation history
  const rawHistory = await dbService.getChatHistory(mission.accountId, mission.targetIdentity.jid, 8).catch(() => []);
  const conversationHistory: Array<{ role: "user" | "assistant" | "model"; text: string }> = [];
  if (Array.isArray(rawHistory)) {
    for (const h of rawHistory) {
      conversationHistory.push({
        role: h.role === "user" ? ("user" as const) : ("assistant" as const),
        text: String(h.text || ""),
      });
    }
  }

  // Plan Continuation Turn
  const plan = await planMissionContinuationTurn({
    mission,
    targetInboundText: textContent,
    conversationHistory,
    contact,
  });

  mission.lastInboundMessageId = messageId;
  mission.lastActivityAt = now;

  // Handle Target Opt-Out
  if (plan.isOptOut) {
    mission.status = "CANCELLED";
    mission.statusReason = "target_opt_out";
    await savePersonalOutboundMission(mission);

    // Update Contact Communication Status to do_not_contact
    if (contact?.contactId) {
      await personalContactService.setContactCommunicationStatus(
        mission.accountId,
        contact.contactId,
        "do_not_contact"
      ).catch(() => {});
    }

    // Send polite opt-out acknowledgment
    if (plan.replyText) {
      await sendPersonalOutboundMissionMessage({
        mission,
        messageText: plan.replyText,
        stepIndex: mission.stepCount,
        sock,
        sendBusinessNotification,
        now,
      });
    }

    // Notify Owner of Cancellation
    await notifyOwnerMissionEvent({
      mission,
      eventType: "FAILED",
      summary: "Recipient requested to stop messaging. Contact marked Do-Not-Contact.",
      sendBusinessNotification,
      now,
    });

    return {
      handled: true,
      missionId: mission.missionId,
      status: "CANCELLED",
      reason: "target_opt_out",
    };
  }

  // Handle Missing Owner Info / Redirection -> NEEDS_OWNER
  if (plan.needsOwner) {
    mission.status = "NEEDS_OWNER";
    mission.unresolvedQuestion = plan.unresolvedQuestion || "Recipient asked a question requiring owner input.";
    await savePersonalOutboundMission(mission);

    // Send reply informing target we are checking with owner if generated
    if (plan.replyText) {
      await sendPersonalOutboundMissionMessage({
        mission,
        messageText: plan.replyText,
        stepIndex: mission.stepCount,
        sock,
        sendBusinessNotification,
        now,
      });
    }

    // Notify Owner via Business WhatsApp
    await notifyOwnerMissionEvent({
      mission,
      eventType: "NEEDS_OWNER",
      summary: mission.unresolvedQuestion,
      unresolvedQuestion: mission.unresolvedQuestion,
      sendBusinessNotification,
      now,
    });

    return {
      handled: true,
      missionId: mission.missionId,
      status: "NEEDS_OWNER",
      replyText: plan.replyText,
    };
  }

  // Handle Mission Completion
  if (plan.isComplete) {
    mission.status = "COMPLETED";
    mission.resultSummary = plan.resultSummary || "Requested details obtained.";
    mission.collectedFacts = [...(mission.collectedFacts || []), ...(plan.collectedFacts || [])];
    await savePersonalOutboundMission(mission);

    // If commercial facts or info gathered, save to Personal Contact Memory
    if (contact?.contactId && plan.collectedFacts && plan.collectedFacts.length > 0) {
      for (const fact of plan.collectedFacts) {
        await personalContactService.addPersonalContactFact(mission.accountId, contact.contactId, {
          category: fact.key === "quoted_price" ? "pricing" : "custom",
          label: fact.key === "quoted_price" ? "Quoted Price" : "Mission Detail",
          value: fact.value,
          source: "contact_explicit_message",
        }).catch(() => {});
      }
    }

    // Send polite closing message to target
    if (plan.replyText) {
      await sendPersonalOutboundMissionMessage({
        mission,
        messageText: plan.replyText,
        stepIndex: mission.stepCount,
        sock,
        sendBusinessNotification,
        now,
      });
    }

    // Report Result to Owner via Business WhatsApp
    await notifyOwnerMissionEvent({
      mission,
      eventType: "COMPLETED",
      summary: mission.resultSummary,
      sendBusinessNotification,
      now,
    });

    return {
      handled: true,
      missionId: mission.missionId,
      status: "COMPLETED",
      replyText: plan.replyText,
    };
  }

  // Autonomous continuation turn: send next question/follow-up to target
  if (plan.replyText) {
    const sendRes = await sendPersonalOutboundMissionMessage({
      mission,
      messageText: plan.replyText,
      stepIndex: mission.stepCount,
      sock,
      sendBusinessNotification,
      now,
    });

    return {
      handled: true,
      missionId: mission.missionId,
      status: mission.status,
      replyText: plan.replyText,
      reason: sendRes.success ? "sent_continuation" : "send_failed",
    };
  }

  return {
    handled: true,
    missionId: mission.missionId,
    status: mission.status,
  };
}
