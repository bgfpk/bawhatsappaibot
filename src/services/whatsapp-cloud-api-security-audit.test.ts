// src/services/whatsapp-cloud-api-security-audit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCloudProviderHealth } from "./whatsapp-cloud-api-health-service.ts";
import { checkCloudPlatformPreflight, sanitizeCloudApiError } from "./whatsapp-cloud-api-platform-preflight.ts";
import { summarizeProviderConfigForLogs } from "./whatsapp-provider-config.ts";
import { createOnboardingAttempt, validateAndConsumeOnboardingAttempt } from "./whatsapp-meta-onboarding-session.ts";

test("Security Audit: token and PIN never appear in serialized health response", async () => {
  const SECRET_TOKEN = "TOP_SECRET_META_TOKEN_ABC123";

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      display_phone_number: "+92 300 9988776",
      verified_name: "Safe Enterprise",
      quality_rating: "GREEN",
    }),
  } as any);

  const health = await evaluateCloudProviderHealth({
    botId: "bot_sec_test",
    phoneNumberId: "1277547175",
    wabaId: "1761944824",
    runtimeEnabled: true,
    accessToken: SECRET_TOKEN,
    performGraphCheck: true,
    fetchImpl: mockFetch,
    versionOverride: "v20.0",
  });

  const serialized = JSON.stringify(health);
  assert.equal(serialized.includes(SECRET_TOKEN), false, "Access token must never leak into serialized health response");
});

test("Security Audit: platform preflight never prints secret values", () => {
  const SECRET_APP_SECRET = "VERY_CONFIDENTIAL_APP_SECRET_999";
  const SECRET_ENC_KEY = "SUPER_SECRET_AES_KEY_888";

  const env = {
    NODE_ENV: "production",
    WHATSAPP_CLOUD_GRAPH_VERSION: "v20.0",
    WHATSAPP_CLOUD_META_APP_ID: "123456",
    WHATSAPP_CLOUD_META_APP_SECRET: SECRET_APP_SECRET,
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID: "cfg_123",
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_REDIRECT_URI: "https://blackarrow-source.offline.invalid",
    WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "verify_tok",
    APP_ENCRYPTION_KEY: SECRET_ENC_KEY,
    WHATSAPP_CLOUD_API_RUNTIME_ENABLED: "true",
  };

  const preflight = checkCloudPlatformPreflight(env, true);
  const serialized = JSON.stringify(preflight);

  assert.equal(serialized.includes(SECRET_APP_SECRET), false);
  assert.equal(serialized.includes(SECRET_ENC_KEY), false);
  assert.equal(preflight.ready, true);
});

test("Security Audit: summarizeProviderConfigForLogs redacts token fields", () => {
  const SECRET_TOKEN = "TOP_SECRET_META_TOKEN_DEF456";
  const config = {
    providerType: "whatsapp_cloud_api" as const,
    phoneNumberId: "12345",
    encryptedAccessTokenRef: SECRET_TOKEN,
    appSecretRef: "secret_ref_val",
  };

  const logged = summarizeProviderConfigForLogs(config);
  const serialized = JSON.stringify(logged);

  assert.equal(serialized.includes(SECRET_TOKEN), false);
});

test("Security Audit: onboarding session never stores or exposes secrets", () => {
  const attempt = createOnboardingAttempt({
    userId: "user_audit",
    botId: "bot_audit",
  });

  const serialized = JSON.stringify(attempt);
  assert.equal(serialized.includes("accessToken"), false);
  assert.equal(serialized.includes("code"), false);
  assert.equal(serialized.includes("pin"), false);

  const res = validateAndConsumeOnboardingAttempt({
    attemptId: attempt.attemptId,
    state: attempt.state,
    userId: "user_audit",
    botId: "bot_audit",
  });

  assert.equal(res.valid, true);
  const resSerialized = JSON.stringify(res);
  assert.equal(resSerialized.includes("pin"), false);
});

test("Security Audit: error sanitization strips tokens and auth headers", () => {
  const rawError = new Error(
    "Failed to authenticate with Bearer EAAG...SECRET_TOKEN_XYZ at https://graph.facebook.com/v20.0/messages"
  );

  const sanitized = sanitizeCloudApiError(rawError);
  const serialized = JSON.stringify(sanitized);

  assert.equal(serialized.includes("SECRET_TOKEN_XYZ"), false);
  assert.equal(serialized.includes("EAAG"), false);
  assert.equal(sanitized.code, "cloud_api_error");
});
