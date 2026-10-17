/**
 * Personal Task Scheduler & Follow-Up Service
 * 
 * Manages bounded, durable follow-ups and scheduled wake-ups:
 * - Default: OFF (only follow-up when explicitly authorized by owner)
 * - Hard safety cap: Maximum 2 automated follow-up messages per task
 * - Due follow-up processing with send idempotency
 * - Automatic cancellation on contact reply, opt-out, manual takeover, or task cancel
 * - Durable timestamps surviving server restarts
 */

import {
  listPersonalTasks,
  savePersonalTask,
} from "./personal-task-storage-service.ts";
import { isManualTakeoverActive } from "./personal-incoming-eligibility-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import { sendPersonalOutboundMissionMessage } from "./personal-outbound-send-service.ts";
import { formatWhatsAppResponse } from "./whatsapp-ai-response-style-service.ts";
import type {
  PersonalTask,
  PersonalTaskFollowUpPolicy,
} from "./personal-task-types.ts";

export const MAX_ALLOWED_FOLLOW_UPS = 2; // Hard safety cap
export const DEFAULT_FOLLOWUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function scheduleTaskFollowUp(
  task: PersonalTask,
  intervalMs = DEFAULT_FOLLOWUP_INTERVAL_MS,
  instructions?: string
): PersonalTaskFollowUpPolicy {
  const currentCount = task.followUpPolicy?.followUpCount || 0;
  const policy: PersonalTaskFollowUpPolicy = {
    enabled: true,
    maxFollowUps: MAX_ALLOWED_FOLLOW_UPS,
    followUpCount: currentCount,
    intervalMs,
    nextDueAt: Date.now() + intervalMs,
    instructions: instructions || "Gentle reminder regarding previous inquiry.",
  };

  task.followUpPolicy = policy;
  return policy;
}

export function cancelTaskFollowUp(task: PersonalTask): void {
  if (task.followUpPolicy) {
    task.followUpPolicy.enabled = false;
    task.followUpPolicy.nextDueAt = undefined;
  }
}

export async function processDuePersonalTaskFollowUps(params: {
  accountId: string;
  now?: number;
  sock?: any;
}): Promise<{ processed: number; sent: number; cancelled: number }> {
  const { accountId, now = Date.now(), sock } = params;

  const tasks = await listPersonalTasks(accountId);
  let processed = 0;
  let sent = 0;
  let cancelled = 0;

  for (const task of tasks) {
    const policy = task.followUpPolicy;
    if (!policy || !policy.enabled || !policy.nextDueAt) continue;
    if (policy.nextDueAt > now) continue;

    processed++;

    // 1. Terminal/Pause Gate
    if (task.currentState !== "WAITING_FOR_CONTACT" && task.currentState !== "WAITING_UNTIL") {
      cancelTaskFollowUp(task);
      await savePersonalTask(task);
      cancelled++;
      continue;
    }

    // 2. Max Count Gate
    if (policy.followUpCount >= policy.maxFollowUps) {
      cancelTaskFollowUp(task);
      await savePersonalTask(task);
      cancelled++;
      continue;
    }

    // 3. Manual Takeover Gate
    const takeover = isManualTakeoverActive(
      task.accountId,
      task.personalInstanceId,
      task.targetContactId,
      now
    );
    if (takeover.active) {
      // Delay follow-up until takeover window passes
      policy.nextDueAt = now + 30 * 60 * 1000;
      await savePersonalTask(task);
      continue;
    }

    // 4. Contact Communication Preferences Gate
    if (task.targetContactId && !task.targetContactId.startsWith("pc_new_")) {
      const contact = await personalContactService.getPersonalContact(
        task.accountId,
        task.targetContactId
      );
      if (contact) {
        const prefs = contact.communicationPreferences;
        if (
          prefs?.contactCommunicationStatus === "do_not_contact" ||
          prefs?.contactCommunicationStatus === "blocked_by_owner" ||
          prefs?.contactCommunicationStatus === "paused_by_owner" ||
          prefs?.doNotContact
        ) {
          cancelTaskFollowUp(task);
          await savePersonalTask(task);
          cancelled++;
          continue;
        }
      }
    }

    // 5. Compose Follow-Up Message
    const followUpText = formatWhatsAppResponse(
      `Hello, just following up regarding our earlier message about ${task.goal}. Let me know if you have any updates.`
    );

    // 6. Transmit Follow-Up with Task Idempotency
    const nextCount = policy.followUpCount + 1;
    const sendRes = await sendPersonalOutboundMissionMessage({
      mission: {
        missionId: task.taskId,
        accountId: task.accountId,
        personalInstanceId: task.personalInstanceId,
        controlBusinessInstanceId: task.controlBusinessInstanceId,
        targetContactId: task.targetContactId,
        targetIdentity: task.targetIdentity,
        goal: task.goal,
        ownerInstructions: task.fullOwnerInstructions,
        constraints: task.constraints,
        createdByOwner: task.createdByOwner,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        lastActivityAt: now,
        stepCount: task.stepCount || 0,
        status: "WAITING_FOR_CONTACT",
      },
      messageText: followUpText,
      stepIndex: nextCount,
      sock,
      now,
    });

    if (sendRes.success) {
      policy.followUpCount = nextCount;
      if (nextCount >= policy.maxFollowUps) {
        policy.enabled = false;
        policy.nextDueAt = undefined;
      } else {
        policy.nextDueAt = now + (policy.intervalMs || DEFAULT_FOLLOWUP_INTERVAL_MS);
      }
      task.stepCount = (task.stepCount || 0) + 1;
      await savePersonalTask(task);
      sent++;
    }
  }

  return { processed, sent, cancelled };
}
