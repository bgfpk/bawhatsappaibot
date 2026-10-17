export const INTEGRATION_BETA_COLLECTIONS = {
  INTEGRATION_CONNECTIONS: "integration_connections",
  INTEGRATION_SYNC_JOBS: "integration_sync_jobs",
  EXTERNAL_OBJECT_LINKS: "external_object_links",
  API_KEYS: "api_keys",
  API_REQUEST_LOGS: "api_request_logs",
  WEBHOOK_ENDPOINTS: "webhook_endpoints",
  WEBHOOK_EVENTS: "webhook_events",
  WEBHOOK_DELIVERIES: "webhook_deliveries",
  SAVED_RECIPIENT_LISTS: "saved_recipient_lists",
  SAVED_RECIPIENT_LIST_MEMBERS: "saved_recipient_list_members",
  CUSTOMER_UPDATE_CAMPAIGNS: "customer_update_campaigns",
  SCHEDULED_UPDATE_RUNS: "scheduled_update_runs",
  SCHEDULED_UPDATE_RECIPIENT_JOBS: "scheduled_update_recipient_jobs",
  API_MESSAGE_REQUESTS: "api_message_requests",
  MESSAGE_DELIVERY_EVENTS: "message_delivery_events",
} as const;

type AttributeDefinition = {
  key: string;
  type: "string" | "integer" | "boolean";
  size?: number;
  required?: boolean;
  default?: string | number | boolean;
};

type IndexDefinition = {
  key: string;
  type: "key" | "unique" | "fulltext";
  attributes: string[];
  orders?: Array<"ASC" | "DESC">;
};

export type BetaCollectionDefinition = {
  id: string;
  name: string;
  attributes: AttributeDefinition[];
  indexes: IndexDefinition[];
};

const accountId = { key: "accountId", type: "string" as const, size: 80, required: true };
const idField = (key: string, size = 100): AttributeDefinition => ({ key, type: "string", size, required: false, default: "" });
const status = { key: "status", type: "string" as const, size: 40, required: false, default: "" };
const createdAt = { key: "createdAt", type: "integer" as const, required: false, default: 0 };
const updatedAt = { key: "updatedAt", type: "integer" as const, required: false, default: 0 };
const metadataJson = (key: string, size = 5000): AttributeDefinition => ({ key, type: "string", size, required: false, default: "" });

export const INTEGRATION_BETA_COLLECTION_DEFINITIONS: BetaCollectionDefinition[] = [
  {
    id: INTEGRATION_BETA_COLLECTIONS.INTEGRATION_CONNECTIONS,
    name: "Integration Connections",
    attributes: [
      accountId,
      idField("provider", 40),
      idField("storeUrl", 300),
      idField("encryptedConsumerKey", 2000),
      idField("encryptedConsumerSecret", 2000),
      idField("maskedConsumerKey", 80),
      { key: "enabled", type: "boolean", required: false, default: false },
      status,
      idField("lastError", 300),
      { key: "lastTestAt", type: "integer", required: false, default: 0 },
      { key: "lastSyncAt", type: "integer", required: false, default: 0 },
      { key: "removedAt", type: "integer", required: false, default: 0 },
      createdAt,
      updatedAt,
    ],
    indexes: [
      { key: "account_provider", type: "key", attributes: ["accountId", "provider"] },
      { key: "account_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.INTEGRATION_SYNC_JOBS,
    name: "Integration Sync Jobs",
    attributes: [
      accountId,
      idField("provider", 40),
      idField("objectType", 40),
      status,
      { key: "overwrite", type: "boolean", required: false, default: false },
      { key: "requested", type: "integer", required: false, default: 0 },
      { key: "created", type: "integer", required: false, default: 0 },
      { key: "updated", type: "integer", required: false, default: 0 },
      { key: "skipped", type: "integer", required: false, default: 0 },
      metadataJson("errorsJson", 5000),
      createdAt,
    ],
    indexes: [
      { key: "account_created", type: "key", attributes: ["accountId", "createdAt"], orders: ["ASC", "DESC"] },
      { key: "account_provider", type: "key", attributes: ["accountId", "provider"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS,
    name: "External Object Links",
    attributes: [
      accountId,
      idField("provider", 40),
      idField("objectType", 40),
      idField("externalId", 180),
      idField("blackarrowId", 180),
      idField("sku", 140),
      idField("syncMode", 60),
      { key: "lastSyncedAt", type: "integer", required: false, default: 0 },
    ],
    indexes: [
      { key: "account_external", type: "key", attributes: ["accountId", "provider", "objectType", "externalId"] },
      { key: "account_blackarrow", type: "key", attributes: ["accountId", "blackarrowId"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.API_KEYS,
    name: "API Keys",
    attributes: [accountId, idField("name", 80), idField("keyHash", 128), idField("maskedKey", 80), metadataJson("scopesJson", 1000), status, { key: "revokedAt", type: "integer", required: false, default: 0 }, { key: "lastUsedAt", type: "integer", required: false, default: 0 }, createdAt],
    indexes: [
      { key: "key_hash", type: "unique", attributes: ["keyHash"] },
      { key: "account_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS,
    name: "API Request Logs",
    attributes: [accountId, idField("keyId", 100), idField("path", 220), idField("method", 16), { key: "status", type: "integer", required: false, default: 0 }, idField("reason", 140), createdAt],
    indexes: [
      { key: "account_created", type: "key", attributes: ["accountId", "createdAt"], orders: ["ASC", "DESC"] },
      { key: "account_key", type: "key", attributes: ["accountId", "keyId"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.WEBHOOK_ENDPOINTS,
    name: "Webhook Endpoints",
    attributes: [accountId, idField("name", 80), idField("url", 500), metadataJson("eventsJson", 2000), { key: "enabled", type: "boolean", required: false, default: true }, idField("encryptedSecret", 2000), idField("maskedSecret", 80), status, idField("lastStatus", 40), idField("lastError", 300), { key: "lastDeliveryAt", type: "integer", required: false, default: 0 }, createdAt, updatedAt],
    indexes: [
      { key: "account_enabled", type: "key", attributes: ["accountId", "enabled"] },
      { key: "account_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS,
    name: "Webhook Events",
    attributes: [accountId, idField("type", 80), metadataJson("dataJson", 10000), createdAt],
    indexes: [
      { key: "account_created", type: "key", attributes: ["accountId", "createdAt"], orders: ["ASC", "DESC"] },
      { key: "account_type", type: "key", attributes: ["accountId", "type"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES,
    name: "Webhook Deliveries",
    attributes: [accountId, idField("endpointId"), idField("eventId"), idField("eventType", 80), { key: "timestamp", type: "integer", required: false, default: 0 }, { key: "attemptCount", type: "integer", required: false, default: 1 }, { key: "httpStatus", type: "integer", required: false, default: 0 }, { key: "success", type: "boolean", required: false, default: false }, idField("error", 300), { key: "nextRetryAt", type: "integer", required: false, default: 0 }, createdAt],
    indexes: [
      { key: "account_created", type: "key", attributes: ["accountId", "createdAt"], orders: ["ASC", "DESC"] },
      { key: "account_endpoint", type: "key", attributes: ["accountId", "endpointId"] },
      { key: "event_id", type: "key", attributes: ["eventId"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.SAVED_RECIPIENT_LISTS,
    name: "Saved Recipient Lists",
    attributes: [accountId, idField("name", 120), idField("description", 400), { key: "memberCount", type: "integer", required: false, default: 0 }, { key: "validCount", type: "integer", required: false, default: 0 }, { key: "invalidCount", type: "integer", required: false, default: 0 }, { key: "duplicateCount", type: "integer", required: false, default: 0 }, idField("createdBy", 40), createdAt, updatedAt],
    indexes: [{ key: "account_created", type: "key", attributes: ["accountId", "createdAt"], orders: ["ASC", "DESC"] }],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.SAVED_RECIPIENT_LIST_MEMBERS,
    name: "Saved Recipient List Members",
    attributes: [accountId, idField("listId"), idField("phoneRaw", 80), idField("normalizedPhone", 40), idField("jid", 120), idField("displayName", 120), status, idField("source", 40), createdAt, updatedAt],
    indexes: [
      { key: "account_list_status", type: "key", attributes: ["accountId", "listId", "status"] },
      { key: "account_list_phone", type: "key", attributes: ["accountId", "listId", "normalizedPhone"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.CUSTOMER_UPDATE_CAMPAIGNS,
    name: "Customer Update Campaigns",
    attributes: [accountId, idField("botId"), idField("botJid", 120), idField("listId"), { key: "messageText", type: "string", size: 1200, required: false, default: "" }, idField("repeatRule", 30), { key: "nextRunAt", type: "integer", required: false, default: 0 }, status, idField("createdBy", 40), idField("idempotencyKey", 180), { key: "sentCount", type: "integer", required: false, default: 0 }, { key: "failedCount", type: "integer", required: false, default: 0 }, { key: "skippedCount", type: "integer", required: false, default: 0 }, { key: "runCount", type: "integer", required: false, default: 0 }, createdAt, updatedAt],
    indexes: [
      { key: "account_status", type: "key", attributes: ["accountId", "status"] },
      { key: "account_next", type: "key", attributes: ["accountId", "nextRunAt"] },
      { key: "account_idempotency", type: "key", attributes: ["accountId", "idempotencyKey"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.SCHEDULED_UPDATE_RUNS,
    name: "Scheduled Update Runs",
    attributes: [accountId, idField("campaignId"), idField("listId"), idField("botId"), { key: "runAt", type: "integer", required: false, default: 0 }, status, { key: "totalCount", type: "integer", required: false, default: 0 }, { key: "queuedCount", type: "integer", required: false, default: 0 }, { key: "sentCount", type: "integer", required: false, default: 0 }, { key: "failedCount", type: "integer", required: false, default: 0 }, { key: "skippedCount", type: "integer", required: false, default: 0 }, createdAt, { key: "startedAt", type: "integer", required: false, default: 0 }, { key: "completedAt", type: "integer", required: false, default: 0 }],
    indexes: [
      { key: "account_run", type: "key", attributes: ["accountId", "runAt"] },
      { key: "account_campaign", type: "key", attributes: ["accountId", "campaignId"] },
      { key: "account_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.SCHEDULED_UPDATE_RECIPIENT_JOBS,
    name: "Scheduled Update Recipient Jobs",
    attributes: [accountId, idField("campaignId"), idField("runId"), idField("botId"), idField("listId"), idField("phoneRaw", 80), idField("normalizedPhone", 40), idField("jid", 120), { key: "messageText", type: "string", size: 1200, required: false, default: "" }, status, { key: "attemptCount", type: "integer", required: false, default: 0 }, idField("lastError", 300), idField("whatsAppMessageId", 160), idField("outboundReceiptId", 160), idField("billingDedupeKey", 180), idField("idempotencyKey", 220), idField("createdBy", 40), createdAt, updatedAt, { key: "sentAt", type: "integer", required: false, default: 0 }, { key: "failedAt", type: "integer", required: false, default: 0 }],
    indexes: [
      { key: "account_bot_status", type: "key", attributes: ["accountId", "botId", "status"] },
      { key: "account_run", type: "key", attributes: ["accountId", "runId"] },
      { key: "account_campaign", type: "key", attributes: ["accountId", "campaignId"] },
      { key: "account_idempotency", type: "key", attributes: ["accountId", "idempotencyKey"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.API_MESSAGE_REQUESTS,
    name: "API Message Requests",
    attributes: [accountId, idField("apiKeyId"), idField("botId"), idField("runId"), idField("jobId"), status, idField("idempotencyKey", 180), metadataJson("safePayloadSummaryJson", 2000), createdAt, updatedAt],
    indexes: [
      { key: "account_idempotency", type: "key", attributes: ["accountId", "idempotencyKey"] },
      { key: "account_api_key", type: "key", attributes: ["accountId", "apiKeyId"] },
      { key: "account_created", type: "key", attributes: ["accountId", "createdAt"], orders: ["ASC", "DESC"] },
    ],
  },
  {
    id: INTEGRATION_BETA_COLLECTIONS.MESSAGE_DELIVERY_EVENTS,
    name: "Message Delivery Events",
    attributes: [accountId, idField("runId"), idField("jobId"), idField("campaignId"), idField("messageId", 160), idField("eventType", 80), { key: "eventAt", type: "integer", required: false, default: 0 }, idField("source", 40), metadataJson("metadataJson", 3000)],
    indexes: [
      { key: "account_event", type: "key", attributes: ["accountId", "eventAt"], orders: ["ASC", "DESC"] },
      { key: "account_run", type: "key", attributes: ["accountId", "runId"] },
      { key: "account_job", type: "key", attributes: ["accountId", "jobId"] },
    ],
  },
];
