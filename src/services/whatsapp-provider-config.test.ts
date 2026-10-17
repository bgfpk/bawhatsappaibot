// src/services/whatsapp-provider-config.test.ts
import test from "node:test";
import assert from "node:assert";
import {
  normalizeWhatsAppProviderConfig,
  validateWhatsAppProviderConfig,
  summarizeProviderConfigForLogs,
  WhatsAppProviderConfig,
} from "./whatsapp-provider-config.ts";

test("missing providerType defaults to whatsapp_web", async () => {
  const cfg = normalizeWhatsAppProviderConfig({});
  assert.equal(cfg.providerType, "whatsapp_web");
});

test("invalid providerType defaults to whatsapp_web", async () => {
  const cfg = normalizeWhatsAppProviderConfig({ providerType: "invalid" as any });
  assert.equal(cfg.providerType, "whatsapp_web");
});

test("whatsapp_web config validates without official fields", async () => {
  const cfg: WhatsAppProviderConfig = { providerType: "whatsapp_web" };
  const errors = validateWhatsAppProviderConfig(cfg);
  assert.deepStrictEqual(errors, []);
});

test("whatsapp_cloud_api missing required fields returns errors", async () => {
  const cfg: WhatsAppProviderConfig = { providerType: "whatsapp_cloud_api" };
  const errors = validateWhatsAppProviderConfig(cfg);
  assert.ok(errors.includes("whatsapp_cloud_api requires phoneNumberId"));
  assert.ok(errors.includes("whatsapp_cloud_api requires encryptedAccessTokenRef"));
});

test("whatsapp_cloud_api with required fields validates", async () => {
  const cfg: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "enc_ref",
  };
  const errors = validateWhatsAppProviderConfig(cfg);
  assert.deepStrictEqual(errors, []);
});

test("log summary redacts token-like fields", async () => {
  const cfg: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "abc123def456ghi789",
    webhookVerifyToken: "secretToken123",
    providerLastError: "error with token abc123def456ghi789 and more details",
  };
  const summary = summarizeProviderConfigForLogs(cfg);
  assert.equal(summary.encryptedAccessTokenRef, "<redacted>");
  assert.equal(summary.webhookVerifyToken, "<redacted>");
  // Provider last error should be redacted and possibly truncated
  const err = summary.providerLastError as string;
  assert.ok(err.includes("<redacted>") || err.includes("error with token"));
});
