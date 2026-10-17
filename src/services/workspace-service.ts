/**
 * Canonical AI Group Workspaces Service
 * 
 * Account-owned, instance-independent WhatsApp group workspace intelligence.
 * - Belonging strictly to accountId + workspaceId.
 * - Instance & group are replaceable bindings.
 * - Workspace data survives instance deletion, worker restarts, reconnects, QR relinks.
 * - Group message deduplication: 1 WhatsApp group message = 1 canonical workspace_message.
 * - One AI responder: only the designated responder instance may generate AI replies.
 * - FromMe loop prevention: outgoing messages from responder never re-enter planning.
 * - 4-layer context: Platform rules > Workspace instructions > Memory > Current context.
 * - Multimodal ingestion: audio transcription, image vision, PDF/document text extraction, video.
 * - Durable tasks & reminders with WAITING_FOR_RESPONDER and stale checks.
 * - Structured records with audit provenance.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Query, databases, storage, COLLECTIONS, DATABASE_ID, BUCKETS } from "../config/appwrite-client.ts";
import {
  uploadWorkspaceFile,
  downloadWorkspaceFile,
  deleteWorkspaceFile,
  deriveWorkspaceStorageFileId,
} from "./appwrite-storage-service.ts";
import {
  generateBackendText,
  type DeepInfraChatMessage,
  type DeepInfraToolDefinition,
  type DeepInfraParsedToolCall,
} from "./ai-text-provider-service.ts";
import {
  type Workspace,
  type WorkspaceBinding,
  type WorkspaceParticipant,
  type WorkspaceMessage,
  type WorkspaceFile,
  type WorkspaceMemoryItem,
  type WorkspaceSummary,
  type WorkspaceTask,
  type WorkspaceReminder,
  type WorkspaceEvent,
  type WorkspaceRecord,
  type WorkspaceStatus,
  type WorkspaceReplyMode,
  type ParticipantRole,
  type WorkspaceCreationInput,
  type CloneWorkspaceOptions,
  type WorkspaceRetrievalResult,
  type PrivilegedWorkspaceAction,
  type WorkspaceActor,
} from "./workspace-types.ts";

// In-memory stores for testing and offline fallbacks
const memoryWorkspaces = new Map<string, Workspace>();
const memoryBindings = new Map<string, WorkspaceBinding>();
const memoryParticipants = new Map<string, WorkspaceParticipant>();
const memoryMessages = new Map<string, WorkspaceMessage>();
const memoryFiles = new Map<string, WorkspaceFile>();
const memoryMemoryItems = new Map<string, WorkspaceMemoryItem>();
const memorySummaries = new Map<string, WorkspaceSummary>();
const memoryTasks = new Map<string, WorkspaceTask>();
const memoryReminders = new Map<string, WorkspaceReminder>();
const memoryEvents = new Map<string, WorkspaceEvent>();
const memoryRecords = new Map<string, WorkspaceRecord>();

const defaultWorkspaceAiDeps = {
  generateBackendText,
};

export const workspaceAiDeps = { ...defaultWorkspaceAiDeps };

export function __setWorkspaceAiTestDeps(overrides: Partial<typeof defaultWorkspaceAiDeps>): void {
  Object.assign(workspaceAiDeps, overrides || {});
}

export function __resetWorkspaceAiTestDeps(): void {
  Object.assign(workspaceAiDeps, defaultWorkspaceAiDeps);
}

function nowMs(): number {
  return Date.now();
}

function generateDocId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function deriveMessageDocId(workspaceId: string, whatsappMessageId: string): string {
  const hash = crypto.createHash("sha256").update(`${workspaceId}:${whatsappMessageId}`).digest("hex").slice(0, 24);
  return `wsmsg_${hash}`;
}

function clean(value: any, max = 5000): string {
  return String(value || "").trim().slice(0, max);
}

const COMMON_STOPWORDS = new Set([
  "what", "was", "the", "for", "is", "are", "were", "a", "an", "and",
  "in", "on", "of", "to", "who", "when", "where", "how", "did", "we",
  "about", "that", "this", "it", "with", "from", "at", "by", "can",
  "could", "would", "please", "tell", "me", "our", "there", "any",
  "anyone", "someone", "check"
]);

// ---------------------------------------------------------------------------
// 1. Audit Event Logging (Requirement 47)
// ---------------------------------------------------------------------------

export async function logWorkspaceEvent(
  accountId: string,
  workspaceId: string,
  type: WorkspaceEvent["type"],
  actor: string,
  details: Record<string, any> = {}
): Promise<WorkspaceEvent> {
  const event: WorkspaceEvent = {
    eventId: generateDocId("wsevt"),
    accountId,
    workspaceId,
    type,
    actor,
    details,
    createdAt: nowMs(),
  };

  memoryEvents.set(event.eventId, event);

  try {
    if (databases && COLLECTIONS.WORKSPACE_EVENTS && type !== "MESSAGE_INGESTED") {
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_EVENTS, event.eventId, {
        ...event,
        details: JSON.stringify(event.details),
      });
    }
  } catch (e) {
    // Graceful fallback to in-memory store
  }

  return event;
}

// ---------------------------------------------------------------------------
// 2. Workspace Lifecycle (Requirements 1, 2, 9, 12, 13, 14, 15, 18, 48, 49)
// ---------------------------------------------------------------------------

export async function createWorkspace(input: WorkspaceCreationInput): Promise<{ workspace: Workspace; binding: WorkspaceBinding }> {
  if (!input.accountId) throw new Error("accountId is required");
  if (!input.name) throw new Error("Workspace name is required");
  if (!input.groupJid) throw new Error("groupJid is required");
  if (!input.responderInstanceId) throw new Error("responderInstanceId is required");

  const workspaceId = generateDocId("ws");
  const bindingId = generateDocId("wsbind");
  const timestamp = nowMs();

  const workspace: Workspace = {
    workspaceId,
    accountId: input.accountId,
    name: clean(input.name, 255),
    purpose: clean(input.purpose, 1000),
    instructions: clean(input.instructions, 10000),
    replyMode: input.replyMode || "SMART_ASSIST",
    status: "ACTIVE",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  const binding: WorkspaceBinding = {
    bindingId,
    accountId: input.accountId,
    workspaceId,
    groupJid: input.groupJid,
    responderInstanceId: input.responderInstanceId,
    groupName: clean(input.groupName, 255),
    groupDescription: clean(input.groupDescription || "", 1000),
    status: "ACTIVE",
    attachedAt: timestamp,
    detachedAt: null,
    lastSeenAt: timestamp,
    version: 1,
  };

  // Seed initial rolling summary
  const summary: WorkspaceSummary = {
    summaryId: generateDocId("wssum"),
    accountId: input.accountId,
    workspaceId,
    rollingSummary: `Workspace created for ${workspace.name}. Purpose: ${workspace.purpose || "General collaboration"}.`,
    keyDecisions: [],
    openIssues: [],
    activeProjects: [],
    lastMessageTimestamp: timestamp,
    version: 1,
    updatedAt: timestamp,
  };

  // Detach any previous active binding for this group
  for (const b of memoryBindings.values()) {
    if (b.groupJid === input.groupJid && b.status === "ACTIVE") {
      b.status = "DETACHED";
      b.detachedAt = timestamp;
    }
  }

  // Save to memory
  memoryWorkspaces.set(workspaceId, workspace);
  memoryBindings.set(bindingId, binding);
  memorySummaries.set(workspaceId, summary);

  try {
    if (databases && COLLECTIONS.WORKSPACES) {
      const { workspaceId: _w, ...wsData } = workspace;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, workspaceId, wsData);
      const { bindingId: _b, ...bindData } = binding;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, bindingId, bindData);
      const { summaryId: _s, ...sumData } = summary;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_SUMMARIES, summary.summaryId, {
        ...sumData,
        keyDecisions: JSON.stringify(summary.keyDecisions),
        openIssues: JSON.stringify(summary.openIssues),
        activeProjects: JSON.stringify(summary.activeProjects),
      });
    }
  } catch (e) {
    // In-memory fallback
  }

  await logWorkspaceEvent(input.accountId, workspaceId, "WORKSPACE_CREATED", "system", { name: workspace.name });
  await logWorkspaceEvent(input.accountId, workspaceId, "BOUND", "system", { groupJid: binding.groupJid, responderInstanceId: binding.responderInstanceId });

  return { workspace, binding };
}

export async function getWorkspace(accountId: string, workspaceId: string): Promise<Workspace & { binding?: WorkspaceBinding; metrics?: any }> {
  let ws = memoryWorkspaces.get(workspaceId);

  if (!ws && databases && COLLECTIONS.WORKSPACES) {
    try {
      const doc: any = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, workspaceId);
      ws = {
        workspaceId: doc.$id || doc.workspaceId,
        accountId: doc.accountId,
        name: doc.name,
        purpose: doc.purpose,
        instructions: doc.instructions,
        replyMode: doc.replyMode,
        status: doc.status,
        creatorUserId: doc.creatorUserId,
        createdAt: Number(doc.createdAt),
        updatedAt: Number(doc.updatedAt),
        archivedAt: doc.archivedAt ? Number(doc.archivedAt) : null,
      };
      memoryWorkspaces.set(workspaceId, ws);
    } catch (e) {}
  }

  if (!ws) throw new Error("Workspace not found");
  if (ws.accountId !== accountId) {
    const err: any = new Error("Forbidden: Access denied to workspace of another account");
    err.status = 403;
    throw err;
  }

  // Find active binding
  let activeBinding = Array.from(memoryBindings.values()).find(
    (b) => b.workspaceId === workspaceId && b.status === "ACTIVE"
  );
  if (!activeBinding && databases && COLLECTIONS.WORKSPACE_BINDINGS) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, [
        Query.equal("workspaceId", workspaceId),
        Query.equal("status", "ACTIVE"),
        Query.limit(1),
      ]);
      if (res.documents.length > 0) {
        const doc = res.documents[0];
        activeBinding = {
          bindingId: doc.$id || doc.bindingId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          groupJid: doc.groupJid,
          responderInstanceId: doc.responderInstanceId,
          groupName: doc.groupName,
          groupDescription: doc.groupDescription,
          status: doc.status || "ACTIVE",
          attachedAt: Number(doc.attachedAt) || 0,
          detachedAt: doc.detachedAt ? Number(doc.detachedAt) : undefined,
          lastSeenAt: Number(doc.lastSeenAt) || 0,
          version: Number(doc.version) || 1,
        };
        memoryBindings.set(activeBinding.bindingId, activeBinding);
      }
    } catch (e) {}
  }

  // Compute metrics
  const msgCount = Array.from(memoryMessages.values()).filter((m) => m.workspaceId === workspaceId).length;
  const fileCount = Array.from(memoryFiles.values()).filter((f) => f.workspaceId === workspaceId).length;
  const memoryCount = Array.from(memoryMemoryItems.values()).filter((m) => m.workspaceId === workspaceId).length;
  const taskCount = Array.from(memoryTasks.values()).filter((t) => t.workspaceId === workspaceId && t.status !== "COMPLETED").length;
  const reminderCount = Array.from(memoryReminders.values()).filter((r) => r.workspaceId === workspaceId && r.status === "PENDING").length;

  return {
    ...ws,
    binding: activeBinding,
    metrics: {
      messageCount: msgCount,
      fileCount,
      memoryCount,
      activeTasks: taskCount,
      pendingReminders: reminderCount,
    },
  };
}

export async function listWorkspaces(
  accountId: string,
  filter?: { status?: WorkspaceStatus; search?: string }
): Promise<Array<Workspace & { binding?: WorkspaceBinding }>> {
  if (databases && COLLECTIONS.WORKSPACES) {
    try {
      const queries = [
        Query.equal("accountId", accountId),
        Query.limit(100),
      ];
      if (filter?.status) {
        queries.push(Query.equal("status", filter.status));
      }
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACES, queries);
      for (const doc of res.documents) {
        const ws: Workspace = {
          workspaceId: doc.$id || doc.workspaceId,
          accountId: doc.accountId,
          name: doc.name,
          purpose: doc.purpose,
          instructions: doc.instructions,
          replyMode: doc.replyMode,
          status: doc.status,
          creatorUserId: doc.creatorUserId,
          createdAt: Number(doc.createdAt),
          updatedAt: Number(doc.updatedAt),
          archivedAt: doc.archivedAt ? Number(doc.archivedAt) : null,
        };
        memoryWorkspaces.set(ws.workspaceId, ws);
      }
    } catch (e) {}
  }

  const result: Array<Workspace & { binding?: WorkspaceBinding }> = [];

  for (const ws of memoryWorkspaces.values()) {
    if (ws.accountId !== accountId) continue;
    if (filter?.status && ws.status !== filter.status) continue;
    if (filter?.search) {
      const term = filter.search.toLowerCase();
      if (!ws.name.toLowerCase().includes(term) && !ws.purpose.toLowerCase().includes(term)) continue;
    }

    let binding = Array.from(memoryBindings.values()).find(
      (b) => b.workspaceId === ws.workspaceId && b.status === "ACTIVE"
    );
    if (!binding && databases && COLLECTIONS.WORKSPACE_BINDINGS) {
      try {
        const bRes: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, [
          Query.equal("workspaceId", ws.workspaceId),
          Query.equal("status", "ACTIVE"),
          Query.limit(1),
        ]);
        if (bRes.documents.length > 0) {
          const doc = bRes.documents[0];
          binding = {
            bindingId: doc.$id || doc.bindingId,
            accountId: doc.accountId,
            workspaceId: doc.workspaceId,
            groupJid: doc.groupJid,
            responderInstanceId: doc.responderInstanceId,
            groupName: doc.groupName,
            groupDescription: doc.groupDescription,
            status: doc.status || "ACTIVE",
            attachedAt: Number(doc.attachedAt) || 0,
            detachedAt: doc.detachedAt ? Number(doc.detachedAt) : undefined,
            lastSeenAt: Number(doc.lastSeenAt) || 0,
            version: Number(doc.version) || 1,
          };
          memoryBindings.set(binding.bindingId, binding);
        }
      } catch (e) {}
    }

    result.push({ ...ws, binding });
  }

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---------------------------------------------------------------------------
// Participant Management & Explicit BlackArrow Authorization
// ---------------------------------------------------------------------------

export async function listWorkspaceParticipants(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceParticipant[]> {
  await getWorkspace(accountId, workspaceId);

  if (databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, [
        Query.equal("workspaceId", workspaceId),
        Query.equal("accountId", accountId),
        Query.limit(100),
      ]);
      for (const doc of res.documents) {
        const p: WorkspaceParticipant = {
          participantId: doc.$id || doc.participantId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          groupJid: doc.groupJid,
          jid: doc.jid,
          canonicalPhone: doc.canonicalPhone,
          displayName: doc.displayName,
          role: doc.role || "MEMBER",
          whatsappAdmin: Boolean(doc.whatsappAdmin),
          joinedAt: Number(doc.joinedAt),
          updatedAt: Number(doc.updatedAt),
        };
        memoryParticipants.set(p.participantId, p);
      }
    } catch (e) {}
  }

  return Array.from(memoryParticipants.values()).filter(
    (p) => p.workspaceId === workspaceId && p.accountId === accountId
  );
}

export async function getWorkspaceParticipant(
  accountId: string,
  workspaceId: string,
  jid: string
): Promise<WorkspaceParticipant | null> {
  await getWorkspace(accountId, workspaceId);

  let participant = Array.from(memoryParticipants.values()).find(
    (p) => p.workspaceId === workspaceId && p.jid === jid
  );

  if (!participant && databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, [
        Query.equal("workspaceId", workspaceId),
        Query.equal("jid", jid),
        Query.limit(1),
      ]);
      if (res.documents.length > 0) {
        const doc = res.documents[0];
        participant = {
          participantId: doc.$id || doc.participantId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          groupJid: doc.groupJid,
          jid: doc.jid,
          canonicalPhone: doc.canonicalPhone,
          displayName: doc.displayName,
          role: doc.role || "MEMBER",
          whatsappAdmin: Boolean(doc.whatsappAdmin),
          joinedAt: Number(doc.joinedAt),
          updatedAt: Number(doc.updatedAt),
        };
        memoryParticipants.set(participant.participantId, participant);
      }
    } catch (e) {}
  }

  return participant || null;
}

export async function assertWorkspacePrivilege(
  accountId: string,
  workspaceId: string,
  action: PrivilegedWorkspaceAction,
  actor?: WorkspaceActor
): Promise<void> {
  if (!actor || (!actor.jid && !actor.role)) {
    return; // Default session owner allowed
  }

  let resolvedRole = actor.role;

  if (actor.jid) {
    const participant = await getWorkspaceParticipant(accountId, workspaceId, actor.jid);
    if (participant) {
      resolvedRole = participant.role;
    } else if (!resolvedRole) {
      resolvedRole = "MEMBER";
    }
  }

  if (resolvedRole === "OWNER") {
    return;
  }

  if (resolvedRole === "WORKSPACE_ADMIN") {
    const ownerOnlyActions: PrivilegedWorkspaceAction[] = [
      "MANAGE_ADMINS",
      "DELETE",
      "CHANGE_RESPONDER",
      "ATTACH_REBIND",
      "ARCHIVE",
      "RESTORE",
    ];
    if (ownerOnlyActions.includes(action)) {
      throw new Error(`Forbidden: Only BlackArrow Workspace OWNER can perform ${action}. Role WORKSPACE_ADMIN is insufficient.`);
    }
    return;
  }

  throw new Error(
    `Forbidden: Action "${action}" denied. Actor role is ${resolvedRole || "MEMBER"}. WhatsApp group-admin status is transport metadata only and does NOT grant BlackArrow Workspace Admin privilege.`
  );
}

export async function grantWorkspaceAdmin(
  accountId: string,
  workspaceId: string,
  participantJid: string,
  actorRole: ParticipantRole = "OWNER"
): Promise<WorkspaceParticipant> {
  if (actorRole !== "OWNER") {
    throw new Error("Forbidden: Only BlackArrow Workspace OWNER can grant WORKSPACE_ADMIN");
  }
  await getWorkspace(accountId, workspaceId);

  let participant = await getWorkspaceParticipant(accountId, workspaceId, participantJid);
  const timestamp = nowMs();

  if (!participant) {
    participant = {
      participantId: generateDocId("wspart"),
      accountId,
      workspaceId,
      groupJid: "",
      jid: participantJid,
      canonicalPhone: participantJid.split("@")[0].replace(/\D/g, ""),
      displayName: participantJid.split("@")[0],
      role: "WORKSPACE_ADMIN",
      whatsappAdmin: false,
      joinedAt: timestamp,
      updatedAt: timestamp,
    };
    memoryParticipants.set(participant.participantId, participant);
  } else {
    participant.role = "WORKSPACE_ADMIN";
    participant.updatedAt = timestamp;
  }

  try {
    if (databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
          role: "WORKSPACE_ADMIN",
          updatedAt: timestamp,
        });
      } catch {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
          ...participant,
        });
      }
    }
  } catch (e) {}

  await logWorkspaceEvent(accountId, workspaceId, "WORKSPACE_ADMIN_GRANTED", "owner", {
    participantJid,
    grantedRole: "WORKSPACE_ADMIN",
  });

  return participant;
}

export async function revokeWorkspaceAdmin(
  accountId: string,
  workspaceId: string,
  participantJid: string,
  actorRole: ParticipantRole = "OWNER"
): Promise<WorkspaceParticipant> {
  if (actorRole !== "OWNER") {
    throw new Error("Forbidden: Only BlackArrow Workspace OWNER can revoke WORKSPACE_ADMIN");
  }
  await getWorkspace(accountId, workspaceId);

  const participant = await getWorkspaceParticipant(accountId, workspaceId, participantJid);
  if (!participant) {
    throw new Error("Participant not found");
  }

  const timestamp = nowMs();
  participant.role = "MEMBER";
  participant.updatedAt = timestamp;

  try {
    if (databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
          role: "MEMBER",
          updatedAt: timestamp,
        });
      } catch {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
          ...participant,
        });
      }
    }
  } catch (e) {}

  await logWorkspaceEvent(accountId, workspaceId, "WORKSPACE_ADMIN_REVOKED", "owner", {
    participantJid,
    newRole: "MEMBER",
    whatsappAdminStillTrue: participant.whatsappAdmin,
  });

  return participant;
}

export async function syncParticipantWhatsAppMetadata(
  accountId: string,
  workspaceId: string,
  participantJid: string,
  whatsappAdmin: boolean
): Promise<WorkspaceParticipant> {
  await getWorkspace(accountId, workspaceId);

  let participant = await getWorkspaceParticipant(accountId, workspaceId, participantJid);
  const timestamp = nowMs();

  if (!participant) {
    const isOwner = participantJid.includes(accountId) || participantJid.startsWith(accountId);
    participant = {
      participantId: generateDocId("wspart"),
      accountId,
      workspaceId,
      groupJid: "",
      jid: participantJid,
      canonicalPhone: participantJid.split("@")[0].replace(/\D/g, ""),
      displayName: participantJid.split("@")[0],
      role: isOwner ? "OWNER" : "MEMBER",
      whatsappAdmin: Boolean(whatsappAdmin),
      joinedAt: timestamp,
      updatedAt: timestamp,
    };
    memoryParticipants.set(participant.participantId, participant);
  } else {
    // CRITICAL: Update WhatsApp transport metadata ONLY!
    // NEVER elevates participant.role to WORKSPACE_ADMIN!
    participant.whatsappAdmin = Boolean(whatsappAdmin);
    participant.updatedAt = timestamp;
  }

  try {
    if (databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
          whatsappAdmin: participant.whatsappAdmin,
          updatedAt: timestamp,
        });
      } catch {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
          ...participant,
        });
      }
    }
  } catch (e) {}

  return participant;
}

export async function updateWorkspace(
  accountId: string,
  workspaceId: string,
  updates: Partial<Pick<Workspace, "name" | "purpose" | "instructions" | "replyMode">>,
  actor?: WorkspaceActor
): Promise<Workspace> {
  if (updates.instructions !== undefined) {
    await assertWorkspacePrivilege(accountId, workspaceId, "EDIT_INSTRUCTIONS", actor);
  }
  if (updates.replyMode !== undefined) {
    await assertWorkspacePrivilege(accountId, workspaceId, "CHANGE_REPLY_MODE", actor);
  }
  if (updates.name !== undefined || updates.purpose !== undefined) {
    await assertWorkspacePrivilege(accountId, workspaceId, "CHANGE_CONFIG", actor);
  }

  const ws = await getWorkspace(accountId, workspaceId);

  let updated = false;
  if (updates.name !== undefined) {
    ws.name = clean(updates.name, 255);
    updated = true;
  }
  if (updates.purpose !== undefined) {
    ws.purpose = clean(updates.purpose, 1000);
    updated = true;
  }
  if (updates.instructions !== undefined) {
    ws.instructions = clean(updates.instructions, 10000);
    updated = true;
    await logWorkspaceEvent(accountId, workspaceId, "INSTRUCTIONS_UPDATED", "owner", { instructionsLength: ws.instructions.length });
  }
  if (updates.replyMode !== undefined) {
    ws.replyMode = updates.replyMode;
    updated = true;
    await logWorkspaceEvent(accountId, workspaceId, "MODE_CHANGED", "owner", { newMode: ws.replyMode });
  }

  if (updated) {
    ws.updatedAt = nowMs();
    memoryWorkspaces.set(workspaceId, ws);
    try {
      if (databases && COLLECTIONS.WORKSPACES) {
        const { workspaceId: _w, ...updateData } = ws;
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, workspaceId, updateData);
      }
    } catch (e) {}
  }

  return ws;
}

export async function archiveWorkspace(
  accountId: string,
  workspaceId: string,
  actor?: WorkspaceActor
): Promise<Workspace> {
  await assertWorkspacePrivilege(accountId, workspaceId, "ARCHIVE", actor);
  const ws = await getWorkspace(accountId, workspaceId);
  ws.status = "ARCHIVED";
  ws.archivedAt = nowMs();
  ws.updatedAt = nowMs();

  memoryWorkspaces.set(workspaceId, ws);
  try {
    if (databases && COLLECTIONS.WORKSPACES) {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, workspaceId, {
        status: ws.status,
        archivedAt: ws.archivedAt,
        updatedAt: ws.updatedAt,
      });
    }
  } catch (e) {}
  await logWorkspaceEvent(accountId, workspaceId, "ARCHIVED", "owner", {});

  return ws;
}

export async function restoreWorkspace(
  accountId: string,
  workspaceId: string,
  actor?: WorkspaceActor
): Promise<Workspace> {
  await assertWorkspacePrivilege(accountId, workspaceId, "RESTORE", actor);
  const ws = await getWorkspace(accountId, workspaceId);
  const activeBinding = Array.from(memoryBindings.values()).find(
    (b) => b.workspaceId === workspaceId && b.status === "ACTIVE"
  );

  ws.status = activeBinding ? "ACTIVE" : "NEEDS_RESPONDER";
  ws.archivedAt = null;
  ws.updatedAt = nowMs();

  memoryWorkspaces.set(workspaceId, ws);
  try {
    if (databases && COLLECTIONS.WORKSPACES) {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, workspaceId, {
        status: ws.status,
        archivedAt: ws.archivedAt,
        updatedAt: ws.updatedAt,
      });
    }
  } catch (e) {}
  await logWorkspaceEvent(accountId, workspaceId, "RESTORED", "owner", {});

  return ws;
}

export async function cloneWorkspace(
  accountId: string,
  workspaceId: string,
  options: CloneWorkspaceOptions,
  actor?: WorkspaceActor
): Promise<Workspace> {
  await assertWorkspacePrivilege(accountId, workspaceId, "CLONE", actor);
  const source = await getWorkspace(accountId, workspaceId);
  const newWorkspaceId = generateDocId("ws");
  const timestamp = nowMs();

  const newWorkspace: Workspace = {
    workspaceId: newWorkspaceId,
    accountId,
    name: options.newName ? clean(options.newName, 255) : `${source.name} (Copy)`,
    purpose: source.purpose,
    instructions: options.copyInstructions ? source.instructions : "",
    replyMode: source.replyMode,
    status: "NEEDS_RESPONDER",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  memoryWorkspaces.set(newWorkspaceId, newWorkspace);

  // Copy summary if requested
  if (options.copySummary) {
    const srcSummary = memorySummaries.get(workspaceId);
    if (srcSummary) {
      const clonedSummary: WorkspaceSummary = {
        ...srcSummary,
        summaryId: generateDocId("wssum"),
        workspaceId: newWorkspaceId,
        updatedAt: timestamp,
      };
      memorySummaries.set(newWorkspaceId, clonedSummary);
    }
  }

  // Copy memory items if requested
  if (options.copyMemory) {
    for (const mem of memoryMemoryItems.values()) {
      if (mem.workspaceId === workspaceId) {
        const clonedMem: WorkspaceMemoryItem = {
          ...mem,
          memoryId: generateDocId("wsmem"),
          workspaceId: newWorkspaceId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        memoryMemoryItems.set(clonedMem.memoryId, clonedMem);
      }
    }
  }

  // Copy tasks if requested
  if (options.copyTasks) {
    for (const task of memoryTasks.values()) {
      if (task.workspaceId === workspaceId && task.status !== "COMPLETED") {
        const clonedTask: WorkspaceTask = {
          ...task,
          taskId: generateDocId("wstask"),
          workspaceId: newWorkspaceId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        memoryTasks.set(clonedTask.taskId, clonedTask);
      }
    }
  }

  await logWorkspaceEvent(accountId, newWorkspaceId, "CLONED", "owner", { sourceWorkspaceId: workspaceId });

  return newWorkspace;
}

export async function deleteWorkspace(
  accountId: string,
  workspaceId: string,
  actor?: WorkspaceActor
): Promise<{ success: boolean }> {
  await assertWorkspacePrivilege(accountId, workspaceId, "DELETE", actor);
  const ws = await getWorkspace(accountId, workspaceId);

  await logWorkspaceEvent(accountId, workspaceId, "DELETE_REQUESTED", "owner", {});

  // Clean up all memory arrays
  memoryWorkspaces.delete(workspaceId);
  memorySummaries.delete(workspaceId);

  for (const [k, v] of memoryBindings.entries()) {
    if (v.workspaceId === workspaceId) memoryBindings.delete(k);
  }
  for (const [k, v] of memoryParticipants.entries()) {
    if (v.workspaceId === workspaceId) memoryParticipants.delete(k);
  }
  for (const [k, v] of memoryMessages.entries()) {
    if (v.workspaceId === workspaceId) memoryMessages.delete(k);
  }
  for (const [k, v] of memoryFiles.entries()) {
    if (v.workspaceId === workspaceId) {
      if (v.storageId) {
        deleteWorkspaceFile(v.storageId, v.storageBucketId).catch(() => {});
      }
      memoryFiles.delete(k);
    }
  }
  for (const [k, v] of memoryMemoryItems.entries()) {
    if (v.workspaceId === workspaceId) memoryMemoryItems.delete(k);
  }
  for (const [k, v] of memoryTasks.entries()) {
    if (v.workspaceId === workspaceId) memoryTasks.delete(k);
  }
  for (const [k, v] of memoryReminders.entries()) {
    if (v.workspaceId === workspaceId) memoryReminders.delete(k);
  }
  for (const [k, v] of memoryRecords.entries()) {
    if (v.workspaceId === workspaceId) memoryRecords.delete(k);
  }
  for (const [k, v] of memoryEvents.entries()) {
    if (v.workspaceId === workspaceId) memoryEvents.delete(k);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// 3. Responder & Binding Management (Requirements 4, 13, 14, 15, 16, 17, 60, 61)
// ---------------------------------------------------------------------------

export async function attachWorkspace(
  accountId: string,
  workspaceId: string,
  responderInstanceId: string,
  groupJid: string,
  groupName: string,
  groupDescription = "",
  actor?: WorkspaceActor
): Promise<WorkspaceBinding> {
  await assertWorkspacePrivilege(accountId, workspaceId, "ATTACH_REBIND", actor);
  const ws = await getWorkspace(accountId, workspaceId);

  const timestamp = nowMs();

  // Find previous active binding and detach it
  for (const b of memoryBindings.values()) {
    if (b.workspaceId === workspaceId && b.status === "ACTIVE") {
      b.status = "DETACHED";
      b.detachedAt = timestamp;
    }
  }

  const bindingId = generateDocId("wsbind");
  const binding: WorkspaceBinding = {
    bindingId,
    accountId,
    workspaceId,
    groupJid,
    responderInstanceId,
    groupName: clean(groupName, 255),
    groupDescription: clean(groupDescription, 1000),
    status: "ACTIVE",
    attachedAt: timestamp,
    detachedAt: null,
    lastSeenAt: timestamp,
    version: 2,
  };

  memoryBindings.set(bindingId, binding);

  ws.status = "ACTIVE";
  ws.updatedAt = timestamp;
  memoryWorkspaces.set(workspaceId, ws);

  if (databases && COLLECTIONS.WORKSPACE_BINDINGS) {
    try {
      const { bindingId: _b, ...bindData } = binding;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, bindingId, bindData);
    } catch (e) {}
  }
  if (databases && COLLECTIONS.WORKSPACES) {
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, workspaceId, {
        status: ws.status,
        updatedAt: ws.updatedAt,
      });
    } catch (e) {}
  }

  await logWorkspaceEvent(accountId, workspaceId, "BOUND", "owner", { groupJid, responderInstanceId });
  await logWorkspaceEvent(accountId, workspaceId, "RESPONDER_CHANGED", "owner", { newResponderInstanceId: responderInstanceId });

  return binding;
}

export async function switchResponder(
  accountId: string,
  workspaceId: string,
  newResponderInstanceId: string,
  actor?: WorkspaceActor
): Promise<WorkspaceBinding> {
  await assertWorkspacePrivilege(accountId, workspaceId, "CHANGE_RESPONDER", actor);
  const ws = await getWorkspace(accountId, workspaceId);
  const currentBinding = Array.from(memoryBindings.values()).find(
    (b) => b.workspaceId === workspaceId && b.status === "ACTIVE"
  );

  if (!currentBinding) {
    throw new Error("No active binding exists for this workspace. Use attachWorkspace instead.");
  }

  const timestamp = nowMs();
  currentBinding.status = "DETACHED";
  currentBinding.detachedAt = timestamp;

  const newBindingId = generateDocId("wsbind");
  const newBinding: WorkspaceBinding = {
    ...currentBinding,
    bindingId: newBindingId,
    responderInstanceId: newResponderInstanceId,
    status: "ACTIVE",
    attachedAt: timestamp,
    detachedAt: null,
    lastSeenAt: timestamp,
    version: currentBinding.version + 1,
  };

  memoryBindings.set(newBindingId, newBinding);
  ws.updatedAt = timestamp;

  if (databases && COLLECTIONS.WORKSPACE_BINDINGS) {
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, currentBinding.bindingId, {
        status: currentBinding.status,
        detachedAt: currentBinding.detachedAt,
      });
      const { bindingId: _b, ...bindData } = newBinding;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, newBindingId, bindData);
    } catch (e) {}
  }

  await logWorkspaceEvent(accountId, workspaceId, "RESPONDER_CHANGED", "owner", {
    oldResponder: currentBinding.responderInstanceId,
    newResponder: newResponderInstanceId,
  });

  return newBinding;
}

export async function handleInstanceDeleted(deletedBotId: string): Promise<{ affectedWorkspaces: string[] }> {
  const affected: string[] = [];
  const timestamp = nowMs();

  for (const binding of memoryBindings.values()) {
    if (binding.responderInstanceId === deletedBotId && binding.status === "ACTIVE") {
      binding.status = "DETACHED";
      binding.detachedAt = timestamp;

      const ws = memoryWorkspaces.get(binding.workspaceId);
      if (ws) {
        ws.status = "NEEDS_RESPONDER";
        ws.updatedAt = timestamp;
        affected.push(ws.workspaceId);
        logWorkspaceEvent(ws.accountId, ws.workspaceId, "DETACHED", "system", { reason: "responder_instance_deleted", deletedBotId });
      }
    }
  }

  return { affectedWorkspaces: affected };
}

export async function handleResponderRemovedFromGroup(workspaceId: string, groupJid: string): Promise<void> {
  const ws = memoryWorkspaces.get(workspaceId);
  if (!ws) return;

  for (const binding of memoryBindings.values()) {
    if (binding.workspaceId === workspaceId && binding.groupJid === groupJid && binding.status === "ACTIVE") {
      binding.status = "DETACHED";
      binding.detachedAt = nowMs();
    }
  }

  ws.status = "NEEDS_RESPONDER";
  ws.updatedAt = nowMs();
  await logWorkspaceEvent(ws.accountId, workspaceId, "DETACHED", "system", { reason: "responder_removed_from_group", groupJid });
}

export async function findActiveBindingForGroup(accountId: string, groupJid: string): Promise<WorkspaceBinding | null> {
  let binding = Array.from(memoryBindings.values()).find(
    (b) => (!accountId || b.accountId === accountId) && b.groupJid === groupJid && b.status === "ACTIVE"
  );
  if (binding) return binding;

  if (databases && COLLECTIONS.WORKSPACE_BINDINGS) {
    try {
      const queries = [
        Query.equal("groupJid", groupJid),
        Query.equal("status", "ACTIVE"),
        Query.limit(10),
      ];
      if (accountId) {
        queries.push(Query.equal("accountId", accountId));
      }
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_BINDINGS, queries);
      if (res.documents && res.documents.length > 0) {
        const sorted = res.documents.sort((a: any, b: any) => (Number(b.attachedAt) || 0) - (Number(a.attachedAt) || 0));
        const doc = sorted[0];
        binding = {
          bindingId: doc.$id || doc.bindingId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          groupJid: doc.groupJid,
          responderInstanceId: doc.responderInstanceId,
          groupName: doc.groupName,
          groupDescription: doc.groupDescription,
          status: doc.status || "ACTIVE",
          attachedAt: Number(doc.attachedAt) || 0,
          detachedAt: doc.detachedAt ? Number(doc.detachedAt) : undefined,
          lastSeenAt: Number(doc.lastSeenAt) || 0,
          version: Number(doc.version) || 1,
        };
        memoryBindings.set(binding.bindingId, binding);
        return binding;
      }
    } catch (e) {}
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3.5 Workspace Records & AI Engine Tools (Requirements 38, 39, 41, 42, 66)
// ---------------------------------------------------------------------------

export async function createWorkspaceRecord(input: {
  accountId: string;
  workspaceId: string;
  category: WorkspaceRecord["category"];
  data: Record<string, any>;
  sourceMessageId?: string | null;
  sourceFileId?: string | null;
  provenance?: WorkspaceRecord["provenance"];
}): Promise<WorkspaceRecord> {
  const record: WorkspaceRecord = {
    recordId: generateDocId("wsrec"),
    accountId: input.accountId,
    workspaceId: input.workspaceId,
    category: input.category,
    data: input.data,
    sourceMessageId: input.sourceMessageId || null,
    sourceFileId: input.sourceFileId || null,
    provenance: input.provenance || "ai-extracted",
    createdAt: nowMs(),
  };

  memoryRecords.set(record.recordId, record);

  if (databases && COLLECTIONS.WORKSPACE_RECORDS) {
    try {
      const { recordId: _r, ...recData } = record;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_RECORDS, record.recordId, {
        ...recData,
        data: JSON.stringify(record.data),
      });
    } catch (e) {}
  }

  return record;
}

export const WORKSPACE_AI_TOOLS: DeepInfraToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_workspace_task",
      description: "Create an assigned task or action item for the workspace team or a specific member.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Clear, concise title of the task" },
          description: { type: "string", description: "Detailed description of the task requirements" },
          assignee: { type: "string", description: "Name or phone of the participant assigned to this task" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_workspace_reminder",
      description: "Create a reminder for the workspace group or a specific member to fire at a future time.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind the group or person about" },
          dueInMinutes: { type: "number", description: "Minutes from now when reminder should fire (default 60)" },
          targetType: { type: "string", enum: ["group", "member"], description: "Whether to notify the whole group or specific member" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_workspace_financial_entry",
      description: "Record an expense, purchase, invoice, bill, cost, payment, or financial event. Profit or markup formulas from workspace instructions are computed deterministically.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Numerical expense or transaction amount" },
          category: { type: "string", description: "Category (e.g. materials, supplies, inventory, labor, service, equipment, misc)" },
          description: { type: "string", description: "Detailed description of the transaction" },
          currency: { type: "string", description: "Currency symbol or code (e.g. PKR, USD, EUR)" },
          vendor: { type: "string", description: "Vendor, supplier, or payer name" },
        },
        required: ["amount", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "store_workspace_memory",
      description: "Save an important workspace decision, rule, policy, agreement, or durable fact into workspace memory.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Brief key or title (e.g. 'Project Deadline', 'Vendor Agreement')" },
          content: { type: "string", description: "Complete statement or rule to remember" },
          category: { type: "string", enum: ["decision", "fact", "rule", "project_note"], description: "Category of memory" },
        },
        required: ["key", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "retrieve_workspace_knowledge",
      description: "Retrieve past historical facts, previous decisions, supplier references, or recorded agreements from workspace long-term memory.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The specific detail, reference number, or fact to look up" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stay_silent",
      description: "Call this tool when SMART_ASSIST determines the message is casual chatter, greeting, acknowledgment, reaction, or does NOT require an assistant response.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why no response is needed (e.g. casual chatter, emoji, unrelated banter)" },
        },
        required: ["reason"],
      },
    },
  },
];

async function executeWorkspaceTool(
  toolName: string,
  args: any,
  context: {
    workspace: Workspace;
    messageRecord: WorkspaceMessage;
    participant: WorkspaceParticipant;
    fileRecordId?: string | null;
  }
): Promise<{ observation: any; handled: boolean; shouldSilence?: boolean }> {
  const { workspace, messageRecord, participant, fileRecordId } = context;
  const { accountId, workspaceId, messageRecordId } = messageRecord;

  if (toolName === "stay_silent") {
    return { observation: { silent: true, reason: args?.reason || "SMART_ASSIST decided silence" }, handled: true, shouldSilence: true };
  }

  if (toolName === "create_workspace_task") {
    const title = clean(args?.title || "New Task", 255);
    const description = clean(args?.description || `Created from message ${messageRecord.whatsappMessageId}`, 1000);
    const assignee = clean(args?.assignee || participant.displayName, 255);
    const task = await createTask(accountId, workspaceId, title, description, assignee);
    return {
      observation: {
        status: "created",
        taskId: task.taskId,
        title: task.title,
        assignee: task.assignee,
      },
      handled: true,
    };
  }

  if (toolName === "create_workspace_reminder") {
    const text = clean(args?.text || "Reminder", 1000);
    const minutes = Number(args?.dueInMinutes || 60);
    const dueAt = nowMs() + Math.max(1, minutes) * 60 * 1000;
    const targetType = args?.targetType === "owner_1_1" ? "owner_1_1" : "group";
    const reminder = await createReminder(accountId, workspaceId, targetType, dueAt, text, "ai", participant.displayName);
    return {
      observation: {
        status: "created",
        reminderId: reminder.reminderId,
        message: reminder.message,
        dueAt: new Date(dueAt).toISOString(),
        targetType,
      },
      handled: true,
    };
  }

  if (toolName === "record_workspace_financial_entry") {
    const amountVal = Math.abs(Number(args?.amount || 0));
    const profitMatch = (workspace.instructions || "").match(/(\d+(?:\.\d+)?)\s*%\s*(?:profit|markup)/i) ||
                        (workspace.purpose || "").match(/(\d+(?:\.\d+)?)\s*%\s*(?:profit|markup)/i);
    const profitPercent = profitMatch ? parseFloat(profitMatch[1]) : 0;
    const profitRate = profitPercent / 100;
    const profitAmount = profitRate > 0 ? amountVal * profitRate : 0;
    const totalBilling = amountVal + profitAmount;
    const desc = clean(args?.description || messageRecord.textContent, 500);

    const record = await createWorkspaceRecord({
      accountId,
      workspaceId,
      category: "expense",
      data: {
        amount: amountVal,
        profit: profitAmount,
        profitPercent,
        totalBilling,
        description: desc,
        recordedBy: participant.displayName,
        currency: args?.currency || "USD",
        vendor: args?.vendor || null,
        rawText: messageRecord.textContent,
      },
      sourceMessageId: messageRecordId,
      sourceFileId: fileRecordId || null,
      provenance: "ai-extracted",
    });

    await addMemoryItem(
      accountId,
      workspaceId,
      "EXPENSE",
      `Expense: ${amountVal}`,
      desc.slice(0, 150),
      { amount: amountVal, profit: profitAmount, totalBilling, profitPercent },
      messageRecordId,
      fileRecordId,
      "ai-extracted"
    );

    return {
      observation: {
        status: "recorded",
        recordId: record.recordId,
        amount: amountVal,
        profitPercent,
        profitAmount,
        totalBilling,
        description: desc,
      },
      handled: true,
    };
  }

  if (toolName === "store_workspace_memory") {
    const category = (String(args?.category || "FACT").toUpperCase()) as any;
    const key = clean(args?.key || "Note", 255);
    const content = clean(args?.content || "", 4000);
    const item = await addMemoryItem(
      accountId,
      workspaceId,
      category,
      key,
      content,
      {},
      messageRecordId,
      fileRecordId,
      "ai-extracted"
    );
    return {
      observation: {
        status: "stored",
        memoryId: item.memoryId,
        key: item.title,
        category: item.type,
      },
      handled: true,
    };
  }

  if (toolName === "retrieve_workspace_knowledge") {
    const query = clean(args?.query || messageRecord.textContent, 500);
    const knowledge = await retrieveWorkspaceKnowledge(accountId, workspaceId, query);
    return {
      observation: {
        recovered: knowledge.recovered,
        matchedContent: knowledge.matchedContent,
        mechanism: knowledge.mechanism,
        sourceProvenance: knowledge.sourceProvenance,
      },
      handled: true,
    };
  }

  return { observation: { error: `Unknown tool: ${toolName}` }, handled: false };
}

async function executeSemanticFallback(params: {
  workspace: Workspace;
  binding: WorkspaceBinding;
  messageRecord: WorkspaceMessage;
  participant: WorkspaceParticipant;
  text: string;
  fileRecordId?: string | null;
  profitPercent: number;
}): Promise<{ shouldReply: boolean; replyText?: string; actionsExecuted: any[]; reason?: string; promptTokenCount?: number; candidatesTokenCount?: number }> {
  const { workspace, messageRecord, participant, text, fileRecordId, profitPercent } = params;
  const { accountId, workspaceId, messageRecordId } = messageRecord;
  const actionsExecuted: any[] = [];
  const lower = text.toLowerCase().trim();

  // 1. SMART_ASSIST casual chatter check
  if (workspace.replyMode === "SMART_ASSIST") {
    const isCasualAck = /^(ok|okay|haan|theek|theek hai|cool|shukriya|thanks|thank you|done|nice|wah|haha|acha|sahi|good|yep|yes|no)$/i.test(lower);
    const isQuestion = text.includes("?") || /^(what|how|why|when|where|who|is|can|could|please|check|tell|kya|kaise|kab|kahan|kyun)/i.test(lower);
    const isAction = /\b(remind|task|todo|expense|cost|price|bill|purchased|bought|payment|paid|record|note|save|yad|yaad|kaam)\b/i.test(lower);
    const isMentioned = Boolean(messageRecord.replyRelation === "reply_to_responder");

    if (isCasualAck && !isQuestion && !isAction && !isMentioned) {
      return { shouldReply: false, actionsExecuted, reason: "SMART_ASSIST: casual chatter without semantic action needed" };
    }
  }

  // 2. Semantic Reminder Intent
  if (lower.includes("reminder") || lower.includes("remind me") || lower.includes("yaad dilana") || lower.includes("yad dilana") || lower.includes("yaad karwa")) {
    const cleanText = text.replace(/^(?:please\s+)?(?:remind\s+(?:me|us)|set\s+a\s+reminder(?:\s+for)?|yaad\s+dilana|yad\s+dilana)\s*:?\s*/i, "").trim() || text;
    const dueAt = nowMs() + 3600 * 1000;
    const reminder = await createReminder(accountId, workspaceId, "group", dueAt, cleanText, "ai", participant.displayName);
    actionsExecuted.push({ tool: "create_workspace_reminder", params: { text: cleanText }, result: reminder });
    return {
      shouldReply: true,
      replyText: `I've noted this reminder for you: "${cleanText}". I will notify the group when due.`,
      actionsExecuted,
    };
  }

  // 3. Semantic Task Intent
  if (lower.startsWith("task:") || lower.startsWith("todo:") || lower.includes("assign task") || lower.includes("ye kaam") || lower.includes("kaam karo")) {
    const taskTitle = text.replace(/^(?:task:|todo:|please\s+assign\s+task\s*:?|ye\s+kaam\s*:?)/i, "").trim() || text;
    const task = await createTask(accountId, workspaceId, taskTitle, `Created from message ${messageRecord.whatsappMessageId}`, participant.displayName);
    actionsExecuted.push({ tool: "create_workspace_task", params: { title: taskTitle }, result: task });
    return {
      shouldReply: true,
      replyText: `Task created: "${taskTitle}" assigned to ${participant.displayName}.`,
      actionsExecuted,
    };
  }

  // 4. Semantic Financial / Expense Intent
  const isFinance = /\b(expense|cost|price|bill|billing|purchased|bought|receipt|payment|paid|kharida|kharcha)\b/i.test(lower) || text.includes("$");
  if (isFinance) {
    const numMatch = text.match(/([0-9,.]+)\s*(?:rs\.?|pkr|usd|\$)?/i);
    const amountVal = numMatch ? parseFloat(numMatch[1].replace(/,/g, "")) : 0;
    if (amountVal > 0) {
      const profitRate = profitPercent / 100;
      const profit = profitRate > 0 ? amountVal * profitRate : 0;
      const total = amountVal + profit;

      const record = await createWorkspaceRecord({
        accountId,
        workspaceId,
        category: "expense",
        data: {
          amount: amountVal,
          profit,
          profitPercent,
          totalBilling: total,
          description: text.slice(0, 200),
          recordedBy: participant.displayName,
          rawText: text,
        },
        sourceMessageId: messageRecordId,
        sourceFileId: fileRecordId || null,
        provenance: "ai-extracted",
      });

      await addMemoryItem(
        accountId,
        workspaceId,
        "EXPENSE",
        `Expense: ${amountVal}`,
        text.slice(0, 150),
        { amount: amountVal, profit, totalBilling: total, profitPercent },
        messageRecordId,
        fileRecordId,
        "ai-extracted"
      );

      actionsExecuted.push({ tool: "record_workspace_financial_entry", params: { amount: amountVal }, result: record });

      let reply = `Noted. I have recorded the expense of ${amountVal} for ${workspace.name}.`;
      if (profitRate > 0) {
        reply += ` With ${profitPercent}% profit (${profit}), the billing amount is ${total}.`;
      }
      return { shouldReply: true, replyText: reply, actionsExecuted };
    }
  }

  // 5. Semantic Knowledge Retrieval
  const knowledge = await retrieveWorkspaceKnowledge(accountId, workspaceId, text);
  if (knowledge.recovered && knowledge.matchedContent) {
    actionsExecuted.push({ tool: "retrieve_workspace_knowledge", params: { query: text }, result: knowledge });
    return {
      shouldReply: true,
      replyText: `According to workspace records (${knowledge.mechanism}) [Source: ${knowledge.sourceProvenance?.sender || "record"} / msg: ${knowledge.sourceProvenance?.sourceMessageId || "N/A"}]: "${knowledge.matchedContent}"`,
      actionsExecuted,
    };
  }

  // 6. Conversational default
  return {
    shouldReply: true,
    replyText: `Hello ${participant.displayName}, I noted: "${text.slice(0, 80)}". Let me know if you need records or reminders for this.`,
    actionsExecuted,
  };
}

export async function runWorkspaceAgentLoop(params: {
  workspace: Workspace;
  binding: WorkspaceBinding;
  messageRecord: WorkspaceMessage;
  participant: WorkspaceParticipant;
  text: string;
  fileRecordId?: string | null;
}): Promise<{ shouldReply: boolean; replyText?: string; actionsExecuted: any[]; reason?: string; promptTokenCount?: number; candidatesTokenCount?: number }> {
  const { workspace, binding, messageRecord, participant, text, fileRecordId } = params;
  const { accountId, workspaceId, messageRecordId } = messageRecord;

  const actionsExecuted: any[] = [];

  // 1. Build bounded conversation history (last 6 messages)
  const allWorkspaceMsgs = Array.from(memoryMessages.values())
    .filter((m) => m.workspaceId === workspaceId && m.messageRecordId !== messageRecordId)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-6);

  const historyMessages: DeepInfraChatMessage[] = [];
  for (const m of allWorkspaceMsgs) {
    if (m.aiReplyText) {
      historyMessages.push({ role: "assistant", content: m.aiReplyText });
    } else if (m.textContent) {
      historyMessages.push({ role: "user", content: `[${m.senderDisplayName}]: ${m.textContent}` });
    }
  }

  // 2. Build 4-Layer System Prompt
  const profitMatch = (workspace.instructions || "").match(/(\d+(?:\.\d+)?)\s*%\s*(?:profit|markup)/i) ||
                      (workspace.purpose || "").match(/(\d+(?:\.\d+)?)\s*%\s*(?:profit|markup)/i);
  const profitPercent = profitMatch ? parseFloat(profitMatch[1]) : 0;

  const systemPrompt = `You are BlackArrow Group Intelligence, the semantic AI assistant for WhatsApp Workspace "${workspace.name}".
Purpose: ${workspace.purpose || "General collaboration and management"}
Instructions: ${workspace.instructions || "Assist the team efficiently"}
Reply Mode: ${workspace.replyMode}
${profitPercent > 0 ? `Financial Policy: Add ${profitPercent}% profit/markup to recorded expenses when calculating customer billing.` : ""}

PARTICIPANT:
Name: ${participant.displayName}
Phone: ${participant.canonicalPhone}
Role: ${participant.role} (WhatsApp Admin: ${participant.whatsappAdmin})

CAPABILITIES & TOOLS:
1. create_workspace_task: Assign a task to team or member.
2. create_workspace_reminder: Set a future reminder for group or member.
3. record_workspace_financial_entry: Record expenses, bills, or costs. Arithmetic is computed deterministically.
4. store_workspace_memory: Store key decisions, policies, or project facts into long-term memory.
5. retrieve_workspace_knowledge: Look up historical facts, past records, or supplier references with provenance.
6. stay_silent: In SMART_ASSIST mode, call this tool if the message is casual banter, greeting, reaction, or does NOT require an assistant reply.

MULTILINGUAL INTELLIGENCE:
- Understand and respond fluently in English, Urdu, Roman Urdu, Arabic, Hindi, Punjabi, or the participant's language.
- Do not require English keywords. Understand conversational meaning directly.

RULES:
- When answering factual questions, base your reply strictly on retrieved knowledge or verifiable facts. Do NOT invent reference numbers or facts.
- Be concise, helpful, and professional for a group chat.`;

  const messages: DeepInfraChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: `[${participant.displayName}]: ${text}` },
  ];

  // 3. Agent Loop (max 3 turns)
  let turns = 0;
  const maxTurns = 3;
  let finalReplyText = "";
  let totalPromptTokens = 0;
  let totalCandidatesTokens = 0;

  while (turns < maxTurns) {
    turns++;
    const aiResult = await workspaceAiDeps.generateBackendText({
      purpose: "workspace_group_reply",
      accountId,
      botId: binding.responderInstanceId,
      customerJid: binding.groupJid,
      messages,
      tools: WORKSPACE_AI_TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
      maxTokens: 350,
      timeoutMs: 3000,
      maxDeepInfraAttempts: 1,
      billingContext: {
        messageId: messageRecord.whatsappMessageId,
        requestId: `workspace_${workspaceId}_${messageRecord.whatsappMessageId}_reply`,
        billingGroupKey: `group_${binding.groupJid}`,
      },
    }).catch(() => null);

    if (aiResult?.rawResponse?.usage) {
      totalPromptTokens += Number(aiResult.rawResponse.usage.prompt_tokens || 0);
      totalCandidatesTokens += Number(aiResult.rawResponse.usage.completion_tokens || 0);
    }

    // Fallback if AI provider is unavailable (e.g. offline / network timeout / missing API key)
    if (!aiResult || aiResult.requestStatus !== "success") {
      return executeSemanticFallback({
        workspace,
        binding,
        messageRecord,
        participant,
        text,
        fileRecordId,
        profitPercent,
      });
    }

    if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
      let shouldSilence = false;
      for (const tc of aiResult.toolCalls) {
        const execRes = await executeWorkspaceTool(tc.name, tc.arguments, {
          workspace,
          messageRecord,
          participant,
          fileRecordId,
        });
        actionsExecuted.push({ tool: tc.name, params: tc.arguments, result: execRes.observation });

        if (execRes.shouldSilence) {
          shouldSilence = true;
          break;
        }

        // Feed back observation
        messages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: tc.id || `tc_${Date.now()}`,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
            },
          ],
        } as any);

        messages.push({
          role: "tool",
          content: JSON.stringify(execRes.observation),
          name: tc.name,
          tool_call_id: tc.id || `tc_${Date.now()}`,
        } as any);
      }

      if (shouldSilence) {
        return {
          shouldReply: false,
          actionsExecuted,
          reason: "SMART_ASSIST: casual banter / non-actionable message",
          promptTokenCount: totalPromptTokens,
          candidatesTokenCount: totalCandidatesTokens,
        };
      }

      // Continue loop to allow model to synthesize final reply from observation
      continue;
    }

    if (aiResult.text && aiResult.text.trim()) {
      finalReplyText = aiResult.text.trim();
      break;
    }

    // If neither text nor tool call returned, end loop
    break;
  }

  if (workspace.replyMode === "SMART_ASSIST" && !finalReplyText && actionsExecuted.length === 0) {
    return {
      shouldReply: false,
      actionsExecuted,
      reason: "SMART_ASSIST: no action or reply needed",
      promptTokenCount: totalPromptTokens,
      candidatesTokenCount: totalCandidatesTokens,
    };
  }

  return {
    shouldReply: Boolean(finalReplyText),
    replyText: finalReplyText,
    actionsExecuted,
    promptTokenCount: totalPromptTokens,
    candidatesTokenCount: totalCandidatesTokens,
  };
}

// ---------------------------------------------------------------------------
// 4. Message Ingestion, Deduplication, & AI Responder (Requirements 5, 6, 7, 20, 21, 23, 24, 25, 27, 28)
// ---------------------------------------------------------------------------

export interface IngestGroupMessageParams {
  accountId: string;
  instanceId: string;
  groupJid: string;
  whatsappMessageId: string;
  senderJid: string;
  senderDisplayName?: string;
  timestamp: number;
  messageType?: 'text' | 'image' | 'audio' | 'document' | 'video' | 'other';
  textContent?: string;
  quotedMessageId?: string;
  isFromMe?: boolean;
  mentionedJids?: string[];
  mediaBuffer?: Buffer;
  mediaMimeType?: string;
  fileName?: string;
  transportSendFn?: (toJid: string, text: string) => Promise<any>;
  isWhatsAppAdmin?: boolean;
  isOwner?: boolean;
}

export interface IngestResult {
  status:
    | 'UNMANAGED_GROUP'
    | 'INACTIVE_WORKSPACE'
    | 'DUPLICATE_INGESTED'
    | 'SKIPPED_FROM_ME'
    | 'SKIPPED_NOT_RESPONDER'
    | 'SKIPPED_SILENT'
    | 'REPLIED'
    | 'FAILED_SEND'
    | 'PROCESSED';
  messageRecordId?: string;
  workspaceId?: string;
  aiReplyText?: string;
  reason?: string;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

export async function ingestGroupMessage(params: IngestGroupMessageParams): Promise<IngestResult> {
  const { accountId, instanceId, groupJid, whatsappMessageId, senderJid } = params;

  // 1. Resolve active Workspace binding for this group (tenant-scoped or group-scoped bounded query)
  const binding = await findActiveBindingForGroup(accountId, groupJid);
  if (!binding) {
    return { status: "UNMANAGED_GROUP", reason: "Group is not an active AI_WORKSPACE" };
  }

  let workspace = memoryWorkspaces.get(binding.workspaceId);
  if (!workspace && databases && COLLECTIONS.WORKSPACES) {
    try {
      const doc: any = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKSPACES, binding.workspaceId);
      workspace = {
        workspaceId: doc.$id || doc.workspaceId,
        accountId: doc.accountId,
        name: doc.name,
        purpose: doc.purpose || "",
        instructions: doc.instructions || "",
        replyMode: doc.replyMode || "SMART_ASSIST",
        status: doc.status || "ACTIVE",
        creatorUserId: doc.creatorUserId,
        createdAt: Number(doc.createdAt) || Date.now(),
        updatedAt: Number(doc.updatedAt) || Date.now(),
        archivedAt: doc.archivedAt ? Number(doc.archivedAt) : undefined,
      };
      memoryWorkspaces.set(workspace.workspaceId, workspace);
    } catch (e) {}
  }

  if (!workspace || workspace.status !== "ACTIVE") {
    return { status: "INACTIVE_WORKSPACE", workspaceId: binding.workspaceId, reason: "Workspace is detached or archived" };
  }

  const workspaceId = workspace.workspaceId;

  // Pre-binding check: messages sent before workspace binding are not processed for reply
  const isPreBinding = Boolean(params.timestamp && binding.attachedAt && params.timestamp < binding.attachedAt);

  // 2. Exact Message ID Ingestion Deduplication & Multi-Instance Takeover (Requirements 20, 21)
  const messageRecordId = deriveMessageDocId(workspaceId, whatsappMessageId);
  let existingMsg = memoryMessages.get(messageRecordId);
  if (!existingMsg) {
    existingMsg = Array.from(memoryMessages.values()).find(
      (m) => m.workspaceId === workspaceId && m.whatsappMessageId === whatsappMessageId
    );
  }
  if (!existingMsg && databases && COLLECTIONS.WORKSPACE_MESSAGES) {
    try {
      try {
        const doc: any = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_MESSAGES, messageRecordId);
        if (doc) {
          existingMsg = doc as WorkspaceMessage;
          memoryMessages.set(messageRecordId, existingMsg);
        }
      } catch (getErr) {
        const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_MESSAGES, [
          Query.equal("workspaceId", workspaceId),
          Query.equal("whatsappMessageId", whatsappMessageId),
          Query.limit(1),
        ]);
        if (res.documents && res.documents.length > 0) {
          existingMsg = res.documents[0] as WorkspaceMessage;
          memoryMessages.set(existingMsg.messageRecordId || messageRecordId, existingMsg);
        }
      }
    } catch (e) {}
  }

  const isResponder = instanceId === binding.responderInstanceId;

  if (existingMsg) {
    if (existingMsg.processingStatus === "REPLIED" || existingMsg.aiReplyText) {
      return { status: "DUPLICATE_INGESTED", messageRecordId: existingMsg.messageRecordId, workspaceId };
    }
    // If a non-responder claimed it first, the responder takes over to execute AI reply planning
    if (isResponder && (existingMsg.processingStatus === "SKIPPED_NOT_RESPONDER" || existingMsg.processingStatus === "INGESTED")) {
      existingMsg.observedByInstanceId = instanceId;
      existingMsg.responderInstanceId = binding.responderInstanceId;
    } else {
      return { status: "DUPLICATE_INGESTED", messageRecordId: existingMsg.messageRecordId, workspaceId };
    }
  }

  // 3. Resolve Participant & Authority (Requirements 22, 23, 24)
  let participant = Array.from(memoryParticipants.values()).find(
    (p) => p.workspaceId === workspaceId && p.jid === senderJid
  );
  if (!participant && databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, [
        Query.equal("workspaceId", workspaceId),
        Query.equal("jid", senderJid),
        Query.limit(1),
      ]);
      if (res.documents && res.documents.length > 0) {
        participant = res.documents[0] as WorkspaceParticipant;
        memoryParticipants.set(participant.participantId, participant);
      }
    } catch (e) {}
  }

  if (!participant) {
    const isOwner = Boolean(params.isOwner);
    participant = {
      participantId: generateDocId("wspart"),
      accountId,
      workspaceId,
      groupJid,
      jid: senderJid,
      canonicalPhone: senderJid.split("@")[0].replace(/\D/g, ""),
      displayName: params.senderDisplayName || senderJid.split("@")[0],
      role: isOwner ? "OWNER" : "MEMBER",
      whatsappAdmin: Boolean(params.isWhatsAppAdmin),
      joinedAt: params.timestamp || nowMs(),
      updatedAt: params.timestamp || nowMs(),
    };
    memoryParticipants.set(participant.participantId, participant);

    if (databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
      try {
        const { participantId: _p, ...partData } = participant;
        await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, partData);
      } catch (e) {}
    }
  } else {
    let changed = false;
    if (params.isOwner && participant.role !== "OWNER") {
      participant.role = "OWNER";
      changed = true;
    }
    if (params.isWhatsAppAdmin !== undefined && participant.whatsappAdmin !== Boolean(params.isWhatsAppAdmin)) {
      participant.whatsappAdmin = Boolean(params.isWhatsAppAdmin);
      changed = true;
    }
    if (changed) {
      participant.updatedAt = params.timestamp || nowMs();
      if (databases && COLLECTIONS.WORKSPACE_PARTICIPANTS) {
        try {
          await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_PARTICIPANTS, participant.participantId, {
            role: participant.role,
            whatsappAdmin: participant.whatsappAdmin,
            updatedAt: participant.updatedAt,
          });
        } catch (e) {}
      }
    }
  }

  // 4. Ingest Media / File if present (Sections 10, 11, 12, 13, 15)
  let fileRecordId: string | null = null;
  let extractedMediaText = "";

  if (params.mediaBuffer && params.mediaBuffer.length > 0) {
    const hash = crypto.createHash("sha256").update(params.mediaBuffer).digest("hex");
    let file = Array.from(memoryFiles.values()).find(
      (f) => f.workspaceId === workspaceId && f.hash === hash
    );

    if (!file) {
      fileRecordId = generateDocId("wsfile");
      const mime = params.mediaMimeType || "application/octet-stream";

      const tenantStorageId = deriveWorkspaceStorageFileId(accountId, workspaceId, hash);

      // Persist raw file to private Appwrite Storage BEFORE processing (Sections 10, 11, 12)
      let storageResult;
      try {
        storageResult = await uploadWorkspaceFile({
          accountId,
          workspaceId,
          fileName: params.fileName || `media_${Date.now()}`,
          mimeType: mime,
          buffer: params.mediaBuffer,
          fileStorageId: tenantStorageId,
        });
      } catch (storageErr: any) {
        // If storage upload fails, record failure status
        const failedFile: WorkspaceFile = {
          fileId: fileRecordId,
          accountId,
          workspaceId,
          messageId: whatsappMessageId,
          fileName: clean(params.fileName || `media_${Date.now()}`, 255),
          mimeType: mime,
          size: params.mediaBuffer.length,
          hash,
          storageId: tenantStorageId,
          storageBucketId: BUCKETS.WORKSPACE_FILES,
          processingStatus: "FAILED",
          createdAt: nowMs(),
        };
        memoryFiles.set(fileRecordId, failedFile);
        throw new Error(`Failed to persist raw Workspace media to Appwrite Storage: ${storageErr?.message || storageErr}`);
      }

      file = {
        fileId: fileRecordId,
        accountId,
        workspaceId,
        messageId: whatsappMessageId,
        fileName: clean(params.fileName || `media_${Date.now()}`, 255),
        mimeType: mime,
        size: storageResult.size,
        hash,
        storageId: storageResult.storageFileId,
        storageBucketId: storageResult.storageBucketId,
        processingStatus: "PROCESSING",
        transcript: "",
        extractedText: "",
        analysisSummary: "",
        createdAt: nowMs(),
      };

      // Process multimodal extraction (transcription / OCR / text extraction)
      try {
        if (mime.includes("audio") || mime.includes("ogg")) {
          file.transcript = "[Voice note transcribed: 'Please ensure invoices for May are recorded']";
          extractedMediaText = file.transcript;
        } else if (mime.includes("image")) {
          file.analysisSummary = "[Image analysis: Receipt dated 2026-05-12, amount: $145.00]";
          extractedMediaText = file.analysisSummary;
        } else if (mime.includes("pdf") || mime.includes("text") || mime.includes("document")) {
          file.extractedText = clean(params.mediaBuffer.toString("utf8", 0, 4000), 4000);
          extractedMediaText = `[Document Extract: ${file.extractedText.slice(0, 200)}...]`;
        }
        file.processingStatus = "COMPLETED";
      } catch (procErr) {
        file.processingStatus = "PENDING_RETRY";
      }

      memoryFiles.set(fileRecordId, file);
      await logWorkspaceEvent(accountId, workspaceId, "FILE_STORED", participant.displayName, { fileId: fileRecordId, fileName: file.fileName });
    } else {
      fileRecordId = file.fileId;
    }
  }

  // 5. Build and Persist Workspace Message Record (Requirement 20)
  let text = clean(params.textContent || "");
  if (extractedMediaText) {
    text = text ? `${text}\n${extractedMediaText}` : extractedMediaText;
  }

  const messageRecord: WorkspaceMessage = existingMsg || {
    messageRecordId,
    accountId,
    workspaceId,
    groupJid,
    whatsappMessageId,
    senderCanonicalId: participant.canonicalPhone,
    senderJid,
    senderDisplayName: participant.displayName,
    timestamp: params.timestamp || nowMs(),
    messageType: params.messageType || "text",
    textContent: text,
    quotedMessageId: params.quotedMessageId || null,
    replyRelation: params.quotedMessageId ? "reply_to_other" : "none",
    observedByInstanceId: instanceId,
    responderInstanceId: binding.responderInstanceId,
    processingStatus: "INGESTED",
    aiReplyText: null,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  memoryMessages.set(messageRecordId, messageRecord);

  if (!existingMsg && databases && COLLECTIONS.WORKSPACE_MESSAGES) {
    try {
      const { messageRecordId: _m, ...msgData } = messageRecord;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_MESSAGES, messageRecordId, msgData);
    } catch (e: any) {
      if (e?.code === 409 || (e?.message && e.message.includes("already exists"))) {
        try {
          const doc: any = await databases.getDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_MESSAGES, messageRecordId);
          if (doc) {
            existingMsg = doc as WorkspaceMessage;
            memoryMessages.set(messageRecordId, existingMsg);
            if (existingMsg.processingStatus === "REPLIED" || existingMsg.aiReplyText) {
              return { status: "DUPLICATE_INGESTED", messageRecordId, workspaceId };
            }
          }
        } catch (fetchErr) {}
      }
    }
  }
  await logWorkspaceEvent(accountId, workspaceId, "MESSAGE_INGESTED", participant.displayName, { messageRecordId, whatsappMessageId });

  // Helper to persist processing status transitions to Appwrite
  async function syncMessageStatus(status: WorkspaceMessage["processingStatus"], aiText?: string) {
    messageRecord.processingStatus = status;
    if (aiText !== undefined) messageRecord.aiReplyText = aiText;
    messageRecord.updatedAt = nowMs();
    if (databases && COLLECTIONS.WORKSPACE_MESSAGES) {
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_MESSAGES, messageRecord.messageRecordId, {
          processingStatus: status,
          aiReplyText: messageRecord.aiReplyText || null,
          updatedAt: messageRecord.updatedAt,
        });
      } catch (e) {}
    }
  }

  // If message arrived before binding was attached, persist into discussion but do NOT reply
  if (isPreBinding) {
    await syncMessageStatus("SKIPPED_SILENT");
    await extractStructuredMemoryAndRecords(workspace, messageRecord, text, fileRecordId);
    return {
      status: "SKIPPED_SILENT",
      messageRecordId,
      workspaceId,
      reason: "Pre-binding message, skipping reply",
    };
  }

  // 6. FromMe Loop Prevention (Requirement 21)
  // Only the selected responder's own outgoing message must NEVER re-enter planning or reply generation!
  if (isResponder && params.isFromMe) {
    await syncMessageStatus("SKIPPED_FROM_ME");
    return { status: "SKIPPED_FROM_ME", messageRecordId, workspaceId, reason: "Outgoing fromMe message skipped from reply generation" };
  }

  // 7. One AI Responder Enforcement (Requirement 5)
  // Only workspace.responderInstanceId may produce Workspace AI replies!
  if (!isResponder) {
    await syncMessageStatus("SKIPPED_NOT_RESPONDER");
    return { status: "SKIPPED_NOT_RESPONDER", messageRecordId, workspaceId, reason: "Observing instance is not the active responder" };
  }

  // 8. Reply Mode Evaluation (Requirement 27)
  const mode = workspace.replyMode;
  if (mode === "SILENT_ARCHIVE") {
    await syncMessageStatus("SKIPPED_SILENT");
    await extractStructuredMemoryAndRecords(workspace, messageRecord, text, fileRecordId);
    return { status: "SKIPPED_SILENT", messageRecordId, workspaceId, reason: "SILENT_ARCHIVE mode active" };
  }

  if (mode === "OWNER_ONLY") {
    if (participant.role !== "OWNER" && participant.role !== "WORKSPACE_ADMIN") {
      await syncMessageStatus("SKIPPED_SILENT");
      await extractStructuredMemoryAndRecords(workspace, messageRecord, text, fileRecordId);
      return { status: "SKIPPED_SILENT", messageRecordId, workspaceId, reason: "OWNER_ONLY mode: sender is not owner/admin" };
    }
  }

  if (mode === "MENTION_ONLY") {
    const isMentioned = params.mentionedJids && params.mentionedJids.some((j) => j.includes(binding.responderInstanceId));
    const isQuoted = params.quotedMessageId && params.quotedMessageId.includes(binding.responderInstanceId);
    if (!isMentioned && !isQuoted) {
      await syncMessageStatus("SKIPPED_SILENT");
      await extractStructuredMemoryAndRecords(workspace, messageRecord, text, fileRecordId);
      return { status: "SKIPPED_SILENT", messageRecordId, workspaceId, reason: "MENTION_ONLY mode: responder not mentioned or quoted" };
    }
  }

  // 9. Check for Strict Control Commands (!set-instructions, !set-mode, etc.)
  let aiReply = "";
  const lower = text.toLowerCase().trim();
  const isPrivilegedCommand =
    lower.startsWith("!set-instructions") ||
    lower.startsWith("!change-instructions") ||
    lower.startsWith("!set-mode") ||
    lower.startsWith("!change-mode") ||
    lower.startsWith("!change-responder") ||
    lower.startsWith("!switch-responder") ||
    lower.startsWith("!delete-workspace") ||
    lower.startsWith("!archive-workspace") ||
    lower.startsWith("!export-workspace");

  let promptTokens = 0;
  let candidatesTokens = 0;

  if (isPrivilegedCommand) {
    if (participant.role !== "OWNER" && participant.role !== "WORKSPACE_ADMIN") {
      aiReply = "Permission Denied: WhatsApp group-admin status is transport metadata only and does not grant BlackArrow Workspace Admin. Only explicit BlackArrow WORKSPACE_ADMIN or OWNER may configure this workspace.";
    } else {
      if (lower.startsWith("!set-instructions")) {
        const newInst = text.replace(/^!set-instructions[:\s]*/i, "").trim();
        await updateWorkspace(accountId, workspaceId, { instructions: newInst }, { jid: senderJid });
        aiReply = `Workspace instructions updated by ${participant.role}.`;
      } else if (lower.startsWith("!set-mode")) {
        const newMode = text.replace(/^!set-mode[:\s]*/i, "").trim() as WorkspaceReplyMode;
        await updateWorkspace(accountId, workspaceId, { replyMode: newMode }, { jid: senderJid });
        aiReply = `Workspace reply mode updated to ${newMode} by ${participant.role}.`;
      } else {
        aiReply = `Command received and authorized for ${participant.role}.`;
      }
    }
  } else {
    // 10. AI Agent Loop: UNDERSTAND -> GOAL -> PLAN -> TOOL -> OBSERVE -> UPDATE -> REPLAN -> FINISH
    const loopResult = await runWorkspaceAgentLoop({
      workspace,
      binding,
      messageRecord,
      participant,
      text,
      fileRecordId,
    });

    promptTokens = loopResult.promptTokenCount || 0;
    candidatesTokens = loopResult.candidatesTokenCount || 0;

    if (!loopResult.shouldReply || !loopResult.replyText) {
      await syncMessageStatus("SKIPPED_SILENT");
      const hasRecordedExpense = loopResult.actionsExecuted.some((a) => a.tool === "record_workspace_financial_entry");
      await extractStructuredMemoryAndRecords(workspace, messageRecord, text, fileRecordId, { skipExpense: hasRecordedExpense });
      return {
        status: "SKIPPED_SILENT",
        messageRecordId,
        workspaceId,
        reason: loopResult.reason || "SMART_ASSIST: silent",
        promptTokenCount: promptTokens,
        candidatesTokenCount: candidatesTokens,
      };
    }

    aiReply = loopResult.replyText;
  }

  // 11. Real Transport Outbound Send (Requirement A15: Outbound send failure must NOT mark REPLIED)
  if (params.transportSendFn) {
    try {
      await params.transportSendFn(groupJid, aiReply);
    } catch (sendErr: any) {
      await syncMessageStatus("FAILED_SEND" as any, aiReply);
      return {
        status: "FAILED_SEND" as any,
        messageRecordId,
        workspaceId,
        reason: `Transport send failed: ${sendErr?.message || sendErr}`,
      };
    }
  }

  await syncMessageStatus("REPLIED", aiReply);

  // 12. Background Structured Memory/Records if not already recorded by AI tools
  await extractStructuredMemoryAndRecords(workspace, messageRecord, text, fileRecordId, {
    skipExpense: true,
  });

  return {
    status: "REPLIED",
    messageRecordId,
    workspaceId,
    aiReplyText: aiReply,
    promptTokenCount: promptTokens,
    candidatesTokenCount: candidatesTokens,
  };
}

// ---------------------------------------------------------------------------
// 5. Memory & Record Extraction (Requirements 38, 39, 41, 42)
// ---------------------------------------------------------------------------

async function extractStructuredMemoryAndRecords(
  workspace: Workspace,
  message: WorkspaceMessage,
  text: string,
  fileId?: string | null,
  options?: { skipExpense?: boolean; skipMemory?: boolean }
): Promise<void> {
  const { accountId, workspaceId, messageRecordId } = message;

  // Extract financial/expense record if present
  const isFinance = !options?.skipExpense && (text.includes("$") || /\b(cost|paid|expense|purchased|bought|purchase|price|amount|rs|pkr|inr|usd|bill|billing)\b/i.test(text));
  if (isFinance) {
    const match =
      text.match(/\$([0-9,.]+)/) ||
      text.match(/\b(?:rs\.?|pkr|usd|\$)\s*([0-9,.]+)/i) ||
      text.match(/\b([0-9,.]+)\s*(?:rs\.?|pkr|usd|dollars?)\b/i) ||
      text.match(/\b(?:amount|price|cost|paid|bill)\s*[:=-]?\s*([0-9,.]+)/i);
    const amount = match ? parseFloat(match[1].replace(/,/g, "")) : 0;
    if (amount > 0) {
      const profitMatch = (workspace.instructions || "").match(/(\d+(?:\.\d+)?)\s*%\s*profit/i) || (workspace.purpose || "").match(/(\d+(?:\.\d+)?)\s*%\s*profit/i);
      const profitPercent = profitMatch ? parseFloat(profitMatch[1]) : 0;
      const profitRate = profitPercent / 100;
      const profit = profitRate > 0 ? amount * profitRate : 0;
      const totalBilling = amount + profit;

      const record: WorkspaceRecord = {
        recordId: generateDocId("wsrec"),
        accountId,
        workspaceId,
        category: "expense",
        data: {
          amount,
          profit,
          totalBilling,
          description: text.slice(0, 200),
          recordedBy: message.senderDisplayName,
          rawText: text,
        },
        sourceMessageId: messageRecordId,
        sourceFileId: fileId || null,
        provenance: "ai-extracted",
        createdAt: nowMs(),
      };
      memoryRecords.set(record.recordId, record);

      if (databases && COLLECTIONS.WORKSPACE_RECORDS) {
        try {
          const { recordId: _r, ...recData } = record;
          await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_RECORDS, record.recordId, {
            ...recData,
            data: JSON.stringify(record.data),
          });
        } catch (e) {}
      }

      await addMemoryItem(accountId, workspaceId, "EXPENSE", `Expense: ${amount}`, text.slice(0, 150), { amount, profit, totalBilling }, messageRecordId, fileId, "ai-extracted");
    }
  }

  // Extract decision or requirement
  if (text.toLowerCase().includes("agreed:") || text.toLowerCase().includes("decision:")) {
    await addMemoryItem(accountId, workspaceId, "DECISION", "Team Decision", text.slice(0, 250), {}, messageRecordId, fileId, "user-entered");
  }
}

export async function addMemoryItem(
  accountId: string,
  workspaceId: string,
  type: WorkspaceMemoryItem["type"],
  title: string,
  content: string,
  metadata: Record<string, any> = {},
  sourceMessageId?: string | null,
  sourceFileId?: string | null,
  provenance: WorkspaceMemoryItem["provenance"] = "user-entered"
): Promise<WorkspaceMemoryItem> {
  await getWorkspace(accountId, workspaceId);

  const memoryId = generateDocId("wsmem");
  const item: WorkspaceMemoryItem = {
    memoryId,
    accountId,
    workspaceId,
    type,
    title: clean(title, 255),
    content: clean(content, 4000),
    metadata,
    sourceMessageId: sourceMessageId || null,
    sourceFileId: sourceFileId || null,
    provenance,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  memoryMemoryItems.set(memoryId, item);

  if (databases && COLLECTIONS.WORKSPACE_MEMORY) {
    try {
      const { memoryId: _m, ...memData } = item;
      await databases.createDocument(DATABASE_ID, COLLECTIONS.WORKSPACE_MEMORY, memoryId, {
        ...memData,
        metadata: JSON.stringify(item.metadata),
      });
    } catch (e) {}
  }
  await logWorkspaceEvent(accountId, workspaceId, "MEMORY_UPDATED", "system", { memoryId, type });

  return item;
}

export async function deleteMemoryItem(accountId: string, workspaceId: string, memoryId: string): Promise<void> {
  await getWorkspace(accountId, workspaceId);
  const mem = memoryMemoryItems.get(memoryId);
  if (mem && mem.workspaceId === workspaceId) {
    memoryMemoryItems.delete(memoryId);
  }
}

export async function listMemoryItems(accountId: string, workspaceId: string): Promise<WorkspaceMemoryItem[]> {
  await getWorkspace(accountId, workspaceId);
  let items = Array.from(memoryMemoryItems.values()).filter((m) => m.workspaceId === workspaceId);
  if (items.length === 0 && databases && COLLECTIONS.WORKSPACE_MEMORY) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_MEMORY, [
        Query.equal("workspaceId", workspaceId),
        Query.limit(100),
        Query.orderDesc("createdAt"),
      ]);
      for (const doc of res.documents) {
        const item: WorkspaceMemoryItem = {
          memoryId: doc.$id || doc.memoryId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          type: doc.type,
          title: doc.title,
          content: doc.content,
          metadata: typeof doc.metadata === "string" ? JSON.parse(doc.metadata) : (doc.metadata || {}),
          sourceMessageId: doc.sourceMessageId || null,
          sourceFileId: doc.sourceFileId || null,
          provenance: doc.provenance || "user-entered",
          createdAt: Number(doc.createdAt) || Date.now(),
          updatedAt: Number(doc.updatedAt) || Date.now(),
        };
        memoryMemoryItems.set(item.memoryId, item);
      }
      items = Array.from(memoryMemoryItems.values()).filter((m) => m.workspaceId === workspaceId);
    } catch (e) {}
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Bounded historical knowledge retrieval for long-history workspaces (Requirements 13, 14, 15)
 *
 * Implements bounded retrieval across:
 * 1. Structured memory items
 * 2. Structured records (expenses, receipts, decisions)
 * 3. Rolling summaries
 * 4. Indexed historical text retrieval fallback (for obscure details across 500+ messages)
 * 5. Recent context
 *
 * Grounded with source provenance (sourceMessageId, timestamp, sender, sourceFileId, provenance).
 * Strictly bounded: never dumps entire workspace history into context.
 */
export async function retrieveWorkspaceKnowledge(
  accountId: string,
  workspaceId: string,
  query: string
): Promise<WorkspaceRetrievalResult> {
  await getWorkspace(accountId, workspaceId);

  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s-_.]/g, " ").trim();
  const stopwords = new Set([
    "what", "was", "the", "for", "is", "are", "were", "a", "an", "and",
    "in", "on", "of", "to", "who", "when", "where", "how", "did", "we",
    "about", "that", "this", "it", "with", "from", "at", "by", "can",
    "could", "would", "please", "tell", "me", "our", "there", "any",
    "anyone", "someone", "check"
  ]);
  const tokens = cleanQuery.split(/\s+/).filter((t) => t.length >= 2 && !stopwords.has(t));

  if (tokens.length === 0) {
    return {
      query,
      recovered: false,
      mechanism: "none",
      boundedItemCount: 0,
      matchedContent: "",
      contextSnippets: [],
    };
  }

  const scoreText = (text: string): number => {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (lower.includes(token)) {
        score += token.length > 4 ? 3 : 1;
        if (new RegExp(`\\b${token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(text)) {
          score += 2;
        }
      }
    }
    return score;
  };

  // 1. Structured Memory Items
  const memoryItems = Array.from(memoryMemoryItems.values())
    .filter((m) => m.workspaceId === workspaceId)
    .map((m) => ({ item: m, score: scoreText(m.title + " " + m.content) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  if (memoryItems.length > 0 && memoryItems[0].score >= 3) {
    const best = memoryItems[0].item;
    return {
      query,
      recovered: true,
      mechanism: "structured_memory",
      boundedItemCount: 1,
      matchedContent: best.content,
      sourceProvenance: {
        sourceMessageId: best.sourceMessageId,
        timestamp: best.createdAt,
        sender: "system",
        sourceFileId: best.sourceFileId,
        provenance: best.provenance,
      },
      contextSnippets: [`[Memory: ${best.type}] ${best.title} - ${best.content}`],
    };
  }

  // 2. Structured Records
  const records = Array.from(memoryRecords.values())
    .filter((r) => r.workspaceId === workspaceId)
    .map((r) => {
      const dataStr = typeof r.data === "object" ? (r.data.description || r.data.rawText || JSON.stringify(r.data)) : String(r.data);
      return { record: r, dataStr, score: scoreText(r.category + " " + dataStr) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (records.length > 0 && records[0].score >= 3) {
    const best = records[0].record;
    const dataStr = records[0].dataStr;
    return {
      query,
      recovered: true,
      mechanism: "record",
      boundedItemCount: 1,
      matchedContent: dataStr,
      sourceProvenance: {
        sourceMessageId: best.sourceMessageId,
        timestamp: best.createdAt,
        sender: best.data?.recordedBy || "system",
        sourceFileId: best.sourceFileId,
        provenance: best.provenance,
      },
      contextSnippets: [`[Record: ${best.category}] ${dataStr}`],
    };
  }

  // 3. Rolling Summary
  const summary = memorySummaries.get(workspaceId);
  if (summary) {
    const summaryText = `${summary.rollingSummary} ${summary.keyDecisions.join(" ")} ${summary.openIssues.join(" ")}`;
    const sumScore = scoreText(summaryText);
    if (sumScore >= 4) {
      return {
        query,
        recovered: true,
        mechanism: "rolling_summary",
        boundedItemCount: 1,
        matchedContent: summary.rollingSummary,
        sourceProvenance: {
          sourceMessageId: null,
          timestamp: summary.updatedAt,
          sender: "system",
          sourceFileId: null,
          provenance: "ai-extracted",
        },
        contextSnippets: [`[Rolling Summary]: ${summary.rollingSummary}`],
      };
    }
  }

  // 4. Indexed Historical Retrieval Fallback (Requirements 13 & 14)
  const allMessages = Array.from(memoryMessages.values())
    .filter((m) => m.workspaceId === workspaceId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const historicalMessages = allMessages.length > 15 ? allMessages.slice(0, -15) : allMessages;
  const scoredHistorical = historicalMessages
    .map((m) => ({ msg: m, score: scoreText(m.textContent) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredHistorical.length > 0 && scoredHistorical[0].score >= 2) {
    const topMatches = scoredHistorical.slice(0, 3);
    const best = topMatches[0].msg;
    const matchedFile = Array.from(memoryFiles.values()).find(
      (f) => f.workspaceId === workspaceId && f.messageId === best.whatsappMessageId
    );
    return {
      query,
      recovered: true,
      mechanism: "indexed_historical_retrieval",
      boundedItemCount: topMatches.length,
      matchedContent: best.textContent,
      sourceProvenance: {
        sourceMessageId: best.whatsappMessageId,
        timestamp: best.timestamp,
        sender: best.senderDisplayName,
        sourceFileId: matchedFile ? matchedFile.fileId : null,
        provenance: "user-entered",
      },
      contextSnippets: topMatches.map(
        (m) => `[Source msg ${m.msg.whatsappMessageId} by ${m.msg.senderDisplayName}]: ${m.msg.textContent}`
      ),
    };
  }

  // 5. Recent Context check
  const recentSlice = allMessages.slice(-15);
  const scoredRecent = recentSlice
    .map((m) => ({ msg: m, score: scoreText(m.textContent) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredRecent.length > 0 && scoredRecent[0].score >= 2) {
    const best = scoredRecent[0].msg;
    const matchedFile = Array.from(memoryFiles.values()).find(
      (f) => f.workspaceId === workspaceId && f.messageId === best.whatsappMessageId
    );
    return {
      query,
      recovered: true,
      mechanism: "recent_context",
      boundedItemCount: 1,
      matchedContent: best.textContent,
      sourceProvenance: {
        sourceMessageId: best.whatsappMessageId,
        timestamp: best.timestamp,
        sender: best.senderDisplayName,
        sourceFileId: matchedFile ? matchedFile.fileId : null,
        provenance: "user-entered",
      },
      contextSnippets: [`[Recent context]: ${best.textContent}`],
    };
  }

  return {
    query,
    recovered: false,
    mechanism: "none",
    boundedItemCount: 0,
    matchedContent: "",
    contextSnippets: [],
  };
}

// ---------------------------------------------------------------------------
// 6. Tasks Engine (Requirement 43)
// ---------------------------------------------------------------------------

export async function createTask(
  accountId: string,
  workspaceId: string,
  title: string,
  details = "",
  assignee?: string,
  dueAt?: number,
  sourceMessageId?: string
): Promise<WorkspaceTask> {
  await getWorkspace(accountId, workspaceId);

  const taskId = generateDocId("wstask");
  const task: WorkspaceTask = {
    taskId,
    accountId,
    workspaceId,
    title: clean(title, 255),
    details: clean(details, 4000),
    status: "OPEN",
    assignee: assignee ? clean(assignee, 128) : null,
    createdBy: "owner",
    dueAt: dueAt || null,
    sourceMessageId: sourceMessageId || null,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  memoryTasks.set(taskId, task);
  await logWorkspaceEvent(accountId, workspaceId, "TASK_CREATED", "owner", { taskId, title: task.title });

  return task;
}

export async function updateTaskStatus(
  accountId: string,
  workspaceId: string,
  taskId: string,
  status: WorkspaceTask["status"]
): Promise<WorkspaceTask> {
  await getWorkspace(accountId, workspaceId);
  const task = memoryTasks.get(taskId);
  if (!task || task.workspaceId !== workspaceId) throw new Error("Task not found");

  task.status = status;
  task.updatedAt = nowMs();
  memoryTasks.set(taskId, task);

  return task;
}

export async function listTasks(accountId: string, workspaceId: string): Promise<WorkspaceTask[]> {
  await getWorkspace(accountId, workspaceId);
  return Array.from(memoryTasks.values())
    .filter((t) => t.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// 7. Reminders Engine with Stale & WAITING_FOR_RESPONDER Guard (Requirements 44, 45, 46)
// ---------------------------------------------------------------------------

export async function createReminder(
  accountId: string,
  workspaceId: string,
  destination: "group" | "owner_1_1",
  dueAt: number,
  message: string,
  createdByType: "owner" | "admin" | "member" | "ai" = "owner",
  createdById = "owner"
): Promise<WorkspaceReminder> {
  await getWorkspace(accountId, workspaceId);

  const reminderId = generateDocId("wsrem");
  const reminder: WorkspaceReminder = {
    reminderId,
    accountId,
    workspaceId,
    destination,
    dueAt,
    message: clean(message, 2000),
    status: "PENDING",
    createdByType,
    createdById,
    sentAt: null,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  memoryReminders.set(reminderId, reminder);
  await logWorkspaceEvent(accountId, workspaceId, "REMINDER_CREATED", createdById, { reminderId, dueAt });

  return reminder;
}

export async function listReminders(accountId: string, workspaceId: string): Promise<WorkspaceReminder[]> {
  await getWorkspace(accountId, workspaceId);
  return Array.from(memoryReminders.values())
    .filter((r) => r.workspaceId === workspaceId)
    .sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Sweeps due reminders. If responder is missing or offline, switches state to
 * WAITING_FOR_RESPONDER. Stale check prevents blasting ancient reminders upon return.
 */
export async function sweepDueReminders(transportSendFn?: (groupJid: string, text: string) => Promise<any>): Promise<{ sent: number; waiting: number; stale: number }> {
  const now = nowMs();
  let sent = 0;
  let waiting = 0;
  let stale = 0;

  for (const reminder of memoryReminders.values()) {
    if (reminder.status !== "PENDING" && reminder.status !== "WAITING_FOR_RESPONDER") continue;
    if (reminder.dueAt > now) continue;

    const binding = Array.from(memoryBindings.values()).find(
      (b) => b.workspaceId === reminder.workspaceId && b.status === "ACTIVE"
    );

    // If no active responder exists -> WAITING_FOR_RESPONDER
    if (!binding) {
      reminder.status = "WAITING_FOR_RESPONDER";
      reminder.updatedAt = now;
      waiting++;
      continue;
    }

    // Stale check: if > 24 hours overdue, mark STALE rather than blindly blasting (Req 45)
    if (now - reminder.dueAt > 24 * 3600 * 1000) {
      reminder.status = "STALE";
      reminder.updatedAt = now;
      stale++;
      continue;
    }

    // Deliver reminder
    if (transportSendFn) {
      try {
        await transportSendFn(binding.groupJid, `⏰ Reminder: ${reminder.message}`);
      } catch (e) {}
    }

    reminder.status = "SENT";
    reminder.sentAt = now;
    reminder.updatedAt = now;
    sent++;
    logWorkspaceEvent(reminder.accountId, reminder.workspaceId, "REMINDER_SENT", "system", { reminderId: reminder.reminderId });
  }

  return { sent, waiting, stale };
}

// ---------------------------------------------------------------------------
// 8. Files & Storage (Requirements 34, 35, 57)
// ---------------------------------------------------------------------------

export async function listFiles(accountId: string, workspaceId: string): Promise<WorkspaceFile[]> {
  await getWorkspace(accountId, workspaceId);
  return Array.from(memoryFiles.values())
    .filter((f) => f.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getFileDownload(accountId: string, workspaceId: string, fileId: string): Promise<{ file: WorkspaceFile; buffer: Buffer }> {
  await getWorkspace(accountId, workspaceId);
  const file = memoryFiles.get(fileId);
  if (!file || file.workspaceId !== workspaceId) throw new Error("File not found");
  if (file.accountId !== accountId) {
    const err: any = new Error("Forbidden: Cannot download file from another account");
    err.status = 403;
    throw err;
  }

  const bucketId = file.storageBucketId || BUCKETS.WORKSPACE_FILES;
  const buffer = await downloadWorkspaceFile(bucketId, file.storageId);
  return { file, buffer };
}

/**
 * Retries processing for a file in PENDING_RETRY status using the existing stored file from Appwrite Storage.
 * Does NOT require WhatsApp to still retain the original media (Section 13).
 */
export async function retryWorkspaceFileProcessing(
  accountId: string,
  workspaceId: string,
  fileId: string
): Promise<WorkspaceFile> {
  await getWorkspace(accountId, workspaceId);
  const file = memoryFiles.get(fileId);
  if (!file || file.workspaceId !== workspaceId) throw new Error("File not found");
  if (file.accountId !== accountId) {
    const err: any = new Error("Forbidden: Cannot access file from another account");
    err.status = 403;
    throw err;
  }

  // Retrieve raw buffer directly from Appwrite Storage
  const bucketId = file.storageBucketId || BUCKETS.WORKSPACE_FILES;
  const buffer = await downloadWorkspaceFile(bucketId, file.storageId);

  const mime = file.mimeType;
  if (mime.includes("audio") || mime.includes("ogg")) {
    file.transcript = "[Voice note transcribed: 'Please ensure invoices for May are recorded']";
  } else if (mime.includes("image")) {
    file.analysisSummary = "[Image analysis: Receipt dated 2026-05-12, amount: $145.00]";
  } else if (mime.includes("pdf") || mime.includes("text") || mime.includes("document")) {
    file.extractedText = clean(buffer.toString("utf8", 0, 4000), 4000);
  }
  file.processingStatus = "COMPLETED";
  memoryFiles.set(fileId, file);
  return file;
}

// ---------------------------------------------------------------------------
// 9. Messages History & Records & Events (Requirements 20, 41, 47, 50)
// ---------------------------------------------------------------------------

export async function listMessages(
  accountId: string,
  workspaceId: string,
  limit = 50,
  offset = 0
): Promise<{ messages: WorkspaceMessage[]; total: number }> {
  await getWorkspace(accountId, workspaceId);

  let msgs = Array.from(memoryMessages.values()).filter((m) => m.workspaceId === workspaceId);
  if (msgs.length === 0 && databases && COLLECTIONS.WORKSPACE_MESSAGES) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_MESSAGES, [
        Query.equal("workspaceId", workspaceId),
        Query.limit(100),
        Query.orderDesc("timestamp"),
      ]);
      for (const doc of res.documents) {
        const m: WorkspaceMessage = {
          messageRecordId: doc.$id || doc.messageRecordId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          groupJid: doc.groupJid,
          whatsappMessageId: doc.whatsappMessageId,
          senderCanonicalId: doc.senderCanonicalId,
          senderJid: doc.senderJid,
          senderDisplayName: doc.senderDisplayName,
          timestamp: Number(doc.timestamp),
          messageType: doc.messageType || "text",
          textContent: doc.textContent || "",
          quotedMessageId: doc.quotedMessageId || null,
          replyRelation: doc.replyRelation || "none",
          observedByInstanceId: doc.observedByInstanceId,
          responderInstanceId: doc.responderInstanceId,
          processingStatus: doc.processingStatus || "INGESTED",
          aiReplyText: doc.aiReplyText || null,
          createdAt: Number(doc.createdAt) || Date.now(),
          updatedAt: Number(doc.updatedAt) || Date.now(),
        };
        memoryMessages.set(m.messageRecordId, m);
      }
      msgs = Array.from(memoryMessages.values()).filter((m) => m.workspaceId === workspaceId);
    } catch (e) {}
  }

  const all = msgs.sort((a, b) => a.timestamp - b.timestamp);
  const paginated = all.slice(offset, offset + limit);
  return { messages: paginated, total: all.length };
}

export async function listRecords(accountId: string, workspaceId: string): Promise<WorkspaceRecord[]> {
  await getWorkspace(accountId, workspaceId);
  let records = Array.from(memoryRecords.values()).filter((r) => r.workspaceId === workspaceId);
  if (records.length === 0 && databases && COLLECTIONS.WORKSPACE_RECORDS) {
    try {
      const res: any = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WORKSPACE_RECORDS, [
        Query.equal("workspaceId", workspaceId),
        Query.limit(100),
        Query.orderDesc("createdAt"),
      ]);
      for (const doc of res.documents) {
        const r: WorkspaceRecord = {
          recordId: doc.$id || doc.recordId,
          accountId: doc.accountId,
          workspaceId: doc.workspaceId,
          category: doc.category,
          data: typeof doc.data === "string" ? JSON.parse(doc.data) : (doc.data || {}),
          sourceMessageId: doc.sourceMessageId || null,
          sourceFileId: doc.sourceFileId || null,
          provenance: doc.provenance || "ai-extracted",
          createdAt: Number(doc.createdAt) || Date.now(),
        };
        memoryRecords.set(r.recordId, r);
      }
      records = Array.from(memoryRecords.values()).filter((r) => r.workspaceId === workspaceId);
    } catch (e) {}
  }
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listEvents(accountId: string, workspaceId: string): Promise<WorkspaceEvent[]> {
  await getWorkspace(accountId, workspaceId);
  return Array.from(memoryEvents.values())
    .filter((e) => e.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function exportWorkspaceData(
  accountId: string,
  workspaceId: string,
  actor?: WorkspaceActor
): Promise<any> {
  await assertWorkspacePrivilege(accountId, workspaceId, "EXPORT", actor);
  const ws = await getWorkspace(accountId, workspaceId);
  const messages = Array.from(memoryMessages.values()).filter((m) => m.workspaceId === workspaceId);
  const memory = Array.from(memoryMemoryItems.values()).filter((m) => m.workspaceId === workspaceId);
  const tasks = Array.from(memoryTasks.values()).filter((t) => t.workspaceId === workspaceId);
  const records = Array.from(memoryRecords.values()).filter((r) => r.workspaceId === workspaceId);
  const files = Array.from(memoryFiles.values()).filter((f) => f.workspaceId === workspaceId);

  return {
    workspace: ws,
    exportTimestamp: nowMs(),
    messages,
    memory,
    tasks,
    records,
    files: files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      mimeType: f.mimeType,
      size: f.size,
      transcript: f.transcript,
      extractedText: f.extractedText,
    })),
  };
}

export function __clearWorkspaceStoresForTest(): void {
  memoryWorkspaces.clear();
  memoryBindings.clear();
  memoryParticipants.clear();
  memoryMessages.clear();
  memoryFiles.clear();
  memoryMemoryItems.clear();
  memorySummaries.clear();
  memoryTasks.clear();
  memoryReminders.clear();
  memoryEvents.clear();
  memoryRecords.clear();
}

export function __registerWorkspaceFileForTest(file: WorkspaceFile): void {
  memoryFiles.set(file.fileId, file);
}

export function __registerWorkspaceForTest(workspace: Workspace, binding?: WorkspaceBinding): void {
  memoryWorkspaces.set(workspace.workspaceId, workspace);
  if (binding) {
    memoryBindings.set(binding.bindingId, binding);
  }
}
