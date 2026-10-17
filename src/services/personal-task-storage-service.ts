/**
 * Personal Task Storage Service
 * 
 * Provides server-authoritative persistence for Personal Tasks in Appwrite SYSTEM_CONFIGS:
 * - Doc ID: pts_${hash12(accountId)}_${hash12(taskId)} (<= 30 chars)
 * - Tenant Index: ptsi_${hash12(accountId)} (<= 17 chars)
 * - Optimistic concurrency control via incremental revision numbers
 * - Full Appwrite synchronization on queries (eliminates multi-process and restart amnesia)
 * - Automatic migration and synchronization with PersonalOutboundMission
 * - Clean test isolation hooks
 */

import { createHash } from "node:crypto";
import { DATABASE_ID, COLLECTIONS, databases, Query } from "../config/appwrite-client.ts";
import type { PersonalTask, PersonalTaskState } from "./personal-task-types.ts";
import { migrateMissionToTask } from "./personal-task-migration.ts";
import type { PersonalOutboundMission } from "./personal-outbound-types.ts";

function hash12(input: string): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

export function buildTaskDocId(accountId: string, taskId: string): string {
  return `pts_${hash12(accountId)}_${hash12(taskId)}`;
}

export function buildTaskIndexDocId(accountId: string): string {
  return `ptsi_${hash12(accountId)}`;
}

const defaultTaskStorageDeps = {
  databases,
  DATABASE_ID,
  COLLECTIONS,
  getDocument: async (dbId: string, collId: string, docId: string) => {
    return databases.getDocument(dbId, collId, docId);
  },
  createDocument: async (dbId: string, collId: string, docId: string, data: any) => {
    return databases.createDocument(dbId, collId, docId, data);
  },
  updateDocument: async (dbId: string, collId: string, docId: string, data: any) => {
    return databases.updateDocument(dbId, collId, docId, data);
  },
  deleteDocument: async (dbId: string, collId: string, docId: string) => {
    return databases.deleteDocument(dbId, collId, docId);
  },
  listDocuments: async (dbId: string, collId: string, queries?: any[]) => {
    return databases.listDocuments(dbId, collId, queries);
  },
  now: () => Date.now(),
};

export const taskStorageDeps = { ...defaultTaskStorageDeps };

export function __setPersonalTaskStorageTestDeps(overrides: Partial<typeof defaultTaskStorageDeps>): void {
  Object.assign(taskStorageDeps, overrides || {});
}

export function __resetPersonalTaskStorageTestDeps(): void {
  Object.assign(taskStorageDeps, defaultTaskStorageDeps);
}

const taskMemoryStore = new Map<string, PersonalTask>();

async function updateTenantTaskIndex(accountId: string, taskId: string): Promise<void> {
  const indexDocId = buildTaskIndexDocId(accountId);
  try {
    let taskIds: string[] = [];
    try {
      const existing: any = await taskStorageDeps.getDocument(
        taskStorageDeps.DATABASE_ID,
        taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        indexDocId
      );
      if (existing?.value) {
        const parsed = JSON.parse(existing.value);
        if (Array.isArray(parsed?.taskIds)) {
          taskIds = parsed.taskIds;
        }
      }
    } catch (err: any) {
      // Index not yet created
    }

    if (!taskIds.includes(taskId)) {
      taskIds.unshift(taskId);
      if (taskIds.length > 200) taskIds = taskIds.slice(0, 200);

      const payload = {
        value: JSON.stringify({ accountId, taskIds, updatedAt: taskStorageDeps.now() }),
        updated_at: Math.floor(taskStorageDeps.now() / 1000),
      };

      try {
        await taskStorageDeps.updateDocument(
          taskStorageDeps.DATABASE_ID,
          taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
          indexDocId,
          payload
        );
      } catch (updateErr: any) {
        if (updateErr?.code === 404 || String(updateErr?.message || "").includes("could not be found")) {
          await taskStorageDeps.createDocument(
            taskStorageDeps.DATABASE_ID,
            taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
            indexDocId,
            payload
          );
        }
      }
    }
  } catch (err: any) {
    // Non-blocking index update
  }
}

export async function savePersonalTask(
  task: PersonalTask,
  expectedRevision?: number
): Promise<PersonalTask> {
  const key = `${task.accountId}:${task.taskId}`;
  const existing = taskMemoryStore.get(key);

  if (expectedRevision !== undefined && existing && existing.revision !== expectedRevision) {
    throw new Error(`CONCURRENCY_CONFLICT: task revision ${existing.revision} does not match expected ${expectedRevision}`);
  }

  const now = taskStorageDeps.now();
  const nextRevision = (existing?.revision || task.revision || 0) + 1;

  const updatedTask: PersonalTask = {
    ...task,
    revision: nextRevision,
    updatedAt: now,
  };

  taskMemoryStore.set(key, updatedTask);

  const docId = buildTaskDocId(updatedTask.accountId, updatedTask.taskId);

  try {
    const payload = {
      value: JSON.stringify(updatedTask),
      updated_at: Math.floor(now / 1000),
    };

    try {
      await taskStorageDeps.updateDocument(
        taskStorageDeps.DATABASE_ID,
        taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        docId,
        payload
      );
    } catch (updateErr: any) {
      if (updateErr?.code === 404 || String(updateErr?.message || "").includes("could not be found")) {
        await taskStorageDeps.createDocument(
          taskStorageDeps.DATABASE_ID,
          taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
          docId,
          payload
        );
      } else {
        throw updateErr;
      }
    }

    // Update tenant index in background
    updateTenantTaskIndex(updatedTask.accountId, updatedTask.taskId).catch(() => {});
  } catch (err: any) {
    console.error(`[PersonalTaskStorage] Error: Persist failed for task ${updatedTask.taskId}:`, err?.message || err);
    throw err;
  }

  return updatedTask;
}

export async function getPersonalTask(
  accountId: string,
  taskId: string
): Promise<PersonalTask | null> {
  const key = `${accountId}:${taskId}`;
  if (taskMemoryStore.has(key)) {
    return taskMemoryStore.get(key)!;
  }

  // 1. Try pts_ task doc
  const docId = buildTaskDocId(accountId, taskId);
  try {
    const doc: any = await taskStorageDeps.getDocument(
      taskStorageDeps.DATABASE_ID,
      taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
    if (doc?.value) {
      const parsed: PersonalTask = JSON.parse(doc.value);
      taskMemoryStore.set(key, parsed);
      return parsed;
    }
  } catch {
    // Check fallback
  }

  // 2. Compatibility: Try poms_ mission doc
  const missionDocId = `poms_${hash12(accountId)}_${hash12(taskId)}`;
  try {
    const doc: any = await taskStorageDeps.getDocument(
      taskStorageDeps.DATABASE_ID,
      taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      missionDocId
    );
    if (doc?.value) {
      const mission: PersonalOutboundMission = JSON.parse(doc.value);
      const migrated = migrateMissionToTask(mission);
      taskMemoryStore.set(key, migrated);
      return migrated;
    }
  } catch {
    // Not found
  }

  return null;
}

export function isTaskActiveState(state: PersonalTaskState): boolean {
  return (
    state === "READY" ||
    state === "ACTIVE" ||
    state === "WAITING_FOR_CONTACT" ||
    state === "WAITING_FOR_REPLY" ||
    state === "WAITING_FOR_OWNER" ||
    state === "WAITING_FOR_APPROVAL" ||
    state === "WAITING_UNTIL"
  );
}

export async function getActiveTaskForContact(
  accountId: string,
  personalInstanceId: string,
  targetContactId: string,
  targetPhoneOrJid?: string
): Promise<PersonalTask | null> {
  const normPhone = targetPhoneOrJid ? targetPhoneOrJid.replace(/[^0-9]/g, "") : "";

  for (const task of taskMemoryStore.values()) {
    if (
      task.accountId === accountId &&
      task.personalInstanceId === personalInstanceId &&
      isTaskActiveState(task.currentState)
    ) {
      if (task.targetContactId === targetContactId) return task;
      if (targetPhoneOrJid) {
        if (task.targetIdentity.jid === targetPhoneOrJid || task.targetIdentity.canonicalPhone === targetPhoneOrJid) {
          return task;
        }
        if (normPhone && task.targetIdentity.canonicalPhone?.replace(/[^0-9]/g, "") === normPhone) {
          return task;
        }
      }
    }
  }

  const all = await listPersonalTasks(accountId, { personalInstanceId });
  for (const task of all) {
    if (isTaskActiveState(task.currentState)) {
      if (task.targetContactId === targetContactId) return task;
      if (targetPhoneOrJid) {
        if (task.targetIdentity.jid === targetPhoneOrJid || task.targetIdentity.canonicalPhone === targetPhoneOrJid) {
          return task;
        }
        if (normPhone && task.targetIdentity.canonicalPhone?.replace(/[^0-9]/g, "") === normPhone) {
          return task;
        }
      }
    }
  }

  return null;
}

export async function listPersonalTasks(
  accountId: string,
  filter?: {
    state?: PersonalTaskState;
    personalInstanceId?: string;
    limit?: number;
  }
): Promise<PersonalTask[]> {
  const accHash = hash12(accountId);

  // 1. Sync from Appwrite to ensure cross-process visibility and restart resilience
  try {
    // A. Check tenant index document
    const indexDocId = buildTaskIndexDocId(accountId);
    try {
      const idxDoc: any = await taskStorageDeps.getDocument(
        taskStorageDeps.DATABASE_ID,
        taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        indexDocId
      );
      if (idxDoc?.value) {
        const parsed = JSON.parse(idxDoc.value);
        if (Array.isArray(parsed?.taskIds)) {
          for (const tid of parsed.taskIds) {
            const key = `${accountId}:${tid}`;
            if (!taskMemoryStore.has(key)) {
              await getPersonalTask(accountId, tid);
            }
          }
        }
      }
    } catch {
      // Index not found, proceed to scan
    }

    // B. Scan recent SYSTEM_CONFIGS documents for any task or mission documents belonging to this account
    const docsRes: any = await taskStorageDeps.listDocuments(
      taskStorageDeps.DATABASE_ID,
      taskStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      [Query.orderDesc("updated_at"), Query.limit(100)]
    ).catch(() => ({ documents: [] }));

    if (Array.isArray(docsRes?.documents)) {
      for (const d of docsRes.documents) {
        const docId = String(d?.$id || "");
        if (docId.startsWith(`pts_${accHash}_`) && d.value) {
          try {
            const parsed: PersonalTask = JSON.parse(d.value);
            if (parsed?.taskId && parsed?.accountId === accountId) {
              const key = `${accountId}:${parsed.taskId}`;
              if (!taskMemoryStore.has(key) || (taskMemoryStore.get(key)!.updatedAt < (parsed.updatedAt || 0))) {
                taskMemoryStore.set(key, parsed);
              }
            }
          } catch {}
        } else if (docId.startsWith(`poms_${accHash}_`) && d.value) {
          try {
            const mission: PersonalOutboundMission = JSON.parse(d.value);
            if (mission?.missionId && mission?.accountId === accountId) {
              const key = `${accountId}:${mission.missionId}`;
              if (!taskMemoryStore.has(key) || (taskMemoryStore.get(key)!.updatedAt < (mission.updatedAt || 0))) {
                const migrated = migrateMissionToTask(mission);
                taskMemoryStore.set(key, migrated);
              }
            }
          } catch {}
        }
      }
    }
  } catch (syncErr: any) {
    // Non-blocking sync fallback to in-memory store
  }

  // 2. Filter and sort results
  const results: PersonalTask[] = [];

  for (const task of taskMemoryStore.values()) {
    if (task.accountId !== accountId) continue;
    if (filter?.state && task.currentState !== filter.state) continue;
    if (filter?.personalInstanceId && task.personalInstanceId !== filter.personalInstanceId) continue;
    results.push(task);
  }

  results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (filter?.limit && filter.limit > 0) {
    return results.slice(0, filter.limit);
  }

  return results;
}

export function __clearPersonalTasksForTest(): void {
  taskMemoryStore.clear();
}
