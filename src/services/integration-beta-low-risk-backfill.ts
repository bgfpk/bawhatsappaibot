import crypto from "crypto";
import { INTEGRATION_BETA_COLLECTIONS } from "./integration-beta-collections.ts";

export const LOW_RISK_BACKFILL_TARGETS = [
  INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS,
  INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS,
  INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES,
  INTEGRATION_BETA_COLLECTIONS.INTEGRATION_SYNC_JOBS,
  INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS,
] as const;

export type LowRiskBackfillCollection = typeof LOW_RISK_BACKFILL_TARGETS[number];

export type BackfillCandidate = {
  collectionId: LowRiskBackfillCollection;
  accountId: string;
  fallbackPath: string;
  originalId: string;
  documentId: string;
  dedupeKey: string;
  data: Record<string, any>;
};

export type ExistingBackfillRow = {
  documentId: string;
  data: Record<string, any>;
};

export type BackfillOperation = BackfillCandidate & {
  action: "create" | "update";
};

export type BackfillWriteAdapter = {
  create: (collectionId: string, documentId: string, data: Record<string, any>) => Promise<any>;
  update: (collectionId: string, documentId: string, data: Record<string, any>) => Promise<any>;
};

const SAFE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const SECRET_KEY_PATTERN = /(secret|token|password|authorization|api[_-]?key|consumer[_-]?key|consumer[_-]?secret|encrypted|keyhash)/i;

function cleanString(value: any, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function numeric(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableHash(value: any) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

export function isAppwriteSafeDocumentId(value: any) {
  const text = String(value || "");
  return Boolean(text && text.length <= 36 && SAFE_ID_PATTERN.test(text));
}

export function buildBackfillDocumentId(collectionId: string, accountId: string, row: any, dedupeKey = "") {
  const originalId = cleanString(row?.id, 200);
  if (isAppwriteSafeDocumentId(originalId)) return originalId;
  return `bf_${stableHash([collectionId, accountId, originalId, dedupeKey].join("|")).slice(0, 33)}`;
}

export function redactSensitiveText(value: any, maxLength = 500) {
  return cleanString(value, maxLength)
    .replace(/bai_live_[a-zA-Z0-9._-]+/g, "bai_live_[redacted]")
    .replace(/whsec_[a-zA-Z0-9._-]+/g, "whsec_[redacted]")
    .replace(/(consumer_key|consumer_secret|api_key|token|secret)=([^&\s]+)/gi, "$1=[redacted]");
}

export function sanitizeLowRiskPayload(value: any, depth = 0): any {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeLowRiskPayload(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeLowRiskPayload(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "string") return redactSensitiveText(value, 2000);
  return value;
}

export function safeJsonString(value: any, maxLength = 5000) {
  return JSON.stringify(sanitizeLowRiskPayload(value ?? null)).slice(0, maxLength);
}

function candidate(collectionId: LowRiskBackfillCollection, accountId: string, fallbackPath: string, row: any, data: Record<string, any>, dedupeKey: string): BackfillCandidate | null {
  if (!accountId) return null;
  const originalId = cleanString(row?.id, 200);
  const documentId = buildBackfillDocumentId(collectionId, accountId, row, dedupeKey);
  return { collectionId, accountId, fallbackPath, originalId, documentId, dedupeKey, data };
}

function apiRequestLog(accountId: string, row: any) {
  return candidate(INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS, accountId, "integrationFoundation.apiRequestLogs", row, {
    accountId,
    keyId: cleanString(row?.keyId, 100),
    path: redactSensitiveText(row?.path, 220),
    method: redactSensitiveText(row?.method, 16),
    status: numeric(row?.status),
    reason: redactSensitiveText(row?.reason, 140),
    createdAt: numeric(row?.createdAt),
  }, cleanString(row?.id || `${row?.keyId || ""}:${row?.path || ""}:${row?.createdAt || ""}`, 300));
}

function webhookEvent(accountId: string, row: any) {
  return candidate(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS, accountId, "integrationFoundation.webhookEvents", row, {
    accountId,
    type: cleanString(row?.type, 80),
    dataJson: safeJsonString(row?.data || {}, 10000),
    createdAt: numeric(row?.createdAt),
  }, cleanString(row?.id || `${row?.type || ""}:${row?.createdAt || ""}`, 300));
}

function webhookDelivery(accountId: string, row: any) {
  return candidate(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES, accountId, "integrationFoundation.webhookDeliveries", row, {
    accountId,
    endpointId: cleanString(row?.endpointId, 100),
    eventId: cleanString(row?.eventId, 100),
    eventType: cleanString(row?.eventType, 80),
    timestamp: numeric(row?.timestamp),
    attemptCount: numeric(row?.attemptCount || 1),
    httpStatus: numeric(row?.httpStatus),
    success: row?.success === true,
    error: redactSensitiveText(row?.error, 300),
    nextRetryAt: numeric(row?.nextRetryAt),
    createdAt: numeric(row?.createdAt),
  }, cleanString(row?.id || `${row?.endpointId || ""}:${row?.eventId || ""}:${row?.timestamp || ""}`, 300));
}

function syncJob(accountId: string, row: any) {
  return candidate(INTEGRATION_BETA_COLLECTIONS.INTEGRATION_SYNC_JOBS, accountId, "integrationFoundation.integrationSyncJobs", row, {
    accountId,
    provider: cleanString(row?.provider, 40),
    objectType: cleanString(row?.objectType, 40),
    status: cleanString(row?.status, 40),
    overwrite: row?.overwrite === true,
    requested: numeric(row?.requested),
    created: numeric(row?.created),
    updated: numeric(row?.updated),
    skipped: numeric(row?.skipped),
    errorsJson: safeJsonString(row?.errors || [], 5000),
    createdAt: numeric(row?.createdAt),
  }, cleanString(row?.id || `${row?.provider || ""}:${row?.objectType || ""}:${row?.createdAt || ""}`, 300));
}

function externalObjectLink(accountId: string, row: any) {
  const provider = cleanString(row?.provider, 40);
  const objectType = cleanString(row?.objectType, 40);
  const externalId = cleanString(row?.externalId, 180);
  const dedupeKey = [accountId, provider, objectType, externalId].join("|");
  return candidate(INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS, accountId, "integrationFoundation.externalObjectLinks", row, {
    accountId,
    provider,
    objectType,
    externalId,
    blackarrowId: cleanString(row?.blackarrowId, 180),
    sku: cleanString(row?.sku, 140),
    syncMode: cleanString(row?.syncMode, 60),
    lastSyncedAt: numeric(row?.lastSyncedAt),
  }, dedupeKey);
}

export function buildLowRiskBackfillCandidates(accountId: string, integrationFoundation: any = {}) {
  const rows: Array<BackfillCandidate | null> = [
    ...(Array.isArray(integrationFoundation.apiRequestLogs) ? integrationFoundation.apiRequestLogs.map((row: any) => apiRequestLog(accountId, row)) : []),
    ...(Array.isArray(integrationFoundation.webhookEvents) ? integrationFoundation.webhookEvents.map((row: any) => webhookEvent(accountId, row)) : []),
    ...(Array.isArray(integrationFoundation.webhookDeliveries) ? integrationFoundation.webhookDeliveries.map((row: any) => webhookDelivery(accountId, row)) : []),
    ...(Array.isArray(integrationFoundation.integrationSyncJobs) ? integrationFoundation.integrationSyncJobs.map((row: any) => syncJob(accountId, row)) : []),
    ...(Array.isArray(integrationFoundation.externalObjectLinks) ? integrationFoundation.externalObjectLinks.map((row: any) => externalObjectLink(accountId, row)) : []),
  ];
  return rows.filter(Boolean) as BackfillCandidate[];
}

function externalLinkKey(row: Record<string, any>) {
  return [row.accountId, row.provider, row.objectType, row.externalId].map((part) => cleanString(part, 180)).join("|");
}

export function planLowRiskBackfillOperations(candidates: BackfillCandidate[], existingRows: Record<string, ExistingBackfillRow[]> = {}) {
  const operations: BackfillOperation[] = [];
  const seenDocumentIds = new Set<string>();
  const seenExternalLinks = new Set<string>();
  let skippedRows = 0;
  let duplicateIds = 0;

  const existingByCollectionAndId = new Map<string, ExistingBackfillRow>();
  const existingExternalLinksByKey = new Map<string, ExistingBackfillRow>();
  for (const [collectionId, rows] of Object.entries(existingRows)) {
    for (const row of rows || []) {
      existingByCollectionAndId.set(`${collectionId}:${row.documentId}`, row);
      if (collectionId === INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS) {
        existingExternalLinksByKey.set(externalLinkKey(row.data), row);
      }
    }
  }

  for (const item of candidates) {
    const candidateKey = `${item.collectionId}:${item.documentId}`;
    if (seenDocumentIds.has(candidateKey)) {
      skippedRows += 1;
      duplicateIds += 1;
      continue;
    }
    seenDocumentIds.add(candidateKey);

    let documentId = item.documentId;
    if (item.collectionId === INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS) {
      const key = externalLinkKey(item.data);
      if (seenExternalLinks.has(key)) {
        skippedRows += 1;
        duplicateIds += 1;
        continue;
      }
      seenExternalLinks.add(key);
      const existingLink = existingExternalLinksByKey.get(key);
      if (existingLink?.documentId) documentId = existingLink.documentId;
    }

    const existing = existingByCollectionAndId.get(`${item.collectionId}:${documentId}`);
    operations.push({ ...item, documentId, action: existing ? "update" : "create" });
  }

  return { operations, skippedRows, duplicateIds };
}

export function maskForBackfillOutput(value: any) {
  return sanitizeLowRiskPayload(value);
}

export async function executeLowRiskBackfillOperations(operations: BackfillOperation[], writer: BackfillWriteAdapter, apply = false) {
  const result = {
    wouldCreateRows: 0,
    wouldUpdateRows: 0,
    createdRows: 0,
    updatedRows: 0,
    errors: 0,
  };

  for (const operation of operations) {
    if (operation.action === "create") result.wouldCreateRows += 1;
    else result.wouldUpdateRows += 1;

    if (!apply) continue;
    try {
      if (operation.action === "create") {
        await writer.create(operation.collectionId, operation.documentId, operation.data);
        result.createdRows += 1;
      } else {
        await writer.update(operation.collectionId, operation.documentId, operation.data);
        result.updatedRows += 1;
      }
    } catch {
      result.errors += 1;
    }
  }

  return result;
}
