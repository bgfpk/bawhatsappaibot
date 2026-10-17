// src/services/whatsapp-delayed-read-service.ts
/**
 * Shared WhatsApp Delayed Read Receipts Service
 *
 * Provides configurable delayed read-receipt scheduling for all incoming WhatsApp messages
 * across Business instances, Personal instances, Personal Assistant, and Admin conversations.
 *
 * Core Guarantees:
 * 1. Independent lifecycle: Message ingestion, CRM hydration, DB save, and AI reply dispatch occur
 *    immediately; the visible WhatsApp read receipt waits for the full configured delay.
 * 2. Independent outbound sending: Outbound messages (AI replies, admin responses, attachments)
 *    do NOT flush, cancel, or trigger early read receipts.
 * 3. Toggle OFF: Retains immediate canonical read receipts on incoming messages.
 * 4. Toggle ON: Defers mark-as-read receipt until the full configured delay elapses.
 * 5. Bounded batching: Rapid incoming messages in the same chat are batched and acknowledged
 *    together at the first message's scheduled deadline without indefinite postponement.
 * 6. Setting precedence: Account setting is the default; Instance setting is an optional override.
 * 7. Disconnect safety: Socket disconnects, instance pauses, or worker restarts clear in-memory
 *    timers cleanly without unhandled exceptions or stale post-disconnect reads.
 */

export interface DelayedReadConfig {
  enabled: boolean;
  delaySeconds: number;
}

export interface PendingReadReceiptEntry {
  instanceId: string;
  chatJid: string;
  messageKeys: any[];
  timer: NodeJS.Timeout | null;
  scheduledAt: number;
  fireAt: number;
  readExecutor: (keys: any[]) => Promise<void> | void;
}

export interface ScheduleReadReceiptInput {
  instanceId?: string;
  chatJid: string;
  messageKey: any;
  config?: any;
  accountConfig?: any;
  readExecutor: (keys: any[]) => Promise<void> | void;
}

export const DEFAULT_READ_RECEIPT_DELAY_SECONDS = 10;
export const MIN_READ_RECEIPT_DELAY_SECONDS = 1;
export const MAX_READ_RECEIPT_DELAY_SECONDS = 300;

/**
 * In-memory map of pending read receipt batches keyed by `${instanceId}:${chatJid}`.
 */
const pendingBatches = new Map<string, PendingReadReceiptEntry>();

/**
 * Resolves delayed read configuration adhering to strict precedence:
 * Instance setting (if explicitly defined) > Account setting (default) > System defaults.
 */
export function resolveDelayedReadConfig(config?: any, accountConfig?: any): DelayedReadConfig {
  const hasExplicitInstanceOverride = Boolean(
    config?.delayed_read_receipts_override === true ||
    config?.delayed_read_receipts_mode === "override" ||
    config?.delayedReadReceiptsOverride === true
  );

  const instanceRaw =
    config?.delayedReadReceiptsEnabled ??
    config?.delayed_read_receipts_enabled;

  const accountRaw =
    accountConfig?.delayedReadReceiptsEnabled ??
    accountConfig?.delayed_read_receipts_enabled;

  let enabled = false;
  if (hasExplicitInstanceOverride && instanceRaw !== undefined && instanceRaw !== null && instanceRaw !== "") {
    enabled = instanceRaw === true || instanceRaw === 1 || instanceRaw === "true" || instanceRaw === "1";
  } else if (accountRaw !== undefined && accountRaw !== null && accountRaw !== "") {
    enabled = accountRaw === true || accountRaw === 1 || accountRaw === "true" || accountRaw === "1";
  } else if (instanceRaw !== undefined && instanceRaw !== null && instanceRaw !== "") {
    enabled = instanceRaw === true || instanceRaw === 1 || instanceRaw === "true" || instanceRaw === "1";
  }

  const instanceDelay =
    config?.readReceiptDelaySeconds ??
    config?.read_receipt_delay_seconds ??
    config?.delayed_read_receipt_delay_seconds;

  const accountDelay =
    accountConfig?.readReceiptDelaySeconds ??
    accountConfig?.read_receipt_delay_seconds;

  let rawDelay = DEFAULT_READ_RECEIPT_DELAY_SECONDS;
  if (hasExplicitInstanceOverride && instanceDelay !== undefined && instanceDelay !== null && instanceDelay !== "" && !isNaN(Number(instanceDelay))) {
    rawDelay = Number(instanceDelay);
  } else if (accountDelay !== undefined && accountDelay !== null && accountDelay !== "" && !isNaN(Number(accountDelay))) {
    rawDelay = Number(accountDelay);
  } else if (instanceDelay !== undefined && instanceDelay !== null && instanceDelay !== "" && !isNaN(Number(instanceDelay))) {
    rawDelay = Number(instanceDelay);
  }

  const delaySeconds =
    !isNaN(rawDelay) && rawDelay > 0
      ? Math.min(Math.max(MIN_READ_RECEIPT_DELAY_SECONDS, Math.round(rawDelay)), MAX_READ_RECEIPT_DELAY_SECONDS)
      : DEFAULT_READ_RECEIPT_DELAY_SECONDS;

  return { enabled, delaySeconds };
}

export function areMessageKeysEqual(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (a.id && b.id) return a.id === b.id;
  if (typeof a === "object" && typeof b === "object") {
    return (a.id || a.key?.id) === (b.id || b.key?.id);
  }
  return a === b;
}

/**
 * Schedules a delayed read receipt or executes immediately if feature is OFF.
 * Multiple incoming messages in the same chat are batched and executed together
 * at the established fireAt deadline.
 */
export async function scheduleOrExecuteReadReceipt(
  input: ScheduleReadReceiptInput
): Promise<{ scheduled: boolean; delaySeconds: number; pendingCount: number }> {
  const { instanceId = "default", chatJid, messageKey, readExecutor } = input;
  if (!chatJid || !messageKey) {
    return { scheduled: false, delaySeconds: 0, pendingCount: 0 };
  }

  const resolved = resolveDelayedReadConfig(input.config, input.accountConfig);

  // If feature is disabled, execute immediately
  if (!resolved.enabled || resolved.delaySeconds <= 0) {
    try {
      await readExecutor([messageKey]);
    } catch (err: any) {
      console.warn(`[DelayedRead] Immediate mark-as-read error for ${chatJid}:`, err?.message || err);
    }
    return { scheduled: false, delaySeconds: 0, pendingCount: 0 };
  }

  const batchKey = `${instanceId}:${chatJid}`;
  const existing = pendingBatches.get(batchKey);

  if (existing) {
    // Append to existing pending batch if not already present
    const alreadyPresent = existing.messageKeys.some((k) => areMessageKeysEqual(k, messageKey));
    if (!alreadyPresent) {
      existing.messageKeys.push(messageKey);
    }
    existing.readExecutor = readExecutor;
    return { scheduled: true, delaySeconds: resolved.delaySeconds, pendingCount: existing.messageKeys.length };
  }

  const delayMs = resolved.delaySeconds * 1000;
  const now = Date.now();

  const entry: PendingReadReceiptEntry = {
    instanceId,
    chatJid,
    messageKeys: [messageKey],
    scheduledAt: now,
    fireAt: now + delayMs,
    readExecutor,
    timer: null,
  };

  entry.timer = setTimeout(async () => {
    pendingBatches.delete(batchKey);
    try {
      if (entry.messageKeys.length > 0) {
        await entry.readExecutor(entry.messageKeys);
        console.log(
          `[DelayedRead] Read receipt acknowledged for ${chatJid} (${entry.messageKeys.length} msgs) after ${resolved.delaySeconds}s delay.`
        );
      }
    } catch (err: any) {
      console.warn(`[DelayedRead] Deferred mark-as-read execution failed for ${chatJid}:`, err?.message || err);
    }
  }, delayMs);

  pendingBatches.set(batchKey, entry);
  return { scheduled: true, delaySeconds: resolved.delaySeconds, pendingCount: 1 };
}

/**
 * Cancels all pending read receipts for an instance (e.g. on socket close or instance pause).
 */
export function cancelPendingReadsForInstance(instanceId: string): number {
  let count = 0;
  for (const [batchKey, entry] of pendingBatches.entries()) {
    if (entry.instanceId === instanceId) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      pendingBatches.delete(batchKey);
      count++;
    }
  }
  return count;
}

/**
 * Clears all pending read receipts across all instances (e.g. on worker shutdown or test reset).
 */
export function clearAllPendingReads(): void {
  for (const entry of pendingBatches.values()) {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }
  pendingBatches.clear();
}

/**
 * Returns count of currently pending chat read receipt batches.
 */
export function getPendingReadReceiptsCount(instanceId?: string): number {
  if (!instanceId) return pendingBatches.size;
  let count = 0;
  for (const entry of pendingBatches.values()) {
    if (entry.instanceId === instanceId) count++;
  }
  return count;
}

/**
 * Returns pending message keys for a given instance and chat.
 */
export function getPendingMessageKeysForChat(instanceId: string, chatJid: string): any[] {
  const batchKey = `${instanceId}:${chatJid}`;
  return pendingBatches.get(batchKey)?.messageKeys || [];
}
