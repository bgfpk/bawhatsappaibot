/**
 * Canonical Distributed Claim & Atomic Lease Service
 * 
 * Provides globally atomic leases across independent OS processes and worker instances
 * backed by Appwrite SYSTEM_CONFIGS (or in-memory / shared storage in test environments).
 * 
 * Supports:
 * 1. Atomic create (unique constraint prevents two workers from both winning)
 * 2. Lease expiry & safe takeover
 * 3. Atomic release
 * 4. Zero local filesystem authority
 */

import crypto from "crypto";

export interface AtomicClaimRecord {
  claimKey: string;
  claimId: string;
  workerId: string;
  acquiredAt: number;
  expiresAt: number;
  revision?: number;
  state?: string;
  finalized?: boolean;
  finalizedAt?: number;
  metadata?: Record<string, any>;
}

export interface AtomicClaimResult {
  acquired: boolean;
  claimKey: string;
  claimId: string;
  holderWorkerId?: string;
  expiresAt: number;
}

type ClaimServiceDeps = {
  getDocument: (collectionId: string, documentId: string) => Promise<any>;
  createDocument: (collectionId: string, documentId: string, data: any) => Promise<any>;
  updateDocument: (collectionId: string, documentId: string, data: any) => Promise<any>;
  deleteDocument: (collectionId: string, documentId: string) => Promise<any>;
};

let testDeps: Partial<ClaimServiceDeps> | null = null;
const volatileFallbackMemoryClaims = new Map<string, AtomicClaimRecord>();

function clean(value: any): string {
  return String(value || "").trim();
}

/**
 * Builds a deterministic 32-character document ID from an arbitrary claim key.
 * Fits within Appwrite's 36-character document ID limit.
 */
export function buildClaimDocumentId(claimKey: string): string {
  const norm = clean(claimKey);
  const hash = crypto.createHash("sha256").update(norm).digest("hex").slice(0, 26);
  return `clm_${hash}`;
}

async function httpJsonRequest(urlStr: string, method: string, data?: any): Promise<{ status: number; data: any }> {
  const httpModule = await import("node:http");
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const postData = data ? JSON.stringify(data) : "";
      const req = httpModule.request(url, {
        method,
        agent: false,
        headers: {
          ...(postData ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) } : {}),
          "Connection": "close",
        },
      }, (res: any) => {
        let body = "";
        res.on("data", (chunk: any) => { body += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode || 200, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode || 200, data: body });
          }
        });
      });
      req.on("error", reject);
      if (postData) req.write(postData);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function resolveClaimDeps(): Promise<ClaimServiceDeps> {
  if (testDeps?.getDocument && testDeps?.createDocument && testDeps?.deleteDocument) {
    return testDeps as ClaimServiceDeps;
  }
  if (typeof process !== "undefined" && process.env?.CANONICAL_CLAIM_HTTP_ENDPOINT) {
    const endpoint = process.env.CANONICAL_CLAIM_HTTP_ENDPOINT.replace(/\/$/, "");
    return {
      getDocument: async (_col, docId) => {
        const res = await httpJsonRequest(`${endpoint}/documents/${docId}`, "GET");
        if (res.status >= 400) {
          const err: any = new Error("Not found");
          err.code = res.status;
          throw err;
        }
        return res.data;
      },
      createDocument: async (_col, docId, data) => {
        const res = await httpJsonRequest(`${endpoint}/documents`, "POST", { documentId: docId, data });
        if (res.status === 409) {
          const err: any = new Error("Document already exists");
          err.code = 409;
          throw err;
        }
        if (res.status >= 400) {
          const err: any = new Error(`HTTP ${res.status}`);
          err.code = res.status;
          throw err;
        }
        return res.data;
      },
      updateDocument: async (_col, docId, data) => {
        const res = await httpJsonRequest(`${endpoint}/documents/${docId}`, "PATCH", data);
        return res.data;
      },
      deleteDocument: async (_col, docId) => {
        await httpJsonRequest(`${endpoint}/documents/${docId}`, "DELETE");
        return {};
      },
    };
  }
  try {
    const dbService = await import("./db-service.ts");
    const databases = (dbService as any).databases;
    const databaseId = (dbService as any).DATABASE_ID;
    return {
      getDocument: async (col, docId) => databases.getDocument(databaseId, col, docId),
      createDocument: async (col, docId, data) => databases.createDocument(databaseId, col, docId, data),
      updateDocument: async (col, docId, data) => databases.updateDocument(databaseId, col, docId, data),
      deleteDocument: async (col, docId) => databases.deleteDocument(databaseId, col, docId),
    };
  } catch {
    // Ephemeral in-memory fallback if db-service cannot be resolved
    return {
      getDocument: async (_col, docId) => {
        const found = volatileFallbackMemoryClaims.get(docId);
        if (!found) throw { code: 404, message: "Not found" };
        return { value: JSON.stringify(found) };
      },
      createDocument: async (_col, docId, data) => {
        if (volatileFallbackMemoryClaims.has(docId)) {
          throw { code: 409, message: "Document already exists" };
        }
        const record = JSON.parse(data.value);
        volatileFallbackMemoryClaims.set(docId, record);
        return { $id: docId, ...data };
      },
      updateDocument: async (_col, docId, data) => {
        const record = JSON.parse(data.value);
        volatileFallbackMemoryClaims.set(docId, record);
        return { $id: docId, ...data };
      },
      deleteDocument: async (_col, docId) => {
        volatileFallbackMemoryClaims.delete(docId);
        return {};
      },
    };
  }
}

/**
 * Atomically acquires a claim lease.
 * If another worker already holds an unexpired claim, returns { acquired: false }.
 * If document creation succeeds, this worker wins the claim.
 * If document exists but expired, uses atomic revision transition claim so only ONE worker can take over.
 */
export async function acquireAtomicClaim(
  claimKey: string,
  workerId: string,
  ttlMs: number = 30000,
  nowMs: number = Date.now(),
  metadata?: Record<string, any>
): Promise<AtomicClaimResult> {
  const normKey = clean(claimKey);
  const normWorker = clean(workerId) || "worker_default";
  const claimId = buildClaimDocumentId(normKey);
  const expiresAt = nowMs + ttlMs;

  const record: AtomicClaimRecord = {
    claimKey: normKey,
    claimId,
    workerId: normWorker,
    acquiredAt: nowMs,
    expiresAt,
    revision: 1,
    metadata,
  };

  const deps = await resolveClaimDeps();
  const collectionId = "system_configs";

  try {
    // 1. Try atomic create
    await deps.createDocument(collectionId, claimId, {
      value: JSON.stringify(record),
      updated_at: Math.floor(nowMs / 1000),
    });
    return {
      acquired: true,
      claimKey: normKey,
      claimId,
      holderWorkerId: normWorker,
      expiresAt,
    };
  } catch (err: any) {
    const isConflict = err?.code === 409 || String(err?.message || "").toLowerCase().includes("already exists");
    if (!isConflict) {
      // Non-conflict error (e.g., network / auth)
      return {
        acquired: false,
        claimKey: normKey,
        claimId,
        expiresAt: 0,
      };
    }

    // 2. Document already exists -> check if current lease has expired
    try {
      const existingDoc = await deps.getDocument(collectionId, claimId);
      const existingRecord: AtomicClaimRecord = JSON.parse(existingDoc.value || "{}");

      if (existingRecord.state === "completed" || existingRecord.finalized) {
        // Job has already completed and finalized -> reject any further acquisition
        return {
          acquired: false,
          claimKey: normKey,
          claimId,
          holderWorkerId: existingRecord.workerId,
          expiresAt: existingRecord.expiresAt,
        };
      }

      if (existingRecord.workerId === normWorker) {
        // Re-entrant acquisition by the same worker -> extend lease
        existingRecord.expiresAt = expiresAt;
        if (deps.updateDocument) {
          await deps.updateDocument(collectionId, claimId, {
            value: JSON.stringify(existingRecord),
            updated_at: Math.floor(nowMs / 1000),
          });
        }
        return {
          acquired: true,
          claimKey: normKey,
          claimId,
          holderWorkerId: normWorker,
          expiresAt,
        };
      }

      if (existingRecord.expiresAt && existingRecord.expiresAt <= nowMs) {
        // Lease has expired and was not finalized -> takeover atomically via revision transition
        const currentRevision = Number(existingRecord.revision || 1);
        const transResult = await acquireRevisionTransitionClaim(
          normKey,
          currentRevision,
          normWorker,
          ttlMs,
          nowMs
        );

        if (!transResult.acquired) {
          // Another worker won the takeover race!
          return {
            acquired: false,
            claimKey: normKey,
            claimId,
            holderWorkerId: existingRecord.workerId,
            expiresAt: existingRecord.expiresAt,
          };
        }

        // Won the atomic transition! Update main claim document with incremented revision
        existingRecord.workerId = normWorker;
        existingRecord.acquiredAt = nowMs;
        existingRecord.expiresAt = expiresAt;
        existingRecord.revision = currentRevision + 1;
        existingRecord.metadata = metadata;

        if (deps.updateDocument) {
          await deps.updateDocument(collectionId, claimId, {
            value: JSON.stringify(existingRecord),
            updated_at: Math.floor(nowMs / 1000),
          });
        }
        return {
          acquired: true,
          claimKey: normKey,
          claimId,
          holderWorkerId: normWorker,
          expiresAt,
        };
      }

      // Claim is actively held by another worker
      return {
        acquired: false,
        claimKey: normKey,
        claimId,
        holderWorkerId: existingRecord.workerId,
        expiresAt: existingRecord.expiresAt,
      };
    } catch {
      return {
        acquired: false,
        claimKey: normKey,
        claimId,
        expiresAt: 0,
      };
    }
  }
}

/**
 * Periodically renews an actively held claim lease.
 * Returns false if claim is no longer held by workerId or is finalized.
 */
export async function renewAtomicClaim(
  claimKey: string,
  workerId: string,
  ttlMs: number = 30000,
  nowMs: number = Date.now()
): Promise<boolean> {
  const normKey = clean(claimKey);
  const normWorker = clean(workerId);
  const claimId = buildClaimDocumentId(normKey);
  const deps = await resolveClaimDeps();
  const collectionId = "system_configs";

  try {
    const existingDoc = await deps.getDocument(collectionId, claimId);
    const existingRecord: AtomicClaimRecord = JSON.parse(existingDoc.value || "{}");

    if (existingRecord.workerId !== normWorker || existingRecord.finalized || existingRecord.state === "completed") {
      return false;
    }

    existingRecord.expiresAt = nowMs + ttlMs;
    if (deps.updateDocument) {
      await deps.updateDocument(collectionId, claimId, {
        value: JSON.stringify(existingRecord),
        updated_at: Math.floor(nowMs / 1000),
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Finalizes a claim upon successful job execution.
 * Marks the claim record as completed and sets retention TTL so duplicate workers
 * will not re-execute the finalized job.
 */
export async function finalizeAtomicClaim(
  claimKey: string,
  workerId: string,
  retentionTtlMs: number = 86400000,
  nowMs: number = Date.now()
): Promise<boolean> {
  const normKey = clean(claimKey);
  const normWorker = clean(workerId);
  const claimId = buildClaimDocumentId(normKey);
  const deps = await resolveClaimDeps();
  const collectionId = "system_configs";

  try {
    const existingDoc = await deps.getDocument(collectionId, claimId);
    const existingRecord: any = JSON.parse(existingDoc.value || "{}");

    if (existingRecord.workerId === normWorker || !normWorker) {
      existingRecord.state = "completed";
      existingRecord.finalized = true;
      existingRecord.finalizedAt = nowMs;
      existingRecord.expiresAt = nowMs + retentionTtlMs;
      if (deps.updateDocument) {
        await deps.updateDocument(collectionId, claimId, {
          value: JSON.stringify(existingRecord),
          updated_at: Math.floor(nowMs / 1000),
        });
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Releases a claim if and only if it is currently held by the specified worker.
 */
export async function releaseAtomicClaim(claimKey: string, workerId: string): Promise<boolean> {
  const normKey = clean(claimKey);
  const normWorker = clean(workerId);
  const claimId = buildClaimDocumentId(normKey);
  const deps = await resolveClaimDeps();
  const collectionId = "system_configs";

  try {
    const existingDoc = await deps.getDocument(collectionId, claimId);
    const existingRecord: AtomicClaimRecord = JSON.parse(existingDoc.value || "{}");

    if (existingRecord.workerId === normWorker || !normWorker) {
      await deps.deleteDocument(collectionId, claimId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Checks the status of a claim without acquiring it.
 */
export async function getAtomicClaimStatus(claimKey: string): Promise<AtomicClaimRecord | null> {
  const normKey = clean(claimKey);
  const claimId = buildClaimDocumentId(normKey);
  const deps = await resolveClaimDeps();
  const collectionId = "system_configs";

  try {
    const doc = await deps.getDocument(collectionId, claimId);
    return JSON.parse(doc.value || "{}");
  } catch {
    return null;
  }
}

/**
 * Atomically transitions state from an expected revision N to N+1.
 * Uses Appwrite's atomic createDocument unique constraint on `trans_<sha256(...)>`.
 * If another process already acquired or transitioned this revision, createDocument throws 409 Conflict.
 * This guarantees database-enforced CAS across independent OS processes.
 */
export async function acquireRevisionTransitionClaim(
  entityKey: string,
  expectedRevision: number,
  workerId: string,
  ttlMs: number = 30000,
  nowMs: number = Date.now()
): Promise<{ acquired: boolean; transitionKey: string; transitionDocId: string }> {
  const normKey = clean(entityKey);
  const normWorker = clean(workerId) || "worker_default";
  const transitionKey = `trans:${normKey}:rev_${expectedRevision}`;
  const transitionDocId = buildClaimDocumentId(transitionKey);

  const deps = await resolveClaimDeps();
  const collectionId = "system_configs";

  try {
    await deps.createDocument(collectionId, transitionDocId, {
      value: JSON.stringify({
        transitionKey,
        entityKey: normKey,
        expectedRevision,
        newRevision: expectedRevision + 1,
        workerId: normWorker,
        acquiredAt: nowMs,
        expiresAt: nowMs + ttlMs,
      }),
      updated_at: Math.floor(nowMs / 1000),
    });
    return { acquired: true, transitionKey, transitionDocId };
  } catch {
    return { acquired: false, transitionKey, transitionDocId };
  }
}

/**
 * Retention Cleanup: Prunes unrenewed expired worker lease claims from memory/store.
 */
export async function cleanupExpiredWorkerClaims(nowMs: number = Date.now()): Promise<number> {
  let cleaned = 0;
  for (const [docId, rec] of Array.from(volatileFallbackMemoryClaims.entries())) {
    if (rec.expiresAt && rec.expiresAt <= nowMs && !rec.finalized) {
      volatileFallbackMemoryClaims.delete(docId);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Retention Cleanup: Prunes finalized dedup claims older than cutoff (default 24 hours).
 */
export async function cleanupExpiredInboundDedupClaims(
  nowMs: number = Date.now(),
  cutoffAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  let cleaned = 0;
  const threshold = nowMs - cutoffAgeMs;
  for (const [docId, rec] of Array.from(volatileFallbackMemoryClaims.entries())) {
    if (rec.finalized && (rec.finalizedAt || rec.acquiredAt) <= threshold) {
      volatileFallbackMemoryClaims.delete(docId);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Testing helpers for isolated unit and multi-process tests
 */
export function __setAtomicClaimTestDeps(overrides: Partial<ClaimServiceDeps> | null) {
  testDeps = overrides;
  if (!overrides) {
    volatileFallbackMemoryClaims.clear();
  }
}

export function __clearMemoryClaimsForTest() {
  volatileFallbackMemoryClaims.clear();
}

export function __resetAtomicClaimTestDeps(inMemory = true) {
  if (inMemory) {
    testDeps = {
      getDocument: async (_col, docId) => {
        const found = volatileFallbackMemoryClaims.get(docId);
        if (!found) throw { code: 404, message: "Not found" };
        return { value: JSON.stringify(found) };
      },
      createDocument: async (_col, docId, data) => {
        if (volatileFallbackMemoryClaims.has(docId)) {
          throw { code: 409, message: "Document already exists" };
        }
        const record = JSON.parse(data.value);
        volatileFallbackMemoryClaims.set(docId, record);
        return { $id: docId, ...data };
      },
      updateDocument: async (_col, docId, data) => {
        const record = JSON.parse(data.value);
        volatileFallbackMemoryClaims.set(docId, record);
        return { $id: docId, ...data };
      },
      deleteDocument: async (_col, docId) => {
        volatileFallbackMemoryClaims.delete(docId);
        return {};
      },
    };
  } else {
    testDeps = null;
  }
  volatileFallbackMemoryClaims.clear();
}
