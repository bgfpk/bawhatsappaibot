/**
 * Personal Task State Machine
 * 
 * Server-authoritative transition engine enforcing strict task state invariants:
 * - Deterministic transition allowlist
 * - Terminal state protection (COMPLETED/CANCELLED cannot resurrect)
 * - Optimistic concurrency revision check
 * - Automatic event log audit trail
 */

import { recordPersonalTaskEvent } from "./personal-task-event-service.ts";
import { savePersonalTask } from "./personal-task-storage-service.ts";
import type {
  PersonalTask,
  PersonalTaskState,
  PersonalTaskEventType,
} from "./personal-task-types.ts";

const VALID_TRANSITIONS: Record<PersonalTaskState, PersonalTaskState[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["ACTIVE", "WAITING_FOR_REPLY", "WAITING_FOR_CONTACT", "PAUSED_OWNER", "CANCELLED"],
  ACTIVE: [
    "WAITING_FOR_CONTACT",
    "WAITING_FOR_REPLY",
    "WAITING_FOR_OWNER",
    "WAITING_FOR_APPROVAL",
    "WAITING_UNTIL",
    "PAUSED_MANUAL_TAKEOVER",
    "PAUSED_OWNER",
    "COMPLETED",
    "CANCELLED",
    "FAILED_RETRYABLE",
    "FAILED_FINAL",
  ],
  WAITING_FOR_CONTACT: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "WAITING_FOR_OWNER",
    "WAITING_UNTIL",
    "PAUSED_MANUAL_TAKEOVER",
    "PAUSED_OWNER",
    "COMPLETED",
    "CANCELLED",
    "FAILED_FINAL",
  ],
  WAITING_FOR_REPLY: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "WAITING_FOR_CONTACT",
    "WAITING_FOR_OWNER",
    "WAITING_FOR_APPROVAL",
    "WAITING_UNTIL",
    "PAUSED_MANUAL_TAKEOVER",
    "PAUSED_OWNER",
    "COMPLETED",
    "CANCELLED",
    "FAILED_FINAL",
  ],
  WAITING_FOR_OWNER: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "WAITING_FOR_CONTACT",
    "PAUSED_OWNER",
    "CANCELLED",
    "COMPLETED",
  ],
  WAITING_FOR_APPROVAL: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "WAITING_FOR_CONTACT",
    "PAUSED_OWNER",
    "CANCELLED",
    "COMPLETED",
  ],
  WAITING_UNTIL: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "PAUSED_OWNER",
    "CANCELLED",
  ],
  PAUSED_MANUAL_TAKEOVER: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "PAUSED_OWNER",
    "CANCELLED",
  ],
  PAUSED_OWNER: [
    "ACTIVE",
    "WAITING_FOR_REPLY",
    "CANCELLED",
  ],
  FAILED_RETRYABLE: [
    "ACTIVE",
    "CANCELLED",
    "FAILED_FINAL",
  ],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
  FAILED_FINAL: [], // Terminal
};

export interface TaskTransitionRequest {
  targetState: PersonalTaskState;
  actor: "owner" | "contact" | "system" | "timer" | "worker";
  reason?: string;
  expectedRevision?: number;
  metadata?: Record<string, any>;
  relatedActionId?: string;
  idempotencyDiscriminator?: string | number;
}

export interface TaskTransitionResult {
  success: boolean;
  task: PersonalTask;
  previousState: PersonalTaskState;
  newState: PersonalTaskState;
  error?: string;
  code?: string;
}

export async function transitionPersonalTask(
  task: PersonalTask,
  request: TaskTransitionRequest
): Promise<TaskTransitionResult> {
  const currentState = task.currentState;
  const targetState = request.targetState;

  // 1. Same state is an idempotent no-op
  if (currentState === targetState) {
    return {
      success: true,
      task,
      previousState: currentState,
      newState: currentState,
    };
  }

  // 2. Validate state transition allowlist
  const allowed = VALID_TRANSITIONS[currentState] || [];
  if (!allowed.includes(targetState)) {
    return {
      success: false,
      task,
      previousState: currentState,
      newState: currentState,
      error: `Invalid task transition from ${currentState} to ${targetState}`,
      code: "INVALID_STATE_TRANSITION",
    };
  }

  // 3. Check optimistic concurrency revision if provided
  if (request.expectedRevision !== undefined && task.revision !== request.expectedRevision) {
    return {
      success: false,
      task,
      previousState: currentState,
      newState: currentState,
      error: `Concurrency conflict: task revision ${task.revision} != expected ${request.expectedRevision}`,
      code: "CONCURRENCY_CONFLICT",
    };
  }

  const now = Date.now();
  const updatedTask: PersonalTask = {
    ...task,
    currentState: targetState,
    updatedAt: now,
  };

  if (targetState === "ACTIVE" && !updatedTask.startedAt) {
    updatedTask.startedAt = now;
  }
  if (targetState === "COMPLETED") {
    updatedTask.completedAt = now;
  }
  if (targetState === "CANCELLED") {
    updatedTask.cancelledAt = now;
  }

  // 4. Determine event type
  let eventType: PersonalTaskEventType = "TASK_STARTED";
  if (targetState === "COMPLETED") eventType = "TASK_COMPLETED";
  else if (targetState === "CANCELLED") eventType = "TASK_CANCELLED";
  else if (targetState === "FAILED_FINAL" || targetState === "FAILED_RETRYABLE") eventType = "TASK_FAILED";
  else if (targetState === "PAUSED_OWNER" || targetState === "PAUSED_MANUAL_TAKEOVER") eventType = "TASK_PAUSED";
  else if (currentState.startsWith("PAUSED_") && targetState === "ACTIVE") eventType = "TASK_RESUMED";
  else if (targetState === "WAITING_FOR_OWNER") eventType = "OWNER_QUESTION_CREATED";
  else if (targetState === "WAITING_FOR_APPROVAL") eventType = "APPROVAL_REQUESTED";
  else if (targetState === "WAITING_UNTIL") eventType = "FOLLOWUP_SCHEDULED";

  // 5. Persist transition in durable storage
  const savedTask = await savePersonalTask(updatedTask, request.expectedRevision);

  // 6. Record in append-only event log
  recordPersonalTaskEvent({
    taskId: savedTask.taskId,
    type: eventType,
    actor: request.actor,
    stateBefore: currentState,
    stateAfter: targetState,
    metadata: {
      reason: request.reason,
      ...request.metadata,
    },
    relatedActionId: request.relatedActionId,
    idempotencyDiscriminator: request.idempotencyDiscriminator,
  });

  return {
    success: true,
    task: savedTask,
    previousState: currentState,
    newState: targetState,
  };
}
