import crypto from "crypto";
import { COLLECTIONS, DATABASE_ID, databases } from "../config/appwrite-client.ts";

const now = () => Math.floor(Date.now() / 1000);
const nowIso = () => new Date().toISOString();

export type WalletPurchaseMarkerStatus =
  | "started"
  | "completed"
  | "failed_refunded"
  | "failed_no_debit";

export type WalletPurchaseMarker = {
  key: string;
  status: WalletPurchaseMarkerStatus;
  userId: string;
  purchaseType: string;
  target: string;
  amount: number;
  idempotencyKeyHash: string;
  transactionRef: string;
  createdAt: string;
  updatedAt: string;
  resultSummary: Record<string, any>;
  errorMessage?: string;
  refundApplied?: boolean;
};

function clean(value: any, max = 180) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function hash(value: string, length = 24) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

function parseMarker(rawValue: any, key: string): WalletPurchaseMarker | null {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(String(rawValue));
    const createdAt = clean(parsed?.createdAt, 60) || nowIso();
    const updatedAt = clean(parsed?.updatedAt, 60) || createdAt;
    const purchaseType = clean(parsed?.purchaseType, 40);
    const target = clean(parsed?.target, 180);
    return {
      key,
      status: parsed?.status === "completed" || parsed?.status === "failed_refunded" || parsed?.status === "failed_no_debit"
        ? parsed.status
        : "started",
      userId: clean(parsed?.userId, 120),
      purchaseType,
      target,
      amount: Math.max(0, Number(parsed?.amount || 0)),
      idempotencyKeyHash: clean(parsed?.idempotencyKeyHash, 64),
      transactionRef: clean(parsed?.transactionRef, 40) || `wallet_${hash(`${key}:ref`, 16)}`,
      createdAt,
      updatedAt,
      resultSummary: typeof parsed?.resultSummary === "object" && parsed.resultSummary ? parsed.resultSummary : {},
      errorMessage: clean(parsed?.errorMessage, 300),
      refundApplied: parsed?.refundApplied === true,
    };
  } catch {
    return null;
  }
}

async function readMarker(key: string) {
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
    return parseMarker((doc as any)?.value, key);
  } catch {
    return null;
  }
}

async function saveMarker(key: string, marker: WalletPurchaseMarker, createOnly = false) {
  const payload = {
    value: JSON.stringify(marker),
    updated_at: now(),
  };
  if (createOnly) {
    await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, payload);
    return marker;
  }
  try {
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, payload);
  } catch {
    await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key, payload);
  }
  return marker;
}

export function buildWalletPurchaseMarkerKey(input: {
  userId: string;
  purchaseType: string;
  target: string;
  idempotencyKey: string;
}) {
  const raw = [
    clean(input.userId, 120),
    clean(input.purchaseType, 40),
    clean(input.target, 180),
    clean(input.idempotencyKey, 180),
  ].join("|");
  return `wpm_${hash(raw, 32)}`;
}

export async function startWalletPurchaseMarker(input: {
  userId: string;
  purchaseType: string;
  target: string;
  amount: number;
  idempotencyKey: string;
}) {
  const key = buildWalletPurchaseMarkerKey(input);
  const existing = await readMarker(key);
  if (existing) {
    console.log(`[WalletPurchase] wallet_purchase_marker_duplicate key=${key} status=${existing.status} userId=${input.userId} type=${input.purchaseType} target=${input.target}`);
    return { fresh: false, marker: existing };
  }
  const createdAt = nowIso();
  const marker: WalletPurchaseMarker = {
    key,
    status: "started",
    userId: clean(input.userId, 120),
    purchaseType: clean(input.purchaseType, 40),
    target: clean(input.target, 180),
    amount: Math.max(0, Number(input.amount || 0)),
    idempotencyKeyHash: hash(clean(input.idempotencyKey, 180), 24),
    transactionRef: `wallet_${hash(`${key}:ref`, 16)}`,
    createdAt,
    updatedAt: createdAt,
    resultSummary: {},
  };
  console.log(`[WalletPurchase] wallet_purchase_marker_start key=${key} userId=${input.userId} type=${input.purchaseType} target=${input.target} amount=${input.amount}`);
  try {
    await saveMarker(key, marker, true);
    console.log(`[WalletPurchase] wallet_purchase_marker_started key=${key} ref=${marker.transactionRef}`);
    return { fresh: true, marker };
  } catch (err: any) {
    const raced = await readMarker(key);
    if (raced) {
      console.log(`[WalletPurchase] wallet_purchase_marker_duplicate (raced) key=${key} status=${raced.status}`);
      return { fresh: false, marker: raced };
    }
    console.error(`[WalletPurchase] wallet_purchase_marker_failed key=${key} error=${err?.message || err}`);
    throw new Error("Unable to start wallet purchase marker.");
  }
}

export async function updateWalletPurchaseMarker(
  key: string,
  patch: Partial<WalletPurchaseMarker>,
) {
  const existing = await readMarker(key);
  const createdAt = existing?.createdAt || nowIso();
  const next: WalletPurchaseMarker = {
    key,
    status: patch.status || existing?.status || "started",
    userId: clean(patch.userId ?? existing?.userId, 120),
    purchaseType: clean(patch.purchaseType ?? existing?.purchaseType, 40),
    target: clean(patch.target ?? existing?.target, 180),
    amount: Math.max(0, Number((patch.amount ?? existing?.amount) || 0)),
    idempotencyKeyHash: clean(patch.idempotencyKeyHash ?? existing?.idempotencyKeyHash, 64),
    transactionRef: clean(patch.transactionRef ?? existing?.transactionRef, 40) || `wallet_${hash(`${key}:ref`, 16)}`,
    createdAt,
    updatedAt: nowIso(),
    resultSummary: typeof patch.resultSummary === "object" && patch.resultSummary
      ? patch.resultSummary
      : existing?.resultSummary || {},
    errorMessage: clean(patch.errorMessage ?? existing?.errorMessage, 300),
    refundApplied: patch.refundApplied ?? existing?.refundApplied ?? false,
  };
  await saveMarker(key, next);
  if (next.status === "completed") {
    console.log(`[WalletPurchase] wallet_purchase_completed key=${key} ref=${next.transactionRef}`);
  } else if (next.status === "failed_refunded") {
    console.log(`[WalletPurchase] wallet_purchase_refunded key=${key} ref=${next.transactionRef} err=${next.errorMessage}`);
  }
  return next;
}
