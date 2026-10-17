/**
 * Personal Outbound Mission Admin Business Assistant Tools
 * 
 * Provides server-authoritative Admin BA tools allowing authorized owners to start,
 * inspect, cancel, and supply information for Outbound Personal Missions exclusively
 * through their controlling Business WhatsApp channel.
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import {
  savePersonalOutboundMission,
  getPersonalOutboundMission,
  listPersonalOutboundMissions,
  updateMissionStatus,
  getActiveMissionForContact,
} from "./personal-outbound-storage-service.ts";
import {
  resolvePersonalInstanceForMission,
  resolveTargetForMission,
} from "./personal-outbound-target-service.ts";
import {
  generateFirstOutboundMissionMessage,
} from "./personal-outbound-planner-service.ts";
import {
  sendPersonalOutboundMissionMessage,
} from "./personal-outbound-send-service.ts";
import { isPersonalAssistantFeatureEnabled } from "./personal-assistant-config-service.ts";
import type { PersonalOutboundMission } from "./personal-outbound-types.ts";

export const personalOutboundAdminDeps = {
  isPersonalAssistantFeatureEnabled: () => isPersonalAssistantFeatureEnabled(),
  resolvePersonalInstanceForMission: (accountId: string, requestedInstanceId?: string, controlBusinessInstanceId?: string) =>
    resolvePersonalInstanceForMission(accountId, requestedInstanceId, controlBusinessInstanceId),
  resolveTargetForMission: (accountId: string, personalInstanceId: string, targetQuery: string) =>
    resolveTargetForMission(accountId, personalInstanceId, targetQuery),
  getActiveMissionForContact: (accountId: string, personalInstanceId: string, targetContactId: string) =>
    getActiveMissionForContact(accountId, personalInstanceId, targetContactId),
  generateFirstOutboundMissionMessage: (params: any) =>
    generateFirstOutboundMissionMessage(params),
  sendPersonalOutboundMissionMessage: (params: any) =>
    sendPersonalOutboundMissionMessage(params),
  getPersonalOutboundMission: (accountId: string, missionId: string) =>
    getPersonalOutboundMission(accountId, missionId),
  listPersonalOutboundMissions: (accountId: string, filter?: any) =>
    listPersonalOutboundMissions(accountId, filter),
  updateMissionStatus: (accountId: string, missionId: string, status: any, updates?: Partial<PersonalOutboundMission>) =>
    updateMissionStatus(accountId, missionId, status, updates),
  savePersonalOutboundMission: (mission: PersonalOutboundMission) =>
    savePersonalOutboundMission(mission),
};

export function __setPersonalOutboundAdminTestDeps(overrides: Partial<typeof personalOutboundAdminDeps>) {
  Object.assign(personalOutboundAdminDeps, overrides || {});
}

export function __resetPersonalOutboundAdminTestDeps() {
  Object.assign(personalOutboundAdminDeps, {
    isPersonalAssistantFeatureEnabled: () => isPersonalAssistantFeatureEnabled(),
    resolvePersonalInstanceForMission: (accountId: string, requestedInstanceId?: string, controlBusinessInstanceId?: string) =>
      resolvePersonalInstanceForMission(accountId, requestedInstanceId, controlBusinessInstanceId),
    resolveTargetForMission: (accountId: string, personalInstanceId: string, targetQuery: string) =>
      resolveTargetForMission(accountId, personalInstanceId, targetQuery),
    getActiveMissionForContact: (accountId: string, personalInstanceId: string, targetContactId: string) =>
      getActiveMissionForContact(accountId, personalInstanceId, targetContactId),
    generateFirstOutboundMissionMessage: (params: any) =>
      generateFirstOutboundMissionMessage(params),
    sendPersonalOutboundMissionMessage: (params: any) =>
      sendPersonalOutboundMissionMessage(params),
    getPersonalOutboundMission: (accountId: string, missionId: string) =>
      getPersonalOutboundMission(accountId, missionId),
    listPersonalOutboundMissions: (accountId: string, filter?: any) =>
      listPersonalOutboundMissions(accountId, filter),
    updateMissionStatus: (accountId: string, missionId: string, status: any, updates?: Partial<PersonalOutboundMission>) =>
      updateMissionStatus(accountId, missionId, status, updates),
    savePersonalOutboundMission: (mission: PersonalOutboundMission) =>
      savePersonalOutboundMission(mission),
  });
}

export function registerPersonalOutboundAdminTools(): void {
  // 1. START OUTBOUND MISSION
  registerAdminAction({
    actionId: "start_personal_outbound_mission",
    category: "personal_assistant",
    label: "Start Personal Outbound Mission",
    description: "Instructs the Personal Assistant to message a contact or business from the Personal WhatsApp line.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "personal_outbound_mission_started",
    handler: async (context, params) => {
      if (!personalOutboundAdminDeps.isPersonalAssistantFeatureEnabled()) {
        return { success: false, message: "Personal Assistant feature is currently disabled." };
      }

      const contactPhone = String(params?.contactPhone || params?.phone || "").trim();
      const contactName = String(params?.contactName || params?.name || "").trim();
      const targetQuery = contactPhone || String(params?.target || contactName || params?.recipient || "").trim();
      const goal = String(params?.objective || params?.goal || params?.instruction || params?.message || "").trim();
      const budgetConstraint = String(params?.budgetConstraint || "").trim();
      const negotiationTarget = String(params?.negotiationTarget || "").trim();

      if (!targetQuery) {
        return { success: false, message: "Please specify who you want to message (e.g. contact name or phone number)." };
      }
      if (!goal) {
        return { success: false, message: "Please specify what you want the assistant to ask or tell them." };
      }

      const controlBusinessId = context.botId || "control_biz";

      // 1. Resolve Personal Instance
      const instanceRes = await personalOutboundAdminDeps.resolvePersonalInstanceForMission(
        context.accountId,
        params?.personalInstanceId,
        controlBusinessId
      );

      if (instanceRes.error === "multiple_personal_instances" && instanceRes.ambiguousInstances) {
        const listStr = instanceRes.ambiguousInstances
          .map((i) => `• *${i.name}* (${i.phone || "No phone"}) [ID: \`${i.instanceId}\`]`)
          .join("\n");
        return {
          success: false,
          message: `📱 *Multiple Personal Numbers Available*\n\nPlease specify which Personal line to use:\n${listStr}`,
        };
      }

      if (instanceRes.error || !instanceRes.personalInstanceId) {
        return { success: false, message: instanceRes.error || "No eligible Personal line found." };
      }

      const personalInstanceId = instanceRes.personalInstanceId;

      // 2. Resolve Target Contact / Phone
      const targetRes = await personalOutboundAdminDeps.resolveTargetForMission(context.accountId, personalInstanceId, targetQuery);
      if (targetRes.ambiguousChoices && targetRes.ambiguousChoices.length > 0) {
        const choices = targetRes.ambiguousChoices
          .map((c) => `• *${c.displayName}* (${c.relationship}) - ${c.displayPhone}`)
          .join("\n");
        return {
          success: false,
          message: `👥 *Multiple Matching Contacts Found for "${targetQuery}"*\n\nPlease specify which contact:\n${choices}`,
        };
      }

      if (targetRes.error || !targetRes.targetIdentity) {
        return { success: false, message: targetRes.error || `Could not resolve target "${targetQuery}".` };
      }

      const targetContactId = targetRes.contact?.contactId || `pc_new_${Date.now()}`;

      // 3. Concurrency Check: Check if an active mission already exists for this contact
      const existingActive = await personalOutboundAdminDeps.getActiveMissionForContact(context.accountId, personalInstanceId, targetContactId);
      if (existingActive) {
        return {
          success: false,
          message: `⚠️ *Active Conversation Already in Progress*\n\nThere is already an active mission with *${targetRes.targetIdentity.displayName}*:\n• *Goal:* ${existingActive.goal}\n• *Status:* ${existingActive.status}\n\nPlease finish or cancel that mission before starting a new one.`,
        };
      }

      // 4. Create Mission Model
      const missionId = `pom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();

      const newMission: PersonalOutboundMission = {
        missionId,
        accountId: context.accountId,
        personalInstanceId,
        controlBusinessInstanceId: controlBusinessId,
        targetContactId,
        targetIdentity: targetRes.targetIdentity,
        goal,
        ownerInstructions: budgetConstraint ? `${goal} (Budget limit: ${budgetConstraint})` : String(params?.instructions || goal),
        constraints: [
          ...(Array.isArray(params?.constraints) ? params.constraints : []),
          ...(budgetConstraint ? [`Budget: ${budgetConstraint}`] : []),
          ...(negotiationTarget ? [`Target: ${negotiationTarget}`] : []),
        ],
        createdByOwner: true,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        stepCount: 0,
        status: "ACTIVE",
        isSendOnly: Boolean(params?.isSendOnly),
        ownerGoalId: String(params?.ownerGoalId || params?.goalId || "").trim() || undefined,
      };

      // 5. Generate First Outbound Message
      const firstMsgResult = await personalOutboundAdminDeps.generateFirstOutboundMissionMessage({
        mission: newMission,
        contact: targetRes.contact,
        ownerName: "Owner",
      });

      newMission.isSendOnly = firstMsgResult.isSendOnly;

      // 6. Transmit Initial Message
      const sendResult = await personalOutboundAdminDeps.sendPersonalOutboundMissionMessage({
        mission: newMission,
        messageText: firstMsgResult.messageText,
        stepIndex: 0,
        now,
      });

      if (!sendResult.success) {
        return {
          success: false,
          message: `❌ *Could Not Send Initial Message*\n\nReason: ${sendResult.reason || "Delivery failed"}. The mission was not started.`,
        };
      }

      const targetLabel = targetRes.targetIdentity.displayName || targetRes.targetIdentity.canonicalPhone || "Contact";
      const statusNote = newMission.isSendOnly
        ? "Message delivered to recipient."
        : "I'll let you know as soon as they respond.";

      return {
        success: true,
        message: `🚀 *Personal Mission Started*\n\n• *Recipient:* ${targetLabel}\n• *Goal:* ${goal}\n• *Status:* ${newMission.status}\n• *Initial Message Sent:* "${firstMsgResult.messageText}"\n\n_${statusNote}_`,
        data: newMission,
      };
    },
  });

  // 2. GET MISSION DETAILS
  registerAdminAction({
    actionId: "get_personal_outbound_mission",
    category: "personal_assistant",
    label: "Get Personal Outbound Mission",
    description: "Views the current progress, status, and collected facts for a Personal Outbound Mission.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_outbound_mission_viewed",
    handler: async (context, params) => {
      const missionId = String(params?.missionId || "").trim();
      const targetQuery = String(params?.target || params?.recipient || "").trim().toLowerCase();

      let mission: PersonalOutboundMission | null = null;
      if (missionId) {
        mission = await getPersonalOutboundMission(context.accountId, missionId);
      } else {
        const missions = await listPersonalOutboundMissions(context.accountId, { limit: 10 });
        if (targetQuery) {
          mission = missions.find((m) =>
            (m.targetIdentity.displayName || "").toLowerCase().includes(targetQuery) ||
            (m.targetIdentity.canonicalPhone || "").includes(targetQuery)
          ) || null;
        } else if (missions.length > 0) {
          mission = missions[0];
        }
      }

      if (!mission) {
        return { success: false, message: `Could not find an active or recent mission${targetQuery ? ` for "${params?.target || targetQuery}"` : ""}.` };
      }

      const recipient = mission.targetIdentity.displayName || mission.targetIdentity.canonicalPhone || "Contact";
      const factsStr = (mission.collectedFacts || [])
        .map((f) => `• *${f.key}:* ${f.value}`)
        .join("\n") || "_No specific facts recorded yet_";

      return {
        success: true,
        message: `📋 *Personal Mission Details*\n\n• *Mission ID:* \`${mission.missionId}\`\n• *Recipient:* ${recipient}\n• *Status:* ${mission.status}\n• *Goal:* ${mission.goal}\n• *Steps:* ${mission.stepCount}\n• *Result Summary:* ${mission.resultSummary || "_None yet_"}\n• *Unresolved Question:* ${mission.unresolvedQuestion || "_None_"}\n\n*Collected Details:*\n${factsStr}`,
        data: mission,
      };
    },
  });

  // 3. LIST OUTBOUND MISSIONS
  registerAdminAction({
    actionId: "list_personal_outbound_missions",
    category: "personal_assistant",
    label: "List Personal Outbound Missions",
    description: "Lists active or recent Personal Outbound Missions.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_outbound_missions_listed",
    handler: async (context, params) => {
      const missions = await listPersonalOutboundMissions(context.accountId, {
        status: params?.status,
        limit: params?.limit ? Number(params.limit) : 10,
      });

      if (missions.length === 0) {
        return {
          success: true,
          message: "ℹ️ *No Outbound Missions Found*\n\nYou have no active or recent Personal missions.",
        };
      }

      const lines = missions.map((m) => {
        const recipient = m.targetIdentity.displayName || m.targetIdentity.canonicalPhone || "Contact";
        return `• *${recipient}* (${m.status}): ${m.goal.slice(0, 50)}${m.goal.length > 50 ? "..." : ""}`;
      }).join("\n");

      return {
        success: true,
        message: `📋 *Personal Outbound Missions (${missions.length})*\n\n${lines}\n\n_To view details, ask: "Show details for mission [ID]"._`,
        data: missions,
      };
    },
  });

  // 4. CANCEL MISSION
  registerAdminAction({
    actionId: "cancel_personal_outbound_mission",
    category: "personal_assistant",
    label: "Cancel Personal Outbound Mission",
    description: "Stops an active Personal Outbound Mission. No further auto-replies will be sent.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_outbound_mission_cancelled",
    handler: async (context, params) => {
      const missionId = String(params?.missionId || "").trim();
      const targetQuery = String(params?.target || params?.recipient || "").trim();

      let targetMission: PersonalOutboundMission | null = null;
      if (missionId) {
        targetMission = await getPersonalOutboundMission(context.accountId, missionId);
      } else if (targetQuery) {
        // Find active mission for this target name/query
        const activeMissions = await listPersonalOutboundMissions(context.accountId);
        targetMission = activeMissions.find(
          (m) =>
            m.targetIdentity.displayName?.toLowerCase().includes(targetQuery.toLowerCase()) ||
            m.targetIdentity.canonicalPhone?.includes(targetQuery)
        ) || null;
      }

      if (!targetMission) {
        return { success: false, message: "Could not find an active mission to cancel." };
      }

      const updated = await updateMissionStatus(context.accountId, targetMission.missionId, "CANCELLED", {
        statusReason: "cancelled_by_owner",
      });

      const recipient = targetMission.targetIdentity.displayName || targetMission.targetIdentity.canonicalPhone || "Contact";
      return {
        success: true,
        message: `🛑 *Mission Cancelled*\n\n• *Recipient:* ${recipient}\n• *Goal:* ${targetMission.goal}\n• *Status:* CANCELLED\n\n_No further messages will be sent for this request._`,
        data: updated,
      };
    },
  });

  // 5. PROVIDE OWNER INFORMATION
  registerAdminAction({
    actionId: "provide_personal_mission_information",
    category: "personal_assistant",
    label: "Provide Personal Mission Information",
    description: "Supplies the owner's answer when a Personal Outbound Mission is in NEEDS_OWNER status.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "personal_mission_owner_information_provided",
    handler: async (context, params) => {
      const answer = String(params?.answer || params?.information || params?.text || "").trim();
      if (!answer) {
        return { success: false, message: "Please specify the answer or information you want to provide." };
      }

      // Find mission by ID or search for active mission needing owner
      let targetMission: PersonalOutboundMission | null = null;
      if (params?.missionId) {
        targetMission = await getPersonalOutboundMission(context.accountId, String(params.missionId));
      } else {
        const all = await listPersonalOutboundMissions(context.accountId, { status: "NEEDS_OWNER" });
        if (all.length === 1) {
          targetMission = all[0];
        } else if (all.length > 1 && params?.target) {
          const q = String(params.target).toLowerCase();
          targetMission = all.find((m) => m.targetIdentity.displayName?.toLowerCase().includes(q)) || null;
        }
      }

      if (!targetMission) {
        return { success: false, message: "No mission currently awaiting your input was found." };
      }

      if (targetMission.status !== "NEEDS_OWNER") {
        return { success: false, message: `Mission is currently in status ${targetMission.status}, not awaiting owner input.` };
      }

      // Resume mission: Send answer to target
      const replyMessage = `Regarding your question, ${answer}`;
      const sendRes = await sendPersonalOutboundMissionMessage({
        mission: targetMission,
        messageText: replyMessage,
        stepIndex: targetMission.stepCount,
      });

      if (!sendRes.success) {
        return { success: false, message: `Failed sending your answer to the recipient: ${sendRes.reason}` };
      }

      targetMission.status = "WAITING_FOR_REPLY";
      targetMission.unresolvedQuestion = undefined;
      await savePersonalOutboundMission(targetMission);

      const recipient = targetMission.targetIdentity.displayName || targetMission.targetIdentity.canonicalPhone || "Contact";
      return {
        success: true,
        message: `✅ *Answer Sent to ${recipient}*\n\n• *Sent:* "${replyMessage}"\n• *Status:* WAITING_FOR_REPLY\n\n_The assistant will continue the conversation when they respond._`,
        data: targetMission,
      };
    },
  });
}

// Auto-register tools on module import
registerPersonalOutboundAdminTools();
