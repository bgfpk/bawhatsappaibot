/**
 * Personal Task Executor & Orchestrator
 * 
 * Safely executes task steps with bounded action loops and execution leases:
 * - Lease lock preventing dual-worker races
 * - Action allowlist enforcement (no payments, OTPs, contracts, or Google APIs)
 * - Safe resume on contact reply or owner answer
 * - Automatic fact extraction and grounded result summary
 * - Retry classification (transient vs permanent)
 */

import {
  savePersonalTask,
  getPersonalTask,
} from "./personal-task-storage-service.ts";
import { transitionPersonalTask } from "./personal-task-state-machine.ts";
import {
  planMissionContinuationTurn,
} from "./personal-outbound-planner-service.ts";
import { adaptTaskToMission } from "./personal-task-migration.ts";
import {
  sendPersonalOutboundMissionMessage,
  notifyOwnerMissionEvent,
} from "./personal-outbound-send-service.ts";
import { createPersonalTaskOwnerQuestion } from "./personal-task-owner-question-service.ts";
import { requestPersonalTaskApproval } from "./personal-task-approval-service.ts";
import { evaluatePersonalActionAuthorization } from "./personal-action-authorization-service.ts";
import { cancelTaskFollowUp } from "./personal-task-scheduler-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import * as dbService from "./db-service.ts";
import {
  acquireAtomicClaim,
  releaseAtomicClaim,
  renewAtomicClaim,
} from "./canonical-claim-service.ts";
import type {
  PersonalTask,
  PersonalTaskAction,
  PersonalTaskExecutionLease,
} from "./personal-task-types.ts";

export const MAX_ACTIONS_PER_RUN = 10;
export const LEASE_DURATION_MS = 30 * 1000; // 30s lease

export async function acquireTaskExecutionLease(
  task: PersonalTask,
  workerId: string
): Promise<{ acquired: boolean; task: PersonalTask }> {
  const current = (await getPersonalTask(task.accountId, task.taskId)) || task;
  const now = Date.now();
  const claimKey = `personal_task:${task.accountId}:${task.taskId}`;

  const claim = await acquireAtomicClaim(claimKey, workerId, LEASE_DURATION_MS, now);
  if (!claim.acquired) {
    return { acquired: false, task: current };
  }

  const existingLease = current.executionLease;
  const newLease: PersonalTaskExecutionLease = {
    leaseOwner: workerId,
    leaseExpiresAt: claim.expiresAt || (now + LEASE_DURATION_MS),
    leaseRevision: (existingLease?.leaseRevision || 0) + 1,
  };

  current.executionLease = newLease;
  const saved = await savePersonalTask(current);
  return { acquired: true, task: saved };
}

export async function releaseTaskExecutionLease(
  task: PersonalTask,
  workerId?: string
): Promise<PersonalTask> {
  const current = (await getPersonalTask(task.accountId, task.taskId)) || task;
  const owner = workerId || current.executionLease?.leaseOwner || "";
  if (owner) {
    await releaseAtomicClaim(`personal_task:${task.accountId}:${task.taskId}`, owner).catch(() => {});
  }
  current.executionLease = undefined;
  return await savePersonalTask(current);
}

export async function renewTaskExecutionLease(
  task: PersonalTask,
  workerId: string
): Promise<{ renewed: boolean; task: PersonalTask }> {
  const current = (await getPersonalTask(task.accountId, task.taskId)) || task;
  const now = Date.now();
  const claimKey = `personal_task:${task.accountId}:${task.taskId}`;

  const renewed = await renewAtomicClaim(claimKey, workerId, LEASE_DURATION_MS, now);
  if (!renewed) {
    return { renewed: false, task: current };
  }

  if (current.executionLease && current.executionLease.leaseOwner === workerId) {
    current.executionLease.leaseExpiresAt = now + LEASE_DURATION_MS;
    const saved = await savePersonalTask(current);
    return { renewed: true, task: saved };
  }

  return { renewed: true, task: current };
}

/**
 * Executes an inbound reply on an active task.
 */
export async function executeInboundReplyOnTask(params: {
  task: PersonalTask;
  textContent: string;
  messageId: string;
  sock?: any;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
  workerId?: string;
  now?: number;
}): Promise<{ handled: boolean; task: PersonalTask; reason?: string }> {
  const { task, textContent, messageId, sock, sendBusinessNotification, workerId = "worker_default", now = Date.now() } = params;

  // 1. Acquire execution lease
  const leaseRes = await acquireTaskExecutionLease(task, workerId);
  if (!leaseRes.acquired) {
    return { handled: true, task, reason: "task_lease_held_by_another_worker" };
  }

  let activeTask = leaseRes.task;

  try {
    // 2. Fetch recent conversation history
    const rawHistory = await dbService.getChatHistory(activeTask.accountId, activeTask.targetIdentity.jid, 8).catch(() => []);
    const conversationHistory: Array<{ role: "user" | "assistant" | "model"; text: string }> = [];
    if (Array.isArray(rawHistory)) {
      for (const h of rawHistory) {
        conversationHistory.push({
          role: h.role === "user" ? ("user" as const) : ("assistant" as const),
          text: String(h.text || ""),
        });
      }
    }

    // 3. Plan continuation using canonical AI planner
    const plan = await planMissionContinuationTurn({
      mission: {
        missionId: activeTask.taskId,
        accountId: activeTask.accountId,
        personalInstanceId: activeTask.personalInstanceId,
        controlBusinessInstanceId: activeTask.controlBusinessInstanceId,
        targetContactId: activeTask.targetContactId,
        targetIdentity: activeTask.targetIdentity,
        goal: activeTask.goal,
        ownerInstructions: activeTask.fullOwnerInstructions,
        constraints: activeTask.constraints,
        createdByOwner: activeTask.createdByOwner,
        createdAt: activeTask.createdAt,
        updatedAt: activeTask.updatedAt,
        lastActivityAt: now,
        stepCount: activeTask.stepCount || 0,
        status: "WAITING_FOR_CONTACT",
      },
      targetInboundText: textContent,
      conversationHistory,
      ownerName: "Owner",
    });

    // Cancel pending follow-up upon contact response
    cancelTaskFollowUp(activeTask);

    // 4. Handle Target Opt-Out
    if (plan.isOptOut) {
      await transitionPersonalTask(activeTask, {
        targetState: "CANCELLED",
        actor: "contact",
        reason: "Recipient requested to stop messaging (opt-out).",
      });

      if (activeTask.targetContactId) {
        await personalContactService.setContactCommunicationStatus(
          activeTask.accountId,
          activeTask.targetContactId,
          "do_not_contact"
        ).catch(() => {});
      }

      if (plan.replyText) {
        await sendPersonalOutboundMissionMessage({
          mission: {
            missionId: activeTask.taskId,
            accountId: activeTask.accountId,
            personalInstanceId: activeTask.personalInstanceId,
            controlBusinessInstanceId: activeTask.controlBusinessInstanceId,
            targetContactId: activeTask.targetContactId,
            targetIdentity: activeTask.targetIdentity,
            goal: activeTask.goal,
            ownerInstructions: activeTask.fullOwnerInstructions,
            constraints: activeTask.constraints,
            createdByOwner: activeTask.createdByOwner,
            createdAt: activeTask.createdAt,
            updatedAt: activeTask.updatedAt,
            lastActivityAt: now,
            stepCount: activeTask.stepCount || 0,
            status: "CANCELLED",
          },
          messageText: plan.replyText,
          stepIndex: activeTask.stepCount || 0,
          sock,
          sendBusinessNotification,
          now,
        });
      }

      await notifyOwnerMissionEvent({
        mission: {
          missionId: activeTask.taskId,
          accountId: activeTask.accountId,
          personalInstanceId: activeTask.personalInstanceId,
          controlBusinessInstanceId: activeTask.controlBusinessInstanceId,
          targetContactId: activeTask.targetContactId,
          targetIdentity: activeTask.targetIdentity,
          goal: activeTask.goal,
          ownerInstructions: activeTask.fullOwnerInstructions,
          constraints: activeTask.constraints,
          createdByOwner: activeTask.createdByOwner,
          createdAt: activeTask.createdAt,
          updatedAt: activeTask.updatedAt,
          lastActivityAt: now,
          stepCount: activeTask.stepCount || 0,
          status: "CANCELLED",
        },
        eventType: "FAILED",
        summary: "Recipient opted out of further messages.",
        sendBusinessNotification,
        now,
      });

      return { handled: true, task: activeTask, reason: "target_opt_out" };
    }

    // 5. Handle Missing Owner Info -> WAITING_FOR_OWNER
    if (plan.needsOwner) {
      const qRes = await createPersonalTaskOwnerQuestion({
        task: activeTask,
        prompt: plan.unresolvedQuestion || "Recipient asked a question requiring your input.",
        reason: "Missing owner decision/choice",
        sendBusinessNotification,
      });
      activeTask = qRes.task;

      if (plan.replyText) {
        await sendPersonalOutboundMissionMessage({
          mission: adaptTaskToMission(activeTask),
          messageText: plan.replyText,
          stepIndex: activeTask.stepCount || 0,
          sock,
          sendBusinessNotification,
          now,
        });
      }

      return { handled: true, task: activeTask, reason: "needs_owner_information" };
    }

    // 6. Handle Completion
    if (plan.isComplete) {
      activeTask.result = {
        summary: plan.resultSummary || "Requested information obtained.",
        keyFacts: (plan.collectedFacts || []).map((f) => ({
          key: f.key,
          value: f.value,
          timestamp: f.timestamp,
        })),
        outcome: "success",
        completedAt: now,
        sourceEvidence: [{
          messageId,
          snippet: textContent.slice(0, 150),
          sender: activeTask.targetIdentity.displayName || "Contact",
        }],
      };

      const completedRes = await transitionPersonalTask(activeTask, {
        targetState: "COMPLETED",
        actor: "system",
        reason: activeTask.result.summary,
      });
      activeTask = completedRes.task;

      if (plan.replyText) {
        await sendPersonalOutboundMissionMessage({
          mission: adaptTaskToMission(activeTask),
          messageText: plan.replyText,
          stepIndex: activeTask.stepCount || 0,
          sock,
          sendBusinessNotification,
          now,
        });
      }

      await notifyOwnerMissionEvent({
        mission: {
          missionId: activeTask.taskId,
          accountId: activeTask.accountId,
          personalInstanceId: activeTask.personalInstanceId,
          controlBusinessInstanceId: activeTask.controlBusinessInstanceId,
          targetContactId: activeTask.targetContactId,
          targetIdentity: activeTask.targetIdentity,
          goal: activeTask.goal,
          ownerInstructions: activeTask.fullOwnerInstructions,
          constraints: activeTask.constraints,
          createdByOwner: activeTask.createdByOwner,
          createdAt: activeTask.createdAt,
          updatedAt: activeTask.updatedAt,
          lastActivityAt: now,
          stepCount: activeTask.stepCount || 0,
          status: "COMPLETED",
        },
        eventType: "COMPLETED",
        summary: activeTask.result.summary,
        sendBusinessNotification,
        now,
      });

      return { handled: true, task: activeTask, reason: "task_completed" };
    }

    // 7. Autonomous continuation turn
    if (plan.replyText) {
      // Prompt 7: Evaluate action authorization gate
      const authDecision = await evaluatePersonalActionAuthorization({
        accountId: activeTask.accountId,
        personalInstanceId: activeTask.personalInstanceId,
        targetContactId: activeTask.targetContactId,
        targetPhoneOrJid: activeTask.targetIdentity.canonicalPhone || activeTask.targetIdentity.jid,
        actionType: "WHATSAPP_SEND",
        taskId: activeTask.taskId,
        taskGoal: activeTask.goal,
        proposedPayload: { text: plan.replyText },
        actorRole: "worker",
        now,
      });

      if (authDecision.decision === "BLOCK") {
        return { handled: true, task: activeTask, reason: `action_blocked:${authDecision.reasonCode}` };
      }

      if (authDecision.decision === "REQUIRE_APPROVAL") {
        await requestPersonalTaskApproval({
          task: activeTask,
          action: {
            actionId: `act_send_${Date.now()}`,
            taskId: activeTask.taskId,
            type: "WHATSAPP_SEND",
            status: "pending",
            input: { text: plan.replyText },
            createdAt: now,
            attemptCount: 1,
            idempotencyKey: `ptask_send_${activeTask.taskId}_${activeTask.stepCount || 0}`,
          },
          actionSummary: authDecision.requiredApprovalSummary || `Send message: "${plan.replyText.slice(0, 100)}..."`,
          sendBusinessNotification,
        });
        return { handled: true, task: activeTask, reason: "action_requires_approval" };
      }

      const currentStep = activeTask.stepCount || 0;
      await sendPersonalOutboundMissionMessage({
        mission: {
          missionId: activeTask.taskId,
          accountId: activeTask.accountId,
          personalInstanceId: activeTask.personalInstanceId,
          controlBusinessInstanceId: activeTask.controlBusinessInstanceId,
          targetContactId: activeTask.targetContactId,
          targetIdentity: activeTask.targetIdentity,
          goal: activeTask.goal,
          ownerInstructions: activeTask.fullOwnerInstructions,
          constraints: activeTask.constraints,
          createdByOwner: activeTask.createdByOwner,
          createdAt: activeTask.createdAt,
          updatedAt: activeTask.updatedAt,
          lastActivityAt: now,
          stepCount: currentStep,
          status: "WAITING_FOR_REPLY",
        },
        messageText: plan.replyText,
        stepIndex: currentStep,
        sock,
        sendBusinessNotification,
        now,
      });

      activeTask.stepCount = currentStep + 1;
      activeTask.currentState = "WAITING_FOR_REPLY";
      await savePersonalTask(activeTask);
      return { handled: true, task: activeTask, reason: "continuation_turn_sent" };
    }

    return { handled: true, task: activeTask };
  } finally {
    await releaseTaskExecutionLease(activeTask, workerId);
  }
}
