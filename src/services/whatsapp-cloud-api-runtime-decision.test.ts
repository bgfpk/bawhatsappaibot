import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCloudApiRuntimeActivation,
  isCloudApiPlatformRolloutEnabled,
} from "./whatsapp-cloud-api-runtime-decision.ts";

test("RuntimeDecision: Web provider returns provider_not_cloud_api with activeRuntimeProvider = whatsapp_web", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_web",
    isPlatformRolloutEnabled: true,
  });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_web");
  assert.equal(result.reason, "provider_not_cloud_api");
});

test("RuntimeDecision: Cloud provider with platform rollout flag OFF returns platform_disabled with activeRuntimeProvider = whatsapp_cloud_api", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_cloud_api",
    isPlatformRolloutEnabled: false,
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "enc_ref",
    decryptedAccessToken: "token_123",
  });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api", "Must NOT silently fall back to whatsapp_web");
  assert.equal(result.reason, "platform_disabled");
});

test("RuntimeDecision: Cloud provider missing phoneNumberId returns missing_phone_number_id", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_cloud_api",
    isPlatformRolloutEnabled: true,
    phoneNumberId: "",
    encryptedAccessTokenRef: "enc_ref",
    decryptedAccessToken: "token_123",
  });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "missing_phone_number_id");
  assert.deepEqual(result.missingFields, ["phoneNumberId"]);
});

test("RuntimeDecision: Cloud provider missing encryptedAccessTokenRef returns missing_token_ref", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_cloud_api",
    isPlatformRolloutEnabled: true,
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "",
    decryptedAccessToken: "token_123",
  });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "missing_token_ref");
  assert.deepEqual(result.missingFields, ["encryptedAccessTokenRef"]);
});

test("RuntimeDecision: Cloud provider with decryption failure returns decrypt_failed", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_cloud_api",
    isPlatformRolloutEnabled: true,
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "enc_ref",
    decryptError: "Invalid key or cipher",
  });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "decrypt_failed");
});

test("RuntimeDecision: Cloud provider with missing webhook security returns webhook_security_not_configured", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_cloud_api",
    isPlatformRolloutEnabled: true,
    phoneNumberId: "12345",
    encryptedAccessTokenRef: "enc_ref",
    decryptedAccessToken: "token_123",
    webhookSecurityConfigured: false,
  });
  assert.equal(result.runtimeEnabled, false);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "webhook_security_not_configured");
});

test("RuntimeDecision: Cloud provider with ALL valid requirements returns ready and runtimeEnabled = true", () => {
  const result = evaluateCloudApiRuntimeActivation({
    providerType: "whatsapp_cloud_api",
    isPlatformRolloutEnabled: true,
    phoneNumberId: "170906520015342",
    encryptedAccessTokenRef: "enc_ref_valid",
    decryptedAccessToken: "EAABwz...",
  });
  assert.equal(result.runtimeEnabled, true);
  assert.equal(result.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(result.reason, "ready");
  assert.deepEqual(result.missingFields, []);
});
