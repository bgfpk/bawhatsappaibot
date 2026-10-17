import crypto from "crypto";
import * as dbService from "./db-service.ts";
import { authenticatePublicApiKey } from "./public-api-key-service.ts";
import {
  cleanString,
  loadIntegrationStore,
  nowSeconds,
  updateIntegrationStore,
  withoutSecrets,
} from "./integration-foundation-store.ts";

const WEBHOOK_SECRET_PREFIX = "bai_whsec";

export function generateIntegrationApiKeyValue(prefix = "bai_live") {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

export function generateWebhookSecretValue(prefix = WEBHOOK_SECRET_PREFIX) {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

export function hashIntegrationSecret(value: any) {
  const text = cleanString(value, 500);
  return text ? crypto.createHash("sha256").update(text).digest("hex") : "";
}

export function maskIntegrationSecret(value: any) {
  const text = cleanString(value, 500);
  if (!text) return "";
  if (text.length <= 12) return `${text.slice(0, 3)}••••${text.slice(-2)}`;
  return `${text.slice(0, 10)}••••${text.slice(-4)}`;
}

export function verifyIntegrationSecret(rawSecret: any, expectedHash: any) {
  const raw = hashIntegrationSecret(rawSecret);
  const expected = cleanString(expectedHash, 100);
  if (!raw || !expected || raw.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(raw), Buffer.from(expected));
}

function normalizeSignature(value: any) {
  return cleanString(value, 300).replace(/^sha256=/i, "").replace(/^v1=/i, "");
}

function timingSafeTextEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function verifyHmacSignature(input: {
  payload?: string | Buffer;
  secret?: string;
  signature?: string;
  encoding?: "hex" | "base64" | "auto";
}) {
  const payload = typeof input.payload === "string" || Buffer.isBuffer(input.payload) ? input.payload : "";
  const secret = cleanString(input.secret, 500);
  const signature = normalizeSignature(input.signature);
  if (!payload || !secret || !signature) return false;

  const hex = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const base64 = crypto.createHmac("sha256", secret).update(payload).digest("base64");
  const encoding = input.encoding || "auto";
  if (encoding === "hex") return timingSafeTextEqual(signature, hex);
  if (encoding === "base64") return timingSafeTextEqual(signature, base64);
  return timingSafeTextEqual(signature, hex) || timingSafeTextEqual(signature, base64);
}

import { decryptServerSecret, encryptServerSecret } from "./secret-crypto-service.ts";

export function publicLeadCaptureAuthStatus(config: any = {}) {
  const hasEncryptedSecret = Boolean(config?.encryptedWebhookSecret);
  const hasLegacyHashOnly = Boolean(config?.webhookSecretHash) && !hasEncryptedSecret;
  return withoutSecrets({
    configured: Boolean(config?.webhookSecretHash),
    hasEncryptedSecret,
    needsRegenerationForHmac: hasLegacyHashOnly,
    maskedWebhookSecret: cleanString(config?.maskedWebhookSecret || config?.maskedSecret, 80),
    createdAt: Number(config?.createdAt || 0),
    updatedAt: Number(config?.updatedAt || 0),
    lastUsedAt: Number(config?.lastUsedAt || 0),
  });
}

export async function getLeadCaptureAuthStatus(userId: string) {
  const store = await loadIntegrationStore(userId);
  return publicLeadCaptureAuthStatus(store.leadCapture || {});
}

export async function regenerateLeadCaptureWebhookSecret(userId: string) {
  const secret = generateWebhookSecretValue();
  const now = nowSeconds();
  const config = {
    webhookSecretHash: hashIntegrationSecret(secret),
    encryptedWebhookSecret: encryptServerSecret(secret),
    maskedWebhookSecret: maskIntegrationSecret(secret),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: 0,
  };
  await updateIntegrationStore(userId, (store) => ({
    ...store,
    leadCapture: {
      ...(store.leadCapture || {}),
      ...config,
    },
  }));
  return { secret, status: publicLeadCaptureAuthStatus(config) };
}

export async function authenticateIntegrationApiKey(rawHeader: any, requiredScope: string | string[] = "write:leads", path = "/api/integrations/leads", method = "POST") {
  return authenticatePublicApiKey(rawHeader, requiredScope, path, method);
}

export async function authenticateLeadCaptureWebhookSecret(rawSecret: any) {
  const secret = cleanString(rawSecret, 500);
  if (!secret) return null;
  const users = await dbService.listUsers();
  for (const user of users as any[]) {
    const userId = String(user?.$id || user?.id || "");
    if (!userId) continue;
    const store = await loadIntegrationStore(userId).catch(() => ({} as any));
    const config = store.leadCapture || {};
    if (!verifyIntegrationSecret(secret, config.webhookSecretHash)) continue;
    await updateIntegrationStore(userId, (current) => ({
      ...current,
      leadCapture: {
        ...(current.leadCapture || {}),
        lastUsedAt: nowSeconds(),
      },
    })).catch(() => {});
    return { userId, user, status: publicLeadCaptureAuthStatus({ ...config, lastUsedAt: nowSeconds() }) };
  }
  return null;
}

export async function authenticateLeadCaptureHmacSignature(payload: string | Buffer, signature: any, encoding: "hex" | "base64" | "auto" = "base64") {
  const sig = cleanString(signature, 500);
  if (!sig) return null;
  const users = await dbService.listUsers();
  for (const user of users as any[]) {
    const userId = String(user?.$id || user?.id || "");
    if (!userId) continue;
    const store = await loadIntegrationStore(userId).catch(() => ({} as any));
    const config = store.leadCapture || {};
    if (!config.encryptedWebhookSecret) continue;
    const decryptedSecret = decryptServerSecret(config.encryptedWebhookSecret);
    if (!decryptedSecret) continue;

    const isValid = verifyHmacSignature({
      payload,
      secret: decryptedSecret,
      signature: sig,
      encoding,
    });
    if (!isValid) continue;

    await updateIntegrationStore(userId, (current) => ({
      ...current,
      leadCapture: {
        ...(current.leadCapture || {}),
        lastUsedAt: nowSeconds(),
      },
    })).catch(() => {});
    return { userId, user, status: publicLeadCaptureAuthStatus({ ...config, lastUsedAt: nowSeconds() }) };
  }
  return null;
}

export const __integrationAuthTestUtils = {
  normalizeSignature,
  timingSafeTextEqual,
};
