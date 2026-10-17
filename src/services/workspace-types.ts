/**
 * AI Group Workspaces - Canonical Types & Contracts
 * 
 * Account-owned, instance-independent WhatsApp group workspace intelligence.
 * All persistent data belongs to accountId + workspaceId.
 */

export type WorkspaceStatus = 'ACTIVE' | 'DETACHED' | 'NEEDS_RESPONDER' | 'ARCHIVED';

export type WorkspaceReplyMode =
  | 'SMART_ASSIST'
  | 'MENTION_ONLY'
  | 'EVERY_MESSAGE'
  | 'OWNER_ONLY'
  | 'SILENT_ARCHIVE';

export type ParticipantRole =
  | 'OWNER'
  | 'WORKSPACE_ADMIN'
  | 'MEMBER'
  | 'RESPONDER';

export type GroupRole =
  | 'MEDIA_TEMPLATE'
  | 'SEQUENCE_TEMPLATE'
  | 'WELCOME_SEQUENCE'
  | 'AI_WORKSPACE'
  | 'UNMANAGED_GROUP';

export type MemoryType =
  | 'FACT'
  | 'DECISION'
  | 'REQUIREMENT'
  | 'IDEA'
  | 'PROJECT'
  | 'EXPENSE'
  | 'INCOME'
  | 'RECEIPT'
  | 'MEASUREMENT'
  | 'PREFERENCE'
  | 'QUESTION';

export type RecordProvenance = 'user-entered' | 'ai-extracted' | 'owner-confirmed';

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ReminderStatus = 'PENDING' | 'WAITING_FOR_RESPONDER' | 'SENT' | 'CANCELLED' | 'STALE';

export type FileProcessingStatus = 'PROCESSING' | 'COMPLETED' | 'PENDING_RETRY' | 'FAILED';

export interface Workspace {
  workspaceId: string;
  accountId: string;
  name: string;
  purpose: string;
  instructions: string;
  replyMode: WorkspaceReplyMode;
  status: WorkspaceStatus;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  creatorUserId?: string;
}

export interface WorkspaceBinding {
  bindingId: string;
  accountId: string;
  workspaceId: string;
  groupJid: string;
  responderInstanceId: string;
  groupName: string;
  groupDescription: string;
  status: 'ACTIVE' | 'DETACHED';
  attachedAt: number;
  detachedAt?: number | null;
  lastSeenAt: number;
  version: number;
}

export interface WorkspaceParticipant {
  participantId: string;
  accountId: string;
  workspaceId: string;
  groupJid: string;
  jid: string;
  canonicalPhone: string;
  displayName: string;
  role: ParticipantRole;
  whatsappAdmin: boolean;
  joinedAt: number;
  updatedAt: number;
}

export interface WorkspaceMessage {
  messageRecordId: string;
  accountId: string;
  workspaceId: string;
  groupJid: string;
  whatsappMessageId: string;
  senderCanonicalId: string;
  senderJid: string;
  senderDisplayName: string;
  timestamp: number;
  messageType: 'text' | 'image' | 'audio' | 'document' | 'video' | 'other';
  textContent: string;
  quotedMessageId?: string | null;
  replyRelation?: 'none' | 'reply_to_responder' | 'reply_to_other';
  observedByInstanceId: string;
  responderInstanceId: string;
  processingStatus: 'INGESTED' | 'PROCESSED' | 'REPLIED' | 'FAILED_SEND' | 'SKIPPED_SILENT' | 'SKIPPED_FROM_ME' | 'SKIPPED_NOT_RESPONDER';
  aiReplyText?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceFile {
  fileId: string;
  accountId: string;
  workspaceId: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  storageId: string;
  storageBucketId?: string;
  processingStatus: FileProcessingStatus;
  transcript?: string;
  extractedText?: string;
  analysisSummary?: string;
  createdAt: number;
}

export interface WorkspaceMemoryItem {
  memoryId: string;
  accountId: string;
  workspaceId: string;
  type: MemoryType;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  sourceMessageId?: string | null;
  sourceFileId?: string | null;
  provenance: RecordProvenance;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSummary {
  summaryId: string;
  accountId: string;
  workspaceId: string;
  rollingSummary: string;
  keyDecisions: string[];
  openIssues: string[];
  activeProjects: string[];
  lastMessageTimestamp: number;
  version: number;
  updatedAt: number;
}

export interface WorkspaceTask {
  taskId: string;
  accountId: string;
  workspaceId: string;
  title: string;
  details: string;
  status: TaskStatus;
  assignee?: string | null;
  createdBy: string;
  dueAt?: number | null;
  sourceMessageId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceReminder {
  reminderId: string;
  accountId: string;
  workspaceId: string;
  destination: 'group' | 'owner_1_1';
  dueAt: number;
  message: string;
  status: ReminderStatus;
  createdByType: 'owner' | 'admin' | 'member' | 'ai';
  createdById: string;
  sentAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceRecord {
  recordId: string;
  accountId: string;
  workspaceId: string;
  category: 'project_record' | 'expense' | 'income' | 'receipt' | 'profit_calc' | 'meeting_outcome';
  data: Record<string, any>;
  sourceMessageId?: string | null;
  sourceFileId?: string | null;
  provenance: RecordProvenance;
  createdAt: number;
}

export interface WorkspaceEvent {
  eventId: string;
  accountId: string;
  workspaceId: string;
  type:
    | 'WORKSPACE_CREATED'
    | 'BOUND'
    | 'DETACHED'
    | 'RESPONDER_CHANGED'
    | 'INSTRUCTIONS_UPDATED'
    | 'MODE_CHANGED'
    | 'MESSAGE_INGESTED'
    | 'FILE_STORED'
    | 'TRANSCRIPTION_COMPLETED'
    | 'MEMORY_UPDATED'
    | 'TASK_CREATED'
    | 'REMINDER_CREATED'
    | 'REMINDER_SENT'
    | 'ARCHIVED'
    | 'RESTORED'
    | 'CLONED'
    | 'DELETE_REQUESTED'
    | 'WORKSPACE_ADMIN_GRANTED'
    | 'WORKSPACE_ADMIN_REVOKED';
  actor: string;
  details: Record<string, any>;
  createdAt: number;
}

export interface ParticipatingGroupInfo {
  jid: string;
  name: string;
  description?: string;
  participantCount: number;
  isBotParticipant: boolean;
  isBotAdmin: boolean;
  botJid: string;
}

export interface WorkspaceCreationInput {
  accountId: string;
  name: string;
  purpose: string;
  instructions: string;
  replyMode: WorkspaceReplyMode;
  responderInstanceId: string;
  groupJid: string;
  groupName: string;
  groupDescription?: string;
}

export interface CloneWorkspaceOptions {
  copyInstructions: boolean;
  copySummary: boolean;
  copyMemory: boolean;
  copyTasks: boolean;
  newName?: string;
}

export interface WorkspaceRetrievalResult {
  query: string;
  recovered: boolean;
  mechanism: "structured_memory" | "record" | "rolling_summary" | "indexed_historical_retrieval" | "recent_context" | "none";
  boundedItemCount: number;
  matchedContent: string;
  sourceProvenance?: {
    sourceMessageId: string | null;
    timestamp?: number;
    sender?: string;
    sourceFileId?: string | null;
    provenance?: "ai-extracted" | "user-entered" | "owner-confirmed";
  };
  contextSnippets: string[];
}

export type PrivilegedWorkspaceAction =
  | "EDIT_INSTRUCTIONS"
  | "CHANGE_CONFIG"
  | "CHANGE_REPLY_MODE"
  | "CHANGE_RESPONDER"
  | "ATTACH_REBIND"
  | "CLONE"
  | "ARCHIVE"
  | "RESTORE"
  | "EXPORT"
  | "DELETE"
  | "MANAGE_ADMINS";

export interface WorkspaceActor {
  jid?: string;
  role?: ParticipantRole;
}
