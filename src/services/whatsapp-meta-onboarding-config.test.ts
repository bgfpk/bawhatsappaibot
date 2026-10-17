import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveMetaPlatformConfig,
  getMetaOnboardingPublicConfig,
} from "./whatsapp-meta-onboarding-config.ts";

test("resolveMetaPlatformConfig resolves canonical environment variables", () => {
  const env = {
    WHATSAPP_CLOUD_META_APP_ID: "app_12345",
    WHATSAPP_CLOUD_META_APP_SECRET: "sec_99999",
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID: "cfg_77777",
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_REDIRECT_URI: "https://blackarrow-source.offline.invalid/oauth",
    WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "verify_token_123",
    WHATSAPP_CLOUD_GRAPH_VERSION: "v20.0",
  };

  const config = resolveMetaPlatformConfig(env);
  assert.equal(config.appId, "app_12345");
  assert.equal(config.appSecret, "sec_99999");
  assert.equal(config.configId, "cfg_77777");
  assert.equal(config.redirectUri, "https://blackarrow-source.offline.invalid/oauth");
  assert.equal(config.webhookVerifyToken, "verify_token_123");
  assert.equal(config.graphVersion, "v20.0");
  assert.equal(config.isComplete, true);
  assert.deepEqual(config.missingFields, []);
});

test("resolveMetaPlatformConfig falls back to supported aliases", () => {
  const env = {
    META_APP_ID: "alias_app_111",
    META_APP_SECRET: "alias_sec_222",
    META_EMBEDDED_SIGNUP_CONFIG_ID: "alias_cfg_333",
    META_WEBHOOK_VERIFY_TOKEN: "alias_verify_444",
  };

  const config = resolveMetaPlatformConfig(env);
  assert.equal(config.appId, "alias_app_111");
  assert.equal(config.appSecret, "alias_sec_222");
  assert.equal(config.configId, "alias_cfg_333");
  assert.equal(config.webhookVerifyToken, "alias_verify_444");
  assert.equal(config.isComplete, true);
});

test("getMetaOnboardingPublicConfig returns public fields and strictly excludes secret fields", () => {
  const env = {
    WHATSAPP_CLOUD_META_APP_ID: "pub_app_100",
    WHATSAPP_CLOUD_META_APP_SECRET: "SUPER_SECRET_VALUE",
    WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID: "pub_cfg_200",
    WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "SUPER_SECRET_VERIFY",
  };

  const publicConfig = getMetaOnboardingPublicConfig(env);
  assert.equal(publicConfig.available, true);
  assert.equal(publicConfig.appId, "pub_app_100");
  assert.equal(publicConfig.configId, "pub_cfg_200");
  assert.equal(publicConfig.graphVersion, "v20.0");
  assert.deepEqual(publicConfig.missing, []);

  // Assert secret fields are strictly absent
  const serialized = JSON.stringify(publicConfig);
  assert.doesNotMatch(serialized, /SUPER_SECRET_VALUE/);
  assert.doesNotMatch(serialized, /SUPER_SECRET_VERIFY/);
  assert.equal((publicConfig as any).appSecret, undefined);
  assert.equal((publicConfig as any).webhookVerifyToken, undefined);
});

test("getMetaOnboardingPublicConfig reports available: false and non-secret missing fields when incomplete", () => {
  const env = {
    WHATSAPP_CLOUD_META_APP_ID: "pub_app_100",
    // Missing appSecret and configId
  };

  const publicConfig = getMetaOnboardingPublicConfig(env);
  assert.equal(publicConfig.available, false);
  assert.equal(publicConfig.appId, "pub_app_100");
  assert.deepEqual(publicConfig.missing, ["appSecret", "configId"]);
});
