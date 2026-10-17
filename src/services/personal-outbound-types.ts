/**
 * Personal Outbound Mission Canonical Types (Prompt 5)
 * 
 * Defines the minimal durable outbound mission schema, target identity,
 * statuses, and execution result types for the Outbound Personal Agent.
 */

export type PersonalOutboundMissionStatus =
  | "ACTIVE"
  | "WAITING_FOR_CONTACT"
  | "WAITING_FOR_REPLY"
  | "NEEDS_OWNER"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export interface PersonalOutboundTargetIdentity {
  jid: string;
  canonicalPhone?: string | null;
  pushName?: string | null;
  displayName?: string;
}

export interface PersonalOutboundCollectedFact {
  key: string;
  value: string;
  timestamp: number;
  sourceMessage?: string;
}

export interface PersonalOutboundMission {
  missionId: string;
  accountId: string;
  personalInstanceId: string;
  controlBusinessInstanceId: string;
  targetContactId: string;
  targetIdentity: PersonalOutboundTargetIdentity;
  goal: string;
  ownerInstructions: string;
  constraints: string[];
  createdByOwner: boolean;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  lastInboundMessageId?: string;
  lastOutboundMessageId?: string;
  resultSummary?: string;
  unresolvedQuestion?: string;
  collectedFacts?: PersonalOutboundCollectedFact[];
  stepCount: number;
  isSendOnly?: boolean;
  status: PersonalOutboundMissionStatus;
  statusReason?: string;
  ownerGoalId?: string;
}

export interface StartPersonalOutboundMissionParams {
  accountId: string;
  controlBusinessInstanceId: string;
  personalInstanceId?: string;
  target: string; // name, phone, or contactId
  goal: string;
  ownerInstructions?: string;
  constraints?: string[];
  isSendOnly?: boolean;
}

export interface PersonalOutboundSendEligibilityResult {
  allowed: boolean;
  reason?: string;
  mission?: PersonalOutboundMission;
}

export interface PersonalOutboundReplyResult {
  handled: boolean;
  missionId?: string;
  replyText?: string;
  status?: PersonalOutboundMissionStatus;
  reason?: string;
}
