// src/services/whatsapp-provider-config-storage.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { 
  readProviderConfigFromSettings, 
  mergeProviderConfigIntoSettings 
} from "./whatsapp-provider-config-storage.ts";
import { summarizeProviderConfigForLogs } from "./whatsapp-provider-config.ts";

test("missing config_settings defaults to whatsapp_web", () => {
  const config = readProviderConfigFromSettings(null);
  assert.equal(config.providerType, "whatsapp_web");

  const config2 = readProviderConfigFromSettings(undefined);
  assert.equal(config2.providerType, "whatsapp_web");
});

test("invalid JSON defaults to whatsapp_web", () => {
  const config = readProviderConfigFromSettings("{invalid json}");
  assert.equal(config.providerType, "whatsapp_web");
});

test("existing Baileys/Web settings remain unchanged", () => {
  const settings = {
    providerType: "whatsapp_web",
    prompt: "Default prompt",
  };
  const config = readProviderConfigFromSettings(settings);
  assert.equal(config.providerType, "whatsapp_web");
  assert.equal((config as any).prompt, undefined); // config read only extracts provider fields
});

test("Cloud API fields are read correctly from object and JSON string input", () => {
  const rawObj = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    businessAccountId: "waba_456",
    encryptedAccessTokenRef: "enc_ref_789",
    webhookVerifyToken: "token_abc",
  };

  // 1. Test with plain object
  const configObj = readProviderConfigFromSettings(rawObj);
  assert.equal(configObj.providerType, "whatsapp_cloud_api");
  assert.equal(configObj.phoneNumberId, "phone_123");
  assert.equal(configObj.businessAccountId, "waba_456");
  assert.equal(configObj.encryptedAccessTokenRef, "enc_ref_789");
  assert.equal(configObj.webhookVerifyToken, "token_abc");

  // 2. Test with JSON string
  const configStr = readProviderConfigFromSettings(JSON.stringify(rawObj));
  assert.equal(configStr.providerType, "whatsapp_cloud_api");
  assert.equal(configStr.phoneNumberId, "phone_123");
  assert.equal(configStr.businessAccountId, "waba_456");
  assert.equal(configStr.encryptedAccessTokenRef, "enc_ref_789");
  assert.equal(configStr.webhookVerifyToken, "token_abc");
});

test("merging Cloud API config preserves unrelated settings", () => {
  const existingSettings = {
    prompt: "System AI instructions",
    learned_instructions: "Learned knowledge",
    preferredLanguage: "ur",
  };

  const newProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_555",
    encryptedAccessTokenRef: "enc_ref_abc",
  };

  const merged = mergeProviderConfigIntoSettings(existingSettings, newProviderConfig);

  // Unrelated fields are preserved
  assert.equal(merged.prompt, "System AI instructions");
  assert.equal(merged.learned_instructions, "Learned knowledge");
  assert.equal(merged.preferredLanguage, "ur");

  // New provider fields are set
  assert.equal(merged.providerType, "whatsapp_cloud_api");
  assert.equal(merged.phoneNumberId, "phone_555");
  assert.equal(merged.encryptedAccessTokenRef, "enc_ref_abc");
});

test("unknown provider type defaults to whatsapp_web", () => {
  const settings = {
    providerType: "some_unsupported_provider",
  };
  const config = readProviderConfigFromSettings(settings);
  assert.equal(config.providerType, "whatsapp_web");
});

test("raw accessToken is not saved if accidentally passed", () => {
  const existingSettings = {
    prompt: "Test prompt",
  };

  const badProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    accessToken: "EAAG...", // Accidental raw token
    access_token: "EAAG...", // Alternate spelling
    token: "secret_123", // Another alternate spelling
    encryptedAccessTokenRef: "enc_ref_safe",
  };

  const merged = mergeProviderConfigIntoSettings(existingSettings, badProviderConfig);

  // Raw secret fields must be stripped
  assert.equal(merged.accessToken, undefined);
  assert.equal(merged.access_token, undefined);
  assert.equal(merged.token, undefined);
  
  // Safe fields must be retained
  assert.equal(merged.providerType, "whatsapp_cloud_api");
  assert.equal(merged.phoneNumberId, "12345");
  assert.equal(merged.encryptedAccessTokenRef, "enc_ref_safe");
});

test("output is safe for logs / no secret leakage", () => {
  const providerConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "long_encrypted_ref_value_xyz",
    webhookVerifyToken: "my_verify_token",
  };

  // Convert to config format
  const config = readProviderConfigFromSettings(providerConfig);
  
  // Call existing summarizeProviderConfigForLogs helper
  const logSummary = summarizeProviderConfigForLogs(config);

  // Secrets should be redacted
  assert.equal(logSummary.encryptedAccessTokenRef, "<redacted>");
  assert.equal(logSummary.webhookVerifyToken, "<redacted>");

  // Non-secrets are preserved
  assert.equal(logSummary.providerType, "whatsapp_cloud_api");
  assert.equal(logSummary.phoneNumberId, "12345");
});
