import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import http from "node:http";
import { registerIntegrationLeadCaptureRoutes } from "../routes/integration-lead-capture-routes.ts";
import { encryptServerSecret } from "./secret-crypto-service.ts";
import { hashIntegrationSecret, maskIntegrationSecret } from "./integration-auth-service.ts";
import * as dbService from "./db-service.ts";

process.env.BLACKARROW_SECRET_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-abc";

test("WooCommerce route level HMAC signature and payload integrity verification", async () => {
  const secret = "bai_whsec_test_secret_123456789";
  const userId = "usr_woo_test_999";

  const originalListDocuments = dbService.databases.listDocuments;
  const originalGetDocument = dbService.databases.getDocument;
  const originalUpdateDocument = dbService.databases.updateDocument;
  const originalCreateDocument = dbService.databases.createDocument;

  const mockUsers = [{ $id: userId, id: userId, email: "contact-88d93b8104b5@example.invalid" }];
  const mockIntegrationStore = {
    leadCapture: {
      webhookSecretHash: hashIntegrationSecret(secret),
      encryptedWebhookSecret: encryptServerSecret(secret),
      maskedWebhookSecret: maskIntegrationSecret(secret),
      createdAt: 1000,
      updatedAt: 1000,
    },
  };

  dbService.databases.listDocuments = (async (_dbId: string, collectionId: string) => {
    if (collectionId === dbService.COLLECTIONS.USERS) {
      return { documents: mockUsers, total: mockUsers.length };
    }
    return { documents: [], total: 0 };
  }) as any;

  dbService.databases.getDocument = (async () => {
    return { value: JSON.stringify({ integrationFoundation: mockIntegrationStore }) };
  }) as any;

  dbService.databases.updateDocument = (async () => ({})) as any;
  dbService.databases.createDocument = (async () => ({})) as any;

  const app = express();
  registerIntegrationLeadCaptureRoutes(app, {
    requireSessionAccount: async () => mockUsers[0],
    getStableUserId: (u) => u.$id,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}/api/integrations/woocommerce/webhook`;

  try {
    const rawPayload = JSON.stringify({
      id: 101,
      status: "processing",
      billing: { first_name: "Ali", phone: "15811061380" },
    });
    const validSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("base64");

    // 1. Valid raw body + signature -> success (202 Accepted)
    const resValid = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WC-Webhook-Signature": validSignature,
      },
      body: rawPayload,
    });
    assert.equal(resValid.status, 202, "Valid WooCommerce webhook returns 202 Accepted");

    // 2. Tampered body with same signature -> 401
    const tamperedPayload = JSON.stringify({
      id: 102,
      status: "processing",
      billing: { first_name: "Ali", phone: "15811061380" },
    });
    const resTamperedBody = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WC-Webhook-Signature": validSignature,
      },
      body: tamperedPayload,
    });
    assert.equal(resTamperedBody.status, 401, "Tampered payload body returns 401 Unauthorized");

    // 3. Wrong signature -> 401
    const resWrongSig = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WC-Webhook-Signature": "invalidBase64Signature==",
      },
      body: rawPayload,
    });
    assert.equal(resWrongSig.status, 401, "Invalid signature returns 401 Unauthorized");

    // 4. Missing signature -> 401
    const resMissingSig = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: rawPayload,
    });
    assert.equal(resMissingSig.status, 401, "Missing signature returns 401 Unauthorized");

    // 5. Query param secret bypass attempt -> still 401
    const resQueryBypass = await fetch(`${baseUrl}?secret=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: rawPayload,
    });
    assert.equal(resQueryBypass.status, 401, "Query param secret bypass is blocked and returns 401");

    // 6. Valid legacy custom-secret header (x-blackarrow-webhook-secret) without WC signature -> 401
    const resLegacyHeader = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-blackarrow-webhook-secret": secret,
      },
      body: rawPayload,
    });
    assert.equal(resLegacyHeader.status, 401, "Legacy custom secret header without WC signature returns 401");

    // 7. Duplicate idempotency delivery with valid signature -> 200 OK
    const duplicateDelivery = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WC-Webhook-Signature": validSignature,
        "X-WC-Webhook-ID": "webhook_event_101",
      },
      body: rawPayload,
    });
    assert.equal([200, 202].includes(duplicateDelivery.status), true, "Duplicate delivery is gracefully handled");
  } finally {
    server.close();
    dbService.databases.listDocuments = originalListDocuments;
    dbService.databases.getDocument = originalGetDocument;
    dbService.databases.updateDocument = originalUpdateDocument;
    dbService.databases.createDocument = originalCreateDocument;
  }
});
