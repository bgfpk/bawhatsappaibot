import test from "node:test";
import assert from "node:assert/strict";
import {
  completeMetaOnboarding,
  disconnectMetaCloudInstance,
} from "./whatsapp-meta-onboarding-service.ts";
import {
  createOnboardingAttempt,
  clearOnboardingAttempts,
} from "./whatsapp-meta-onboarding-session.ts";

test.afterEach(() => {
  clearOnboardingAttempts();
});

function createMockDeps(options: {
  botUserId?: string;
  wabaPhones?: any[];
  tokenToReturn?: string;
  allBots?: any[];
} = {}) {
  let savedConfig: any = null;
  const httpCalls: Array<{ url: string; method?: string; headers?: any; body?: string }> = [];

  const mockFetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    httpCalls.push({
      url: urlStr,
      method: init?.method || "GET",
      headers: init?.headers,
      body: init?.body ? String(init.body) : undefined,
    });

    if (urlStr.includes("oauth/access_token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: options.tokenToReturn || "EAABwz_mock_token_xyz_999",
          token_type: "bearer",
        }),
      } as any;
    }

    if (urlStr.includes("/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: options.wabaPhones || [
            {
              id: "phone_valid_123",
              display_phone_number: "+1 555-0199",
              verified_name: "BlackArrow Support",
              quality_rating: "GREEN",
            },
          ],
        }),
      } as any;
    }

    if (urlStr.includes("/subscribed_apps")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any;
    }

    if (urlStr.includes("/register")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any;
    }

    return { ok: false, status: 404, json: async () => ({}) } as any;
  };

  const getBotById = async (botId: string) => ({
    $id: botId,
    id: botId,
    user_id: options.botUserId || "user_alice",
    config_settings: "{}",
  });

  const saveBotProviderConfig = async (botId: string, config: any) => {
    savedConfig = config;
    return true;
  };

  const listAllBots = async () => options.allBots || [];

  const mockEncrypt = async (raw: string) => `enc_ref_${raw}`;

  return {
    getBotById,
    saveBotProviderConfig,
    listAllBots,
    encryptSecret: mockEncrypt,
    fetchImpl: mockFetch,
    getSavedConfig: () => savedConfig,
    getHttpCalls: () => httpCalls,
    platformConfig: {
      appId: "app_mock_111",
      appSecret: "sec_mock_222",
      configId: "cfg_mock_333",
      graphVersion: "v20.0",
      redirectUri: "https://blackarrow-source.offline.invalid/oauth",
      webhookVerifyToken: "verify_123",
      isComplete: true,
      missingFields: [],
    },
  };
}

test("completeMetaOnboarding orchestrates complete signup successfully without leaking secrets", async () => {
  const deps = createMockDeps();
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_101",
  });

  const result = await completeMetaOnboarding(
    {
      userId: "user_alice",
      botId: "bot_101",
      attemptId: attempt.attemptId,
      state: attempt.state,
      code: "auth_code_from_fb_signup",
      wabaId: "waba_777",
      phoneNumberId: "phone_valid_123",
      pin: "123456",
    },
    deps
  );

  assert.equal(result.success, true);
  assert.equal(result.botId, "bot_101");
  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.providerStatus, "configured");
  assert.equal(result.phoneNumberId, "phone_valid_123");
  assert.equal(result.displayPhoneNumber, "+1 555-0199");
  assert.equal(result.verifiedName, "BlackArrow Support");
  assert.equal(result.businessAccountId, "waba_777");

  // Verify stored config
  const saved = deps.getSavedConfig();
  assert.ok(saved);
  assert.equal(saved.providerType, "whatsapp_cloud_api");
  assert.equal(saved.phoneNumberId, "phone_valid_123");
  assert.equal(saved.encryptedAccessTokenRef, "enc_ref_EAABwz_mock_token_xyz_999");
  assert.equal(saved.encryptedRegistrationPinRef, "enc_ref_123456");

  // Assert raw token / pin never appear in returned response
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /EAABwz_mock_token_xyz_999/);
  assert.doesNotMatch(serialized, /123456/);
  assert.doesNotMatch(serialized, /auth_code_from_fb_signup/);
});

test("completeMetaOnboarding rejects unauthorized bot access (wrong user)", async () => {
  const deps = createMockDeps({ botUserId: "user_alice" });
  const attempt = createOnboardingAttempt({
    userId: "user_bob", // Attacker
    botId: "bot_101",
  });

  await assert.rejects(
    async () => {
      await completeMetaOnboarding(
        {
          userId: "user_bob",
          botId: "bot_101",
          attemptId: attempt.attemptId,
          state: attempt.state,
          code: "auth_code",
          wabaId: "waba_1",
          phoneNumberId: "phone_1",
          pin: "123456",
        },
        deps
      );
    },
    /bot_not_owned/
  );
});

test("completeMetaOnboarding rejects invalid registration PIN before network calls", async () => {
  const deps = createMockDeps();
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_101",
  });

  await assert.rejects(
    async () => {
      await completeMetaOnboarding(
        {
          userId: "user_alice",
          botId: "bot_101",
          attemptId: attempt.attemptId,
          state: attempt.state,
          code: "auth_code",
          wabaId: "waba_1",
          phoneNumberId: "phone_1",
          pin: "12345", // 5 digits
        },
        deps
      );
    },
    /invalid_registration_pin/
  );

  assert.equal(deps.getHttpCalls().length, 0);
});

test("completeMetaOnboarding rejects when phone number does not belong to WABA", async () => {
  const deps = createMockDeps({
    wabaPhones: [
      { id: "phone_other_999", display_phone_number: "+1 555-9999" },
    ],
  });
  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_101",
  });

  await assert.rejects(
    async () => {
      await completeMetaOnboarding(
        {
          userId: "user_alice",
          botId: "bot_101",
          attemptId: attempt.attemptId,
          state: attempt.state,
          code: "auth_code",
          wabaId: "waba_777",
          phoneNumberId: "phone_valid_123", // Does not match phone_other_999
          pin: "123456",
        },
        deps
      );
    },
    /asset_validation_failed/
  );

  // Credentials should NOT have been saved
  assert.equal(deps.getSavedConfig(), null);
});

test("completeMetaOnboarding blocks duplicate phone attachment by another account", async () => {
  const existingBotOfOtherUser = {
    $id: "bot_existing_other",
    user_id: "user_charlie",
    config_settings: JSON.stringify({
      phoneNumberId: "phone_conflict_888",
    }),
  };

  const deps = createMockDeps({
    allBots: [existingBotOfOtherUser],
  });

  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_101",
  });

  await assert.rejects(
    async () => {
      await completeMetaOnboarding(
        {
          userId: "user_alice",
          botId: "bot_101",
          attemptId: attempt.attemptId,
          state: attempt.state,
          code: "auth_code",
          wabaId: "waba_777",
          phoneNumberId: "phone_conflict_888", // Conflict!
          pin: "123456",
        },
        deps
      );
    },
    /already connected to another BlackArrow account/
  );
});

test("completeMetaOnboarding allows reconnect on same account's own bot", async () => {
  const existingBotOfSameUser = {
    $id: "bot_101",
    user_id: "user_alice",
    config_settings: JSON.stringify({
      phoneNumberId: "phone_valid_123",
    }),
  };

  const deps = createMockDeps({
    allBots: [existingBotOfSameUser],
  });

  const attempt = createOnboardingAttempt({
    userId: "user_alice",
    botId: "bot_101",
  });

  const res = await completeMetaOnboarding(
    {
      userId: "user_alice",
      botId: "bot_101",
      attemptId: attempt.attemptId,
      state: attempt.state,
      code: "auth_code_reconnect",
      wabaId: "waba_777",
      phoneNumberId: "phone_valid_123",
      pin: "123456",
    },
    deps
  );

  assert.equal(res.success, true);
  assert.equal(res.phoneNumberId, "phone_valid_123");
});

test("disconnectMetaCloudInstance safely disconnects without deleting Meta assets", async () => {
  const deps = createMockDeps({ botUserId: "user_alice" });

  const result = await disconnectMetaCloudInstance(
    { userId: "user_alice", botId: "bot_101" },
    deps
  );

  assert.equal(result.success, true);
  assert.equal(result.providerStatus, "disconnected");

  const saved = deps.getSavedConfig();
  assert.equal(saved.providerStatus, "disconnected");
  assert.equal(saved.encryptedAccessTokenRef, "");

  // Assert NO external HTTP calls were made to Meta (no destructive deregistration)
  assert.equal(deps.getHttpCalls().length, 0);
});
