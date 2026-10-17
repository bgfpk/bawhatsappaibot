/**
 * Personal Task Engine - Canonical Types & State Definitions
 * 
 * Prompt 6 Core Orchestration Contract:
 * - Server-authoritative task lifecycle
 * - Structured actions and execution leases
 * - Single-use approval and owner question contracts
 * - Follow-up, retry, and structured result contracts
 */

import type { PersonalOutboundTargetIdentity } from "./personal-outbound-types.ts";

export type PersonalTaskState =
  | "DRAFT"
  | "READY"
  | "ACTIVE"
  | "WAITING_FOR_CONTACT"
  | "WAITING_FOR_REPLY"
  | "WAITING_FOR_OWNER"
  | "WAITING_FOR_APPROVAL"
  | "WAITING_UNTIL"
  | "PAUSED_MANUAL_TAKEOVER"
  | "PAUSED_OWNER"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL";

export type PersonalTaskActionType =
  | "WHATSAPP_SEND"
  | "WAIT_FOR_CONTACT_REPLY"
  | "ASK_OWNER"
  | "WAIT_FOR_OWNER"
  | "REQUEST_OWNER_APPROVAL"
  | "WAIT_FOR_APPROVAL"
  | "WAIT_UNTIL"
  | "SUMMARIZE_RESULT"
  | "UPDATE_CONTACT_MEMORY_SAFE"
  | "COMPLETE_TASK"
  | "FAIL_TASK"
  | "PAUSE_TASK";

export type PersonalTaskEventType =
  | "TASK_CREATED"
  | "TASK_STARTED"
  | "MESSAGE_SENT"
  | "CONTACT_REPLIED"
  | "OWNER_QUESTION_CREATED"
  | "OWNER_ANSWER_RECEIVED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "FOLLOWUP_SCHEDULED"
  | "FOLLOWUP_SENT"
  | "TASK_PAUSED"
  | "TASK_RESUMED"
  | "TASK_CANCELLED"
  | "TASK_COMPLETED"
  | "TASK_FAILED";

export interface PersonalTaskExecutionLease {
  leaseOwner: string;
  leaseExpiresAt: number;
  leaseRevision: number;
}

export interface PersonalTaskOwnerQuestion {
  questionId: string;
  taskId: string;
  prompt: string;
  reason?: string;
  requestedField?: string;
  createdAt: number;
  status: "pending" | "answered" | "cancelled";
  answer?: string;
  answeredAt?: number;
  answerSource?: string;
}

export interface PersonalTaskApprovalRequest {
  approvalId: string;
  taskId: string;
  actionId: string;
  actionSummary: string;
  exactActionFingerprint: string;
  requestedAt: number;
  expiresAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  consumedAt?: number;
}

export interface PersonalTaskFollowUpPolicy {
  enabled: boolean;
  maxFollowUps: number;
  followUpCount: number;
  intervalMs?: number;
  nextDueAt?: number;
  instructions?: string;
}

export interface PersonalTaskResult {
  summary: string;
  keyFacts: Array<{ key: string; value: string; timestamp?: number }>;
  outcome: "success" | "partial" | "no_result";
  completedAt: number;
  sourceEvidence?: Array<{ messageId?: string; snippet: string; sender: string }>;
  unresolvedItems?: string[];
}

export interface PersonalTaskFailure {
  reason: string;
  errorCode?: string;
  attemptCount: number;
  isRetryable: boolean;
  nextRetryAt?: number;
  failedAt: number;
}

export interface PersonalTaskAction {
  actionId: string;
  taskId: string;
  type: PersonalTaskActionType;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  input: Record<string, any>;
  result?: Record<string, any>;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  attemptCount: number;
  idempotencyKey: string;
  riskClass?: "SAFE" | "REQUIRES_APPROVAL";
  requiresApproval?: boolean;
}

export interface PersonalTaskEvent {
  eventId: string;
  taskId: string;
  timestamp: number;
  type: PersonalTaskEventType;
  actor: "owner" | "contact" | "system" | "timer" | "worker";
  stateBefore: PersonalTaskState;
  stateAfter: PersonalTaskState;
  metadata?: Record<string, any>;
  relatedActionId?: string;
}

export interface PersonalTask {
  taskId: string;
  schemaVersion: number;
  revision: number;
  accountId: string;
  personalInstanceId: string;
  controlBusinessInstanceId: string;
  createdByOwner: boolean;
  goal: string;
  fullOwnerInstructions: string;
  constraints: string[];
  targetContactId: string;
  targetIdentity: PersonalOutboundTargetIdentity;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  currentState: PersonalTaskState;
  currentStepId?: string;
  executionLease?: PersonalTaskExecutionLease;
  ownerQuestion?: PersonalTaskOwnerQuestion;
  pendingApproval?: PersonalTaskApprovalRequest;
  followUpPolicy?: PersonalTaskFollowUpPolicy;
  result?: PersonalTaskResult;
  failure?: PersonalTaskFailure;
  taskLocalMemory?: Record<string, any>;
  metadata?: Record<string, any>;
  missionId?: string; // Compatibility with Prompt 5
  ownerGoalId?: string;
  isSendOnly?: boolean;
  stepCount?: number;
}
