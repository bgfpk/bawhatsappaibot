/**
 * Personal Task Migration & Prompt 5 Compatibility Layer
 * 
 * Provides unified lifecycle management between Prompt 5 PersonalOutboundMission
 * and Prompt 6 PersonalTask:
 * - Maps existing missions into canonical PersonalTask documents
 * - Preserves already completed/cancelled terminal states
 * - Ensures single source of truth across storage and query endpoints
 */

import type { PersonalOutboundMission, PersonalOutboundMissionStatus } from "./personal-outbound-types.ts";
import type { PersonalTask, PersonalTaskState } from "./personal-task-types.ts";

export function mapMissionStatusToTaskState(status: PersonalOutboundMissionStatus): PersonalTaskState {
  switch (status) {
    case "ACTIVE":
      return "ACTIVE";
    case "WAITING_FOR_CONTACT":
      return "WAITING_FOR_CONTACT";
    case "WAITING_FOR_REPLY":
      return "WAITING_FOR_REPLY";
    case "NEEDS_OWNER":
      return "WAITING_FOR_OWNER";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    case "FAILED":
      return "FAILED_FINAL";
    default:
      return "ACTIVE";
  }
}

export function mapTaskStateToMissionStatus(state: PersonalTaskState): PersonalOutboundMissionStatus {
  switch (state) {
    case "DRAFT":
    case "READY":
    case "ACTIVE":
      return "ACTIVE";
    case "WAITING_FOR_REPLY":
      return "WAITING_FOR_REPLY";
    case "WAITING_FOR_CONTACT":
    case "WAITING_UNTIL":
      return "WAITING_FOR_CONTACT";
    case "WAITING_FOR_OWNER":
    case "WAITING_FOR_APPROVAL":
      return "NEEDS_OWNER";
    case "PAUSED_MANUAL_TAKEOVER":
    case "PAUSED_OWNER":
      return "WAITING_FOR_CONTACT";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    case "FAILED_RETRYABLE":
    case "FAILED_FINAL":
      return "FAILED";
    default:
      return "ACTIVE";
  }
}

export function migrateMissionToTask(mission: PersonalOutboundMission): PersonalTask {
  return {
    taskId: mission.missionId,
    schemaVersion: 1,
    revision: 1,
    accountId: mission.accountId,
    personalInstanceId: mission.personalInstanceId,
    controlBusinessInstanceId: mission.controlBusinessInstanceId,
    createdByOwner: mission.createdByOwner,
    goal: mission.goal,
    fullOwnerInstructions: mission.ownerInstructions,
    constraints: mission.constraints || [],
    targetContactId: mission.targetContactId,
    targetIdentity: mission.targetIdentity,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    lastActivityAt: mission.lastActivityAt,
    currentState: mapMissionStatusToTaskState(mission.status),
    isSendOnly: mission.isSendOnly,
    stepCount: mission.stepCount || 0,
    missionId: mission.missionId,
    ownerGoalId: mission.ownerGoalId,
    result: mission.resultSummary
      ? {
          summary: mission.resultSummary,
          keyFacts: (mission.collectedFacts || []).map((f) => ({ key: f.key, value: f.value, timestamp: f.timestamp })),
          outcome: mission.status === "COMPLETED" ? "success" : "partial",
          completedAt: mission.updatedAt,
        }
      : undefined,
    ownerQuestion: mission.unresolvedQuestion
      ? {
          questionId: `ptoq_mig_${mission.missionId}`,
          taskId: mission.missionId,
          prompt: mission.unresolvedQuestion,
          createdAt: mission.updatedAt,
          status: "pending",
        }
      : undefined,
  } as PersonalTask;
}

export function adaptTaskToMission(task: PersonalTask): PersonalOutboundMission {
  return {
    missionId: task.missionId || task.taskId,
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
    lastActivityAt: task.updatedAt,
    stepCount: task.stepCount || 0,
    status: mapTaskStateToMissionStatus(task.currentState),
    isSendOnly: task.isSendOnly,
    ownerGoalId: task.ownerGoalId,
    resultSummary: task.result?.summary,
    collectedFacts: task.result?.keyFacts?.map((f) => ({
      key: f.key,
      value: f.value,
      timestamp: f.timestamp || Date.now(),
      sourceMessage: "",
    })),
    unresolvedQuestion: task.ownerQuestion?.prompt,
  };
}
