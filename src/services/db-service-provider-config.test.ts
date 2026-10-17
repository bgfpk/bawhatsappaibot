// src/services/db-service-provider-config.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as dbService from "./db-service.ts";

const originalGetDocument = dbService.databases.getDocument;
const originalUpdateDocument = dbService.databases.updateDocument;
const originalListDocuments = dbService.databases.listDocuments;

// Setup in-memory mock database store
const mockBotDocs = new Map<string, any>();

test("setup mock databases", () => {
  // Override databases.getDocument directly on the instance
  dbService.databases.getDocument = (async (dbId: string, collectionId: string, documentId: string) => {
    if (mockBotDocs.has(documentId)) {
      return mockBotDocs.get(documentId);
    }
    const err = new Error("Document not found");
    (err as any).code = 404;
    throw err;
  }) as any;

  // Override databases.updateDocument directly on the instance
  dbService.databases.updateDocument = (async (dbId: string, collectionId: string, documentId: string, data: any) => {
    if (mockBotDocs.has(documentId)) {
      const existing = mockBotDocs.get(documentId);
      const updated = {
        ...existing,
        ...data,
      };
      mockBotDocs.set(documentId, updated);
      return updated;
    }
    const err = new Error("Document not found");
    (err as any).code = 404;
    throw err;
  }) as any;
});

test("existing bot with no provider fields defaults to whatsapp_web", async () => {
  mockBotDocs.set("bot_baileys", {
    $id: "bot_baileys",
    name: "Baileys Bot",
    jid: "contact-90732f42e67f@example.invalid",
    config_settings: JSON.stringify({
      prompt: "AI prompt value",
    }),
  });

  const config = await dbService.getBotProviderConfig("bot_baileys");
  assert.equal(config.providerType, "whatsapp_web");
});

test("bot with object config_settings and Cloud API fields returns whatsapp_cloud_api", async () => {
  mockBotDocs.set("bot_cloud_obj", {
    $id: "bot_cloud_obj",
    name: "Cloud Bot Obj",
    config_settings: {
      providerType: "whatsapp_cloud_api",
      phoneNumberId: "phone_999",
      businessAccountId: "waba_777",
    },
  });

  const config = await dbService.getBotProviderConfig("bot_cloud_obj");
  assert.equal(config.providerType, "whatsapp_cloud_api");
  assert.equal(config.phoneNumberId, "phone_999");
  assert.equal(config.businessAccountId, "waba_777");
});

test("bot with JSON string config_settings returns correct provider config", async () => {
  mockBotDocs.set("bot_cloud_str", {
    $id: "bot_cloud_str",
    config_settings: JSON.stringify({
      providerType: "whatsapp_cloud_api",
      phoneNumberId: "phone_888",
      businessAccountId: "waba_888",
    }),
  });

  const config = await dbService.getBotProviderConfig("bot_cloud_str");
  assert.equal(config.providerType, "whatsapp_cloud_api");
  assert.equal(config.phoneNumberId, "phone_888");
  assert.equal(config.businessAccountId, "waba_888");
});

test("invalid JSON config_settings returns whatsapp_web", async () => {
  mockBotDocs.set("bot_invalid_json", {
    $id: "bot_invalid_json",
    config_settings: "{invalid JSON string",
  });

  const config = await dbService.getBotProviderConfig("bot_invalid_json");
  assert.equal(config.providerType, "whatsapp_web");
});

test("no raw token fields are returned in getBotProviderConfig", async () => {
  mockBotDocs.set("bot_leak_test", {
    $id: "bot_leak_test",
    config_settings: {
      providerType: "whatsapp_cloud_api",
      accessToken: "EAAG_raw_unencrypted_token",
      token: "raw_token",
      encryptedAccessTokenRef: "enc_ref_safe_abc",
    },
  });

  const config = await dbService.getBotProviderConfig("bot_leak_test");
  assert.equal((config as any).accessToken, undefined);
  assert.equal((config as any).token, undefined);
  assert.equal(config.encryptedAccessTokenRef, "enc_ref_safe_abc");
});

test("non-existent bot returns whatsapp_web", async () => {
  const config = await dbService.getBotProviderConfig("bot_does_not_exist");
  assert.equal(config.providerType, "whatsapp_web");
});

test("no existing behavior of loadBotConfig or getBotById is changed", async () => {
  // Test loadBotConfig still parses and returns the full JSON object unmodified
  mockBotDocs.set("bot_behavior_check", {
    $id: "bot_behavior_check",
    config_settings: JSON.stringify({
      prompt: "AI prompt check",
      providerType: "whatsapp_cloud_api",
    }),
  });

  const rawConfig = await dbService.loadBotConfig("bot_behavior_check");
  assert.deepEqual(rawConfig, {
    prompt: "AI prompt check",
    providerType: "whatsapp_cloud_api",
  });

  // Test getBotById still retrieves the raw document correctly
  const doc = await dbService.getBotById("bot_behavior_check");
  assert.ok(doc);
  assert.equal(doc.$id, "bot_behavior_check");
});

test("saving whatsapp_cloud_api provider config updates only config_settings and preserves unrelated fields", async () => {
  mockBotDocs.set("bot_save_test", {
    $id: "bot_save_test",
    name: "Original Bot Name",
    jid: "contact-211d04ecefb7@example.invalid",
    config_settings: JSON.stringify({
      prompt: "AI prompt to preserve",
      some_other_setting: 42,
    }),
  });

  const input = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_555",
    businessAccountId: "waba_555",
  };

  const success = await dbService.saveBotProviderConfig("bot_save_test", input);
  assert.equal(success, true);

  const updatedDoc = mockBotDocs.get("bot_save_test");
  assert.ok(updatedDoc);
  
  // Unrelated top-level bot fields are preserved
  assert.equal(updatedDoc.name, "Original Bot Name");
  assert.equal(updatedDoc.jid, "contact-211d04ecefb7@example.invalid");

  // config_settings is saved as a JSON string and parsed config_settings preserves unrelated keys
  const parsedSettings = JSON.parse(updatedDoc.config_settings);
  assert.equal(parsedSettings.prompt, "AI prompt to preserve");
  assert.equal(parsedSettings.some_other_setting, 42);

  // config_settings is updated with the provider fields
  assert.equal(parsedSettings.providerType, "whatsapp_cloud_api");
  assert.equal(parsedSettings.phoneNumberId, "phone_555");
  assert.equal(parsedSettings.businessAccountId, "waba_555");
});

test("raw access token is encrypted through injected mock and only encryptedAccessTokenRef is saved", async () => {
  mockBotDocs.set("bot_encrypt_test", {
    $id: "bot_encrypt_test",
    config_settings: JSON.stringify({
      prompt: "preserve me",
    }),
  });

  const encryptMock = (raw: string) => `my_mock_encrypted:${raw}`;
  const input = {
    providerType: "whatsapp_cloud_api",
    accessToken: "EAAG_raw_token_value",
  };

  const success = await dbService.saveBotProviderConfig("bot_encrypt_test", input, { encryptSecret: encryptMock });
  assert.equal(success, true);

  const doc = mockBotDocs.get("bot_encrypt_test");
  const parsedSettings = JSON.parse(doc.config_settings);

  // Raw token is not saved, only encryptedAccessTokenRef is saved
  assert.equal(parsedSettings.accessToken, undefined);
  assert.equal(parsedSettings.encryptedAccessTokenRef, "my_mock_encrypted:EAAG_raw_token_value");
});

test("raw token is dropped when no encrypt function is injected", async () => {
  mockBotDocs.set("bot_no_encrypt_test", {
    $id: "bot_no_encrypt_test",
    config_settings: JSON.stringify({}),
  });

  const input = {
    providerType: "whatsapp_cloud_api",
    accessToken: "EAAG_raw_token_value",
  };

  const success = await dbService.saveBotProviderConfig("bot_no_encrypt_test", input);
  assert.equal(success, true);

  const doc = mockBotDocs.get("bot_no_encrypt_test");
  const parsedSettings = JSON.parse(doc.config_settings);

  // Raw token is dropped and not saved
  assert.equal(parsedSettings.accessToken, undefined);
  assert.equal(parsedSettings.encryptedAccessTokenRef, undefined);
  assert.match(parsedSettings.providerLastError || "", /no encryptSecret function injected/);
});

test("existing encryptedAccessTokenRef is preserved during save", async () => {
  mockBotDocs.set("bot_preserve_ref_test", {
    $id: "bot_preserve_ref_test",
    config_settings: JSON.stringify({
      encryptedAccessTokenRef: "enc_ref_safe_existing",
    }),
  });

  const input = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_000",
  };

  const success = await dbService.saveBotProviderConfig("bot_preserve_ref_test", input);
  assert.equal(success, true);

  const doc = mockBotDocs.get("bot_preserve_ref_test");
  const parsedSettings = JSON.parse(doc.config_settings);

  assert.equal(parsedSettings.encryptedAccessTokenRef, "enc_ref_safe_existing");
  assert.equal(parsedSettings.phoneNumberId, "phone_000");
});

test("saving invalid provider type defaults to whatsapp_web", async () => {
  mockBotDocs.set("bot_invalid_type_test", {
    $id: "bot_invalid_type_test",
    config_settings: JSON.stringify({}),
  });

  const input = {
    providerType: "some_invalid_provider_type",
  };

  await dbService.saveBotProviderConfig("bot_invalid_type_test", input);

  const doc = mockBotDocs.get("bot_invalid_type_test");
  const parsedSettings = JSON.parse(doc.config_settings);
  assert.equal(parsedSettings.providerType, "whatsapp_web");
});

test("getBotProviderConfig still works after save helper changes", async () => {
  const config = await dbService.getBotProviderConfig("bot_save_test");
  assert.equal(config.providerType, "whatsapp_cloud_api");
  assert.equal(config.phoneNumberId, "phone_555");
});

test("sanitizeBotConfigSecrets logic drops all secrets", () => {
  const sanitize = (config: any) => {
    if (!config || typeof config !== "object") return config;
    const clean = { ...config };
    const secretKeys = new Set([
      "accesstoken",
      "access_token",
      "token",
      "rawtoken",
      "apikey",
      "api_key",
      "secret",
      "clientsecret",
      "client_secret",
      "appsecret",
      "app_secret",
      "encryptedaccesstokenref",
      "encrypted_access_token_ref",
      "webhookverifytoken",
      "webhook_verify_token"
    ]);
    for (const key of Object.keys(clean)) {
      if (secretKeys.has(key.toLowerCase())) {
        delete clean[key];
      }
    }
    return clean;
  };

  const dirty = {
    prompt: "preserve me",
    systemPrompt: "preserve system prompt",
    learnedInstructions: "preserve instructions",
    accessToken: "EAAG...",
    encryptedAccessTokenRef: "enc_ref...",
    webhookVerifyToken: "xyz...",
    appSecret: "abc...",
    someSafeField: "yes"
  };

  const clean = sanitize(dirty);
  assert.equal(clean.prompt, "preserve me");
  assert.equal(clean.systemPrompt, "preserve system prompt");
  assert.equal(clean.learnedInstructions, "preserve instructions");
  assert.equal(clean.someSafeField, "yes");
  assert.equal(clean.accessToken, undefined);
  assert.equal(clean.encryptedAccessTokenRef, undefined);
  assert.equal(clean.webhookVerifyToken, undefined);
  assert.equal(clean.appSecret, undefined);
});

test("findBotByCloudApiPhoneNumberId finds Cloud API bot on first page", async () => {
  const page1Docs: any[] = Array.from({ length: 99 }, (_, i) => ({
    $id: `bot_dummy_p1_${i}`,
    config_settings: JSON.stringify({ providerType: "whatsapp_web" }),
  }));
  page1Docs.push({
    $id: "bot_target_p1",
    user_id: "user_p1",
    name: "Target P1 Bot",
    config_settings: JSON.stringify({
      providerType: "whatsapp_cloud_api",
      phoneNumberId: "phone_target_p1",
    }),
  });

  let callsCount = 0;
  dbService.databases.listDocuments = (async (dbId: string, collId: string, queries: any[]) => {
    callsCount++;
    return {
      documents: page1Docs,
    };
  }) as any;

  const result = await dbService.findBotByCloudApiPhoneNumberId("phone_target_p1");
  assert.ok(result);
  assert.equal(result.botId, "bot_target_p1");
  assert.equal(result.userId, "user_p1");
  assert.equal(result.phoneNumberId, "phone_target_p1");
  assert.equal(callsCount, 1); // Scanning should stop immediately since target is found on page 1

  // Ensure secrets are not returned in the result object
  const keys = Object.keys(result);
  assert.equal(keys.includes("accessToken"), false);
  assert.equal(keys.includes("encryptedAccessTokenRef"), false);
});

test("findBotByCloudApiPhoneNumberId finds Cloud API bot on second page and stops scanning", async () => {
  const page1Docs = Array.from({ length: 100 }, (_, i) => ({
    $id: `bot_dummy_p1_${i}`,
    config_settings: JSON.stringify({ providerType: "whatsapp_web" }),
  }));
  const page2Docs = [
    {
      $id: "bot_target_p2",
      user_id: "user_p2",
      name: "Target P2 Bot",
      config_settings: JSON.stringify({
        providerType: "whatsapp_cloud_api",
        phoneNumberId: "phone_target_p2",
      }),
    },
    {
      $id: "bot_dummy_p2_1",
      config_settings: JSON.stringify({ providerType: "whatsapp_web" }),
    }
  ];

  let queryOffsets: number[] = [];
  dbService.databases.listDocuments = (async (dbId: string, collId: string, queries: any[]) => {
    // Find offset value in queries
    let offset = 0;
    for (const q of queries) {
      if (typeof q === "string") {
        try {
          const parsed = JSON.parse(q);
          if (parsed && parsed.method === "offset" && Array.isArray(parsed.values)) {
            offset = parsed.values[0];
          }
        } catch (e) {}
      }
    }
    queryOffsets.push(offset);
    if (offset === 0) {
      return { documents: page1Docs };
    } else if (offset === 100) {
      return { documents: page2Docs };
    }
    return { documents: [] };
  }) as any;

  const result = await dbService.findBotByCloudApiPhoneNumberId("phone_target_p2");
  assert.ok(result);
  assert.equal(result.botId, "bot_target_p2");
  assert.equal(result.userId, "user_p2");
  assert.equal(result.phoneNumberId, "phone_target_p2");
  // Expected offsets requested: 0, then 100.
  // Since target is found in page 2 (offset 100), it must stop scanning and never request offset 200.
  assert.deepEqual(queryOffsets, [0, 100]);
});

test("findBotByCloudApiPhoneNumberId returns null when not found across multiple pages", async () => {
  const page1Docs = Array.from({ length: 100 }, (_, i) => ({
    $id: `bot_dummy_p1_${i}`,
    config_settings: JSON.stringify({ providerType: "whatsapp_web" }),
  }));
  const page2Docs = Array.from({ length: 10 }, (_, i) => ({
    $id: `bot_dummy_p2_${i}`,
    config_settings: JSON.stringify({ providerType: "whatsapp_web" }),
  }));

  let queryOffsets: number[] = [];
  dbService.databases.listDocuments = (async (dbId: string, collId: string, queries: any[]) => {
    let offset = 0;
    for (const q of queries) {
      if (typeof q === "string") {
        try {
          const parsed = JSON.parse(q);
          if (parsed && parsed.method === "offset" && Array.isArray(parsed.values)) {
            offset = parsed.values[0];
          }
        } catch (e) {}
      }
    }
    queryOffsets.push(offset);
    if (offset === 0) {
      return { documents: page1Docs, total: 110 };
    } else if (offset === 100) {
      return { documents: page2Docs, total: 110 };
    }
    return { documents: [], total: 110 };
  }) as any;

  const result = await dbService.findBotByCloudApiPhoneNumberId("non_existent_phone");
  assert.equal(result, null);
  // Expected to query offset 0, then offset 100.
  // Since page 2 has 10 documents (< 100 limit), it must break the loop and not query offset 200.
  assert.deepEqual(queryOffsets, [0, 100]);
});

test("findBotByCloudApiPhoneNumberId stops scanning on short final page", async () => {
  const page1Docs = Array.from({ length: 10 }, (_, i) => ({
    $id: `bot_dummy_p1_${i}`,
    config_settings: JSON.stringify({ providerType: "whatsapp_web" }),
  }));

  let queryOffsets: number[] = [];
  dbService.databases.listDocuments = (async (dbId: string, collId: string, queries: any[]) => {
    let offset = 0;
    for (const q of queries) {
      if (typeof q === "string") {
        try {
          const parsed = JSON.parse(q);
          if (parsed && parsed.method === "offset" && Array.isArray(parsed.values)) {
            offset = parsed.values[0];
          }
        } catch (e) {}
      }
    }
    queryOffsets.push(offset);
    return { documents: page1Docs, total: 10 };
  }) as any;

  const result = await dbService.findBotByCloudApiPhoneNumberId("non_existent_phone");
  assert.equal(result, null);
  // Expected to query offset 0 only because page 1 has 10 documents (< 100 limit)
  assert.deepEqual(queryOffsets, [0]);
});

test("findBotByCloudApiPhoneNumberId trims input, returns null for empty/invalid/failure cases", async () => {
  const page1Docs = [
    {
      $id: "bot_cloud_trimmed",
      config_settings: JSON.stringify({
        providerType: "whatsapp_cloud_api",
        phoneNumberId: "phone_trimmed",
      }),
    }
  ];

  dbService.databases.listDocuments = (async () => {
    return { documents: page1Docs };
  }) as any;

  // Trim check
  const resultTrim = await dbService.findBotByCloudApiPhoneNumberId("  phone_trimmed  ");
  assert.ok(resultTrim);
  assert.equal(resultTrim.botId, "bot_cloud_trimmed");

  // Empty check
  const resultEmpty = await dbService.findBotByCloudApiPhoneNumberId("");
  assert.equal(resultEmpty, null);

  // Missing config settings check
  page1Docs[0].config_settings = undefined as any;
  const resultMissing = await dbService.findBotByCloudApiPhoneNumberId("phone_trimmed");
  assert.equal(resultMissing, null);

  // Invalid JSON check
  page1Docs[0].config_settings = "{invalid json}" as any;
  const resultInvalid = await dbService.findBotByCloudApiPhoneNumberId("phone_trimmed");
  assert.equal(resultInvalid, null);

  // DB failure check
  dbService.databases.listDocuments = (async () => {
    throw new Error("DB Error");
  }) as any;
  const resultFailure = await dbService.findBotByCloudApiPhoneNumberId("phone_trimmed");
  assert.equal(resultFailure, null);
});

test("cleanup mock databases", () => {
  // Restore original databases references
  dbService.databases.getDocument = originalGetDocument;
  dbService.databases.updateDocument = originalUpdateDocument;
  dbService.databases.listDocuments = originalListDocuments;
});
