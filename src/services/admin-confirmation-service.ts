import crypto from "node:crypto";
import {
  getAdminAction,
  type AdminActionDefinition,
  type AdminActionResult,
} from "./admin-action-registry-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

export interface AdminPendingConfirmation {
  confirmationId: string;
  accountId: string;
  adminJid: string;
  actionId: string;
  params: any;
  targetResource?: string;
  summaryText: string;
  expectedFingerprint?: string;
  metadata?: any;
  createdAt: number;
  expiresAt: number;
  nonce: string;
  executed: boolean;
  executedAt?: number;
  cancelled?: boolean;
}

export interface ConfirmationExecutionResult {
  executed: boolean;
  actionResult?: AdminActionResult;
  status: "executed" | "expired" | "cancelled" | "not_found" | "already_executed" | "forbidden" | "failed";
  reason?: string;
}

const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store keyed by `${accountId}:${adminJid}`
const PENDING_CONFIRMATIONS = new Map<string, AdminPendingConfirmation>();

// Idempotency execution cache: `${confirmationId}:${nonce}` -> result
const EXECUTED_IDEMPOTENCY_CACHE = new Map<string, { result: AdminActionResult; timestamp: number }>();

function buildStorageKey(accountId: string, adminJid: string): string {
  return `${String(accountId || "").trim()}:${String(adminJid || "").trim().toLowerCase()}`;
}

/**
 * Creates a bounded pending confirmation tied to the exact account, admin identity, action, and target.
 */
export function createPendingConfirmation(input: {
  accountId: string;
  adminJid: string;
  actionId: string;
  params?: any;
  targetResource?: string;
  summaryText: string;
  expectedFingerprint?: string;
  metadata?: any;
  ttlMs?: number;
}): AdminPendingConfirmation {
  const key = buildStorageKey(input.accountId, input.adminJid);
  const now = Date.now();
  const ttlMs = input.ttlMs || DEFAULT_CONFIRMATION_TTL_MS;

  const confirmationId = `conf_${now}_${crypto.randomBytes(6).toString("hex")}`;
  const nonce = crypto.randomBytes(8).toString("hex");

  const pending: AdminPendingConfirmation = {
    confirmationId,
    accountId: String(input.accountId).trim(),
    adminJid: String(input.adminJid).trim().toLowerCase(),
    actionId: String(input.actionId).trim().toLowerCase(),
    params: {
      ...(input.params || {}),
      ...(input.expectedFingerprint ? { expectedFingerprint: input.expectedFingerprint } : {}),
    },
    targetResource: input.targetResource ? String(input.targetResource).trim() : undefined,
    summaryText: String(input.summaryText || "").trim(),
    expectedFingerprint: input.expectedFingerprint,
    metadata: input.metadata,
    createdAt: now,
    expiresAt: now + ttlMs,
    nonce,
    executed: false,
  };

  PENDING_CONFIRMATIONS.set(key, pending);
  return pending;
}

/**
 * Retrieves the current pending confirmation for an account and admin.
 * Automatically invalidates and returns null if expired or already executed.
 */
export function getPendingConfirmation(accountId: string, adminJid: string): AdminPendingConfirmation | null {
  const key = buildStorageKey(accountId, adminJid);
  const pending = PENDING_CONFIRMATIONS.get(key);
  if (!pending) return null;

  if (pending.executed || pending.cancelled) {
    PENDING_CONFIRMATIONS.delete(key);
    return null;
  }

  if (Date.now() > pending.expiresAt) {
    PENDING_CONFIRMATIONS.delete(key);
    return null;
  }

  return pending;
}

/**
 * Explicitly invalidates any pending confirmation for an account and admin.
 */
export function invalidatePendingConfirmation(accountId: string, adminJid: string, reason = "invalidated"): boolean {
  const key = buildStorageKey(accountId, adminJid);
  const existing = PENDING_CONFIRMATIONS.get(key);
  if (existing) {
    existing.cancelled = true;
    PENDING_CONFIRMATIONS.delete(key);
    return true;
  }
  return false;
}

/**
 * Invalidates all pending confirmations for a specific account (e.g. when business assistant access is disabled).
 */
export function invalidateAllAccountConfirmations(accountId: string): number {
  const prefix = `${String(accountId || "").trim()}:`;
  let count = 0;
  for (const [key, pending] of PENDING_CONFIRMATIONS.entries()) {
    if (key.startsWith(prefix)) {
      pending.cancelled = true;
      PENDING_CONFIRMATIONS.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Natural language affirmative detection (English, Urdu, Roman Urdu).
 */
export function isConfirmationAffirmative(text: string): boolean {
  const clean = String(text || "").trim().toLowerCase();
  if (!clean) return false;

  // Single word checks
  const directWords = new Set([
    "yes", "y", "haan", "han", "jee", "ji", "confirm", "proceed", "agree",
    "karo", "kr do", "krdo", "theek hai", "thik he", "ok", "okay", "sure",
    "approved", "sahi hai", "bilkul", "execute"
  ]);
  if (directWords.has(clean)) return true;

  // Regex patterns
  return /^(yes|haan|han|jee|ji|confirm|proceed|ok|okay|karo|kr do|krdo|theek hai|sahi hai|do it|execute)(\b|[!.,])/i.test(clean);
}

/**
 * Natural language cancellation detection (English, Urdu, Roman Urdu).
 */
export function isConfirmationCancellation(text: string): boolean {
  const clean = String(text || "").trim().toLowerCase();
  if (!clean) return false;

  const cancelWords = new Set([
    "no", "n", "nahi", "nahin", "na", "cancel", "stop", "mat karo",
    "mat krna", "abort", "reject", "never mind", "nevermind", "chhor do", "rehndo", "rehn do"
  ]);
  if (cancelWords.has(clean)) return true;

  return /^(no|nahi|nahin|cancel|stop|mat karo|mat krna|abort|reject)(\b|[!.,])/i.test(clean);
}

/**
 * Executes a pending confirmation with full revalidation, idempotency, and tenant isolation.
 */
export async function executePendingConfirmation(input: {
  context: AdminBusinessAssistantContext;
  confirmationId: string;
  idempotencyKey?: string;
}): Promise<ConfirmationExecutionResult> {
  const { context, confirmationId } = input;

  // 1. Check idempotency cache first (protects against replayed requests)
  if (input.idempotencyKey) {
    const cached = EXECUTED_IDEMPOTENCY_CACHE.get(input.idempotencyKey);
    if (cached) {
      return {
        executed: true,
        status: "executed",
        actionResult: cached.result,
      };
    }
  }

  const key = buildStorageKey(context.accountId, context.adminJid);
  const pending = PENDING_CONFIRMATIONS.get(key);

  if (!pending || pending.confirmationId !== confirmationId) {
    return {
      executed: false,
      status: "not_found",
      reason: "pending_confirmation_not_found_or_mismatched",
    };
  }

  // Tenant & Admin isolation check
  if (pending.accountId !== context.accountId || pending.adminJid !== context.adminJid) {
    return {
      executed: false,
      status: "forbidden",
      reason: "tenant_or_admin_mismatch",
    };
  }

  // Expiry check
  if (Date.now() > pending.expiresAt) {
    PENDING_CONFIRMATIONS.delete(key);
    return {
      executed: false,
      status: "expired",
      reason: "confirmation_expired",
    };
  }

  // Replay check
  if (pending.executed) {
    return {
      executed: false,
      status: "already_executed",
      reason: "confirmation_already_executed",
    };
  }

  // Idempotency cache check
  const dedupeKey = input.idempotencyKey || `${pending.confirmationId}:${pending.nonce}`;
  const cached = EXECUTED_IDEMPOTENCY_CACHE.get(dedupeKey);
  if (cached) {
    return {
      executed: true,
      status: "executed",
      actionResult: cached.result,
    };
  }

  // Mark executed immediately to prevent concurrent race conditions
  pending.executed = true;
  pending.executedAt = Date.now();
  PENDING_CONFIRMATIONS.delete(key);

  // Retrieve action definition
  const actionDef = getAdminAction(pending.actionId);
  if (!actionDef || !actionDef.handler) {
    return {
      executed: false,
      status: "failed",
      reason: "action_handler_missing",
    };
  }

  try {
    const actionResult = await actionDef.handler(context, pending.params);
    EXECUTED_IDEMPOTENCY_CACHE.set(dedupeKey, {
      result: actionResult,
      timestamp: Date.now(),
    });
    return {
      executed: true,
      status: "executed",
      actionResult,
    };
  } catch (err: any) {
    return {
      executed: false,
      status: "failed",
      reason: err?.message || "action_execution_error",
    };
  }
}
