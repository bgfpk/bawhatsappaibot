import * as dbService from "./db-service.ts";

export const INTEGRATION_FOUNDATION_COLLECTIONS = {
  INTEGRATION_CONNECTIONS: "integration_connections",
  INTEGRATION_SYNC_JOBS: "integration_sync_jobs",
  EXTERNAL_OBJECT_LINKS: "external_object_links",
  API_KEYS: "api_keys",
  API_REQUEST_LOGS: "api_request_logs",
  WEBHOOK_ENDPOINTS: "webhook_endpoints",
  WEBHOOK_EVENTS: "webhook_events",
  WEBHOOK_DELIVERIES: "webhook_deliveries",
} as const;

const STORE_KEY = "integrationFoundation";
const MAX_LOG_ROWS = 80;

export type IntegrationFoundationStore = {
  wooCommerce?: any;
  leadCapture?: any;
  integrationEvents?: any[];
  externalObjectLinks?: any[];
  integrationSyncJobs?: any[];
  apiKeys?: any[];
  apiRequestLogs?: any[];
  webhookEndpoints?: any[];
  webhookEvents?: any[];
  webhookDeliveries?: any[];
};

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function cleanString(value: any, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

export function safeId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export async function loadIntegrationStore(userId: string): Promise<IntegrationFoundationStore> {
  const store = await dbService.getUserExtraConfigValue(userId, STORE_KEY).catch(() => null);
  if (!store || typeof store !== "object") return {};
  return {
    wooCommerce: store.wooCommerce || {},
    leadCapture: store.leadCapture || {},
    integrationEvents: Array.isArray(store.integrationEvents) ? store.integrationEvents : [],
    externalObjectLinks: Array.isArray(store.externalObjectLinks) ? store.externalObjectLinks : [],
    integrationSyncJobs: Array.isArray(store.integrationSyncJobs) ? store.integrationSyncJobs : [],
    apiKeys: Array.isArray(store.apiKeys) ? store.apiKeys : [],
    apiRequestLogs: Array.isArray(store.apiRequestLogs) ? store.apiRequestLogs : [],
    webhookEndpoints: Array.isArray(store.webhookEndpoints) ? store.webhookEndpoints : [],
    webhookEvents: Array.isArray(store.webhookEvents) ? store.webhookEvents : [],
    webhookDeliveries: Array.isArray(store.webhookDeliveries) ? store.webhookDeliveries : [],
  };
}

export async function saveIntegrationStore(userId: string, nextStore: IntegrationFoundationStore) {
  await dbService.saveUserExtraConfigPatch(userId, { [STORE_KEY]: nextStore });
  return nextStore;
}

export async function updateIntegrationStore(userId: string, updater: (store: IntegrationFoundationStore) => IntegrationFoundationStore | Promise<IntegrationFoundationStore>) {
  const current = await loadIntegrationStore(userId);
  const next = await updater(current);
  return saveIntegrationStore(userId, next);
}

export function prependLog<T extends { createdAt?: number }>(rows: T[] | undefined, row: T, maxRows = MAX_LOG_ROWS) {
  return [row, ...(Array.isArray(rows) ? rows : [])].slice(0, maxRows);
}

export function withoutSecrets<T extends Record<string, any>>(value: T, secretKeys = ["encryptedConsumerKey", "encryptedConsumerSecret", "encryptedSecret", "secretHash", "webhookSecretHash", "apiKeyHash"]) {
  const output: any = { ...(value || {}) };
  for (const key of secretKeys) delete output[key];
  return output as T;
}
