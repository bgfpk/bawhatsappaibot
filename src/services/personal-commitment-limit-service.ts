/**
 * Personal Commitment Limit & Safety Ledger Service
 * 
 * Tracks external purchase/order commitments against owner-authorized spending caps:
 * - Completely isolated from BlackArrow billing wallet (NO wallet mutations)
 * - Daily spending cap enforcement with timezone-aware date boundaries
 * - Atomic check-and-reserve preventing dual-task limit races
 * - Action-level idempotency preventing double commitment accounting
 */

import { getOwnerProfile } from "./owner360-service.ts";
import type { DailyCommitmentRecord } from "./personal-delegation-types.ts";

const commitmentMemoryStore = new Map<string, DailyCommitmentRecord>();

export async function resolveOwnerDateKey(accountId: string, now = Date.now()): Promise<string> {
  let timezone = "UTC";
  try {
    const profile = await getOwnerProfile(accountId);
    if (profile?.locale?.timezone) {
      timezone = profile.locale.timezone;
    }
  } catch {
    // default to UTC
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

export async function getDailyCommitmentRecord(
  accountId: string,
  currency: string,
  now = Date.now()
): Promise<DailyCommitmentRecord> {
  const dateKey = await resolveOwnerDateKey(accountId, now);
  const key = `${accountId}:${currency.toUpperCase()}:${dateKey}`;

  let record = commitmentMemoryStore.get(key);
  if (!record) {
    record = {
      recordId: `dcr_${key}`,
      accountId,
      dateKey,
      currency: currency.toUpperCase(),
      totalCommitted: 0,
      commitments: [],
    };
    commitmentMemoryStore.set(key, record);
  }

  return record;
}

export async function checkAndReserveCommitment(params: {
  accountId: string;
  currency: string;
  amount: number;
  taskId: string;
  actionId: string;
  merchant: string;
  idempotencyKey: string;
  maxDailyLimit: number;
  now?: number;
}): Promise<{
  allowed: boolean;
  currentTotal: number;
  remainingDailyLimit: number;
  error?: string;
  reasonCode?: string;
}> {
  const {
    accountId,
    currency,
    amount,
    taskId,
    actionId,
    merchant,
    idempotencyKey,
    maxDailyLimit,
    now = Date.now(),
  } = params;

  const record = await getDailyCommitmentRecord(accountId, currency, now);

  // 1. Idempotency Check: Already committed under same idempotencyKey?
  const existingCommitment = record.commitments.find((c) => c.idempotencyKey === idempotencyKey);
  if (existingCommitment) {
    return {
      allowed: true,
      currentTotal: record.totalCommitted,
      remainingDailyLimit: Math.max(0, maxDailyLimit - record.totalCommitted),
    };
  }

  // 2. Limit Check: Would this breach the daily limit?
  const projectedTotal = record.totalCommitted + amount;
  if (projectedTotal > maxDailyLimit) {
    return {
      allowed: false,
      currentTotal: record.totalCommitted,
      remainingDailyLimit: Math.max(0, maxDailyLimit - record.totalCommitted),
      error: `Daily spending limit of ${currency} ${maxDailyLimit} would be exceeded (current: ${record.totalCommitted}, requested: ${amount})`,
      reasonCode: "DAILY_LIMIT_EXCEEDED",
    };
  }

  // 3. Atomically Reserve
  record.totalCommitted = projectedTotal;
  record.commitments.push({
    taskId,
    actionId,
    amount,
    timestamp: now,
    merchant,
    idempotencyKey,
  });

  return {
    allowed: true,
    currentTotal: record.totalCommitted,
    remainingDailyLimit: Math.max(0, maxDailyLimit - record.totalCommitted),
  };
}

export async function releaseCommitmentReservation(params: {
  accountId: string;
  currency: string;
  idempotencyKey: string;
  now?: number;
}): Promise<void> {
  const { accountId, currency, idempotencyKey, now = Date.now() } = params;
  const record = await getDailyCommitmentRecord(accountId, currency, now);

  const idx = record.commitments.findIndex((c) => c.idempotencyKey === idempotencyKey);
  if (idx >= 0) {
    const released = record.commitments[idx];
    record.totalCommitted = Math.max(0, record.totalCommitted - released.amount);
    record.commitments.splice(idx, 1);
  }
}

export function __clearCommitmentLedgerForTest(): void {
  commitmentMemoryStore.clear();
}
