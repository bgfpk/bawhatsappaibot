import {
  cleanString,
  loadIntegrationStore,
  nowSeconds,
  prependLog,
  safeId,
  updateIntegrationStore,
} from "./integration-foundation-store.ts";

export type IntegrationEventStatus = "success" | "failed" | "skipped" | "duplicate";

export type IntegrationEventLogInput = {
  id?: string;
  provider?: string;
  source?: string;
  eventType?: string;
  status?: IntegrationEventStatus | string;
  reason?: string;
  idempotencyKey?: string;
  externalId?: string;
  leadId?: string;
  httpStatus?: number;
  metadata?: Record<string, any>;
  createdAt?: number;
};

const SAFE_METADATA_KEYS = [
  "name",
  "email",
  "phone",
  "source",
  "sourceUrl",
  "pageUrl",
  "orderId",
  "customerId",
  "externalId",
  "idempotencyKey",
  "eventType",
  "provider",
  "status",
  "reason",
];

export function normalizeIntegrationEventStatus(value: any): IntegrationEventStatus {
  const status = cleanString(value, 40).toLowerCase();
  if (["success", "failed", "skipped", "duplicate"].includes(status)) return status as IntegrationEventStatus;
  if (status === "error") return "failed";
  if (status === "skip") return "skipped";
  return "failed";
}

export function sanitizeIntegrationEventMetadata(metadata: any = {}) {
  const output: Record<string, any> = {};
  for (const key of SAFE_METADATA_KEYS) {
    if (metadata?.[key] === undefined || metadata?.[key] === null || metadata?.[key] === "") continue;
    const value = metadata[key];
    if (/secret|token|key|password/i.test(key)) continue;
    if (typeof value === "string") output[key] = cleanString(value, key === "sourceUrl" || key === "pageUrl" ? 240 : 120);
    else if (typeof value === "number" || typeof value === "boolean") output[key] = value;
  }
  return output;
}

export function publicIntegrationEventLog(input: IntegrationEventLogInput = {}) {
  return {
    id: cleanString(input.id, 120) || safeId("int_evt"),
    provider: cleanString(input.provider || input.source || "website_api", 80),
    source: cleanString(input.source || input.provider || "website_api", 80),
    eventType: cleanString(input.eventType || "lead.capture", 100),
    status: normalizeIntegrationEventStatus(input.status || "failed"),
    reason: cleanString(input.reason, 180),
    idempotencyKey: cleanString(input.idempotencyKey, 160),
    externalId: cleanString(input.externalId, 160),
    leadId: cleanString(input.leadId, 120),
    httpStatus: Number(input.httpStatus || 0),
    metadata: sanitizeIntegrationEventMetadata(input.metadata || {}),
    createdAt: Number(input.createdAt || nowSeconds()),
  };
}

export function summarizeIntegrationEvents(events: any[] = []) {
  const rows = (Array.isArray(events) ? events : []).map(publicIntegrationEventLog);
  const lastSuccess = rows.find((event) => event.status === "success") || null;
  const lastFailure = rows.find((event) => event.status === "failed") || null;
  const counts = rows.reduce((acc, event) => {
    acc[event.status] = Number(acc[event.status] || 0) + 1;
    acc.total = Number(acc.total || 0) + 1;
    return acc;
  }, { total: 0, success: 0, failed: 0, skipped: 0, duplicate: 0 } as Record<string, number>);
  return {
    recentCount: rows.length,
    counts,
    lastSuccess,
    lastFailure,
  };
}

export async function listIntegrationEvents(accountId: string) {
  const store = await loadIntegrationStore(accountId);
  return (store.integrationEvents || []).map(publicIntegrationEventLog);
}

export async function getIntegrationEventSummary(accountId: string) {
  return summarizeIntegrationEvents(await listIntegrationEvents(accountId));
}

export async function findIntegrationEventByIdempotencyKey(accountId: string, idempotencyKey: any) {
  const key = cleanString(idempotencyKey, 160);
  if (!key) return null;
  const events = await listIntegrationEvents(accountId);
  return events.find((event) => event.idempotencyKey === key && event.status === "success") || null;
}

export async function recordIntegrationEvent(accountId: string, input: IntegrationEventLogInput = {}) {
  const row = publicIntegrationEventLog(input);
  await updateIntegrationStore(accountId, (store) => ({
    ...store,
    integrationEvents: prependLog(store.integrationEvents, row, 120),
  }));
  return row;
}
