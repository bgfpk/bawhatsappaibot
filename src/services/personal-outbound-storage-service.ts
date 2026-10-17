/**
 * Personal Outbound Mission Storage Service
 * 
 * Provides server-authoritative persistence for Personal Outbound Missions
 * using Appwrite SYSTEM_CONFIGS collection backed by an in-memory active index.
 * Survives worker restarts and prevents duplicate mission executions.
 * Synchronizes with canonical PersonalTask storage.
 */

import { createHash } from "node:crypto";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";
import type { PersonalOutboundMission, PersonalOutboundMissionStatus } from "./personal-outbound-types.ts";
import { migrateMissionToTask, adaptTaskToMission } from "./personal-task-migration.ts";
import { savePersonalTask, getPersonalTask, listPersonalTasks, __clearPersonalTasksForTest } from "./personal-task-storage-service.ts";

function hash12(input: string): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

export function getMissionDocId(accountId: string, missionId: string): string {
  return `poms_${hash12(accountId)}_${hash12(missionId)}`;
}

const defaultMissionStorageDeps = {
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
  now: () => Date.now(),
};

export const missionStorageDeps = { ...defaultMissionStorageDeps };

export function __setPersonalOutboundStorageTestDeps(overrides: Partial<typeof defaultMissionStorageDeps>): void {
  Object.assign(missionStorageDeps, overrides || {});
}

export function __resetPersonalOutboundStorageTestDeps(): void {
  Object.assign(missionStorageDeps, defaultMissionStorageDeps);
}

// In-memory memory map for fast synchronous lookups & testing
const missionMemoryStore = new Map<string, PersonalOutboundMission>();

export async function savePersonalOutboundMission(
  mission: PersonalOutboundMission
): Promise<PersonalOutboundMission> {
  const now = missionStorageDeps.now();
  const updatedMission: PersonalOutboundMission = {
    ...mission,
    updatedAt: now,
  };

  const key = `${updatedMission.accountId}:${updatedMission.missionId}`;
  missionMemoryStore.set(key, updatedMission);

  const docId = getMissionDocId(updatedMission.accountId, updatedMission.missionId);

  try {
    const payload = {
      value: JSON.stringify(updatedMission),
      updated_at: Math.floor(now / 1000),
    };

    try {
      await missionStorageDeps.updateDocument(
        missionStorageDeps.DATABASE_ID,
        missionStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
        docId,
        payload
      );
    } catch (updateErr: any) {
      if (updateErr?.code === 404 || String(updateErr?.message || "").includes("could not be found")) {
        await missionStorageDeps.createDocument(
          missionStorageDeps.DATABASE_ID,
          missionStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
          docId,
          payload
        );
      } else {
        throw updateErr;
      }
    }
  } catch (err: any) {
    console.warn(`[PersonalOutboundStorage] Failed to persist mission ${updatedMission.missionId} to Appwrite:`, err?.message || err);
  }

  // Synchronize canonical PersonalTask storage
  try {
    const existingTask = await getPersonalTask(updatedMission.accountId, updatedMission.missionId);
    const task = migrateMissionToTask(updatedMission);
    if (existingTask) {
      if (existingTask.ownerQuestion && !task.ownerQuestion && updatedMission.status === "NEEDS_OWNER") {
        task.ownerQuestion = existingTask.ownerQuestion;
      }
      if (existingTask.followUpPolicy && !task.followUpPolicy) {
        task.followUpPolicy = existingTask.followUpPolicy;
      }
      if (existingTask.taskLocalMemory && !task.taskLocalMemory) {
        task.taskLocalMemory = existingTask.taskLocalMemory;
      }
      if (existingTask.pendingApproval && !task.pendingApproval) {
        task.pendingApproval = existingTask.pendingApproval;
      }
    }
    await savePersonalTask(task);
  } catch (syncErr: any) {
    console.warn(`[PersonalOutboundStorage] Failed to sync task for mission ${updatedMission.missionId}:`, syncErr?.message || syncErr);
  }

  return updatedMission;
}

export async function getPersonalOutboundMission(
  accountId: string,
  missionId: string
): Promise<PersonalOutboundMission | null> {
  const key = `${accountId}:${missionId}`;

  // 1. Check canonical PersonalTask first to guarantee single source of truth
  try {
    const task = await getPersonalTask(accountId, missionId);
    if (task) {
      const cached = missionMemoryStore.get(key);
      if (!cached || (task.updatedAt && task.updatedAt >= (cached.updatedAt || 0))) {
        const adapted = adaptTaskToMission(task);
        missionMemoryStore.set(key, adapted);
        return adapted;
      }
      return cached;
    }
  } catch {
    // Fall back to mission cache and Appwrite
  }

  if (missionMemoryStore.has(key)) {
    return missionMemoryStore.get(key)!;
  }

  const docId = getMissionDocId(accountId, missionId);
  try {
    const doc: any = await missionStorageDeps.getDocument(
      missionStorageDeps.DATABASE_ID,
      missionStorageDeps.COLLECTIONS.SYSTEM_CONFIGS,
      docId
    );
    if (doc?.value) {
      const parsed = JSON.parse(doc.value);
      missionMemoryStore.set(key, parsed);
      return parsed;
    }
  } catch (err: any) {
    // Not found
  }

  return null;
}

/**
 * Returns the single currently active/waiting mission for the specified contact on this instance.
 * Enforces: At most ONE active mission per (tenant, instance, contact).
 */
export async function getActiveMissionForContact(
  accountId: string,
  personalInstanceId: string,
  targetContactId: string
): Promise<PersonalOutboundMission | null> {
  const isMissionActive = (status: PersonalOutboundMissionStatus) =>
    status === "ACTIVE" || status === "WAITING_FOR_CONTACT" || status === "WAITING_FOR_REPLY" || status === "NEEDS_OWNER";

  // Check memory store first
  for (const mission of missionMemoryStore.values()) {
    if (
      mission.accountId === accountId &&
      mission.personalInstanceId === personalInstanceId &&
      mission.targetContactId === targetContactId &&
      isMissionActive(mission.status)
    ) {
      return mission;
    }
  }

  // Fallback: list all missions for account and inspect
  const allMissions = await listPersonalOutboundMissions(accountId, { personalInstanceId });
  for (const mission of allMissions) {
    if (
      mission.targetContactId === targetContactId &&
      isMissionActive(mission.status)
    ) {
      return mission;
    }
  }

  return null;
}

export async function listPersonalOutboundMissions(
  accountId: string,
  filter?: {
    personalInstanceId?: string;
    status?: PersonalOutboundMissionStatus;
    limit?: number;
  }
): Promise<PersonalOutboundMission[]> {
  // Sync with canonical tasks
  try {
    const tasks = await listPersonalTasks(accountId, {
      personalInstanceId: filter?.personalInstanceId,
    });
    for (const t of tasks) {
      const key = `${accountId}:${t.taskId}`;
      if (!missionMemoryStore.has(key)) {
        missionMemoryStore.set(key, adaptTaskToMission(t));
      }
    }
  } catch {
    // Non-blocking sync
  }

  const results: PersonalOutboundMission[] = [];

  for (const mission of missionMemoryStore.values()) {
    if (mission.accountId !== accountId) continue;
    if (filter?.personalInstanceId && mission.personalInstanceId !== filter.personalInstanceId) continue;
    if (filter?.status && mission.status !== filter.status) continue;
    results.push(mission);
  }

  // Sort descending by createdAt
  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const limit = filter?.limit || 50;
  return results.slice(0, limit);
}

export async function updateMissionStatus(
  accountId: string,
  missionId: string,
  status: PersonalOutboundMissionStatus,
  updates?: Partial<PersonalOutboundMission>
): Promise<PersonalOutboundMission | null> {
  const existing = await getPersonalOutboundMission(accountId, missionId);
  if (!existing) return null;

  const merged: PersonalOutboundMission = {
    ...existing,
    ...(updates || {}),
    status,
    updatedAt: missionStorageDeps.now(),
  };

  return await savePersonalOutboundMission(merged);
}

export function __clearMissionsForTest(): void {
  missionMemoryStore.clear();
  __clearPersonalTasksForTest();
}
