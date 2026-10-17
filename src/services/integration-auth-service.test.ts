import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  generateIntegrationApiKeyValue,
  generateWebhookSecretValue,
  hashIntegrationSecret,
  maskIntegrationSecret,
  publicLeadCaptureAuthStatus,
  verifyHmacSignature,
  verifyIntegrationSecret,
} from "./integration-auth-service.ts";

test("integration auth generates recognizable API keys and webhook secrets", () => {
  assert.match(generateIntegrationApiKeyValue(), /^bai_live_/);
  assert.match(generateWebhookSecretValue(), /^bai_whsec_/);
});

test("integration auth hashes, verifies, and masks secrets safely", () => {
  const secret = "bai_whsec_test_123456789";
  const hash = hashIntegrationSecret(secret);

  assert.equal(verifyIntegrationSecret(secret, hash), true);
  assert.equal(verifyIntegrationSecret("wrong", hash), false);
  assert.equal(maskIntegrationSecret(secret), "bai_whsec_••••6789");
});

test("integration auth verifies hex and base64 HMAC signatures", () => {
  const secret = "bai_whsec_test";
  const payload = JSON.stringify({ id: 123, event: "order.created" });
  const hex = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const base64 = crypto.createHmac("sha256", secret).update(payload).digest("base64");

  assert.equal(verifyHmacSignature({ payload, secret, signature: `sha256=${hex}` }), true);
  assert.equal(verifyHmacSignature({ payload, secret, signature: base64 }), true);
  assert.equal(verifyHmacSignature({ payload, secret, signature: "bad" }), false);
});

test("publicLeadCaptureAuthStatus never exposes hashes", () => {
  const status: ReturnType<typeof publicLeadCaptureAuthStatus> & { webhookSecretHash?: string } = publicLeadCaptureAuthStatus({
    webhookSecretHash: "abc",
    maskedWebhookSecret: "bai_whsec_••••abcd",
    createdAt: 10,
    updatedAt: 20,
  });

  assert.deepEqual(status, {
    configured: true,
    hasEncryptedSecret: false,
    needsRegenerationForHmac: true,
    maskedWebhookSecret: "bai_whsec_••••abcd",
    createdAt: 10,
    updatedAt: 20,
    lastUsedAt: 0,
  });
  assert.equal(status.webhookSecretHash, undefined);
});
