import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generateWebhookSecretValue,
  hashIntegrationSecret,
  maskIntegrationSecret,
  publicLeadCaptureAuthStatus,
  verifyHmacSignature,
} from "./integration-auth-service.ts";
import { encryptServerSecret, decryptServerSecret } from "./secret-crypto-service.ts";

process.env.BLACKARROW_SECRET_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-abc";

test("WooCommerce HMAC webhook authentication with raw payload verification", () => {
  const secret = generateWebhookSecretValue();
  const encryptedSecret = encryptServerSecret(secret);
  const hash = hashIntegrationSecret(secret);

  const mockConfig = {
    webhookSecretHash: hash,
    encryptedWebhookSecret: encryptedSecret,
    maskedWebhookSecret: maskIntegrationSecret(secret),
    createdAt: 100,
    updatedAt: 100,
  };

  const status = publicLeadCaptureAuthStatus(mockConfig);
  assert.equal(status.configured, true);
  assert.equal(status.hasEncryptedSecret, true);
  assert.equal(status.needsRegenerationForHmac, false);

  // Decrypt secret
  const recoveredSecret = decryptServerSecret(mockConfig.encryptedWebhookSecret);
  assert.equal(recoveredSecret, secret);

  const rawPayload = Buffer.from(JSON.stringify({ id: 1001, status: "completed", customer_id: 42 }), "utf8");

  // Generate valid WooCommerce signature (base64)
  const validSignature = crypto.createHmac("sha256", recoveredSecret).update(rawPayload).digest("base64");

  // 1. Valid signature check
  const isValid = verifyHmacSignature({
    payload: rawPayload,
    secret: recoveredSecret,
    signature: validSignature,
    encoding: "base64",
  });
  assert.equal(isValid, true, "Valid WooCommerce HMAC signature passes");

  // 2. Tampered signature check
  const isInvalid = verifyHmacSignature({
    payload: rawPayload,
    secret: recoveredSecret,
    signature: "invalid-signature-base64",
    encoding: "base64",
  });
  assert.equal(isInvalid, false, "Tampered signature is rejected");

  // 3. Tampered raw body check
  const tamperedPayload = Buffer.from(JSON.stringify({ id: 1002, status: "completed", customer_id: 42 }), "utf8");
  const isBodyTampered = verifyHmacSignature({
    payload: tamperedPayload,
    secret: recoveredSecret,
    signature: validSignature,
    encoding: "base64",
  });
  assert.equal(isBodyTampered, false, "Tampered raw payload is rejected");

  // 4. Legacy config without encrypted secret reports needsRegenerationForHmac
  const legacyConfig = {
    webhookSecretHash: hash,
    maskedWebhookSecret: maskIntegrationSecret(secret),
    createdAt: 100,
    updatedAt: 100,
  };
  const legacyStatus = publicLeadCaptureAuthStatus(legacyConfig);
  assert.equal(legacyStatus.hasEncryptedSecret, false);
  assert.equal(legacyStatus.needsRegenerationForHmac, true);
});
