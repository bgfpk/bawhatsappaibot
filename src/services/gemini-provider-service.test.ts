import test from "node:test";
import assert from "node:assert/strict";

import { encryptServerSecret } from "./secret-crypto-service.ts";
import {
  __resetGeminiProviderTestDeps,
  __setGeminiProviderTestDeps,
  getClientGeminiStatus,
  isGoogleAiStudioGeminiApiKey,
  resolveGeminiProvider,
  saveClientGeminiSetting,
} from "./gemini-provider-service.ts";

process.env.BLACKARROW_SECRET_ENCRYPTION_KEY = "test-secret-for-gemini-provider";

const ACCOUNT_A_KEY = ("AIza" + "A".repeat(35));
const ACCOUNT_B_KEY = ("AIza" + "B".repeat(35));
const SAVED_KEY = ("AIza" + "C".repeat(35));

test.afterEach(() => {
  __resetGeminiProviderTestDeps();
});

test("account with no custom Gemini key uses platform provider", async () => {
  __setGeminiProviderTestDeps({
    loadUserConfig: async () => ({ clientGemini: { enabled: false, encryptedApiKey: "" } } as any),
    getPlatformClientOptions: () => ({ apiKey: "platform-key" }),
  });

  const provider = await resolveGeminiProvider({ userId: "acct_1", purpose: "reply" });

  assert.equal(provider.provider, "platform_gemini");
  assert.deepEqual(provider.clientOptions, { apiKey: "platform-key" });
});

test("platform Agent or Vertex options stay default when no client key exists", async () => {
  const platformOptions = { vertexai: true, project: "blackarrow-platform", location: "us-central1" };
  __setGeminiProviderTestDeps({
    loadUserConfig: async () => ({ clientGemini: { enabled: false, encryptedApiKey: "" } } as any),
    getPlatformClientOptions: () => platformOptions,
  });

  const provider = await resolveGeminiProvider({ userId: "acct_vertex", purpose: "reply" });

  assert.equal(provider.provider, "platform_gemini");
  assert.deepEqual(provider.clientOptions, platformOptions);
});

test("custom Gemini key is account scoped and isolated", async () => {
  const configs: Record<string, any> = {
    acct_a: { clientGemini: { enabled: true, encryptedApiKey: encryptServerSecret(ACCOUNT_A_KEY) } },
    acct_b: { clientGemini: { enabled: true, encryptedApiKey: encryptServerSecret(ACCOUNT_B_KEY) } },
  };
  __setGeminiProviderTestDeps({
    loadUserConfig: async (userId: string) => configs[userId] || {},
    canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" } as any),
    getUser: async (userId: string) => ({ $id: userId, wallet_balance: 1 } as any),
    getPlatformClientOptions: () => ({ apiKey: "platform-key" }),
  });

  const accountA = await resolveGeminiProvider({ userId: "acct_a", purpose: "reply" });
  const accountB = await resolveGeminiProvider({ userId: "acct_b", purpose: "reply" });

  assert.equal(accountA.provider, "client_custom_gemini");
  assert.equal((accountA.clientOptions as any).apiKey, ACCOUNT_A_KEY);
  assert.equal((accountB.clientOptions as any).apiKey, ACCOUNT_B_KEY);
  assert.notEqual((accountA.clientOptions as any).apiKey, (accountB.clientOptions as any).apiKey);
});

test("custom Gemini key status is masked and redacts full key", async () => {
  __setGeminiProviderTestDeps({
    loadUserConfig: async () => ({ clientGemini: { enabled: true, encryptedApiKey: encryptServerSecret(SAVED_KEY) } } as any),
    canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" } as any),
    getUser: async () => ({ $id: "acct_1", wallet_balance: 1 } as any),
  });

  const status = await getClientGeminiStatus("acct_1");
  const provider = await resolveGeminiProvider({ userId: "acct_1", purpose: "summary" });

  assert.equal(status.enabled, true);
  assert.equal(status.maskedKey.includes(SAVED_KEY), false);
  assert.equal(provider.redact(`bad key ${SAVED_KEY} failed`).includes(SAVED_KEY), false);
});

test("custom Gemini account blocks instead of falling back to platform on access failure", async () => {
  __setGeminiProviderTestDeps({
    loadUserConfig: async () => ({ clientGemini: { enabled: true, encryptedApiKey: encryptServerSecret(SAVED_KEY) } } as any),
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "trial_expired" } as any),
    getPlatformClientOptions: () => ({ apiKey: "platform-key" }),
  });

  await assert.rejects(
    () => resolveGeminiProvider({ userId: "acct_1", purpose: "reply" }),
    (error: any) => error?.provider === "client_custom_gemini" && error?.code === "trial_expired",
  );
});

test("client custom key accepts only Google AI Studio API-key flow", async () => {
  __setGeminiProviderTestDeps({
    loadUserConfig: async () => ({} as any),
    saveUserExtraConfigPatch: async () => ({} as any),
  });

  assert.equal(isGoogleAiStudioGeminiApiKey(SAVED_KEY), true);
  assert.equal(isGoogleAiStudioGeminiApiKey('{"type":"service_account","project_id":"demo"}'), false);
  assert.equal(isGoogleAiStudioGeminiApiKey("project=demo location=us-central1 vertex"), false);
  assert.equal(isGoogleAiStudioGeminiApiKey("agent-platform-secret"), false);

  await assert.rejects(
    () => saveClientGeminiSetting("acct_1", { enabled: true, apiKey: '{"type":"service_account","project_id":"demo"}' }),
    /Invalid Google AI Studio Gemini API key/,
  );
});

test("client Gemini Cache Boost is off by default and scoped to saved setting", async () => {
  const configs: Record<string, any> = {
    acct_off: { clientGemini: { enabled: true, encryptedApiKey: encryptServerSecret(SAVED_KEY) } },
    acct_on: { clientGemini: { enabled: true, encryptedApiKey: encryptServerSecret(ACCOUNT_A_KEY), explicitCacheBoostEnabled: true } },
  };
  __setGeminiProviderTestDeps({
    loadUserConfig: async (userId: string) => configs[userId] || {},
    canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" } as any),
    getUser: async (userId: string) => ({ $id: userId, wallet_balance: 1 } as any),
  });

  const off = await resolveGeminiProvider({ userId: "acct_off", purpose: "reply" }) as any;
  const on = await resolveGeminiProvider({ userId: "acct_on", purpose: "reply" }) as any;

  assert.equal(off.explicitCacheBoostEnabled, false);
  assert.equal(on.explicitCacheBoostEnabled, true);
});
