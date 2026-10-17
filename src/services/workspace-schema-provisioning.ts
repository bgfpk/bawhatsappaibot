/**
 * AI Group Workspaces Appwrite Schema Provisioning Specification
 * 
 * Repeatable, idempotent, and non-destructive schema definitions
 * for Workspaces, Bindings, Participants, Messages, Files, Memory,
 * Summaries, Tasks, Reminders, Events, and Records.
 */

import { COLLECTIONS, DATABASE_ID, databases } from "../config/appwrite-client.ts";

export interface CollectionAttributeDef {
  key: string;
  type: "string" | "integer" | "boolean" | "float";
  size?: number;
  required: boolean;
  default?: any;
  array?: boolean;
}

export interface CollectionIndexDef {
  key: string;
  type: "key" | "unique" | "fulltext";
  attributes: string[];
  orders?: ("ASC" | "DESC")[];
}

export interface CollectionSchemaDef {
  collectionId: string;
  name: string;
  attributes: CollectionAttributeDef[];
  indexes: CollectionIndexDef[];
}

export const WORKSPACE_SCHEMA: Record<string, CollectionSchemaDef> = {
  WORKSPACES: {
    collectionId: COLLECTIONS.WORKSPACES,
    name: "AI Group Workspaces",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 255, required: true },
      { key: "purpose", type: "string", size: 1000, required: false },
      { key: "instructions", type: "string", size: 10000, required: false },
      { key: "replyMode", type: "string", size: 32, required: false, default: "SMART_ASSIST" },
      { key: "status", type: "string", size: 32, required: false, default: "ACTIVE" },
      { key: "creatorUserId", type: "string", size: 64, required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
      { key: "archivedAt", type: "integer", required: false },
    ],
    indexes: [
      { key: "idx_ws_account", type: "key", attributes: ["accountId"] },
      { key: "idx_ws_account_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  WORKSPACE_BINDINGS: {
    collectionId: COLLECTIONS.WORKSPACE_BINDINGS,
    name: "Workspace Bindings",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "groupJid", type: "string", size: 128, required: true },
      { key: "responderInstanceId", type: "string", size: 64, required: true },
      { key: "groupName", type: "string", size: 255, required: false },
      { key: "groupDescription", type: "string", size: 1000, required: false },
      { key: "status", type: "string", size: 32, required: false, default: "ACTIVE" },
      { key: "attachedAt", type: "integer", required: true },
      { key: "detachedAt", type: "integer", required: false },
      { key: "lastSeenAt", type: "integer", required: true },
      { key: "version", type: "integer", required: false, default: 1 },
    ],
    indexes: [
      { key: "idx_ws_binding_acc_group", type: "key", attributes: ["accountId", "groupJid"] },
      { key: "idx_ws_binding_ws_status", type: "key", attributes: ["workspaceId", "status"] },
      { key: "idx_ws_binding_responder", type: "key", attributes: ["responderInstanceId"] },
    ],
  },
  WORKSPACE_PARTICIPANTS: {
    collectionId: COLLECTIONS.WORKSPACE_PARTICIPANTS,
    name: "Workspace Participants",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "groupJid", type: "string", size: 128, required: true },
      { key: "jid", type: "string", size: 128, required: true },
      { key: "canonicalPhone", type: "string", size: 64, required: false },
      { key: "displayName", type: "string", size: 255, required: false },
      { key: "role", type: "string", size: 32, required: false, default: "MEMBER" },
      { key: "whatsappAdmin", type: "boolean", required: false, default: false },
      { key: "joinedAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_part_ws_jid", type: "key", attributes: ["workspaceId", "jid"] },
      { key: "idx_ws_part_acc_phone", type: "key", attributes: ["accountId", "canonicalPhone"] },
    ],
  },
  WORKSPACE_MESSAGES: {
    collectionId: COLLECTIONS.WORKSPACE_MESSAGES,
    name: "Workspace Messages",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "groupJid", type: "string", size: 128, required: true },
      { key: "whatsappMessageId", type: "string", size: 128, required: true },
      { key: "senderCanonicalId", type: "string", size: 128, required: true },
      { key: "senderJid", type: "string", size: 128, required: true },
      { key: "senderDisplayName", type: "string", size: 255, required: false },
      { key: "timestamp", type: "integer", required: true },
      { key: "messageType", type: "string", size: 32, required: false, default: "text" },
      { key: "textContent", type: "string", size: 10000, required: false },
      { key: "quotedMessageId", type: "string", size: 128, required: false },
      { key: "replyRelation", type: "string", size: 32, required: false, default: "none" },
      { key: "observedByInstanceId", type: "string", size: 64, required: true },
      { key: "responderInstanceId", type: "string", size: 64, required: true },
      { key: "processingStatus", type: "string", size: 32, required: false, default: "INGESTED" },
      { key: "aiReplyText", type: "string", size: 10000, required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_msg_ws_ts", type: "key", attributes: ["workspaceId", "timestamp"] },
      { key: "idx_ws_msg_ws_wamid", type: "key", attributes: ["workspaceId", "whatsappMessageId"] },
      { key: "idx_ws_msg_acc_group", type: "key", attributes: ["accountId", "groupJid"] },
    ],
  },
  WORKSPACE_FILES: {
    collectionId: COLLECTIONS.WORKSPACE_FILES,
    name: "Workspace Files",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "messageId", type: "string", size: 64, required: true },
      { key: "fileName", type: "string", size: 255, required: true },
      { key: "mimeType", type: "string", size: 128, required: true },
      { key: "size", type: "integer", required: true, default: 0 },
      { key: "hash", type: "string", size: 64, required: true },
      { key: "storageId", type: "string", size: 64, required: true },
      { key: "storageBucketId", type: "string", size: 64, required: false },
      { key: "processingStatus", type: "string", size: 32, required: true, default: "COMPLETED" },
      { key: "transcript", type: "string", size: 10000, required: false },
      { key: "extractedText", type: "string", size: 10000, required: false },
      { key: "analysisSummary", type: "string", size: 4000, required: false },
      { key: "createdAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_files_ws_created", type: "key", attributes: ["workspaceId", "createdAt"] },
      { key: "idx_ws_files_hash", type: "key", attributes: ["hash"] },
    ],
  },
  WORKSPACE_MEMORY: {
    collectionId: COLLECTIONS.WORKSPACE_MEMORY,
    name: "Workspace Memory Items",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "type", type: "string", size: 32, required: true },
      { key: "title", type: "string", size: 255, required: true },
      { key: "content", type: "string", size: 4000, required: true },
      { key: "metadata", type: "string", size: 4000, required: false },
      { key: "sourceMessageId", type: "string", size: 64, required: false },
      { key: "sourceFileId", type: "string", size: 64, required: false },
      { key: "provenance", type: "string", size: 32, required: true, default: "ai-extracted" },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_mem_ws_type", type: "key", attributes: ["workspaceId", "type"] },
      { key: "idx_ws_mem_ws_created", type: "key", attributes: ["workspaceId", "createdAt"] },
    ],
  },
  WORKSPACE_SUMMARIES: {
    collectionId: COLLECTIONS.WORKSPACE_SUMMARIES,
    name: "Workspace Summaries",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "rollingSummary", type: "string", size: 10000, required: true },
      { key: "keyDecisions", type: "string", size: 4000, required: false },
      { key: "openIssues", type: "string", size: 4000, required: false },
      { key: "activeProjects", type: "string", size: 4000, required: false },
      { key: "lastMessageTimestamp", type: "integer", required: true, default: 0 },
      { key: "version", type: "integer", required: true, default: 1 },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_sum_ws", type: "key", attributes: ["workspaceId"] },
    ],
  },
  WORKSPACE_TASKS: {
    collectionId: COLLECTIONS.WORKSPACE_TASKS,
    name: "Workspace Tasks",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "title", type: "string", size: 255, required: true },
      { key: "details", type: "string", size: 4000, required: false },
      { key: "status", type: "string", size: 32, required: true, default: "OPEN" },
      { key: "assignee", type: "string", size: 128, required: false },
      { key: "createdBy", type: "string", size: 128, required: true },
      { key: "dueAt", type: "integer", required: false },
      { key: "sourceMessageId", type: "string", size: 64, required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_tasks_ws_status", type: "key", attributes: ["workspaceId", "status"] },
      { key: "idx_ws_tasks_acc_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  WORKSPACE_REMINDERS: {
    collectionId: COLLECTIONS.WORKSPACE_REMINDERS,
    name: "Workspace Reminders",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "destination", type: "string", size: 32, required: true, default: "group" },
      { key: "dueAt", type: "integer", required: true },
      { key: "message", type: "string", size: 2000, required: true },
      { key: "status", type: "string", size: 32, required: true, default: "PENDING" },
      { key: "createdByType", type: "string", size: 32, required: true, default: "ai" },
      { key: "createdById", type: "string", size: 128, required: true },
      { key: "sentAt", type: "integer", required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_rem_status_due", type: "key", attributes: ["status", "dueAt"] },
      { key: "idx_ws_rem_ws_status", type: "key", attributes: ["workspaceId", "status"] },
    ],
  },
  WORKSPACE_EVENTS: {
    collectionId: COLLECTIONS.WORKSPACE_EVENTS,
    name: "Workspace Audit Events",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "type", type: "string", size: 64, required: true },
      { key: "actor", type: "string", size: 128, required: true },
      { key: "details", type: "string", size: 4000, required: false },
      { key: "createdAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_evt_ws_created", type: "key", attributes: ["workspaceId", "createdAt"] },
      { key: "idx_ws_evt_acc_created", type: "key", attributes: ["accountId", "createdAt"] },
    ],
  },
  WORKSPACE_RECORDS: {
    collectionId: COLLECTIONS.WORKSPACE_RECORDS,
    name: "Workspace Structured Records",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "workspaceId", type: "string", size: 64, required: true },
      { key: "category", type: "string", size: 64, required: true },
      { key: "data", type: "string", size: 10000, required: true },
      { key: "sourceMessageId", type: "string", size: 64, required: false },
      { key: "sourceFileId", type: "string", size: 64, required: false },
      { key: "provenance", type: "string", size: 32, required: true, default: "ai-extracted" },
      { key: "createdAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_ws_rec_ws_cat", type: "key", attributes: ["workspaceId", "category"] },
      { key: "idx_ws_rec_ws_created", type: "key", attributes: ["workspaceId", "createdAt"] },
    ],
  },
};

/**
 * Ensures all collections, attributes and indexes exist idempotently.
 */
export async function ensureWorkspaceSchema(): Promise<{ created: string[]; existing: string[]; errors: string[] }> {
  const summary = {
    created: [] as string[],
    existing: [] as string[],
    errors: [] as string[],
  };

  for (const [key, def] of Object.entries(WORKSPACE_SCHEMA)) {
    try {
      try {
        await databases.getCollection(DATABASE_ID, def.collectionId);
        summary.existing.push(def.name);
      } catch (err: any) {
        if (err?.code === 404 || String(err?.message || "").includes("not found")) {
          await databases.createCollection(DATABASE_ID, def.collectionId, def.name);
          summary.created.push(def.name);
        } else {
          throw err;
        }
      }

      // Provision attributes idempotently
      for (const attr of def.attributes) {
        try {
          const isReq = attr.default !== undefined ? false : attr.required;
          if (attr.type === "string") {
            await databases.createStringAttribute(DATABASE_ID, def.collectionId, attr.key, attr.size || 255, isReq, attr.default, attr.array);
          } else if (attr.type === "integer") {
            await databases.createIntegerAttribute(DATABASE_ID, def.collectionId, attr.key, isReq, undefined, undefined, attr.default, attr.array);
          } else if (attr.type === "boolean") {
            await databases.createBooleanAttribute(DATABASE_ID, def.collectionId, attr.key, isReq, attr.default, attr.array);
          } else if (attr.type === "float") {
            await databases.createFloatAttribute(DATABASE_ID, def.collectionId, attr.key, isReq, undefined, undefined, attr.default, attr.array);
          }
        } catch (attrErr: any) {
          // Attribute already exists or pending
        }
      }

      // Provision indexes idempotently
      for (const idx of def.indexes) {
        try {
          await databases.createIndex(DATABASE_ID, def.collectionId, idx.key, idx.type as any, idx.attributes, idx.orders as any);
        } catch (idxErr: any) {
          // Index already exists or pending
        }
      }
    } catch (e: any) {
      summary.errors.push(`${def.name}: ${e?.message || e}`);
    }
  }

  return summary;
}
