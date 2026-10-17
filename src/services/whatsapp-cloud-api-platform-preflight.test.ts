// src/services/whatsapp-cloud-api-platform-preflight.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkCloudPlatformPreflight,
  sanitizeCloudApiError,
} from "./whatsapp-cloud-api-platform-preflight.ts";

test("PlatformPreflight: in production, detects missing required env variables", () => {
  const emptyEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
  };

  const res = checkCloudPlatformPreflight(emptyEnv, true);
  assert.equal(res.ready, false);
  assert.equal(res.status, "not_ready");
  assert.ok(res.missing.includes("WHATSAPP_CLOUD_GRAPH_VERSION"));
  assert.ok(res.missing.includes("WHATSAPP_CLOUD_META_APP_ID"));
  assert.ok(res.missing.includes("WHATSAPP_CLOUD_META_APP_SECRET"));
});

test("PlatformPreflight: in production, succeeds when all required env variables are present", () => {
  const completeEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
    WHATSAPP_CLOUD_GRAPH_VERSION: "v21.0",
    WHATSAPP_CLOUD_META_APP_ID: "1277547175",
    WHATSAPP_CLOUD_META_APP_SECRET: "secret_12345",
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID: "config_12345",
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_REDIRECT_URI: "https://blackarrow-source.offline.invalid/oauth",
    WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "verify_token_12345",
    APP_ENCRYPTION_KEY: "enc_key_12345",
    WHATSAPP_CLOUD_API_RUNTIME_ENABLED: "true",
  };

  const res = checkCloudPlatformPreflight(completeEnv, true);
  assert.equal(res.ready, true);
  assert.equal(res.status, "ready");
  assert.equal(res.missing.length, 0);
});

test("sanitizeCloudApiError: sanitizes expired token error into reauth_required", () => {
  const sanitized = sanitizeCloudApiError(
    new Error("Error validating access token: Session has expired on Wednesday, 19-Aug-26 04:00:00 PDT. (code 190)")
  );

  assert.equal(sanitized.code, "reauth_required");
  assert.equal(sanitized.needsReconnect, true);
  assert.equal(sanitized.retryable, false);
  assert.equal(sanitized.message.includes("Session has expired on Wednesday"), false);
});

test("sanitizeCloudApiError: sanitizes rate limit 429 error", () => {
  const sanitized = sanitizeCloudApiError(new Error("HTTP 429: (#80007) Rate limit exceeded"));
  assert.equal(sanitized.code, "rate_limited");
  assert.equal(sanitized.retryable, true);
});

test("sanitizeCloudApiError: sanitizes closed window error", () => {
  const sanitized = sanitizeCloudApiError(new Error("cloud_template_required: 24-hour customer service window expired"));
  assert.equal(sanitized.code, "cloud_template_required");
  assert.equal(sanitized.retryable, false);
});
