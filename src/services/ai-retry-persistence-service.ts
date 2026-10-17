import crypto from "crypto";
import { buildAiReplyRetryKey, type PendingAiReplyRetry } from "./ai-retry-schedule-service.ts";

type AiRetryPersistenceDeps = {
  getSystemConfig: (key: string) => Promise<string | null>;
  setSystemConfig: (key: string, value: string) => Promise<void>;
  deleteSystemConfig?: (key: string) => Promise<void>;
};

let testDeps: Partial<AiRetryPersistenceDeps> | null = null;
const volatileGranularRetryStore = new Map<string, string>();

function trimBlock(value: any) {
  return String(value || "").trim();
}

function buildStorageKey(botId: string) {
  return `ai_reply_retry_queue:${trimBlock(botId) || "unknown"}`;
}

export function buildGranularRetryJobDocId(
  botId: string,
  canonicalCustomerId: string,
  customerMessageId: string
): string {
  const normBot = trimBlock(botId);
  const normCust = trimBlock(canonicalCustomerId);
  const normMsg = trimBlock(customerMessageId);
  const hash = crypto.createHash("sha256").update(`${normBot}:${normCust}:${normMsg}`).digest("hex").slice(0, 26);
  return `rtj_${hash}`;
}

function parseQueuePayload(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function resolvePersistenceDeps(): Promise<AiRetryPersistenceDeps> {
  if (testDeps?.getSystemConfig && testDeps?.setSystemConfig) {
    return testDeps as AiRetryPersistenceDeps;
  }
  const dbService = await import("./db-service.ts");
  return {
    getSystemConfig: dbService.getSystemConfig,
    setSystemConfig: dbService.setSystemConfig,
  };
}

export async function saveGranularRetryJob(job: PendingAiReplyRetry): Promise<void> {
  const deps = await resolvePersistenceDeps();
  const docId = buildGranularRetryJobDocId(
    job.botId,
    job.canonicalCustomerId || job.jid,
    job.messageId
  );
  const json = JSON.stringify(job);
  volatileGranularRetryStore.set(docId, json);
  await deps.setSystemConfig(docId, json);
}

export async function loadGranularRetryJob(
  botId: string,
  canonicalCustomerId: string,
  customerMessageId: string
): Promise<PendingAiReplyRetry | null> {
  const deps = await resolvePersistenceDeps();
  const docId = buildGranularRetryJobDocId(botId, canonicalCustomerId, customerMessageId);
  const raw = volatileGranularRetryStore.get(docId) || await deps.getSystemConfig(docId);
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadAiReplyRetryQueue(botId: string) {
  const deps = await resolvePersistenceDeps();
  const raw = await deps.getSystemConfig(buildStorageKey(botId));
  const list = parseQueuePayload(raw);
  const queue = new Map<string, PendingAiReplyRetry>();
  for (const item of list) {
    if (item && item.id && item.botId && item.jid && item.messageId) {
      const id = buildAiReplyRetryKey(item);
      queue.set(id, { ...(item as PendingAiReplyRetry), id });
    }
  }
  return queue;
}

export async function saveAiReplyRetryQueue(botId: string, queue: Map<string, PendingAiReplyRetry>) {
  const deps = await resolvePersistenceDeps();
  const list = Array.from(queue.values()).sort((a, b) => a.queuedAt - b.queuedAt);
  await deps.setSystemConfig(buildStorageKey(botId), JSON.stringify(list));
  // Granular persistence: save each job as its own independent document
  for (const job of list) {
    await saveGranularRetryJob(job).catch(() => {});
  }
}

/**
 * Retention Cleanup: Prunes completed or superseded retry jobs older than cutoff (default 24 hours).
 */
export async function cleanupCompletedRetryJobs(
  nowMs: number = Date.now(),
  cutoffAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  const deps = await resolvePersistenceDeps();
  let cleaned = 0;
  const threshold = nowMs - cutoffAgeMs;
  for (const [docId, raw] of Array.from(volatileGranularRetryStore.entries())) {
    try {
      const job = JSON.parse(raw);
      const isTerminal = ["sent", "SENT", "superseded", "SUPERSEDED", "cancelled", "CANCELLED"].includes(job.status);
      const completionTime = job.repliedAt || job.supersededAt || job.updatedAt || job.queuedAt;
      if (isTerminal && completionTime <= threshold) {
        volatileGranularRetryStore.delete(docId);
        await deps.setSystemConfig(docId, "").catch(() => {});
        cleaned++;
      }
    } catch {}
  }
  return cleaned;
}

export function __setAiRetryPersistenceTestDeps(overrides: Partial<AiRetryPersistenceDeps>) {
  testDeps = { ...(testDeps || {}), ...(overrides || {}) };
}

export function __resetAiRetryPersistenceTestDeps(inMemory = true) {
  if (inMemory) {
    testDeps = {
      getSystemConfig: async (key: string) => volatileGranularRetryStore.get(key) || null,
      setSystemConfig: async (key: string, val: string) => {
        if (!val) {
          volatileGranularRetryStore.delete(key);
        } else {
          volatileGranularRetryStore.set(key, val);
        }
      },
    };
  } else {
    testDeps = null;
  }
  volatileGranularRetryStore.clear();
}
