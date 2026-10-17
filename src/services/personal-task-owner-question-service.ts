/**
 * Personal Task Owner Question & Answer Service
 * 
 * Manages structured owner inquiry and response correlation:
 * - Max 1 pending question at a time per task
 * - Notification dispatched via controlling Business WhatsApp ($0.003 charge on send)
 * - Natural answer correlation ("Black", "Yes", "Office address")
 * - Disambiguation when multiple tasks are awaiting input
 * - Owner answers stay task-scoped (never pollute global Owner360)
 */

import {
  savePersonalTask,
  listPersonalTasks,
  getPersonalTask,
} from "./personal-task-storage-service.ts";
import { transitionPersonalTask } from "./personal-task-state-machine.ts";
import { notifyOwnerMissionEvent } from "./personal-outbound-send-service.ts";
import type {
  PersonalTask,
  PersonalTaskOwnerQuestion,
} from "./personal-task-types.ts";

export interface CreateOwnerQuestionParams {
  task: PersonalTask;
  prompt: string;
  reason?: string;
  requestedField?: string;
  sendBusinessNotification?: (text: string) => Promise<{ success: boolean; messageId?: string }>;
}

export async function createPersonalTaskOwnerQuestion(
  params: CreateOwnerQuestionParams
): Promise<{ success: boolean; question: PersonalTaskOwnerQuestion; task: PersonalTask }> {
  const { task, prompt, reason, requestedField, sendBusinessNotification } = params;

  // Invariant: Max 1 unanswered question at a time per task
  if (task.ownerQuestion && task.ownerQuestion.status === "pending") {
    return { success: true, question: task.ownerQuestion, task };
  }

  const questionId = `ptoq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const question: PersonalTaskOwnerQuestion = {
    questionId,
    taskId: task.taskId,
    prompt: prompt.trim(),
    reason: reason?.trim(),
    requestedField: requestedField?.trim(),
    createdAt: Date.now(),
    status: "pending",
  };

  task.ownerQuestion = question;

  // Transition state to WAITING_FOR_OWNER
  const transitionRes = await transitionPersonalTask(task, {
    targetState: "WAITING_FOR_OWNER",
    actor: "system",
    reason: reason || prompt,
    relatedActionId: questionId,
  });

  const updatedTask = transitionRes.task;

  // Dispatch notification to owner via Business WhatsApp
  if (typeof sendBusinessNotification === "function") {
    await notifyOwnerMissionEvent({
      mission: {
        missionId: updatedTask.taskId,
        accountId: updatedTask.accountId,
        personalInstanceId: updatedTask.personalInstanceId,
        controlBusinessInstanceId: updatedTask.controlBusinessInstanceId,
        targetContactId: updatedTask.targetContactId,
        targetIdentity: updatedTask.targetIdentity,
        goal: updatedTask.goal,
        ownerInstructions: updatedTask.fullOwnerInstructions,
        constraints: updatedTask.constraints,
        createdByOwner: updatedTask.createdByOwner,
        createdAt: updatedTask.createdAt,
        updatedAt: updatedTask.updatedAt,
        lastActivityAt: updatedTask.updatedAt,
        stepCount: updatedTask.stepCount || 0,
        status: "NEEDS_OWNER",
      },
      eventType: "NEEDS_OWNER",
      summary: prompt,
      unresolvedQuestion: prompt,
      sendBusinessNotification,
    });
  }

  return { success: true, question, task: updatedTask };
}

export interface CorrelateOwnerAnswerResult {
  correlated: boolean;
  ambiguous?: boolean;
  task?: PersonalTask;
  choices?: Array<{ taskId: string; goal: string; target: string; prompt: string }>;
  error?: string;
}

/**
 * Correlates a natural owner response on Business WhatsApp to the correct pending task question.
 */
export async function correlateOwnerAnswer(params: {
  accountId: string;
  answerText: string;
  targetHint?: string;
  explicitTaskId?: string;
  actor?: "owner";
}): Promise<CorrelateOwnerAnswerResult> {
  const { accountId, answerText, targetHint, explicitTaskId } = params;
  const cleanAnswer = String(answerText || "").trim();

  if (!cleanAnswer) {
    return { correlated: false, error: "Empty answer provided." };
  }

  // 1. Explicit task ID provided
  if (explicitTaskId) {
    const task = await getPersonalTask(accountId, explicitTaskId);
    if (task && task.currentState === "WAITING_FOR_OWNER" && task.ownerQuestion?.status === "pending") {
      const resolved = await resolveTaskQuestion(task, cleanAnswer);
      return { correlated: true, task: resolved };
    }
  }

  // 2. Fetch all tasks waiting for owner
  const pendingTasks = await listPersonalTasks(accountId, { state: "WAITING_FOR_OWNER" });
  const tasksWithQuestions = pendingTasks.filter((t) => t.ownerQuestion?.status === "pending");

  if (tasksWithQuestions.length === 0) {
    return { correlated: false, error: "No tasks are currently waiting for your input." };
  }

  // 3. Exactly ONE task waiting -> auto-correlate!
  if (tasksWithQuestions.length === 1) {
    const single = tasksWithQuestions[0];
    const resolved = await resolveTaskQuestion(single, cleanAnswer);
    return { correlated: true, task: resolved };
  }

  // 4. Multiple tasks: Check targetHint
  if (targetHint && targetHint.trim()) {
    const hintLower = targetHint.toLowerCase().trim();
    const matched = tasksWithQuestions.filter((t) => {
      const name = (t.targetIdentity.displayName || "").toLowerCase();
      const phone = t.targetIdentity.canonicalPhone || "";
      return name.includes(hintLower) || phone.includes(hintLower);
    });

    if (matched.length === 1) {
      const resolved = await resolveTaskQuestion(matched[0], cleanAnswer);
      return { correlated: true, task: resolved };
    }
  }

  // 5. Ambiguous: Return safe choices asking owner to disambiguate
  return {
    correlated: false,
    ambiguous: true,
    choices: tasksWithQuestions.map((t) => ({
      taskId: t.taskId,
      goal: t.goal,
      target: t.targetIdentity.displayName || t.targetIdentity.canonicalPhone || "Contact",
      prompt: t.ownerQuestion?.prompt || "Needs input",
    })),
  };
}

async function resolveTaskQuestion(task: PersonalTask, answer: string): Promise<PersonalTask> {
  const now = Date.now();
  if (task.ownerQuestion) {
    task.ownerQuestion.status = "answered";
    task.ownerQuestion.answer = answer;
    task.ownerQuestion.answeredAt = now;
    task.ownerQuestion.answerSource = "business_whatsapp";
  }

  // Invariant: Save to taskLocalMemory, NEVER pollute Owner360 automatically
  task.taskLocalMemory = {
    ...(task.taskLocalMemory || {}),
    [`answer_${task.ownerQuestion?.requestedField || "last"}`]: answer,
    lastOwnerAnswer: answer,
  };

  // Transition from WAITING_FOR_OWNER -> ACTIVE
  const res = await transitionPersonalTask(task, {
    targetState: "ACTIVE",
    actor: "owner",
    reason: `Owner answered question: "${answer}"`,
    metadata: { answer },
  });

  return res.task;
}
