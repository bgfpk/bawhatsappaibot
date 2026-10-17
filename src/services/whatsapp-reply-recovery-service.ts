/**
 * WhatsApp Reply Recovery & Safe Lock Management Service
 *
 * Guarantees that:
 * 1. An inbound customer message failure never permanently blocks a conversation.
 * 2. All processing locks (currentlyReplying, activeAIControllers, batch.status)
 *    are reliably released via try/catch/finally with ownership semantics.
 * 3. Orphaned batches (status="generating_reply" when currentlyReplying is empty)
 *    are automatically detected and healed to "pending_debounce" or cleanly reset.
 * 4. Bounded timeouts are enforced with AbortController so operations never hang forever.
 * 5. Outbound WhatsApp send deduplication prevents duplicate sends on retries.
 */

import { WhatsAppReplyPipelineTrace, maskJid, sanitizeErrorMessage } from "./whatsapp-reply-pipeline-tracer.ts";

export interface SafeLockContext {
  jid: string;
  batchId?: string;
  lockSet: Set<string>;
  trace?: WhatsAppReplyPipelineTrace;
  onAcquired?: () => void;
  onCleanState?: (error?: any) => Promise<void> | void;
}

export interface RecoverableBatch {
  batchId: string;
  status: string;
  pendingWhileProcessing?: boolean;
  timer?: any;
  createdAt: number;
  lastUpdatedAt: number;
  extendedOnce?: boolean;
  messageIds?: string[];
}

export interface LockStateInspector {
  currentlyReplying?: Set<string>;
  activeAIControllers?: Map<string, any>;
}

export class TimeoutError extends Error {
  readonly code = "STAGE_TIMEOUT";
  constructor(public readonly stage: string, public readonly timeoutMs: number) {
    super(`Stage '${stage}' exceeded bounded timeout of ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Checks if a batch processing status represents an in-flight operation.
 */
export function isBatchProcessingStatus(status: string): boolean {
  return status === "processing_media" || status === "generating_reply" || status === "sending";
}

/**
 * Checks whether an active batch is orphaned:
 * i.e., the batch status says it's actively processing, but neither
 * currentlyReplying nor activeAIControllers holds the lock for this JID.
 */
export function isBatchOrphaned(
  batch: RecoverableBatch | undefined | null,
  locks: LockStateInspector,
  normalizedJid: string
): boolean {
  if (!batch) return false;
  if (!isBatchProcessingStatus(batch.status)) return false;

  const isReplying = Boolean(locks.currentlyReplying?.has(normalizedJid));
  const hasController = Boolean(locks.activeAIControllers?.has(normalizedJid));

  return !isReplying && !hasController;
}

/**
 * Recovers an orphaned batch if it was left in a processing status
 * after an unhandled rejection, worker glitch, or failed attempt.
 */
export function recoverOrphanedBatch(
  batch: RecoverableBatch | undefined | null,
  locks: LockStateInspector,
  normalizedJid: string
): { recovered: boolean; previousStatus?: string; reason?: string } {
  if (!batch) {
    return { recovered: false, reason: "no_batch" };
  }

  if (isBatchOrphaned(batch, locks, normalizedJid)) {
    const previousStatus = batch.status;
    batch.status = "pending_debounce";
    batch.pendingWhileProcessing = false;
    batch.lastUpdatedAt = Date.now();
    return {
      recovered: true,
      previousStatus,
      reason: "orphaned_lock_cleared",
    };
  }

  return { recovered: false, reason: "not_orphaned" };
}

/**
 * Executes a customer message reply within a bulletproof lock lifecycle.
 *
 * Guarantees:
 * - Lock is acquired only if not already held by another execution.
 * - Entire pipeline runs inside try/catch/finally.
 * - Any caught error is safely handled, tracked in tracer, and clean state callback invoked.
 * - Lock is unconditionally released in `finally`.
 */
export async function executeWithSafeConversationLock<T>(
  context: SafeLockContext,
  action: () => Promise<T>
): Promise<{ success: boolean; result?: T; error?: any }> {
  const { jid, lockSet, trace, onAcquired, onCleanState } = context;

  // 1. Acquire lock
  if (lockSet.has(jid)) {
    if (trace) {
      trace.recordTerminal("SUPERSEDED", "Already processing active lock");
    }
    return { success: false, error: new Error(`Conversation lock already held for ${maskJid(jid)}`) };
  }

  lockSet.add(jid);
  onAcquired?.();

  let actionResult: T | undefined;
  let actionError: any;

  try {
    actionResult = await action();
    return { success: true, result: actionResult };
  } catch (err: any) {
    actionError = err;
    if (trace && !trace.snapshot().terminalOutcome) {
      const currentStage = trace.snapshot().currentStage || "AI_REQUEST_STARTED";
      trace.recordFailure(currentStage, err);
      trace.recordTerminal("AI_FAILED", sanitizeErrorMessage(err));
    }
    return { success: false, error: err };
  } finally {
    try {
      if (onCleanState) {
        await onCleanState(actionError);
      }
    } catch (cleanupErr) {
      console.error(`[ReplyRecovery] Cleanup error for ${maskJid(jid)}:`, cleanupErr);
    } finally {
      // Unconditional lock release
      lockSet.delete(jid);
      if (trace) {
        trace.recordStage("CONVERSATION_STATE_RELEASED", {
          lockedDurationMs: trace.snapshot().totalDurationMs,
          hadError: Boolean(actionError),
        });
      }
    }
  }
}

/**
 * Wraps an async operation with a bounded timeout and optional AbortController.
 */
export async function withBoundedTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  stageName: string,
  existingSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  let timer: any = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new TimeoutError(stageName, timeoutMs);
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });

  if (existingSignal) {
    if (existingSignal.aborted) {
      if (timer) clearTimeout(timer);
      throw existingSignal.reason;
    }
    existingSignal.addEventListener("abort", () => {
      if (timer) clearTimeout(timer);
      controller.abort(existingSignal.reason);
    });
  }

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Outbound WhatsApp Send Deduplication Cache
 *
 * Prevents retried generation or ambiguous delivery timeouts from
 * dispatching duplicate identical customer responses within a 5-minute window.
 */
export class WhatsAppSendDeduplicator {
  private sentHashes = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = 300000) {
    this.ttlMs = ttlMs;
  }

  private makeKey(jid: string, text: string): string {
    const sanitized = text.replace(/\s+/g, " ").trim().slice(0, 100);
    return `${jid}::${sanitized}`;
  }

  /**
   * Checks if an identical message has already been sent to this customer recently.
   */
  public isDuplicate(jid: string, text: string): boolean {
    this.prune();
    const key = this.makeKey(jid, text);
    return this.sentHashes.has(key);
  }

  /**
   * Records that a message was successfully sent to this customer.
   */
  public recordSent(jid: string, text: string): void {
    const key = this.makeKey(jid, text);
    this.sentHashes.set(key, Date.now());
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, timestamp] of this.sentHashes.entries()) {
      if (timestamp < cutoff) {
        this.sentHashes.delete(key);
      }
    }
  }

  public clear(): void {
    this.sentHashes.clear();
  }
}

export const globalSendDeduplicator = new WhatsAppSendDeduplicator();
