/**
 * Personal Task Admin Business Assistant Tools
 * 
 * Server-authoritative Admin BA tools for task creation, inspection,
 * approval, question-answering, pause/resume, and cancellation:
 * - create_personal_task
 * - get_personal_task
 * - list_personal_tasks
 * - pause_personal_task
 * - resume_personal_task
 * - cancel_personal_task
 * - answer_personal_task_question
 * - approve_personal_task_action
 * - reject_personal_task_action
 */

import { registerAdminAction } from "./admin-action-registry-service.ts";
import {
  savePersonalTask,
  getPersonalTask,
  listPersonalTasks,
  getActiveTaskForContact,
} from "./personal-task-storage-service.ts";
import { transitionPersonalTask } from "./personal-task-state-machine.ts";
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
import {
  scheduleTaskFollowUp,
  cancelTaskFollowUp,
} from "./personal-task-scheduler-service.ts";
import {
  correlateOwnerAnswer,
} from "./personal-task-owner-question-service.ts";
import {
  resolvePersonalTaskApproval,
} from "./personal-task-approval-service.ts";
import { isPersonalAssistantFeatureEnabled } from "./personal-assistant-config-service.ts";
import type { PersonalTask } from "./personal-task-types.ts";

export function registerPersonalTaskAdminTools(): void {
  // 1. CREATE TASK
  registerAdminAction({
    actionId: "create_personal_task",
    category: "personal_assistant",
    label: "Create Personal Task",
    description: "Instructs the Personal Assistant to perform a task or inquiry through the Personal WhatsApp line.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "personal_task_created",
    handler: async (context, params) => {
      if (!isPersonalAssistantFeatureEnabled()) {
        return { success: false, message: "Personal Assistant feature is currently disabled." };
      }

      const targetQuery = String(params?.target || params?.recipient || "").trim();
      const goal = String(params?.goal || params?.instruction || "").trim();
      const fullInstructions = String(params?.fullInstructions || params?.instructions || goal).trim();

      if (!targetQuery) return { success: false, message: "Please specify who to message." };
      if (!goal) return { success: false, message: "Please specify the goal or instruction for the task." };

      const controlBusinessId = context.botId || "control_biz";

      // 1. Resolve Personal Line
      const instanceRes = await resolvePersonalInstanceForMission(
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

      // 2. Resolve Target
      const targetRes = await resolveTargetForMission(context.accountId, personalInstanceId, targetQuery);
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

      // 3. Concurrency Check: At most ONE active task holding messaging lease per contact
      const existing = await getActiveTaskForContact(
        context.accountId,
        personalInstanceId,
        targetContactId,
        targetRes.targetIdentity.canonicalPhone || targetRes.targetIdentity.jid
      );
      if (existing) {
        return {
          success: false,
          message: `⚠️ *Active Task Already in Progress*\n\nThere is already an active task for *${targetRes.targetIdentity.displayName}*:\n• *Goal:* ${existing.goal}\n• *State:* ${existing.currentState}\n\nPlease pause, complete, or cancel it before starting a new one.`,
        };
      }

      const taskId = `ptask_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();

      const task: PersonalTask = {
        taskId,
        schemaVersion: 1,
        revision: 1,
        accountId: context.accountId,
        personalInstanceId,
        controlBusinessInstanceId: controlBusinessId,
        createdByOwner: true,
        goal,
        fullOwnerInstructions: fullInstructions,
        constraints: Array.isArray(params?.constraints) ? params.constraints : [],
        targetContactId,
        targetIdentity: targetRes.targetIdentity,
        createdAt: now,
        updatedAt: now,
        currentState: "ACTIVE",
        stepCount: 0,
        isSendOnly: Boolean(params?.isSendOnly),
      };

      // 4. Configure Follow-up policy if requested by owner (e.g. "follow up tomorrow")
      if (params?.followUp || fullInstructions.toLowerCase().includes("follow up") || fullInstructions.toLowerCase().includes("follow-up")) {
        scheduleTaskFollowUp(task, 24 * 60 * 60 * 1000, "Follow up if no reply received.");
      }

      // 5. Generate first message
      const firstMsgResult = await generateFirstOutboundMissionMessage({
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
          createdByOwner: true,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
          stepCount: 0,
          status: "ACTIVE",
          isSendOnly: task.isSendOnly,
        },
        contact: targetRes.contact,
        ownerName: "Owner",
      });

      task.isSendOnly = firstMsgResult.isSendOnly;

      // 6. Send first message
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
          createdByOwner: true,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
          stepCount: 0,
          status: "ACTIVE",
          isSendOnly: task.isSendOnly,
        },
        messageText: firstMsgResult.messageText,
        stepIndex: 0,
        now,
      });

      if (!sendRes.success) {
        return {
          success: false,
          message: `❌ *Could Not Send Initial Message*\n\nReason: ${sendRes.reason || "Delivery failed"}. Task was not created.`,
        };
      }

      task.currentState = task.isSendOnly ? "COMPLETED" : "WAITING_FOR_CONTACT";
      task.stepCount = 1;
      await savePersonalTask(task);

      const targetLabel = targetRes.targetIdentity.displayName || targetRes.targetIdentity.canonicalPhone || "Contact";
      return {
        success: true,
        message: `🚀 *Personal Task Created*\n\n• *Target:* ${targetLabel}\n• *Goal:* ${goal}\n• *State:* ${task.currentState}\n• *Initial Message:* "${firstMsgResult.messageText}"\n\n_I will update you as soon as there is progress._`,
        data: task,
      };
    },
  });

  // 2. GET TASK
  registerAdminAction({
    actionId: "get_personal_task",
    category: "personal_assistant",
    label: "Get Personal Task",
    description: "Views current progress, state, and facts for a Personal Task.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_task_viewed",
    handler: async (context, params) => {
      const taskId = String(params?.taskId || "").trim();
      if (!taskId) return { success: false, message: "Please specify a task ID." };

      const task = await getPersonalTask(context.accountId, taskId);
      if (!task) return { success: false, message: `Task \`${taskId}\` not found.` };

      const target = task.targetIdentity.displayName || task.targetIdentity.canonicalPhone || "Contact";
      const factsStr = (task.result?.keyFacts || [])
        .map((f) => `• *${f.key}:* ${f.value}`)
        .join("\n") || "_None recorded yet_";

      return {
        success: true,
        message: `📋 *Personal Task Details*\n\n• *Task ID:* \`${task.taskId}\`\n• *Target:* ${target}\n• *State:* ${task.currentState}\n• *Goal:* ${task.goal}\n• *Steps:* ${task.stepCount || 0}\n• *Pending Question:* ${task.ownerQuestion?.status === "pending" ? task.ownerQuestion.prompt : "_None_"}\n• *Pending Approval:* ${task.pendingApproval?.status === "PENDING" ? task.pendingApproval.actionSummary : "_None_"}\n• *Result:* ${task.result?.summary || "_In progress_"}\n\n*Key Facts:*\n${factsStr}`,
        data: task,
      };
    },
  });

  // 3. LIST TASKS
  registerAdminAction({
    actionId: "list_personal_tasks",
    category: "personal_assistant",
    label: "List Personal Tasks",
    description: "Lists active or recent Personal Tasks.",
    riskLevel: "READ",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_tasks_listed",
    handler: async (context, params) => {
      const tasks = await listPersonalTasks(context.accountId, {
        state: params?.state,
        limit: params?.limit ? Number(params.limit) : 10,
      });

      if (tasks.length === 0) {
        return { success: true, message: "ℹ️ *No Tasks Found*\n\nYou currently have no active Personal tasks." };
      }

      const lines = tasks.map((t) => {
        const target = t.targetIdentity.displayName || t.targetIdentity.canonicalPhone || "Contact";
        return `• *${target}* (${t.currentState}): ${t.goal.slice(0, 50)}${t.goal.length > 50 ? "..." : ""}`;
      }).join("\n");

      return {
        success: true,
        message: `📋 *Personal Tasks (${tasks.length})*\n\n${lines}`,
        data: tasks,
      };
    },
  });

  // 4. PAUSE TASK
  registerAdminAction({
    actionId: "pause_personal_task",
    category: "personal_assistant",
    label: "Pause Personal Task",
    description: "Pauses an active Personal Task.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_task_paused",
    handler: async (context, params) => {
      const taskId = String(params?.taskId || "").trim();
      const task = await getPersonalTask(context.accountId, taskId);
      if (!task) return { success: false, message: "Task not found." };

      cancelTaskFollowUp(task);
      const res = await transitionPersonalTask(task, {
        targetState: "PAUSED_OWNER",
        actor: "owner",
        reason: "Paused by owner via Admin BA",
      });

      return {
        success: res.success,
        message: res.success ? `⏸️ *Task Paused*\n\nTask for *${task.targetIdentity.displayName}* has been paused.` : res.error,
        data: res.task,
      };
    },
  });

  // 5. RESUME TASK
  registerAdminAction({
    actionId: "resume_personal_task",
    category: "personal_assistant",
    label: "Resume Personal Task",
    description: "Resumes a paused Personal Task.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_task_resumed",
    handler: async (context, params) => {
      const taskId = String(params?.taskId || "").trim();
      const task = await getPersonalTask(context.accountId, taskId);
      if (!task) return { success: false, message: "Task not found." };

      const res = await transitionPersonalTask(task, {
        targetState: "ACTIVE",
        actor: "owner",
        reason: "Resumed by owner via Admin BA",
      });

      return {
        success: res.success,
        message: res.success ? `▶️ *Task Resumed*\n\nTask for *${task.targetIdentity.displayName}* has resumed.` : res.error,
        data: res.task,
      };
    },
  });

  // 6. CANCEL TASK
  registerAdminAction({
    actionId: "cancel_personal_task",
    category: "personal_assistant",
    label: "Cancel Personal Task",
    description: "Terminates an active Personal Task.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: true,
    auditEventType: "personal_task_cancelled",
    handler: async (context, params) => {
      const taskId = String(params?.taskId || "").trim();
      const task = await getPersonalTask(context.accountId, taskId);
      if (!task) return { success: false, message: "Task not found." };

      cancelTaskFollowUp(task);
      const res = await transitionPersonalTask(task, {
        targetState: "CANCELLED",
        actor: "owner",
        reason: "Cancelled by owner via Admin BA",
      });

      return {
        success: res.success,
        message: res.success ? `🛑 *Task Cancelled*\n\nTask for *${task.targetIdentity.displayName}* has been cancelled.` : res.error,
        data: res.task,
      };
    },
  });

  // 7. ANSWER QUESTION
  registerAdminAction({
    actionId: "answer_personal_task_question",
    category: "personal_assistant",
    label: "Answer Personal Task Question",
    description: "Answers a pending question for a Personal Task.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "personal_task_question_answered",
    handler: async (context, params) => {
      const answer = String(params?.answer || params?.text || "").trim();
      if (!answer) return { success: false, message: "Please provide your answer." };

      const corRes = await correlateOwnerAnswer({
        accountId: context.accountId,
        answerText: answer,
        targetHint: params?.target,
        explicitTaskId: params?.taskId,
      });

      if (corRes.ambiguous && corRes.choices) {
        const listStr = corRes.choices.map((c) => `• *${c.target}*: ${c.prompt} [Task: \`${c.taskId}\`]`).join("\n");
        return {
          success: false,
          message: `❓ *Multiple Tasks Awaiting Input*\n\nPlease specify which task you are answering:\n${listStr}`,
        };
      }

      if (!corRes.correlated || !corRes.task) {
        return { success: false, message: corRes.error || "Could not correlate answer to a task." };
      }

      // Resume task communication: Send answer to target
      const replyText = `Regarding your question, ${answer}`;
      await sendPersonalOutboundMissionMessage({
        mission: {
          missionId: corRes.task.taskId,
          accountId: corRes.task.accountId,
          personalInstanceId: corRes.task.personalInstanceId,
          controlBusinessInstanceId: corRes.task.controlBusinessInstanceId,
          targetContactId: corRes.task.targetContactId,
          targetIdentity: corRes.task.targetIdentity,
          goal: corRes.task.goal,
          ownerInstructions: corRes.task.fullOwnerInstructions,
          constraints: corRes.task.constraints,
          createdByOwner: corRes.task.createdByOwner,
          createdAt: corRes.task.createdAt,
          updatedAt: corRes.task.updatedAt,
          lastActivityAt: Date.now(),
          stepCount: corRes.task.stepCount || 0,
          status: "WAITING_FOR_CONTACT",
        },
        messageText: replyText,
        stepIndex: corRes.task.stepCount || 0,
      });

      corRes.task.currentState = "WAITING_FOR_CONTACT";
      corRes.task.stepCount = (corRes.task.stepCount || 0) + 1;
      await savePersonalTask(corRes.task);

      const targetLabel = corRes.task.targetIdentity.displayName || "Contact";
      return {
        success: true,
        message: `✅ *Answer Delivered to ${targetLabel}*\n\n• *Sent:* "${replyText}"\n• *State:* WAITING_FOR_CONTACT\n\n_The assistant will continue when they respond._`,
        data: corRes.task,
      };
    },
  });

  // 8. APPROVE ACTION
  registerAdminAction({
    actionId: "approve_personal_task_action",
    category: "personal_assistant",
    label: "Approve Personal Task Action",
    description: "Authorizes a pending approval for a Personal Task.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "personal_task_action_approved",
    handler: async (context, params) => {
      const taskId = String(params?.taskId || "").trim();
      const res = await resolvePersonalTaskApproval({
        accountId: context.accountId,
        taskId,
        approvalId: params?.approvalId,
        decision: "APPROVED",
        actorRole: context.adminRole || "owner",
      });

      return {
        success: res.success,
        message: res.success ? `✅ *Action Approved*\n\nTask \`${taskId}\` has resumed execution.` : res.error,
        data: res.task,
      };
    },
  });

  // 9. REJECT ACTION
  registerAdminAction({
    actionId: "reject_personal_task_action",
    category: "personal_assistant",
    label: "Reject Personal Task Action",
    description: "Rejects a pending approval for a Personal Task.",
    riskLevel: "SAFE_WRITE",
    requiredRole: "owner",
    requiresConfirmation: false,
    idempotent: false,
    auditEventType: "personal_task_action_rejected",
    handler: async (context, params) => {
      const taskId = String(params?.taskId || "").trim();
      const res = await resolvePersonalTaskApproval({
        accountId: context.accountId,
        taskId,
        approvalId: params?.approvalId,
        decision: "REJECTED",
        actorRole: context.adminRole || "owner",
      });

      return {
        success: res.success,
        message: res.success ? `🛑 *Action Rejected*\n\nProposed action was cancelled for task \`${taskId}\`.` : res.error,
        data: res.task,
      };
    },
  });
}

// Auto-register tools on module load
registerPersonalTaskAdminTools();
