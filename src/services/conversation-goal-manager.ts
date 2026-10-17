/**
 * Canonical Conversation Goal & Persistent Task Manager
 *
 * Implements canonical goal tracking, multi-turn state preservation,
 * and semantic active-object / referent memory across BlackArrow assistants.
 */

import { createHash } from "node:crypto";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";

export type GoalStatus =
  | "IN_PROGRESS"
  | "WAITING_FOR_USER"
  | "WAITING_FOR_EXTERNAL_RESULT"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED";

export type GoalChannel = "personal_whatsapp" | "business_whatsapp" | "dashboard";

export interface GoalStepExecution {
  stepIndex: number;
  actionId: string;
  params: Record<string, any>;
  resultSummary: string;
  success: boolean;
  data?: any;
  timestamp: number;
}

export interface GoalContactEntity {
  contactId?: string;
  displayName: string;
  canonicalPhone?: string;
  jid?: string;
  isDirectNumber?: boolean;
}

export interface GoalCustomerEntity {
  customerId?: string;
  name?: string;
  phone?: string;
}

export interface GoalLeadEntity {
  leadId?: string;
  name?: string;
  phone?: string;
  status?: string;
  department?: string;
}

export interface GoalOrderEntity {
  orderId?: string;
  orderReference?: string;
  total?: number;
  status?: string;
}

export interface GoalInstanceEntity {
  botId?: string;
  name?: string;
  connected?: boolean;
}

export interface GoalDepartmentEntity {
  departmentId?: string;
  name?: string;
}

export interface GoalKnownEntities {
  activeContact?: GoalContactEntity;
  activeCustomer?: GoalCustomerEntity;
  activePhone?: string;
  activePersonName?: string;
  activePerson?: string;
  activeEntity?: string;
  activeLead?: GoalLeadEntity;
  activeOrder?: GoalOrderEntity;
  activeInstance?: GoalInstanceEntity;
  activeDepartment?: GoalDepartmentEntity;
  activePersonalMissionId?: string;
  activeTaskId?: string;
  activePersonalInstanceId?: string;
}

export interface ConversationGoal {
  goalId: string;
  accountId: string;
  conversationId: string; // adminJid or customerJid
  requesterIdentity: {
    role: string;
    jid: string;
    phone?: string;
    name?: string;
  };
  goalType:
    | "external_contact"
    | "order_inquiry"
    | "customer_lookup"
    | "lead_management"
    | "catalog_management"
    | "assistant_capabilities"
    | "personal_assistant_settings"
    | "wallet_billing"
    | "instance_operations"
    | "query_business"
    | "general_task";
  originalObjective: string;
  currentObjectiveSummary: string;
  status: GoalStatus;
  knownEntities: GoalKnownEntities;
  channelRequired?: GoalChannel;
  knownArguments: Record<string, any>;
  missingArguments: string[];
  currentStep: number;
  completedSteps: GoalStepExecution[];
  pendingToolAction?: {
    actionId: string;
    params: Record<string, any>;
  };
  lastToolResult?: {
    actionId: string;
    success: boolean;
    data?: any;
    summary?: string;
  };
  blockedReason?: string;
  version: number;
  suspendedGoal?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Canonical Persistent Storage Adapter & Doc ID Partitioning
// ---------------------------------------------------------------------------

function hash12(input: string): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

export function buildGoalDocId(accountId: string, conversationId: string): string {
  return `cg_${hash12(accountId)}_${hash12(conversationId)}`;
}

export function buildGoalClaimDocId(accountId: string, goalId: string, version: number): string {
  return `cgc_${hash12(accountId)}_${hash12(goalId)}_${version}`;
}

export interface GoalStepClaim {
  claimId: string;
  accountId: string;
  goalId: string;
  version: number;
  workerId: string;
  status: "claimed" | "completed" | "failed" | "reconciliation_required";
  acquiredAt: number;
  expiresAt: number;
  attempts: number;
  summary?: string;
}

export interface CanonicalGoalStorageAdapter {
  getGoalDocument(docId: string): Promise<string | null> | string | null;
  setGoalDocument(docId: string, value: string, updatedAt: number): Promise<void> | void;
  deleteGoalDocument(docId: string): Promise<void> | void;
  createClaimDocument?(docId: string, value: string, updatedAt: number): Promise<boolean> | boolean;
  getClaimDocument?(docId: string): Promise<string | null> | string | null;
  updateClaimDocument?(docId: string, value: string, updatedAt: number): Promise<void> | void;
  deleteClaimDocument?(docId: string): Promise<void> | void;
}

// In-process canonical persistent backing store (persists across memory cache clears, zero local files)
const canonicalDurableGoalStore = new Map<string, { value: string; updatedAt: number }>();
const canonicalDurableClaimStore = new Map<string, { value: string; updatedAt: number }>();

const defaultCanonicalGoalStorageAdapter: CanonicalGoalStorageAdapter = {
  getGoalDocument(docId: string): string | null {
    const item = canonicalDurableGoalStore.get(docId);
    return item ? item.value : null;
  },

  setGoalDocument(docId: string, value: string, updatedAt: number): void {
    canonicalDurableGoalStore.set(docId, { value, updatedAt });
    // Asynchronously synchronize with Appwrite SYSTEM_CONFIGS in production
    try {
      const payload = { value, updated_at: updatedAt };
      databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch((e: any) => {
        if (Number(e?.code || 0) === 404 || String(e?.message || "").includes("could not be found")) {
          databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
        }
      });
    } catch {}
  },

  deleteGoalDocument(docId: string): void {
    canonicalDurableGoalStore.delete(docId);
    try {
      databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId).catch(() => {});
    } catch {}
  },

  createClaimDocument(docId: string, value: string, updatedAt: number): boolean {
    if (canonicalDurableClaimStore.has(docId)) {
      return false; // Unique collision (409 Conflict)
    }
    canonicalDurableClaimStore.set(docId, { value, updatedAt });
    try {
      const payload = { value, updated_at: updatedAt };
      databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
    } catch {}
    return true;
  },

  getClaimDocument(docId: string): string | null {
    const item = canonicalDurableClaimStore.get(docId);
    return item ? item.value : null;
  },

  updateClaimDocument(docId: string, value: string, updatedAt: number): void {
    canonicalDurableClaimStore.set(docId, { value, updatedAt });
    try {
      const payload = { value, updated_at: updatedAt };
      databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
    } catch {}
  },

  deleteClaimDocument(docId: string): void {
    canonicalDurableClaimStore.delete(docId);
    try {
      databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId).catch(() => {});
    } catch {}
  },
};

let activeCanonicalGoalAdapter = defaultCanonicalGoalStorageAdapter;

export function __setCanonicalGoalStorageAdapterForTest(adapter: CanonicalGoalStorageAdapter | null): void {
  activeCanonicalGoalAdapter = adapter || defaultCanonicalGoalStorageAdapter;
}

export async function tryAcquireGoalStepClaim(
  accountId: string,
  goalId: string,
  expectedVersion: number,
  workerId?: string,
  leaseDurationMs = 30000
): Promise<{
  acquired: boolean;
  claimId: string;
  reason?: "already_completed" | "in_flight" | "conflict" | "max_attempts_exceeded" | "reconciliation_required";
  claim?: GoalStepClaim;
  recovered?: boolean;
}> {
  const claimId = buildGoalClaimDocId(accountId, goalId, expectedVersion);
  const now = Date.now();
  const effectiveWorkerId = workerId || `worker_${process.pid || 1}_${Math.random().toString(36).slice(2, 7)}`;

  const newClaim: GoalStepClaim = {
    claimId,
    accountId,
    goalId,
    version: expectedVersion,
    workerId: effectiveWorkerId,
    status: "claimed",
    acquiredAt: now,
    expiresAt: now + leaseDurationMs,
    attempts: 1,
  };

  const created = await Promise.resolve(
    activeCanonicalGoalAdapter.createClaimDocument?.(claimId, JSON.stringify(newClaim), Math.floor(now / 1000))
  );

  if (created) {
    return { acquired: true, claimId, claim: newClaim };
  }

  // Claim document already exists: examine existing claim
  const existingRaw = await Promise.resolve(activeCanonicalGoalAdapter.getClaimDocument?.(claimId));
  if (!existingRaw) {
    return { acquired: false, claimId, reason: "conflict" };
  }

  try {
    const existing: GoalStepClaim = JSON.parse(existingRaw);
    if (existing.status === "completed") {
      return { acquired: false, claimId, reason: "already_completed", claim: existing };
    }

    if (existing.status === "reconciliation_required") {
      return { acquired: false, claimId, reason: "reconciliation_required", claim: existing };
    }

    if (existing.status === "claimed" && now < existing.expiresAt) {
      return { acquired: false, claimId, reason: "in_flight", claim: existing };
    }

    // Lease expired: worker crashed or stalled during or after execution
    if (existing.status === "claimed" && now >= existing.expiresAt) {
      // SAFE UNCERTAIN-OUTCOME POLICY:
      // If the prior worker crashed while holding the claim, an irreversible external action
      // (such as a WhatsApp send or financial write) may have succeeded on the network.
      // We do NOT blindly resend. We mark the claim as reconciliation_required and stop duplicate execution.
      existing.status = "reconciliation_required";
      existing.summary = "OUTCOME_UNKNOWN: Process crashed during or immediately after external action execution. Automatic duplicate retry suppressed; manual or transport reconciliation required.";
      await Promise.resolve(
        activeCanonicalGoalAdapter.updateClaimDocument?.(claimId, JSON.stringify(existing), Math.floor(now / 1000))
      );
      return { acquired: false, claimId, reason: "reconciliation_required", claim: existing };
    }
  } catch {}

  return { acquired: false, claimId, reason: "conflict" };
}

export async function finalizeGoalStepClaim(
  claimId: string,
  outcome: "completed" | "failed",
  summary?: string
): Promise<void> {
  try {
    const existingRaw = await Promise.resolve(activeCanonicalGoalAdapter.getClaimDocument?.(claimId));
    if (existingRaw) {
      const existing: GoalStepClaim = JSON.parse(existingRaw);
      existing.status = outcome;
      existing.summary = summary;
      existing.expiresAt = Date.now() + (outcome === "completed" ? 3600000 : 60000);
      await Promise.resolve(
        activeCanonicalGoalAdapter.updateClaimDocument?.(claimId, JSON.stringify(existing), Math.floor(Date.now() / 1000))
      );
    }
  } catch {}
}

export function cleanupExpiredGoalClaims(): number {
  const now = Date.now();
  let purged = 0;
  for (const [docId, item] of canonicalDurableClaimStore.entries()) {
    try {
      const claim = JSON.parse(item.value);
      if (now > Number(claim.expiresAt || 0)) {
        canonicalDurableClaimStore.delete(docId);
        purged += 1;
      }
    } catch {}
  }
  return purged;
}

const DEFAULT_GOAL_TTL_MS = 60 * 60 * 1000; // 1 hour conversational TTL

// In-memory cache for fast conversational resolution
function getGoalMemoryCache(): Map<string, ConversationGoal> {
  return ((globalThis as any).__blackarrowConversationGoalStore ??= new Map<string, ConversationGoal>());
}

function makeGoalKey(accountId: string, conversationId: string): string {
  return `${String(accountId || "").trim()}:${String(conversationId || "").trim()}`;
}

export function extractMinimalGoalRecord(goal: ConversationGoal): Record<string, any> {
  return {
    goalId: goal.goalId,
    accountId: goal.accountId,
    conversationId: goal.conversationId,
    requesterIdentity: goal.requesterIdentity,
    goalType: goal.goalType,
    originalObjective: goal.originalObjective,
    currentObjectiveSummary: goal.currentObjectiveSummary,
    status: goal.status,
    knownEntities: goal.knownEntities,
    channelRequired: goal.channelRequired,
    knownArguments: goal.knownArguments,
    missingArguments: goal.missingArguments,
    currentStep: goal.currentStep,
    completedSteps: (goal.completedSteps || []).map((s) => ({
      stepIndex: s.stepIndex,
      actionId: s.actionId,
      resultSummary: s.resultSummary,
      success: s.success,
      timestamp: s.timestamp,
    })),
    pendingToolAction: goal.pendingToolAction,
    lastToolResult: goal.lastToolResult,
    blockedReason: goal.blockedReason,
    version: goal.version || 1,
    suspendedGoal: goal.suspendedGoal ? extractMinimalGoalRecord(goal.suspendedGoal as any) : undefined,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    expiresAt: goal.expiresAt,
  };
}

function readGoalFromCanonicalStore(accountId: string, conversationId: string): ConversationGoal | undefined {
  try {
    const docId = buildGoalDocId(accountId, conversationId);
    const raw = activeCanonicalGoalAdapter.getGoalDocument(docId);
    if (!raw) return undefined;
    const rawStr = typeof raw === "string" ? raw : null;
    if (!rawStr) return undefined;
    const parsed: ConversationGoal = JSON.parse(rawStr);

    // Tenant authorization & isolation check
    if (parsed.accountId !== accountId || parsed.conversationId !== conversationId) {
      console.warn(`[GoalManager] Tenant isolation violation: goal ${parsed.goalId} belongs to ${parsed.accountId}, requested by ${accountId}`);
      return undefined;
    }

    if (Date.now() > parsed.expiresAt) {
      activeCanonicalGoalAdapter.deleteGoalDocument(docId);
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function writeGoalToCanonicalStore(goal: ConversationGoal): void {
  try {
    const docId = buildGoalDocId(goal.accountId, goal.conversationId);
    // Unfinished and actionable goals must survive normal worker restarts:
    // IN_PROGRESS, WAITING_FOR_USER, WAITING_FOR_EXTERNAL_RESULT, BLOCKED
    if (
      goal.status === "IN_PROGRESS" ||
      goal.status === "WAITING_FOR_USER" ||
      goal.status === "WAITING_FOR_EXTERNAL_RESULT" ||
      goal.status === "BLOCKED"
    ) {
      const minimal = extractMinimalGoalRecord(goal);
      activeCanonicalGoalAdapter.setGoalDocument(docId, JSON.stringify(minimal), Math.floor(goal.updatedAt / 1000));
    } else {
      // Completed or failed goals are non-actionable; clean up from persistent store
      activeCanonicalGoalAdapter.deleteGoalDocument(docId);
    }
  } catch {}
}

function deleteGoalFromCanonicalStore(accountId: string, conversationId: string): void {
  try {
    const docId = buildGoalDocId(accountId, conversationId);
    activeCanonicalGoalAdapter.deleteGoalDocument(docId);
  } catch {}
}

export function getStoredConversationGoal(accountId: string, conversationId: string): ConversationGoal | undefined {
  if (!accountId || !conversationId) return undefined;
  const key = makeGoalKey(accountId, conversationId);
  let goal = getGoalMemoryCache().get(key);
  if (!goal) {
    goal = readGoalFromCanonicalStore(accountId, conversationId);
    if (goal) {
      getGoalMemoryCache().set(key, goal);
    }
  }
  return goal;
}

export function getActiveConversationGoal(accountId: string, conversationId: string): ConversationGoal | undefined {
  if (!accountId || !conversationId) return undefined;
  const key = makeGoalKey(accountId, conversationId);
  let goal = getGoalMemoryCache().get(key);

  // On memory cache miss (e.g. after worker/process restart), rehydrate from canonical persistent store
  if (!goal) {
    goal = readGoalFromCanonicalStore(accountId, conversationId);
    if (goal) {
      getGoalMemoryCache().set(key, goal);
    }
  }

  if (!goal) return undefined;

  // Prune expired goals
  if (Date.now() > goal.expiresAt) {
    getGoalMemoryCache().delete(key);
    deleteGoalFromCanonicalStore(accountId, conversationId);
    return undefined;
  }

  // Active means not terminal (terminal = COMPLETED or FAILED)
  if (goal.status === "COMPLETED" || goal.status === "FAILED") {
    return undefined;
  }

  return goal;
}

export function saveConversationGoal(goal: ConversationGoal, expectedVersion?: number): ConversationGoal {
  if (!goal?.accountId || !goal?.conversationId) return goal;
  const key = makeGoalKey(goal.accountId, goal.conversationId);
  const existing = getStoredConversationGoal(goal.accountId, goal.conversationId);

  if (expectedVersion !== undefined && existing && existing.version !== expectedVersion) {
    throw new Error(`CONCURRENCY_CONFLICT: goal version ${existing.version} does not match expected ${expectedVersion}`);
  }

  if (existing) {
    goal.version = (existing.version || 0) + 1;
  } else {
    goal.version = goal.version || 1;
  }
  goal.updatedAt = Date.now();
  if (goal.expiresAt === undefined) {
    goal.expiresAt = Date.now() + DEFAULT_GOAL_TTL_MS;
  }

  getGoalMemoryCache().set(key, goal);
  writeGoalToCanonicalStore(goal);
  return goal;
}

export function updateConversationGoal(
  accountId: string,
  conversationId: string,
  patch: Partial<ConversationGoal>,
  expectedVersion?: number
): ConversationGoal | undefined {
  const goal = getStoredConversationGoal(accountId, conversationId);
  if (!goal) return undefined;

  if (expectedVersion !== undefined && goal.version !== expectedVersion) {
    throw new Error(`CONCURRENCY_CONFLICT: goal version ${goal.version} does not match expected ${expectedVersion}`);
  }

  Object.assign(goal, patch);
  return saveConversationGoal(goal, expectedVersion !== undefined ? goal.version : undefined);
}

const inFlightGoalLocks = new Map<string, Promise<any>>();

/**
 * Atomically advances an actionable goal with concurrency protection.
 * Protects external writes (e.g. WhatsApp sends, lead assignments, business writes)
 * from duplicate execution by concurrent workers.
 */
export async function advanceConversationGoalAtomically<T = any>(input: {
  accountId: string;
  conversationId: string;
  expectedVersion: number;
  workerId?: string;
  executeExternalStep: (goal: ConversationGoal) => Promise<{
    actionId: string;
    params: Record<string, any>;
    resultSummary: string;
    success: boolean;
    data?: T;
    nextStatus?: GoalStatus;
    nextStep?: number;
    knownArgumentsPatch?: Record<string, any>;
    missingArgumentsPatch?: string[];
  }>;
}): Promise<{
  success: boolean;
  conflict?: boolean;
  goal?: ConversationGoal;
  stepResult?: any;
  error?: string;
}> {
  const lockKey = makeGoalKey(input.accountId, input.conversationId);
  const previousLock = inFlightGoalLocks.get(lockKey) || Promise.resolve();

  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  inFlightGoalLocks.set(lockKey, currentLock);

  // Wait for any previous in-flight operation on this goal in this process to settle
  await previousLock.catch(() => {});

  try {
    const { accountId, conversationId, expectedVersion, executeExternalStep } = input;
    // Re-read fresh goal from store after acquiring the lock
    const current = getStoredConversationGoal(accountId, conversationId);

    if (!current) {
      return { success: false, error: "Goal not found" };
    }

    if (current.version !== expectedVersion) {
      return {
        success: false,
        conflict: true,
        goal: current,
        error: `CONCURRENCY_CONFLICT: Goal was already advanced to version ${current.version} (expected ${expectedVersion})`,
      };
    }

    // CROSS-WORKER ATOMIC CLAIM: Protect external write from duplicate execution across PM2 workers/processes
    const effectiveWorkerId = input.workerId || `worker_${process.pid || 1}_${Math.random().toString(36).slice(2, 7)}`;
    const claimResult = await tryAcquireGoalStepClaim(accountId, current.goalId, expectedVersion, effectiveWorkerId);
    if (!claimResult.acquired) {
      if (claimResult.reason === "reconciliation_required") {
        current.status = "BLOCKED";
        current.blockedReason = "RECONCILIATION_REQUIRED: Prior worker crashed during or after external execution; outcome unknown. Duplicate retry blocked pending verification.";
        current.updatedAt = Date.now();
        saveConversationGoal(current);
        return {
          success: false,
          conflict: true,
          goal: current,
          error: "RECONCILIATION_REQUIRED: Previous worker crashed during external send; delivery outcome unknown. Automatic retry suppressed.",
        };
      }
      return {
        success: false,
        conflict: true,
        goal: current,
        error: `CONCURRENCY_CLAIM_ACQUIRED_BY_ANOTHER_WORKER: ${claimResult.reason || "in_flight"}`,
      };
    }

    // Pre-advance distributed claim acquired! Execute external step exactly once.
    let stepOutcome: any;
    try {
      stepOutcome = await executeExternalStep(current);
    } catch (stepErr: any) {
      await finalizeGoalStepClaim(claimResult.claimId, "failed", stepErr?.message || String(stepErr));
      throw stepErr;
    }

    current.currentStep = stepOutcome.nextStep !== undefined ? stepOutcome.nextStep : current.currentStep + 1;
    if (stepOutcome.nextStatus) current.status = stepOutcome.nextStatus;
    if (stepOutcome.knownArgumentsPatch) {
      current.knownArguments = { ...current.knownArguments, ...stepOutcome.knownArgumentsPatch };
    }
    if (stepOutcome.missingArgumentsPatch) {
      current.missingArguments = stepOutcome.missingArgumentsPatch;
    }

    current.completedSteps.push({
      stepIndex: current.currentStep,
      actionId: stepOutcome.actionId,
      params: stepOutcome.params,
      resultSummary: stepOutcome.resultSummary,
      success: stepOutcome.success,
      data: stepOutcome.data,
      timestamp: Date.now(),
    });

    current.lastToolResult = {
      actionId: stepOutcome.actionId,
      success: stepOutcome.success,
      data: stepOutcome.data,
      summary: stepOutcome.resultSummary,
    };

    const saved = saveConversationGoal(current, expectedVersion);

    // Finalize claim on success
    await finalizeGoalStepClaim(claimResult.claimId, stepOutcome.success ? "completed" : "failed", stepOutcome.resultSummary);

    return {
      success: true,
      conflict: false,
      goal: saved,
      stepResult: stepOutcome,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
      goal: getStoredConversationGoal(input.accountId, input.conversationId),
    };
  } finally {
    releaseLock!();
    if (inFlightGoalLocks.get(lockKey) === currentLock) {
      inFlightGoalLocks.delete(lockKey);
    }
  }
}

export function completeConversationGoal(
  accountId: string,
  conversationId: string,
  resultSummary?: string
): ConversationGoal | undefined {
  const goal = getStoredConversationGoal(accountId, conversationId);
  if (!goal) return undefined;
  goal.status = "COMPLETED";
  goal.updatedAt = Date.now();
  if (resultSummary) {
    goal.lastToolResult = {
      actionId: goal.pendingToolAction?.actionId || "complete",
      success: true,
      summary: resultSummary,
    };
  }

  // Bounded cleanup: Immediately purge completed goal from canonical persistent store
  deleteGoalFromCanonicalStore(accountId, conversationId);
  getGoalMemoryCache().delete(makeGoalKey(accountId, conversationId));

  // If this goal had a suspended goal waiting, auto-resume it cleanly
  if (goal.suspendedGoal) {
    const suspended = goal.suspendedGoal as ConversationGoal;
    suspended.updatedAt = Date.now();
    suspended.expiresAt = Date.now() + DEFAULT_GOAL_TTL_MS;
    saveConversationGoal(suspended);
    return suspended;
  }

  return goal;
}

export function suspendAndReplaceActiveGoal(
  accountId: string,
  conversationId: string,
  newGoalInput: Parameters<typeof createConversationGoal>[0]
): ConversationGoal {
  const currentActive = getActiveConversationGoal(accountId, conversationId);
  const newGoal = createConversationGoal(newGoalInput);
  if (currentActive && currentActive.status !== "COMPLETED" && currentActive.status !== "FAILED") {
    newGoal.suspendedGoal = extractMinimalGoalRecord(currentActive);
    saveConversationGoal(newGoal);
  }
  return newGoal;
}

export function resumeSuspendedGoal(
  accountId: string,
  conversationId: string
): ConversationGoal | undefined {
  const current = getStoredConversationGoal(accountId, conversationId);
  if (!current || !current.suspendedGoal) return undefined;

  const suspended = current.suspendedGoal as ConversationGoal;
  suspended.updatedAt = Date.now();
  suspended.expiresAt = Date.now() + DEFAULT_GOAL_TTL_MS;

  saveConversationGoal(suspended);
  return suspended;
}

export function blockConversationGoal(
  accountId: string,
  conversationId: string,
  reason: string
): ConversationGoal | undefined {
  const goal = getStoredConversationGoal(accountId, conversationId);
  if (!goal) return undefined;
  goal.status = "BLOCKED";
  goal.blockedReason = reason;
  goal.updatedAt = Date.now();
  saveConversationGoal(goal);
  return goal;
}

export function cleanupExpiredConversationGoals(): number {
  const now = Date.now();
  const store = getGoalMemoryCache();
  let purged = 0;
  for (const [key, goal] of store.entries()) {
    if (now > goal.expiresAt) {
      store.delete(key);
      deleteGoalFromCanonicalStore(goal.accountId, goal.conversationId);
      purged += 1;
    }
  }

  // Also clean up any expired items in canonical durable store
  for (const [docId, item] of canonicalDurableGoalStore.entries()) {
    try {
      const parsed = JSON.parse(item.value);
      if (now > Number(parsed.expiresAt || 0)) {
        canonicalDurableGoalStore.delete(docId);
        purged += 1;
      }
    } catch {}
  }

  // Also clean up expired claims
  purged += cleanupExpiredGoalClaims();

  return purged;
}

export function clearConversationGoal(accountId: string, conversationId: string): void {
  if (!accountId || !conversationId) return;
  getGoalMemoryCache().delete(makeGoalKey(accountId, conversationId));
  deleteGoalFromCanonicalStore(accountId, conversationId);
}

export const clearActiveConversationGoal = clearConversationGoal;

export function resetConversationGoalStoreForTesting(): void {
  getGoalMemoryCache().clear();
  canonicalDurableGoalStore.clear();
  canonicalDurableClaimStore.clear();
}

export function clearInMemoryGoalStoreOnlyForTesting(): void {
  getGoalMemoryCache().clear();
}

// ---------------------------------------------------------------------------
// Goal Factory & Creation
// ---------------------------------------------------------------------------

export function createConversationGoal(input: {
  accountId: string;
  conversationId: string;
  requesterIdentity: {
    role?: string;
    jid: string;
    phone?: string;
    name?: string;
  } | string;
  goalType: ConversationGoal["goalType"];
  originalObjective: string;
  currentObjectiveSummary?: string;
  channelRequired?: GoalChannel;
  knownArguments?: Record<string, any>;
  missingArguments?: string[];
  knownEntities?: any;
  initialToolAction?: {
    actionId: string;
    params: Record<string, any>;
  };
  currentStep?: string | number;
  completedSteps?: string[] | GoalStepExecution[];
  status?: GoalStatus;
  ttlMs?: number;
  ttlSeconds?: number;
}): ConversationGoal {
  const now = Date.now();
  const reqIdentity = typeof input.requesterIdentity === "string"
    ? { role: "admin", jid: input.requesterIdentity }
    : { role: input.requesterIdentity.role || "admin", jid: input.requesterIdentity.jid, phone: input.requesterIdentity.phone, name: input.requesterIdentity.name };

  const ttlMs = input.ttlSeconds !== undefined ? input.ttlSeconds * 1000 : (input.ttlMs || DEFAULT_GOAL_TTL_MS);

  const initialStatus: GoalStatus = input.status
    ? input.status
    : ((input.missingArguments && input.missingArguments.length > 0) ? "WAITING_FOR_USER" : "IN_PROGRESS");

  const goal: ConversationGoal = {
    goalId: `goal_${now}_${Math.random().toString(36).slice(2, 8)}`,
    accountId: input.accountId,
    conversationId: input.conversationId,
    requesterIdentity: reqIdentity,
    goalType: input.goalType,
    originalObjective: input.originalObjective,
    currentObjectiveSummary: input.currentObjectiveSummary || input.originalObjective,
    status: initialStatus,
    knownEntities: input.knownEntities || {},
    channelRequired: input.channelRequired || "personal_whatsapp",
    knownArguments: input.knownArguments || {},
    missingArguments: input.missingArguments || [],
    currentStep: typeof input.currentStep === "number" ? input.currentStep : 0,
    completedSteps: [],
    pendingToolAction: input.initialToolAction,
    version: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
  };

  saveConversationGoal(goal);
  return goal;
}

// ---------------------------------------------------------------------------
// Tool Result Observation & Goal State Update
// ---------------------------------------------------------------------------

export function updateGoalWithToolResult(input: {
  goal: ConversationGoal;
  actionId: string;
  params: Record<string, any>;
  result: {
    success: boolean;
    data?: any;
    message: string;
    error?: string;
  };
}): ConversationGoal {
  const { goal, actionId, params, result } = input;
  const now = Date.now();

  goal.currentStep += 1;
  const summary = result.message ? result.message.slice(0, 300) : (result.success ? "Success" : "Failed");

  goal.completedSteps.push({
    stepIndex: goal.currentStep,
    actionId,
    params,
    resultSummary: summary,
    success: result.success,
    data: result.data,
    timestamp: now,
  });

  goal.lastToolResult = {
    actionId,
    success: result.success,
    data: result.data,
    summary,
  };

  // 1. Observe & Extract Active Entities from Tool Results
  if (result.success && result.data) {
    // Contact lookups
    if (actionId === "find_personal_contact") {
      if (result.data.contact) {
        const c = result.data.contact;
        const phone = c.whatsappIdentities?.[0]?.canonicalPhone;
        const jid = c.whatsappIdentities?.[0]?.jid;
        goal.knownEntities.activeContact = {
          contactId: c.contactId,
          displayName: c.displayName,
          canonicalPhone: phone,
          jid,
          isDirectNumber: false,
        };
        goal.knownEntities.activePhone = phone;
        goal.knownEntities.activePerson = c.displayName;
        goal.knownEntities.activePersonName = c.displayName;
        goal.knownArguments.target = c.displayName;
        if (phone) goal.knownArguments.targetPhone = phone;
        // Resolved recipient slot
        goal.missingArguments = goal.missingArguments.filter((arg) => arg !== "recipient" && arg !== "target");
      } else if (result.data.directRecipient) {
        const d = result.data.directRecipient;
        goal.knownEntities.activeContact = {
          displayName: d.displayName,
          canonicalPhone: d.canonicalPhone,
          jid: d.jid,
          isDirectNumber: true,
        };
        goal.knownEntities.activePhone = d.canonicalPhone;
        goal.knownEntities.activePerson = d.displayName;
        goal.knownEntities.activePersonName = d.displayName;
        goal.knownArguments.target = d.displayName;
        goal.knownArguments.targetPhone = d.canonicalPhone;
        goal.missingArguments = goal.missingArguments.filter((arg) => arg !== "recipient" && arg !== "target");
      }
    }

    // Outbound Personal Mission
    if (actionId === "start_personal_outbound_mission") {
      if (result.data?.targetIdentity) {
        goal.knownEntities.activePerson = result.data.targetIdentity.displayName;
        goal.knownEntities.activePersonName = result.data.targetIdentity.displayName;
        goal.knownEntities.activePhone = result.data.targetIdentity.canonicalPhone;
        goal.knownEntities.activeContact = {
          contactId: result.data.targetContactId,
          displayName: result.data.targetIdentity.displayName,
          canonicalPhone: result.data.targetIdentity.canonicalPhone,
          jid: result.data.targetIdentity.jid,
        };
      }
      if (result.data?.missionId) {
        goal.knownEntities.activePersonalMissionId = result.data.missionId;
        goal.knownEntities.activeTaskId = result.data.missionId;
        goal.knownEntities.activePersonalInstanceId = result.data.personalInstanceId;
      }
      goal.status = "COMPLETED";
    }

    // Contact Save
    if (actionId === "save_personal_contact") {
      if (result.data.contact) {
        goal.knownEntities.activeContact = {
          contactId: result.data.contact.contactId,
          displayName: result.data.contact.displayName,
          canonicalPhone: result.data.contact.whatsappIdentities?.[0]?.canonicalPhone,
        };
        goal.knownEntities.activePersonName = result.data.contact.displayName;
      }
    }

    // Order Lookups
    if (actionId.includes("order")) {
      const order = result.data.order || result.data.orders?.[0];
      if (order) {
        goal.knownEntities.activeOrder = {
          orderId: order.$id || order.id || order.orderId,
          orderReference: order.order_id || order.orderReference || order.id,
          total: order.total_amount || order.total,
          status: order.status,
        };
      }
    }

    // Customer Lookups
    if (actionId.includes("customer")) {
      const cust = result.data.customer || result.data.customers?.[0];
      if (cust) {
        goal.knownEntities.activeCustomer = {
          customerId: cust.$id || cust.id || cust.customerId,
          name: cust.name || cust.displayName,
          phone: cust.phone || cust.canonicalPhone,
        };
        if (cust.phone) goal.knownEntities.activePhone = cust.phone;
        if (cust.name) goal.knownEntities.activePersonName = cust.name;
      }
    }

    // Lead Routing Lookups & Reassignment
    if (actionId.includes("lead")) {
      const lead = result.data.lead || result.data.record;
      if (lead) {
        goal.knownEntities.activeLead = {
          leadId: lead.leadId || lead.id || lead.$id,
          name: lead.leadName || lead.customerName,
          phone: lead.customerPhone,
          status: lead.status,
          department: lead.departmentName || lead.departmentId,
        };
        if (lead.customerPhone) goal.knownEntities.activePhone = lead.customerPhone;
      }
    }
  }

  // 2. Failure / Blocker Handling
  if (!result.success) {
    if (result.error?.includes("disconnected") || result.error?.includes("not_connected") || result.error?.includes("offline")) {
      goal.status = "BLOCKED";
      goal.blockedReason = result.error || "Required WhatsApp line is disconnected.";
    } else {
      goal.status = "FAILED";
      goal.blockedReason = result.error || result.message;
    }
  }

  saveConversationGoal(goal);
  return goal;
}

// ---------------------------------------------------------------------------
// Semantic Referent / Active Object Memory Resolution
// ---------------------------------------------------------------------------

export interface SemanticReferentResolution {
  referentType?: "contact" | "customer" | "lead" | "order" | "phone" | "person";
  targetType?: "contact" | "customer" | "lead" | "order" | "phone" | "person";
  value?: any;
  resolvedValue?: any;
  displayName?: string;
  phone?: string;
  confidence: number;
}

/**
 * Resolves pronouns and demonstratives ("it", "him", "her", "them", "that one",
 * "same person", "save it", "call him", "that number") to active objects.
 */
export function resolveSemanticReferent(
  inputOrText: string | {
    text: string;
    goal?: ConversationGoal;
    activeContact?: GoalContactEntity;
    activePhone?: string;
    activePersonName?: string;
    activeOrder?: GoalOrderEntity;
    activeLead?: GoalLeadEntity;
  },
  memory?: any
): SemanticReferentResolution {
  let raw = "";
  let effectiveContact: any;
  let effectivePhone: any;
  let effectivePerson: any;
  let effectiveOrder: any;
  let effectiveLead: any;

  if (typeof inputOrText === "string") {
    raw = inputOrText.toLowerCase().trim();
    effectiveContact = memory?.activeContact;
    effectivePhone = memory?.activePhone || effectiveContact?.canonicalPhone;
    effectivePerson = memory?.activePersonName || effectiveContact?.displayName || memory?.activeCustomer?.name;
    effectiveOrder = memory?.activeOrder;
    effectiveLead = memory?.activeLead;
  } else {
    raw = String(inputOrText.text || "").toLowerCase().trim();
    const goalEntities = inputOrText.goal?.knownEntities || {};
    effectiveContact = inputOrText.activeContact || goalEntities.activeContact;
    effectivePhone = inputOrText.activePhone || goalEntities.activePhone || effectiveContact?.canonicalPhone;
    effectivePerson = inputOrText.activePersonName || goalEntities.activePersonName || effectiveContact?.displayName;
    effectiveOrder = inputOrText.activeOrder || goalEntities.activeOrder;
    effectiveLead = inputOrText.activeLead || goalEntities.activeLead;
  }

  // 1. Phone / Number Referents: "it", "that number", "this number", "save it", "save this"
  const isPhoneReferent =
    /\b(that number|this number|same number|the number|iss number|yeh number|us number)\b/i.test(raw) ||
    (/\b(save it|save this|save him|save her|isko save karo|use save karo|save karo)\b/i.test(raw) && Boolean(effectivePhone)) ||
    (/^send\s+(?:a\s+)?message\s+to\s+it\b/i.test(raw) && Boolean(effectivePhone));

  if (isPhoneReferent && effectivePhone) {
    return {
      referentType: "phone",
      targetType: "phone",
      value: effectivePhone,
      resolvedValue: effectivePhone,
      phone: effectivePhone,
      displayName: effectivePerson,
      confidence: 0.95,
    };
  }

  // 2. Person / Contact Referents: "him", "her", "them", "that person", "same person", "use", "unhe", "usko"
  const isPersonReferent =
    /\b(him|her|them|that person|same person|that guy|that contact|same contact|use|usko|unhe|unko|isi ko|is banday)\b/i.test(raw) ||
    /^(?:message|tell|ask|call|contact)\s+(?:him|her|them)\b/i.test(raw) ||
    /\b(?:message|bolo|poocho)\s+(?:use|unhe|usko)\b/i.test(raw);

  if (isPersonReferent && (effectiveContact || effectivePerson || effectivePhone)) {
    return {
      referentType: "person",
      targetType: "person",
      value: effectiveContact || { displayName: effectivePerson || "Contact", canonicalPhone: effectivePhone },
      resolvedValue: effectivePerson || effectiveContact?.displayName || effectivePhone,
      displayName: effectivePerson || effectiveContact?.displayName,
      phone: effectivePhone,
      confidence: 0.95,
    };
  }

  // 3. Order Referents: "that order", "same order", "the order", "us order"
  const isOrderReferent = /\b(that order|this order|same order|the order|us order|yeh order)\b/i.test(raw);
  if (isOrderReferent && effectiveOrder) {
    const orderId = effectiveOrder.orderId || effectiveOrder.orderReference || effectiveOrder.id;
    return {
      referentType: "order",
      targetType: "order",
      value: effectiveOrder,
      resolvedValue: orderId,
      displayName: effectiveOrder.orderReference || effectiveOrder.orderId,
      confidence: 0.95,
    };
  }

  // 4. Lead Referents: "that lead", "same lead", "us lead"
  const isLeadReferent = /\b(that lead|this lead|same lead|the lead|us lead|yeh lead)\b/i.test(raw);
  if (isLeadReferent && effectiveLead) {
    const leadId = effectiveLead.leadId || effectiveLead.id;
    return {
      referentType: "lead",
      targetType: "lead",
      value: effectiveLead,
      resolvedValue: leadId,
      displayName: effectiveLead.name || effectiveLead.customerName || effectiveLead.leadId,
      phone: effectiveLead.phone,
      confidence: 0.95,
    };
  }

  // General Fallback to Contact if active
  if (/\b(it|that one|same one)\b/i.test(raw)) {
    if (effectiveContact || effectivePhone) {
      return {
        referentType: "contact",
        targetType: "contact",
        value: effectiveContact,
        resolvedValue: effectivePerson || effectivePhone,
        displayName: effectivePerson,
        phone: effectivePhone,
        confidence: 0.75,
      };
    }
    if (effectiveOrder) {
      return {
        referentType: "order",
        targetType: "order",
        value: effectiveOrder,
        resolvedValue: effectiveOrder.orderId || effectiveOrder.orderReference,
        confidence: 0.75,
      };
    }
  }

  return { confidence: 0 };
}

// ---------------------------------------------------------------------------
// Multi-Turn Goal Continuation & Slot Filling
// ---------------------------------------------------------------------------

/**
 * Evaluates whether an incoming message from the user satisfies the missing arguments
 * of an existing in-progress or waiting goal, and updates the goal accordingly.
 */
export function incorporateUserResponseIntoGoal(
  goal: ConversationGoal,
  userText: string
): ConversationGoal & { updatedGoal: ConversationGoal; accepted: boolean; fieldFilled?: string } {
  const clean = String(userText || "").trim();
  if (!clean || goal.status === "COMPLETED" || goal.status === "FAILED") {
    return Object.assign(goal, { updatedGoal: goal, accepted: false });
  }

  // 1. Missing Recipient / Target
  if (goal.missingArguments.includes("recipient") || goal.missingArguments.includes("target")) {
    const isTopicSwitch = /^(?:show|view|check|get|list)\s+(?:orders?|sales|revenue|balance|wallet|catalog)\b/i.test(clean);
    if (!isTopicSwitch) {
      goal.knownArguments.recipient = clean;
      goal.knownArguments.target = clean;
      goal.knownEntities.activePerson = clean;
      goal.knownEntities.activePersonName = clean;
      goal.missingArguments = goal.missingArguments.filter((arg) => arg !== "recipient" && arg !== "target");
      goal.status = goal.missingArguments.length === 0 ? "IN_PROGRESS" : "WAITING_FOR_USER";
      goal.currentObjectiveSummary = `Contact ${clean} regarding ${goal.knownArguments.goal || goal.knownArguments.message || goal.knownArguments.messageContent || "inquiry"}`;
      saveConversationGoal(goal);
      return Object.assign(goal, { updatedGoal: goal, accepted: true, fieldFilled: "recipient" });
    }
  }

  // 2. Missing Message / Goal / messageContent
  if (
    goal.missingArguments.includes("message") ||
    goal.missingArguments.includes("goal") ||
    goal.missingArguments.includes("messageContent")
  ) {
    const isTopicSwitch = /^(?:show|view|check|get|list)\s+(?:orders?|sales|revenue|balance|wallet)\b/i.test(clean);
    if (!isTopicSwitch) {
      goal.knownArguments.message = clean;
      goal.knownArguments.goal = clean;
      goal.knownArguments.messageContent = clean;
      goal.missingArguments = goal.missingArguments.filter(
        (arg) => arg !== "message" && arg !== "goal" && arg !== "messageContent"
      );
      goal.status = goal.missingArguments.length === 0 ? "IN_PROGRESS" : "WAITING_FOR_USER";
      goal.currentObjectiveSummary = `Contact ${goal.knownArguments.recipient || goal.knownArguments.target || "contact"} regarding ${clean}`;
      saveConversationGoal(goal);
      return Object.assign(goal, { updatedGoal: goal, accepted: true, fieldFilled: "message" });
    }
  }

  return Object.assign(goal, { updatedGoal: goal, accepted: false });
}
