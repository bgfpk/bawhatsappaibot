// src/services/whatsapp-cloud-api-runtime-config.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCloudApiRuntimeConfig,
  summarizeCloudApiRuntimeConfig
} from "./whatsapp-cloud-api-runtime-config.ts";
import { WhatsAppProviderConfig } from "./whatsapp-provider-config.ts";

test("non-cloud provider returns inactive web runtime", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_web"
  };
  const result = await resolveCloudApiRuntimeConfig(config);
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_web");
  assert.equal(result.reason, "provider_not_cloud_api");
});

test("cloud provider with platform rollout disabled returns platform_disabled with activeRuntimeProvider = whatsapp_cloud_api", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "some_ref"
  };
  const result = await resolveCloudApiRuntimeConfig(config, { isPlatformRolloutEnabled: false });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "platform_disabled");
});

test("cloud provider missing phoneNumberId returns missing_phone_number_id with activeRuntimeProvider = whatsapp_cloud_api", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    encryptedAccessTokenRef: "some_ref"
  };
  const result = await resolveCloudApiRuntimeConfig(config, { isPlatformRolloutEnabled: true });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "missing_phone_number_id");
  assert.deepEqual(result.missingFields, ["phoneNumberId"]);
});

test("cloud provider missing encryptedAccessTokenRef returns missing_token_ref with activeRuntimeProvider = whatsapp_cloud_api", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345"
  };
  const result = await resolveCloudApiRuntimeConfig(config, { isPlatformRolloutEnabled: true });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "missing_token_ref");
  assert.deepEqual(result.missingFields, ["encryptedAccessTokenRef"]);
});

test("cloud provider missing decrypt function returns missing_decrypt_function with activeRuntimeProvider = whatsapp_cloud_api", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "some_ref"
  };
  const result = await resolveCloudApiRuntimeConfig(config, { isPlatformRolloutEnabled: true });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "missing_decrypt_function");
});

test("decrypt failure returns decrypt_failed with safe error details", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "some_ref"
  };
  const mockDecrypt = async (ref: string) => {
    throw new Error("Decryption server offline");
  };
  
  const result = await resolveCloudApiRuntimeConfig(config, { decryptSecret: mockDecrypt, isPlatformRolloutEnabled: true });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "decrypt_failed");
  assert.equal(result.errorMessage, "Decryption server offline");
});

test("decrypt success returns runtime config with accessToken available only in runtime result", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    businessAccountId: "waba_456",
    encryptedAccessTokenRef: "enc_ref_value"
  };
  const mockDecrypt = async (ref: string) => {
    assert.equal(ref, "enc_ref_value");
    return "decrypted_raw_access_token";
  };

  const result = await resolveCloudApiRuntimeConfig(config, {
    decryptSecret: mockDecrypt,
    isPlatformRolloutEnabled: true,
    webhookSecurityConfigured: true,
  });
  assert.equal(result.runtimeEnabled, true);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.phoneNumberId, "phone_123");
  assert.equal(result.businessAccountId, "waba_456");
  assert.equal(result.accessToken, "decrypted_raw_access_token");
});

test("safe summary does not include raw token or encrypted ref", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    businessAccountId: "waba_456",
    encryptedAccessTokenRef: "enc_ref_value"
  };
  const mockDecrypt = async (ref: string) => "decrypted_raw_access_token";

  const result = await resolveCloudApiRuntimeConfig(config, {
    decryptSecret: mockDecrypt,
    isPlatformRolloutEnabled: true,
    webhookSecurityConfigured: true,
  });
  const summary = summarizeCloudApiRuntimeConfig(result);

  assert.equal(summary.runtimeEnabled, true);
  assert.equal(summary.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(summary.phoneNumberId, "phone_123");
  assert.equal(summary.businessAccountId, "waba_456");
  assert.equal(summary.hasAccessToken, true);

  // Assert secret properties are not leaked
  const summaryKeys = Object.keys(summary);
  assert.equal(summaryKeys.includes("accessToken"), false);
  assert.equal(summaryKeys.includes("encryptedAccessTokenRef"), false);
  assert.equal(summaryKeys.includes("webhookVerifyToken"), false);
});

test("input provider config is not mutated", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    encryptedAccessTokenRef: "enc_ref_value"
  };
  
  const originalJSON = JSON.stringify(config);
  const mockDecrypt = async (ref: string) => "decrypted_raw_access_token";

  await resolveCloudApiRuntimeConfig(config, { decryptSecret: mockDecrypt, isPlatformRolloutEnabled: true });
  assert.equal(JSON.stringify(config), originalJSON);
});

test("runtime config resolver disables Cloud API when app secret is missing from environment", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    encryptedAccessTokenRef: "enc_ref_value",
  };
  const mockDecrypt = async () => "decrypted_token";

  const result = await resolveCloudApiRuntimeConfig(config, {
    decryptSecret: mockDecrypt,
    isPlatformRolloutEnabled: true,
    env: {
      WHATSAPP_CLOUD_APP_SECRET: "",
      WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "valid_verify_token",
    },
  });

  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "webhook_security_not_configured");
  assert.equal(result.accessToken, undefined);
});

test("runtime config resolver disables Cloud API when webhook verify token is missing from environment", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    encryptedAccessTokenRef: "enc_ref_value",
  };
  const mockDecrypt = async () => "decrypted_token";

  const result = await resolveCloudApiRuntimeConfig(config, {
    decryptSecret: mockDecrypt,
    isPlatformRolloutEnabled: true,
    env: {
      WHATSAPP_CLOUD_APP_SECRET: "valid_app_secret",
      WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "",
    },
  });

  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "webhook_security_not_configured");
  assert.equal(result.accessToken, undefined);
});

test("runtime config resolver enables Cloud API when both app secret and verify token are present", async () => {
  const config: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
    encryptedAccessTokenRef: "enc_ref_value",
  };
  const mockDecrypt = async () => "decrypted_token";

  const result = await resolveCloudApiRuntimeConfig(config, {
    decryptSecret: mockDecrypt,
    isPlatformRolloutEnabled: true,
    env: {
      META_APP_SECRET: "secret_123",
      META_WEBHOOK_VERIFY_TOKEN: "verify_123",
    },
  });

  assert.equal(result.runtimeEnabled, true);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.accessToken, "decrypted_token");
});
