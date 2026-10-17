/**
 * Personal Assistant Hub - Canonical Frontend Types
 * 
 * Prompt 9: Personal Assistant Hub
 * Clean, coherent control and visibility layer over Prompts 1-8.
 */

import type { PersonalTask, PersonalTaskState } from "../../../services/personal-task-types.ts";
import type { GooglePersonalConnection, SelectedDriveFile } from "../../../services/google-personal-auth-types.ts";

export type PersonalAssistantTab =
  | "overview"
  | "tasks"
  | "conversations"
  | "contacts"
  | "profile"
  | "permissions"
  | "connected_apps"
  | "numbers";

export type AttentionItemType =
  | "approval_required"
  | "owner_question_required"
  | "failed_task"
  | "google_issue"
  | "manual_takeover"
  | "notice";

export interface AttentionItem {
  id: string;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  type: AttentionItemType;
  title: string;
  description: string;
  timestamp: number;
  taskId?: string;
  contactId?: string;
  contactJid?: string;
  contactName?: string;
  instanceId?: string;
  pendingQuestion?: string;
  approvalFingerprint?: string;
  proposedAction?: {
    actionType: string;
    description: string;
    details?: Record<string, any>;
  };
}

export interface HubOverviewMetrics {
  activeTasksCount: number;
  waitingOwnerCount: number;
  pendingApprovalsCount: number;
  personalContactsCount: number;
  connectedNumbersCount: number;
  googleIssuesCount: number;
  delegatedCommitmentTodayPkr: number;
  delegatedCommitmentLimitPkr: number;
}

export interface PersonalActivityEvent {
  id: string;
  type:
    | "task_started"
    | "message_sent"
    | "reply_received"
    | "approval_requested"
    | "approval_granted"
    | "google_event_created"
    | "email_sent"
    | "task_completed"
    | "manual_takeover";
  title: string;
  summary: string;
  timestamp: number;
  taskId?: string;
  contactName?: string;
  instanceName?: string;
}

export interface PersonalInstanceSummary {
  instanceId: string;
  name: string;
  phone?: string;
  status: "connected" | "disconnected" | "qr_required" | "connecting" | "paused" | "error" | "control_unavailable";
  controllingBusinessInstanceId: string;
  controllingBusinessInstanceName?: string;
  controllingBusinessPhone?: string;
  incomingAssistantEnabled: boolean;
  incomingAssistantRuntimeStatus?: "auto_replying" | "waiting_connection" | "disabled";
  activeTasksCount: number;
  manualTakeoverCount: number;
}

export type ConversationAiStatus = "active" | "paused" | "manual_takeover" | "do_not_contact";

export interface PersonalConversationSummary {
  jid: string;
  contactName: string;
  safePhone: string;
  personalInstanceId: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  aiStatus: ConversationAiStatus;
  activeTaskId?: string;
  activeTaskGoal?: string;
  unread?: boolean;
}

export type ChatMessageSender = "contact" | "assistant" | "owner_manual" | "system";

export interface PersonalChatMessage {
  id: string;
  sender: ChatMessageSender;
  text: string;
  timestamp: number;
  status?: "sent" | "delivered" | "read" | "failed";
}

export interface TaskFilterOptions {
  statusCategory?: "all" | "active" | "waiting" | "needs_approval" | "paused" | "completed" | "failed" | "cancelled";
  personalInstanceId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ConversationFilterOptions {
  personalInstanceId?: string;
  status?: "all" | "active" | "paused" | "manual_takeover" | "do_not_contact";
  search?: string;
}
