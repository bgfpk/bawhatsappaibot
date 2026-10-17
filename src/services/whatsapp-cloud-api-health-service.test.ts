// src/services/whatsapp-cloud-api-health-service.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCloudProviderHealth,
  fetchMetaPhoneNumberMetadata,
  recordCloudWebhookActivity,
  getWebhookActivity,
  clearCloudHealthStore,
} from "./whatsapp-cloud-api-health-service.ts";

test.afterEach(() => {
  clearCloudHealthStore();
});

test("HealthService: returns setup_required when bot has no phone or WABA ID", async () => {
  const summary = await evaluateCloudProviderHealth({
    botId: "bot_unconfigured",
    runtimeEnabled: true,
  });

  assert.equal(summary.overallStatus, "setup_required");
  assert.equal(summary.setup, "setup_required");
  assert.equal(summary.runtime, "enabled");
  assert.equal(summary.apiAccess, "not_checked");
});

test("HealthService: returns runtime_disabled when runtimeEnabled is false", async () => {
  const summary = await evaluateCloudProviderHealth({
    botId: "bot_disabled",
    phoneNumberId: "123456789",
    wabaId: "987654321",
    runtimeEnabled: false,
  });

  assert.equal(summary.overallStatus, "runtime_disabled");
  assert.equal(summary.setup, "configured");
  assert.equal(summary.runtime, "disabled");
});

test("HealthService: live Graph check retrieves display phone and quality rating without leaking tokens", async () => {
  const mockFetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        display_phone_number: "+92 300 1234567",
        verified_name: "BlackArrow Store",
        quality_rating: "GREEN",
        code_verification_status: "VERIFIED",
      }),
    } as any;
  };

  const summary = await evaluateCloudProviderHealth({
    botId: "bot_live",
    phoneNumberId: "104100542821472",
    wabaId: "154105710440220",
    runtimeEnabled: true,
    accessToken: "TOP_SECRET_META_TOKEN_12345",
    performGraphCheck: true,
    fetchImpl: mockFetch,
    versionOverride: "v20.0",
  });

  assert.equal(summary.overallStatus, "active");
  assert.equal(summary.apiAccess, "reachable");
  assert.equal(summary.displayPhoneNumber, "+92 300 1234567");
  assert.equal(summary.verifiedName, "BlackArrow Store");
  assert.equal(summary.qualityRating, "GREEN");

  // Ensure raw token is nowhere in the serialized object
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("TOP_SECRET_META_TOKEN_12345"), false);
});

test("HealthService: 401 response classifies as reauth_required", async () => {
  const mockFetch = async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: "Session expired", code: 190 },
      }),
    } as any;
  };

  const summary = await evaluateCloudProviderHealth({
    botId: "bot_expired",
    phoneNumberId: "104100542821472",
    wabaId: "154105710440220",
    runtimeEnabled: true,
    accessToken: "expired_token",
    performGraphCheck: true,
    fetchImpl: mockFetch,
    versionOverride: "v20.0",
  });

  assert.equal(summary.overallStatus, "reauth_required");
  assert.equal(summary.apiAccess, "reauth_required");
});

test("HealthService: webhook activity recording updates activity timestamps", () => {
  recordCloudWebhookActivity("phone_123", "inbound_message");
  const activity = getWebhookActivity("phone_123");

  assert.ok(activity.lastValidSignedWebhookAt !== null);
  assert.ok(activity.lastInboundMessageWebhookAt !== null);
  assert.equal(activity.lastStatusWebhookAt, null);
});
