import crypto from "crypto";
import * as dbService from "./db-service.ts";
import {
  cleanString,
  loadIntegrationStore,
  nowSeconds,
  prependLog,
  safeId,
  updateIntegrationStore,
} from "./integration-foundation-store.ts";
import { INTEGRATION_BETA_COLLECTIONS } from "./integration-beta-collections.ts";
import { listBetaCollectionRows, mergeRowsById, writeBetaCollectionRow } from "./integration-beta-collection-store.ts";

export const PUBLIC_API_SCOPES = [
  "read:account",
  "read:customers",
  "write:customers",
  "read:orders",
  "write:orders",
  "read:products",
  "write:products",
  "read:messages",
  "write:messages",
  "write:leads",
  "write:knowledge",
] as const;

const KEY_PREFIX = "bai_live";
export const PUBLIC_API_RATE_LIMITS = {
  READ_WINDOW_MS: 60 * 1000,
  READ_MAX: 120,
  SEND_WINDOW_MS: 60 * 1000,
  SEND_MAX: 20,
  INVALID_WINDOW_MS: 60 * 1000,
  INVALID_MAX: 30,
} as const;

const publicApiRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function hashKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function maskApiKey(key: any) {
  const text = cleanString(key, 200);
  if (!text) return "";
  return `${text.slice(0, 12)}...${text.slice(-4)}`;
}

function redactPublicLogText(value: any, maxLength = 220) {
  return cleanString(value, maxLength)
    .replace(/bai_live_[a-zA-Z0-9_-]+/g, "[redacted_api_key]")
    .replace(/whsec_[a-zA-Z0-9_-]+/g, "[redacted_webhook_secret]")
    .replace(/(consumer[_-]?(key|secret)=)[^&\s]+/gi, "$1[redacted]");
}

function normalizeScopes(scopes: any) {
  const requested = Array.isArray(scopes) ? scopes.map((scope) => cleanString(scope, 80)) : ["read:account"];
  return Array.from(new Set(requested.filter((scope) => (PUBLIC_API_SCOPES as readonly string[]).includes(scope))));
}

function publicKeyRecord(record: any) {
  return {
    id: record.id,
    name: record.name,
    maskedKey: record.maskedKey,
    scopes: record.scopes || [],
    status: record.status || "active",
    createdAt: record.createdAt || 0,
    revokedAt: record.revokedAt || 0,
    lastUsedAt: record.lastUsedAt || 0,
  };
}

export function hasRequiredApiScope(scopes: any, requiredScope: string | string[]) {
  const available = Array.isArray(scopes) ? scopes : [];
  const required = Array.isArray(requiredScope) ? requiredScope : [requiredScope];
  return required.some((scope) => available.includes(scope));
}

function applyPublicApiRateLimitBucket(bucketKey: string, max: number, windowMs: number) {
  const currentTime = Date.now();
  const bucket = publicApiRateLimitBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= currentTime) {
    publicApiRateLimitBuckets.set(bucketKey, { count: 1, resetAt: currentTime + windowMs });
    return { limited: false, retryAfterSeconds: Math.ceil(windowMs / 1000), remaining: max - 1 };
  }
  bucket.count += 1;
  publicApiRateLimitBuckets.set(bucketKey, bucket);
  return {
    limited: bucket.count > max,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
    remaining: Math.max(0, max - bucket.count),
  };
}

export async function checkPublicApiRateLimit(input: {
  accountId?: string;
  keyId?: string;
  ip?: string;
  path?: string;
  method?: string;
  kind?: "read" | "send" | "invalid";
}) {
  const kind = input.kind || "read";
  const config = kind === "send"
    ? { max: PUBLIC_API_RATE_LIMITS.SEND_MAX, windowMs: PUBLIC_API_RATE_LIMITS.SEND_WINDOW_MS }
    : kind === "invalid"
      ? { max: PUBLIC_API_RATE_LIMITS.INVALID_MAX, windowMs: PUBLIC_API_RATE_LIMITS.INVALID_WINDOW_MS }
      : { max: PUBLIC_API_RATE_LIMITS.READ_MAX, windowMs: PUBLIC_API_RATE_LIMITS.READ_WINDOW_MS };
  const ownerKey = input.keyId && input.accountId
    ? `key:${input.accountId}:${input.keyId}`
    : input.accountId
      ? `account:${input.accountId}`
      : `ip:${cleanString(input.ip || "unknown", 80)}`;
  const result = applyPublicApiRateLimitBucket(`public-api:${kind}:${ownerKey}`, config.max, config.windowMs);
  if (result.limited && input.accountId) {
    await recordApiRequestLog(input.accountId, {
      keyId: cleanString(input.keyId || "", 80),
      path: cleanString(input.path || "", 160),
      method: cleanString(input.method || "", 12),
      status: 429,
      reason: `rate_limited_${kind}`,
    }).catch(() => {});
  }
  return result;
}

export async function recordApiRequestLog(accountId: string, input: any) {
  const row = {
    id: input.id || safeId("api_log"),
    accountId,
    keyId: cleanString(input.keyId, 100),
    path: redactPublicLogText(input.path, 220),
    method: redactPublicLogText(input.method, 16),
    status: Number(input.status || 0),
    reason: redactPublicLogText(input.reason, 140),
    createdAt: Number(input.createdAt || nowSeconds()),
  };
  const collectionWrite = await writeBetaCollectionRow(INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS, row);
  if (collectionWrite.available) return row;
  await updateIntegrationStore(accountId, (store) => ({
    ...store,
    apiRequestLogs: prependLog(store.apiRequestLogs, row),
  }));
  return row;
}

export const __publicApiKeyTestUtils = {
  hashKey,
  maskApiKey,
  normalizeScopes,
  publicKeyRecord,
  hasRequiredApiScope,
  applyPublicApiRateLimitBucket,
  publicApiRateLimitBuckets,
  redactPublicLogText,
};

export function createRawApiKey() {
  return `${KEY_PREFIX}_${crypto.randomBytes(24).toString("base64url")}`;
}

export async function createApiKey(userId: string, input: any = {}) {
  const rawKey = createRawApiKey();
  const scopes = normalizeScopes(input.scopes);
  if (scopes.length === 0) scopes.push("read:account");
  const record = {
    id: safeId("key"),
    name: cleanString(input.name || "API key", 80),
    keyHash: hashKey(rawKey),
    maskedKey: maskApiKey(rawKey),
    scopes,
    status: "active",
    createdAt: nowSeconds(),
    lastUsedAt: 0,
  };
  await updateIntegrationStore(userId, (store) => ({
    ...store,
    apiKeys: [record, ...(store.apiKeys || [])].slice(0, 50),
  }));
  return { key: rawKey, record: publicKeyRecord(record) };
}

export async function listApiKeys(userId: string) {
  const store = await loadIntegrationStore(userId);
  return (store.apiKeys || []).map(publicKeyRecord);
}

export async function revokeApiKey(userId: string, keyId: string) {
  let revoked: any = null;
  await updateIntegrationStore(userId, (store) => {
    const apiKeys = (store.apiKeys || []).map((record) => {
      if (record.id !== keyId) return record;
      revoked = { ...record, status: "revoked", revokedAt: nowSeconds() };
      return revoked;
    });
    return { ...store, apiKeys };
  });
  if (!revoked) throw new Error("API key not found.");
  return publicKeyRecord(revoked);
}

async function findApiKeyInAccount(userId: string, rawKey: string) {
  const store = await loadIntegrationStore(userId);
  const keyHash = hashKey(rawKey);
  const record = (store.apiKeys || []).find((item) => item.keyHash === keyHash && item.status !== "revoked");
  return record ? { userId, record } : null;
}

export async function authenticatePublicApiKey(rawHeader: any, requiredScope: string | string[] = "read:account", path = "/api/public/v1/account/status", method = "GET") {
  const auth = cleanString(rawHeader, 300);
  const rawKey = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth;
  if (!rawKey.startsWith(`${KEY_PREFIX}_`)) return null;
  const users = await dbService.listUsers();
  for (const user of users as any[]) {
    const userId = String(user.$id || user.id || "");
    const match = await findApiKeyInAccount(userId, rawKey);
    if (!match) continue;
    const scopes = match.record.scopes || [];
    if (!hasRequiredApiScope(scopes, requiredScope)) return null;
    await updateIntegrationStore(userId, (store) => ({
      ...store,
      apiKeys: (store.apiKeys || []).map((record) => record.id === match.record.id ? { ...record, lastUsedAt: nowSeconds() } : record),
    }));
    await recordApiRequestLog(userId, { keyId: match.record.id, path, method, status: 200 }).catch(() => {});
    return { userId, key: publicKeyRecord(match.record), user };
  }
  return null;
}

export async function getPublicAccountStatus(userId: string) {
  const user = await dbService.getUser(userId) as any;
  const bots = await dbService.getBotsByUser(userId);
  const products = await dbService.listProducts(userId).catch(() => []);
  return {
    accountId: userId,
    email: user?.email || "",
    name: user?.name || "",
    role: user?.role || "user",
    counts: {
      instances: bots.length,
      products: products.length,
    },
  };
}

export async function listApiRequestLogs(userId: string) {
  const store = await loadIntegrationStore(userId);
  const collection = await listBetaCollectionRows(INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS, userId, { limit: 200, orderDesc: "createdAt" });
  return mergeRowsById(collection.rows, store.apiRequestLogs || []).slice(0, 200);
}
