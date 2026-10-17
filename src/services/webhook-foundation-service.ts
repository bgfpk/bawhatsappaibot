import crypto from "crypto";
import { decryptServerSecret, encryptServerSecret, maskSecret } from "./secret-crypto-service.ts";
import {
  cleanString,
  loadIntegrationStore,
  nowSeconds,
  prependLog,
  safeId,
  updateIntegrationStore,
  withoutSecrets,
} from "./integration-foundation-store.ts";
import { assertSafeExternalServiceUrl, validateExternalServiceUrl } from "./outbound-url-safety-service.ts";
import { INTEGRATION_BETA_COLLECTIONS } from "./integration-beta-collections.ts";
import { listBetaCollectionRows, mergeRowsById, parseJsonString, safeJsonString, writeBetaCollectionRow } from "./integration-beta-collection-store.ts";

export const WEBHOOK_EVENT_TYPES = [
  "customer.created",
  "customer.updated",
  "lead.created",
  "lead.updated",
  "order.created",
  "order.updated",
  "message.received",
  "message.sent",
  "ai.reply.sent",
  "ai.summary.updated",
  "followup.created",
  "followup.completed",
  "customer_update.sent",
  "broadcast.sent",
  "message.requested",
  "message.queued",
  "message.sent",
  "message.failed",
  "message.skipped",
  "message.cancelled",
  "campaign.run.created",
  "campaign.run.completed",
  "instance.connected",
  "instance.disconnected",
  "bot.paused",
  "bot.resumed",
  "wallet.low",
  "usage.charged",
  "test.ping",
] as const;

function normalizeEvents(events: any) {
  const requested = Array.isArray(events) ? events : ["test.ping"];
  return Array.from(new Set(requested.map((event) => cleanString(event, 80)).filter((event) => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(event))));
}

export function validateWebhookUrl(value: any) {
  const url = validateExternalServiceUrl(value, { label: "Webhook", requireHttps: true, allowLocalDevelopment: true, maxLength: 500 });
  return url.toString();
}

function generateSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

export function signWebhookPayload(secret: string, payload: string, timestamp: number) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

function publicEndpoint(endpoint: any) {
  return withoutSecrets({
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    events: endpoint.events || [],
    enabled: endpoint.enabled !== false,
    status: endpoint.status || "active",
    maskedSecret: endpoint.maskedSecret || "****",
    createdAt: endpoint.createdAt || 0,
    updatedAt: endpoint.updatedAt || 0,
    lastDeliveryAt: endpoint.lastDeliveryAt || 0,
    lastStatus: endpoint.lastStatus || "",
    lastError: endpoint.lastError || "",
  }, ["encryptedSecret"]);
}

export async function listWebhookEndpoints(userId: string) {
  const store = await loadIntegrationStore(userId);
  return (store.webhookEndpoints || []).map(publicEndpoint);
}

export async function createWebhookEndpoint(userId: string, input: any = {}) {
  const secret = generateSecret();
  const events = normalizeEvents(input.events);
  if (events.length === 0) events.push("test.ping");
  const safeUrl = await assertSafeExternalServiceUrl(input.url, { label: "Webhook", requireHttps: true, allowLocalDevelopment: true, maxLength: 500 });
  const endpoint = {
    id: safeId("wh"),
    name: cleanString(input.name || "Webhook endpoint", 80),
    url: safeUrl.toString(),
    events,
    enabled: input.enabled === undefined ? true : input.enabled !== false,
    encryptedSecret: encryptServerSecret(secret),
    maskedSecret: maskSecret(secret),
    status: "active",
    createdAt: nowSeconds(),
    updatedAt: nowSeconds(),
  };
  await updateIntegrationStore(userId, (store) => ({
    ...store,
    webhookEndpoints: [endpoint, ...(store.webhookEndpoints || [])].slice(0, 30),
  }));
  return { endpoint: publicEndpoint(endpoint), secret };
}

export async function updateWebhookEndpoint(userId: string, endpointId: string, input: any = {}) {
  let found: any = null;
  const safeUrl = input.url !== undefined
    ? (await assertSafeExternalServiceUrl(input.url, { label: "Webhook", requireHttps: true, allowLocalDevelopment: true, maxLength: 500 })).toString()
    : "";
  await updateIntegrationStore(userId, (store) => ({
    ...store,
    webhookEndpoints: (store.webhookEndpoints || []).map((endpoint) => {
      if (endpoint.id !== endpointId) return endpoint;
      found = {
        ...endpoint,
        ...(input.url !== undefined ? { url: safeUrl } : {}),
        ...(input.name !== undefined ? { name: cleanString(input.name, 80) } : {}),
        ...(input.events !== undefined ? { events: normalizeEvents(input.events) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled !== false } : {}),
        updatedAt: nowSeconds(),
      };
      return found;
    }),
  }));
  if (!found) throw new Error("Webhook endpoint not found.");
  return publicEndpoint(found);
}

export async function deleteWebhookEndpoint(userId: string, endpointId: string) {
  await updateIntegrationStore(userId, (store) => ({
    ...store,
    webhookEndpoints: (store.webhookEndpoints || []).filter((endpoint) => endpoint.id !== endpointId),
  }));
  return { success: true };
}

export async function regenerateWebhookSecret(userId: string, endpointId: string) {
  const secret = generateSecret();
  let found: any = null;
  await updateIntegrationStore(userId, (store) => ({
    ...store,
    webhookEndpoints: (store.webhookEndpoints || []).map((endpoint) => {
      if (endpoint.id !== endpointId) return endpoint;
      found = {
        ...endpoint,
        encryptedSecret: encryptServerSecret(secret),
        maskedSecret: maskSecret(secret),
        updatedAt: nowSeconds(),
      };
      return found;
    }),
  }));
  if (!found) throw new Error("Webhook endpoint not found.");
  return { endpoint: publicEndpoint(found), secret };
}

async function writeWebhookEventRow(userId: string, event: any) {
  const row = {
    id: event.id,
    accountId: userId,
    type: cleanString(event.type, 80),
    dataJson: safeJsonString(event.data || {}, 10000),
    createdAt: Number(event.createdAt || nowSeconds()),
  };
  return writeBetaCollectionRow(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS, row);
}

async function writeWebhookDeliveryRow(userId: string, delivery: any) {
  const row = {
    id: delivery.id,
    accountId: userId,
    endpointId: cleanString(delivery.endpointId, 100),
    eventId: cleanString(delivery.eventId, 100),
    eventType: cleanString(delivery.eventType, 80),
    timestamp: Number(delivery.timestamp || 0),
    attemptCount: Number(delivery.attemptCount || 1),
    httpStatus: Number(delivery.httpStatus || 0),
    success: delivery.success === true,
    error: cleanString(delivery.error, 300),
    nextRetryAt: Number(delivery.nextRetryAt || 0),
    createdAt: Number(delivery.createdAt || nowSeconds()),
  };
  return writeBetaCollectionRow(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES, row);
}

function publicWebhookEventRow(row: any) {
  return { id: row.id, type: row.type, accountId: row.accountId, createdAt: row.createdAt, data: parseJsonString(row.dataJson, {}) };
}

export async function sendWebhookTestEvent(userId: string, endpointId: string) {
  const store = await loadIntegrationStore(userId);
  const endpoint = (store.webhookEndpoints || []).find((item) => item.id === endpointId);
  if (!endpoint) throw new Error("Webhook endpoint not found.");
  if (endpoint.enabled === false) throw new Error("Webhook endpoint is disabled.");
  const event = {
    id: safeId("evt"),
    type: "test.ping",
    accountId: userId,
    createdAt: nowSeconds(),
    data: {
      message: "BlackArrow webhook test event",
    },
  };
  const payload = JSON.stringify(event);
  const timestamp = nowSeconds();
  const secret = decryptServerSecret(endpoint.encryptedSecret);
  const signature = signWebhookPayload(secret, payload, timestamp);
  const delivery = {
    id: safeId("del"),
    endpointId,
    eventId: event.id,
    eventType: event.type,
    timestamp,
    attemptCount: 1,
    httpStatus: 0,
    success: false,
    error: "",
    nextRetryAt: 0,
    createdAt: timestamp,
  };
  try {
    await assertSafeExternalServiceUrl(endpoint.url, { label: "Webhook", requireHttps: true, allowLocalDevelopment: true, maxLength: 500 });
    const res = await fetch(endpoint.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BlackArrow-Webhooks/1.0",
        "X-BlackArrow-Event": event.type,
        "X-BlackArrow-Event-Id": event.id,
        "X-BlackArrow-Timestamp": String(timestamp),
        "X-BlackArrow-Signature": `v1=${signature}`,
      },
      body: payload,
    });
    delivery.httpStatus = res.status;
    delivery.success = res.ok;
    if (!res.ok) delivery.error = `HTTP ${res.status}`;
  } catch (error: any) {
    delivery.error = cleanString(error?.message || "Webhook delivery failed.", 300);
  }
  const eventWrite = await writeWebhookEventRow(userId, event).catch(() => ({ available: false }));
  const deliveryWrite = await writeWebhookDeliveryRow(userId, delivery).catch(() => ({ available: false }));
  await updateIntegrationStore(userId, (current) => ({
    ...current,
    webhookEvents: eventWrite.available ? current.webhookEvents : prependLog(current.webhookEvents, event, 80),
    webhookDeliveries: deliveryWrite.available ? current.webhookDeliveries : prependLog(current.webhookDeliveries, delivery, 120),
    webhookEndpoints: (current.webhookEndpoints || []).map((item) => item.id === endpointId ? {
      ...item,
      lastDeliveryAt: nowSeconds(),
      lastStatus: delivery.success ? "success" : "failed",
      lastError: delivery.error,
    } : item),
  }));
  return delivery;
}

function safeWebhookPayloadData(data: any = {}) {
  const output: any = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (/secret|token|key|password/i.test(key)) continue;
    if (typeof value === "string") output[key] = cleanString(value, 500);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) output[key] = value;
    else if (Array.isArray(value)) output[key] = value.slice(0, 20);
    else if (value && typeof value === "object") output[key] = JSON.stringify(value).slice(0, 2000);
  }
  return output;
}

export async function dispatchWebhookEvent(userId: string, eventType: string, data: any = {}) {
  if (!(WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventType)) return [];
  const store = await loadIntegrationStore(userId);
  const endpoints = (store.webhookEndpoints || []).filter((endpoint) =>
    endpoint.enabled !== false && Array.isArray(endpoint.events) && endpoint.events.includes(eventType)
  );
  if (endpoints.length === 0) return [];
  const event = {
    id: safeId("evt"),
    type: eventType,
    accountId: userId,
    createdAt: nowSeconds(),
    data: safeWebhookPayloadData(data),
  };
  const payload = JSON.stringify(event);
  const deliveries: any[] = [];
  for (const endpoint of endpoints) {
    const timestamp = nowSeconds();
    const signature = signWebhookPayload(decryptServerSecret(endpoint.encryptedSecret), payload, timestamp);
    const delivery = {
      id: safeId("del"),
      endpointId: endpoint.id,
      eventId: event.id,
      eventType,
      timestamp,
      attemptCount: 1,
      httpStatus: 0,
      success: false,
      error: "",
      nextRetryAt: 0,
      createdAt: timestamp,
    };
    try {
      await assertSafeExternalServiceUrl(endpoint.url, { label: "Webhook", requireHttps: true, allowLocalDevelopment: true, maxLength: 500 });
      const res = await fetch(endpoint.url, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BlackArrow-Webhooks/1.0",
          "X-BlackArrow-Event": eventType,
          "X-BlackArrow-Event-Id": event.id,
          "X-BlackArrow-Timestamp": String(timestamp),
          "X-BlackArrow-Signature": `v1=${signature}`,
        },
        body: payload,
      });
      delivery.httpStatus = res.status;
      delivery.success = res.ok;
      if (!res.ok) delivery.error = `HTTP ${res.status}`;
    } catch (error: any) {
      delivery.error = cleanString(error?.message || "Webhook delivery failed.", 300);
    }
    deliveries.push(delivery);
  }
  const eventWrite = await writeWebhookEventRow(userId, event).catch(() => ({ available: false }));
  const deliveryWrites = await Promise.all(deliveries.map((delivery) => writeWebhookDeliveryRow(userId, delivery).catch(() => ({ available: false }))));
  const allDeliveriesWritten = deliveryWrites.every((result) => result.available);
  await updateIntegrationStore(userId, (current) => ({
    ...current,
    webhookEvents: eventWrite.available ? current.webhookEvents : prependLog(current.webhookEvents, event, 80),
    webhookDeliveries: allDeliveriesWritten ? current.webhookDeliveries : [...deliveries, ...(current.webhookDeliveries || [])].slice(0, 120),
    webhookEndpoints: (current.webhookEndpoints || []).map((endpoint) => {
      const delivery = deliveries.find((item) => item.endpointId === endpoint.id);
      return delivery ? {
        ...endpoint,
        lastDeliveryAt: nowSeconds(),
        lastStatus: delivery.success ? "success" : "failed",
        lastError: delivery.error,
      } : endpoint;
    }),
  }));
  return deliveries;
}

export async function listWebhookDeliveries(userId: string) {
  const store = await loadIntegrationStore(userId);
  const collection = await listBetaCollectionRows(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES, userId, { limit: 200, orderDesc: "createdAt" });
  return mergeRowsById(collection.rows, store.webhookDeliveries || []).slice(0, 200);
}

export async function listWebhookEventLogs(userId: string) {
  const store = await loadIntegrationStore(userId);
  const collection = await listBetaCollectionRows(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS, userId, { limit: 200, orderDesc: "createdAt" });
  return mergeRowsById(collection.rows.map(publicWebhookEventRow), store.webhookEvents || []).slice(0, 200);
}
