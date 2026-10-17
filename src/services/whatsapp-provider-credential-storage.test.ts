// src/services/whatsapp-provider-credential-storage.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareCloudApiProviderConfigInput,
  stripRawProviderSecrets
} from "./whatsapp-provider-credential-storage.ts";

test("raw accessToken becomes only encryptedAccessTokenRef when encrypt function is injected", async () => {
  const encryptMock = (raw: string) => `enc:${raw}`;
  const input = {
    providerType: "whatsapp_cloud_api",
    accessToken: "EAAG_my_secret_token",
  };

  const result = await prepareCloudApiProviderConfigInput(input, { encryptSecret: encryptMock });

  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.encryptedAccessTokenRef, "enc:EAAG_my_secret_token");
  assert.equal((result as any).accessToken, undefined);
});

test("raw accessToken is removed and sets error when encrypt function is missing", async () => {
  const input = {
    providerType: "whatsapp_cloud_api",
    accessToken: "EAAG_my_secret_token",
  };

  const result = await prepareCloudApiProviderConfigInput(input);

  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.encryptedAccessTokenRef, undefined);
  assert.equal((result as any).accessToken, undefined);
  assert.match(result.providerLastError || "", /no encryptSecret function injected/);
});

test("existing encryptedAccessTokenRef is preserved", async () => {
  const input = {
    providerType: "whatsapp_cloud_api",
    encryptedAccessTokenRef: "enc_already_existing_ref",
  };

  const result = await prepareCloudApiProviderConfigInput(input);

  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.encryptedAccessTokenRef, "enc_already_existing_ref");
});

test("unsafe secret keys are stripped", async () => {
  const input = {
    providerType: "whatsapp_cloud_api",
    accessToken: "raw_token",
    access_token: "raw_token_2",
    token: "raw_token_3",
    apiKey: "raw_api_key",
    api_key: "raw_api_key_2",
    secret: "raw_secret",
    clientSecret: "raw_client_secret",
    appSecret: "raw_app_secret",
    phoneNumberId: "phone_123", // Safe field
    webhookVerifyToken: "verify_123", // Safe field
  };

  const stripped = stripRawProviderSecrets(input);

  // Unsafe keys deleted
  assert.equal(stripped.accessToken, undefined);
  assert.equal(stripped.access_token, undefined);
  assert.equal(stripped.token, undefined);
  assert.equal(stripped.apiKey, undefined);
  assert.equal(stripped.api_key, undefined);
  assert.equal(stripped.secret, undefined);
  assert.equal(stripped.clientSecret, undefined);
  assert.equal(stripped.appSecret, undefined);

  // Safe keys preserved
  assert.equal(stripped.providerType, "whatsapp_cloud_api");
  assert.equal(stripped.phoneNumberId, "phone_123");
  assert.equal(stripped.webhookVerifyToken, "verify_123");
});

test("unrelated safe provider fields are preserved", async () => {
  const input = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_999",
    businessAccountId: "waba_777",
    webhookVerifyToken: "verify_xyz",
    templateSyncStatus: "synced",
    officialApiCapabilities: { test: true },
  };

  const result = await prepareCloudApiProviderConfigInput(input);

  assert.equal(result.phoneNumberId, "phone_999");
  assert.equal(result.businessAccountId, "waba_777");
  assert.equal(result.webhookVerifyToken, "verify_xyz");
  assert.equal(result.templateSyncStatus, "synced");
  assert.deepEqual(result.officialApiCapabilities, { test: true });
});

test("invalid provider type defaults to whatsapp_web", async () => {
  const input = {
    providerType: "invalid_provider",
  };

  const result = await prepareCloudApiProviderConfigInput(input);
  assert.equal(result.providerType, "whatsapp_web");
});

test("valid whatsapp_cloud_api is preserved", async () => {
  const input = {
    providerType: "whatsapp_cloud_api",
  };

  const result = await prepareCloudApiProviderConfigInput(input);
  assert.equal(result.providerType, "whatsapp_cloud_api");
});

test("helper supports async encrypt function", async () => {
  const asyncEncryptMock = async (raw: string) => {
    return new Promise<string>((resolve) => {
      setTimeout(() => resolve(`async_enc:${raw}`), 10);
    });
  };

  const input = {
    providerType: "whatsapp_cloud_api",
    accessToken: "my_raw_val",
  };

  const result = await prepareCloudApiProviderConfigInput(input, { encryptSecret: asyncEncryptMock });

  assert.equal(result.encryptedAccessTokenRef, "async_enc:my_raw_val");
  assert.equal((result as any).accessToken, undefined);
});
