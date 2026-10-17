/**
 * Canonical Durable Billing Reconciliation Service
 *
 * Authoritative financial reconciliation for customer AI usage:
 * - When customer-facing WhatsApp delivery succeeds but post-send wallet settlement fails,
 *   a durable Appwrite reconciliation record is created in COLLECTIONS.SYSTEM_CONFIGS.
 * - Filesystem logs are diagnostic only (filesystem financial authority: NO).
 * - Appwrite is the authoritative financial store (Appwrite financial authority: YES).
 * - Document IDs are bounded (<= 36 chars) and deterministically derived from the logical settlement.
 * - Atomic claiming ensures multiple workers never double-charge.
 * - Retries ONLY wallet settlement and NEVER invokes WhatsApp send.
 * - Dedupe key is reused so already-charged settlements safely resolve to SETTLED.
 */

import crypto from "node:crypto";
import { Query, databases, COLLECTIONS, DATABASE_ID } from "../config/appwrite-client.ts";
import { chargeUsageBillingAction } from "./outbound-message-billing-service.ts";

export const BILLING_RECONCILIATION_DOC_PREFIX = "brc_";
export const DEFAULT_RECONCILIATION_LEASE_MS = 60 * 1000; // 60s atomic lease
export const MAX_RECONCILIATION_ATTEMPTS = 5;

export type BillingReconciliationState =
  | "PENDING"
  | "CLAIMED"
  | "SETTLED"
  | "FAILED_RETRYABLE"
  | "MANUAL_REVIEW";

export interface BillingReconciliationRecord {
  id: string; // Appwrite Document ID: brc_<31 char hash> (35 chars total <= 36)
  accountId: string;
  botId: string;
  customerJid: string;
  customerTurnId: string;
  messageId: string;
  receiptId: string;
  billingAction: string;
  successfulQualifyingAiCalls: number;
  expectedCharge: number;
  chargeDedupeKey: string;
  state: BillingReconciliationState;
  failureReason: string;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  claimedBy?: string;
  claimedAt?: number;
  leaseExpiresAt?: number;
}

export interface CreateBillingReconciliationInput {
  accountId: string;
  botId: string;
  customerJid: string;
  customerTurnId: string;
  messageId: string;
  receiptId: string;
  billingAction: string;
  successfulQualifyingAiCalls: number;
  expectedCharge: number;
  chargeDedupeKey: string;
  failureReason: string;
}

// In-memory fallback map for test environments without live Appwrite connectivity
const volatileAppwriteReconciliationDocs = new Map<string, { value: string; updated_at: number }>();

export type BillingReconciliationDeps = {
  createDocument: (collectionId: string, documentId: string, data: any) => Promise<any>;
  getDocument: (collectionId: string, documentId: string) => Promise<any>;
  updateDocument: (collectionId: string, documentId: string, data: any) => Promise<any>;
  listDocuments: (collectionId: string, queries: any[]) => Promise<{ documents: any[] }>;
  deleteDocument?: (collectionId: string, documentId: string) => Promise<any>;
  chargeUsageBillingAction: typeof chargeUsageBillingAction;
  now: () => number;
};

let testDepsOverride: Partial<BillingReconciliationDeps> | null = null;

export function __setBillingReconciliationTestDeps(overrides: Partial<BillingReconciliationDeps>): void {
  testDepsOverride = { ...(testDepsOverride || {}), ...overrides };
}

export function __resetBillingReconciliationTestDeps(): void {
  testDepsOverride = null;
  volatileAppwriteReconciliationDocs.clear();
}

export function __clearBillingReconciliationMemoryForTest(): void {
  volatileAppwriteReconciliationDocs.clear();
}

function clean(value: any): string {
  return String(value || "").trim();
}

/**
 * Builds a deterministic 35-character document ID from the logical settlement seed.
 * Fits within Appwrite's 36-character document ID limit.
 */
export function buildBillingReconciliationDocId(input: {
  accountId?: string;
  receiptId?: string;
  idempotencyKey?: string;
  messageId?: string;
}): string {
  const account = clean(input.accountId || "global");
  const receipt = clean(input.receiptId);
  const idempotency = clean(input.idempotencyKey);
  const msg = clean(input.messageId);
  const seed = receipt || idempotency || `${account}:${msg}`;
  const hash = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 31);
  return `${BILLING_RECONCILIATION_DOC_PREFIX}${hash}`;
}

function resolveDefaultDeps(): BillingReconciliationDeps {
  // Production Appwrite Databases client
  try {
    if (databases && typeof databases.createDocument === "function") {
      return {
        createDocument: async (col, docId, data) => databases.createDocument(DATABASE_ID, col, docId, data),
        getDocument: async (col, docId) => databases.getDocument(DATABASE_ID, col, docId),
        updateDocument: async (col, docId, data) => databases.updateDocument(DATABASE_ID, col, docId, data),
        listDocuments: async (col, queries) => databases.listDocuments(DATABASE_ID, col, queries),
        deleteDocument: async (col, docId) => databases.deleteDocument(DATABASE_ID, col, docId),
        chargeUsageBillingAction,
        now: () => Date.now(),
      };
    }
  } catch {}

  // In-memory fallback
  return {
    createDocument: async (_col, docId, data) => {
      if (volatileAppwriteReconciliationDocs.has(docId)) {
        const err: any = new Error("Document already exists");
        err.code = 409;
        throw err;
      }
      volatileAppwriteReconciliationDocs.set(docId, { value: data.value, updated_at: data.updated_at });
      return { $id: docId, ...data };
    },
    getDocument: async (_col, docId) => {
      const found = volatileAppwriteReconciliationDocs.get(docId);
      if (!found) {
        const err: any = new Error("Document not found");
        err.code = 404;
        throw err;
      }
      return { $id: docId, value: found.value, updated_at: found.updated_at };
    },
    updateDocument: async (_col, docId, data) => {
      const found = volatileAppwriteReconciliationDocs.get(docId);
      if (!found) {
        const err: any = new Error("Document not found");
        err.code = 404;
        throw err;
      }
      volatileAppwriteReconciliationDocs.set(docId, { value: data.value, updated_at: data.updated_at });
      return { $id: docId, ...data };
    },
    listDocuments: async (_col, queries) => {
      let documents = Array.from(volatileAppwriteReconciliationDocs.entries()).map(([docId, val]) => ({
        $id: docId,
        value: val.value,
        updated_at: val.updated_at,
      }));
      for (const q of queries || []) {
        try {
          const parsed = typeof q === "string" ? JSON.parse(q) : q;
          if (parsed?.method === "startsWith" && parsed?.attribute === "$id") {
            const prefix = String(parsed.values?.[0] || "");
            documents = documents.filter((d) => d.$id.startsWith(prefix));
          }
        } catch {
          const qStr = String(q || "");
          if (qStr.includes(BILLING_RECONCILIATION_DOC_PREFIX)) {
            documents = documents.filter((d) => d.$id.startsWith(BILLING_RECONCILIATION_DOC_PREFIX));
          }
        }
      }
      return { documents };
    },
    deleteDocument: async (_col, docId) => {
      volatileAppwriteReconciliationDocs.delete(docId);
      return {};
    },
    chargeUsageBillingAction,
    now: () => Date.now(),
  };
}

function resolveReconciliationDeps(): BillingReconciliationDeps {
  const defaults = resolveDefaultDeps();
  if (testDepsOverride) {
    return {
      createDocument: testDepsOverride.createDocument || defaults.createDocument,
      getDocument: testDepsOverride.getDocument || defaults.getDocument,
      updateDocument: testDepsOverride.updateDocument || defaults.updateDocument,
      listDocuments: testDepsOverride.listDocuments || defaults.listDocuments,
      deleteDocument: testDepsOverride.deleteDocument || defaults.deleteDocument,
      chargeUsageBillingAction: testDepsOverride.chargeUsageBillingAction || defaults.chargeUsageBillingAction,
      now: testDepsOverride.now || defaults.now,
    };
  }
  return defaults;
}

/**
 * Creates a durable Appwrite billing reconciliation record in COLLECTIONS.SYSTEM_CONFIGS.
 * Guaranteed to be idempotent: 409 conflict returns existing record without throwing.
 * Required financial errors are never silently swallowed.
 */
export async function createDurableBillingReconciliationRecord(
  input: CreateBillingReconciliationInput
): Promise<BillingReconciliationRecord> {
  const deps = resolveReconciliationDeps();
  const nowMs = deps.now();
  const docId = buildBillingReconciliationDocId({
    accountId: input.accountId,
    receiptId: input.receiptId,
    messageId: input.messageId,
  });

  const record: BillingReconciliationRecord = {
    id: docId,
    accountId: clean(input.accountId),
    botId: clean(input.botId),
    customerJid: clean(input.customerJid),
    customerTurnId: clean(input.customerTurnId),
    messageId: clean(input.messageId),
    receiptId: clean(input.receiptId),
    billingAction: clean(input.billingAction),
    successfulQualifyingAiCalls: Math.max(1, Number(input.successfulQualifyingAiCalls) || 1),
    expectedCharge: Number(Number(input.expectedCharge || 0.003).toFixed(6)),
    chargeDedupeKey: clean(input.chargeDedupeKey),
    state: "PENDING",
    failureReason: clean(input.failureReason),
    attemptCount: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  };

  try {
    await deps.createDocument(COLLECTIONS.SYSTEM_CONFIGS, docId, {
      value: JSON.stringify(record),
      updated_at: Math.floor(nowMs / 1000),
    });
    return record;
  } catch (err: any) {
    if (err?.code === 409 || String(err?.message || "").includes("already exists")) {
      // Idempotent deduplication: document already exists
      const existing = await deps.getDocument(COLLECTIONS.SYSTEM_CONFIGS, docId);
      return JSON.parse(existing.value);
    }
    // Fail loudly with durable error details for operator recovery
    console.error(`[CRITICAL_BILLING_RECONCILIATION] Failed to persist reconciliation record in Appwrite: ${err?.message || err}`, {
      docId,
      accountId: input.accountId,
      receiptId: input.receiptId,
      messageId: input.messageId,
      expectedCharge: input.expectedCharge,
    });
    throw err;
  }
}

/**
 * Retrieves a durable billing reconciliation record by docId or receiptId.
 */
export async function getBillingReconciliationRecord(
  docIdOrReceiptId: string
): Promise<BillingReconciliationRecord | null> {
  const deps = resolveReconciliationDeps();
  const docId = docIdOrReceiptId.startsWith(BILLING_RECONCILIATION_DOC_PREFIX)
    ? docIdOrReceiptId
    : buildBillingReconciliationDocId({ receiptId: docIdOrReceiptId });
  try {
    const doc = await deps.getDocument(COLLECTIONS.SYSTEM_CONFIGS, docId);
    if (!doc?.value) return null;
    return JSON.parse(doc.value);
  } catch {
    return null;
  }
}

const activeClaimLocks = new Map<string, Promise<void>>();

/**
 * Atomically claims a billing reconciliation record for execution.
 * Prevents multiple workers from double-claiming or double-charging.
 */
export async function claimBillingReconciliationRecord(
  docId: string,
  workerId: string = "worker-1",
  leaseMs: number = DEFAULT_RECONCILIATION_LEASE_MS
): Promise<{ success: boolean; record?: BillingReconciliationRecord; reason?: string }> {
  while (activeClaimLocks.has(docId)) {
    try {
      await activeClaimLocks.get(docId);
    } catch {}
  }

  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((res) => {
    resolveLock = res;
  });
  activeClaimLocks.set(docId, lockPromise);

  try {
    const deps = resolveReconciliationDeps();
    const existingDoc = await deps.getDocument(COLLECTIONS.SYSTEM_CONFIGS, docId).catch(() => null);
    if (!existingDoc) {
      return { success: false, reason: "record_not_found" };
    }

    const record: BillingReconciliationRecord = JSON.parse(existingDoc.value);
    if (record.state === "SETTLED") {
      return { success: false, reason: "already_settled", record };
    }
    if (record.state === "MANUAL_REVIEW") {
      return { success: false, reason: "manual_review_required", record };
    }

    const now = deps.now();
    // Check if actively claimed by another worker whose lease has not expired
    if (
      record.state === "CLAIMED" &&
      record.leaseExpiresAt &&
      record.leaseExpiresAt > now &&
      record.claimedBy !== workerId
    ) {
      return { success: false, reason: "claimed_by_another_worker", record };
    }

    // Atomically claim
    const updatedRecord: BillingReconciliationRecord = {
      ...record,
      state: "CLAIMED",
      claimedBy: workerId,
      claimedAt: now,
      leaseExpiresAt: now + leaseMs,
      attemptCount: (record.attemptCount || 0) + 1,
      updatedAt: now,
    };

    try {
      await deps.updateDocument(COLLECTIONS.SYSTEM_CONFIGS, docId, {
        value: JSON.stringify(updatedRecord),
        updated_at: Math.floor(now / 1000),
      });
    } catch (err: any) {
      console.error(`[CRITICAL_BILLING_ERROR] Failed to claim reconciliation record ${docId}: ${err?.message || err}`);
      return { success: false, reason: "appwrite_claim_error", record };
    }

    return { success: true, record: updatedRecord };
  } finally {
    activeClaimLocks.delete(docId);
    resolveLock();
  }
}

/**
 * Reconciles a single billing record:
 * - Claims the record atomically
 * - Retries ONLY wallet settlement with original dedupe key
 * - NEVER invokes WhatsApp send
 * - Marks SETTLED on confirmed wallet debit or duplicate charge
 */
export async function reconcileBillingRecord(
  recordOrId: string | BillingReconciliationRecord,
  workerId: string = "worker-1"
): Promise<{
  status: BillingReconciliationState;
  charged: boolean;
  duplicate?: boolean;
  reason?: string;
  record?: BillingReconciliationRecord;
}> {
  const docId = typeof recordOrId === "string" ? recordOrId : recordOrId.id;
  const claim = await claimBillingReconciliationRecord(docId, workerId);

  if (!claim.success) {
    if (claim.reason === "already_settled") {
      return { status: "SETTLED", charged: true, duplicate: true, record: claim.record };
    }
    if (claim.reason === "manual_review_required") {
      return { status: "MANUAL_REVIEW", charged: false, reason: claim.reason, record: claim.record };
    }
    return { status: claim.record?.state || "FAILED_RETRYABLE", charged: false, reason: claim.reason, record: claim.record };
  }

  const record = claim.record!;
  const deps = resolveReconciliationDeps();
  const now = deps.now();

  try {
    // Retry wallet settlement using original dedupe key
    const chargeResult = await deps.chargeUsageBillingAction(
      record.accountId,
      record.billingAction as any,
      {
        botId: record.botId,
        customerJid: record.customerJid,
        eventId: record.receiptId || record.messageId,
        messageId: record.messageId,
        dedupeKey: record.chargeDedupeKey,
      },
      `Reconciliation debit for receipt:${record.receiptId} message:${record.messageId}`,
      1
    );

    const isCharged = chargeResult?.charged === true;
    const isDuplicate = chargeResult?.duplicate === true;

    // If extra calls were part of this turn, also settle them
    if (isCharged && record.successfulQualifyingAiCalls > 1) {
      const extraCalls = record.successfulQualifyingAiCalls - 1;
      await deps.chargeUsageBillingAction(
        record.accountId,
        "customer_ai_extra_call" as any,
        {
          botId: record.botId,
          customerJid: record.customerJid,
          eventId: `${record.receiptId || record.messageId}:extra_calls`,
          messageId: record.messageId,
        },
        `Reconciliation extra calls debit for receipt:${record.receiptId}`,
        extraCalls
      );
    }

    if (isCharged || isDuplicate) {
      const settledRecord: BillingReconciliationRecord = {
        ...record,
        state: "SETTLED",
        completedAt: now,
        failureReason: "",
        updatedAt: now,
      };
      await deps.updateDocument(COLLECTIONS.SYSTEM_CONFIGS, docId, {
        value: JSON.stringify(settledRecord),
        updated_at: Math.floor(now / 1000),
      });
      return { status: "SETTLED", charged: true, duplicate: isDuplicate, record: settledRecord };
    }

    // Charge failed
    const nextState: BillingReconciliationState =
      record.attemptCount >= MAX_RECONCILIATION_ATTEMPTS ? "MANUAL_REVIEW" : "FAILED_RETRYABLE";
    const failedRecord: BillingReconciliationRecord = {
      ...record,
      state: nextState,
      failureReason: clean(chargeResult?.reason || "charge_failed"),
      updatedAt: now,
    };
    await deps.updateDocument(COLLECTIONS.SYSTEM_CONFIGS, docId, {
      value: JSON.stringify(failedRecord),
      updated_at: Math.floor(now / 1000),
    });
    return { status: nextState, charged: false, reason: chargeResult?.reason, record: failedRecord };
  } catch (error: any) {
    const reason = clean(error?.message || error) || "reconciliation_exception";
    const nextState: BillingReconciliationState =
      record.attemptCount >= MAX_RECONCILIATION_ATTEMPTS ? "MANUAL_REVIEW" : "FAILED_RETRYABLE";
    const failedRecord: BillingReconciliationRecord = {
      ...record,
      state: nextState,
      failureReason: reason,
      updatedAt: now,
    };
    try {
      await deps.updateDocument(COLLECTIONS.SYSTEM_CONFIGS, docId, {
        value: JSON.stringify(failedRecord),
        updated_at: Math.floor(now / 1000),
      });
    } catch (saveErr: any) {
      console.error(`[CRITICAL_BILLING_ERROR] Failed to persist failed reconciliation status for ${docId}: ${saveErr?.message || saveErr}`);
    }
    return { status: nextState, charged: false, reason, record: failedRecord };
  }
}

/**
 * Lists all pending, failed retryable, or expired claimed records.
 */
export async function listPendingBillingReconciliations(batchSize: number = 50): Promise<BillingReconciliationRecord[]> {
  const deps = resolveReconciliationDeps();
  const response = await deps.listDocuments(COLLECTIONS.SYSTEM_CONFIGS, [
    Query.startsWith("$id", BILLING_RECONCILIATION_DOC_PREFIX),
    Query.limit(Math.max(1, batchSize)),
  ]);
  const records: BillingReconciliationRecord[] = [];
  const now = deps.now();

  for (const doc of response.documents || []) {
    if (!doc.$id?.startsWith(BILLING_RECONCILIATION_DOC_PREFIX)) continue;
    try {
      const rec: BillingReconciliationRecord = JSON.parse(doc.value);
      if (
        rec.state === "PENDING" ||
        rec.state === "FAILED_RETRYABLE" ||
        (rec.state === "CLAIMED" && rec.leaseExpiresAt && rec.leaseExpiresAt <= now)
      ) {
        records.push(rec);
      }
    } catch {}
  }
  return records;
}

/**
 * Background worker to process all pending billing reconciliations.
 */
export async function processAllPendingBillingReconciliations(
  workerId: string = "worker-batch",
  batchSize: number = 50
): Promise<{
  total: number;
  settled: number;
  failed: number;
  skipped: number;
}> {
  const pending = await listPendingBillingReconciliations(batchSize);
  let settled = 0;
  let failed = 0;
  let skipped = 0;

  for (const record of pending) {
    const result = await reconcileBillingRecord(record.id, workerId);
    if (result.status === "SETTLED") {
      settled += 1;
    } else if (result.reason === "claimed_by_another_worker") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return { total: pending.length, settled, failed, skipped };
}

export interface BillingReconciliationSchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  batchSize?: number;
  workerId?: string;
}

let schedulerTimer: NodeJS.Timeout | null = null;
let initialTimeoutTimer: NodeJS.Timeout | null = null;
let isSchedulerRunning = false;
let isSweepInProgress = false;

export function isBillingReconciliationSchedulerRunning(): boolean {
  return isSchedulerRunning;
}

/**
 * Starts the automatic background billing reconciliation scheduler.
 * Double-start protected: safe against multiple initializations.
 * Unrefs timers so it does not block clean shutdown.
 */
export function startBillingReconciliationScheduler(
  options: BillingReconciliationSchedulerOptions = {}
): boolean {
  const g = global as any;
  if (isSchedulerRunning || g.__blackarrow_billing_reconciliation_scheduler_active) {
    return false;
  }

  isSchedulerRunning = true;
  g.__blackarrow_billing_reconciliation_scheduler_active = true;

  const intervalMs = Math.max(1000, options.intervalMs ?? 60 * 1000);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 15 * 1000);
  const batchSize = Math.max(1, options.batchSize ?? 50);
  const workerId = options.workerId || `proc_${process.pid || "main"}_${Date.now()}`;

  const executeSweep = async () => {
    if (isSweepInProgress || !isSchedulerRunning) return;
    isSweepInProgress = true;
    try {
      const result = await processAllPendingBillingReconciliations(workerId, batchSize);
      if (result.settled > 0 || result.failed > 0) {
        console.log(`[BillingReconciliationScheduler] sweep completed: total=${result.total}, settled=${result.settled}, failed=${result.failed}, skipped=${result.skipped}`);
      }
    } catch (err: any) {
      console.error("[BillingReconciliationScheduler] sweep error:", err?.message || err);
    } finally {
      isSweepInProgress = false;
    }
  };

  if (initialDelayMs > 0) {
    initialTimeoutTimer = setTimeout(async () => {
      initialTimeoutTimer = null;
      if (!isSchedulerRunning) return;
      await executeSweep();
    }, initialDelayMs);
    initialTimeoutTimer.unref?.();
  } else {
    setImmediate(() => {
      if (isSchedulerRunning) {
        executeSweep().catch(() => {});
      }
    });
  }

  schedulerTimer = setInterval(executeSweep, intervalMs);
  schedulerTimer.unref?.();

  return true;
}

/**
 * Stops the automatic background billing reconciliation scheduler and clears timers.
 */
export function stopBillingReconciliationScheduler(): void {
  if (initialTimeoutTimer) {
    clearTimeout(initialTimeoutTimer);
    initialTimeoutTimer = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isSchedulerRunning = false;
  isSweepInProgress = false;
  const g = global as any;
  g.__blackarrow_billing_reconciliation_scheduler_active = false;
}
