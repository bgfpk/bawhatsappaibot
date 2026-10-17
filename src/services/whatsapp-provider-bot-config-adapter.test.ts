// src/services/whatsapp-provider-bot-config-adapter.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  getConfigSettingsFromBotDocument,
  readProviderConfigFromBotDocument,
  mergeProviderConfigIntoBotDocument
} from "./whatsapp-provider-bot-config-adapter.ts";

test("missing config_settings defaults to whatsapp_web", () => {
  const botDoc = {
    $id: "bot_123",
    name: "Missing Config Bot",
  };
  const config = readProviderConfigFromBotDocument(botDoc);
  assert.equal(config.providerType, "whatsapp_web");
});

test("JSON string config_settings is parsed correctly", () => {
  const botDoc = {
    $id: "bot_123",
    config_settings: JSON.stringify({
      providerType: "whatsapp_cloud_api",
      phoneNumberId: "phone_555",
    }),
  };

  const config = readProviderConfigFromBotDocument(botDoc);
  assert.equal(config.providerType, "whatsapp_cloud_api");
  assert.equal(config.phoneNumberId, "phone_555");
});

test("object config_settings is parsed correctly", () => {
  const botDoc = {
    $id: "bot_123",
    config_settings: {
      providerType: "whatsapp_cloud_api",
      phoneNumberId: "phone_666",
    },
  };

  const config = readProviderConfigFromBotDocument(botDoc);
  assert.equal(config.providerType, "whatsapp_cloud_api");
  assert.equal(config.phoneNumberId, "phone_666");
});

test("invalid JSON safely defaults to whatsapp_web", () => {
  const botDoc = {
    $id: "bot_123",
    config_settings: "{invalid-json-string",
  };

  const config = readProviderConfigFromBotDocument(botDoc);
  assert.equal(config.providerType, "whatsapp_web");
});

test("merging Cloud API config preserves unrelated bot fields", () => {
  const botDoc = {
    $id: "bot_123",
    name: "Preserved Name",
    jid: "contact-b7fef06f39af@example.invalid",
    is_active: 1,
    config_settings: {
      prompt: "AI prompt",
    },
  };

  const providerConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_1",
  };

  const mergedDoc = mergeProviderConfigIntoBotDocument(botDoc, providerConfig);

  // Top-level document fields are preserved
  assert.equal(mergedDoc.$id, "bot_123");
  assert.equal(mergedDoc.name, "Preserved Name");
  assert.equal(mergedDoc.jid, "contact-b7fef06f39af@example.invalid");
  assert.equal(mergedDoc.is_active, 1);
});

test("merging Cloud API config preserves unrelated settings", () => {
  const botDoc = {
    $id: "bot_123",
    config_settings: {
      prompt: "AI prompt to preserve",
      learned_instructions: "learned stuff",
    },
  };

  const providerConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "phone_123",
  };

  const mergedDoc = mergeProviderConfigIntoBotDocument(botDoc, providerConfig);
  const settings = mergedDoc.config_settings;

  // Unrelated settings inside config_settings are preserved
  assert.equal(settings.prompt, "AI prompt to preserve");
  assert.equal(settings.learned_instructions, "learned stuff");
  
  // Provider config is merged
  assert.equal(settings.providerType, "whatsapp_cloud_api");
  assert.equal(settings.phoneNumberId, "phone_123");
});

test("original bot document is not mutated", () => {
  const botDoc = {
    $id: "bot_123",
    name: "Original Name",
    config_settings: {
      prompt: "original prompt",
    },
  };

  const providerConfig = {
    providerType: "whatsapp_cloud_api",
  };

  const mergedDoc = mergeProviderConfigIntoBotDocument(botDoc, providerConfig);

  // Original remains unchanged
  assert.equal(botDoc.name, "Original Name");
  assert.equal(botDoc.config_settings.prompt, "original prompt");
  assert.equal((botDoc.config_settings as any).providerType, undefined);

  // Merged is updated
  assert.equal(mergedDoc.config_settings.providerType, "whatsapp_cloud_api");
});

test("raw token fields are not saved", () => {
  const botDoc = {
    $id: "bot_123",
    config_settings: {
      prompt: "AI prompt",
    },
  };

  const badProviderConfig = {
    providerType: "whatsapp_cloud_api",
    accessToken: "EAAG_raw_token_xyz",
    encryptedAccessTokenRef: "enc_ref_safe_123",
  };

  const mergedDoc = mergeProviderConfigIntoBotDocument(botDoc, badProviderConfig);
  const settings = mergedDoc.config_settings;

  assert.equal(settings.accessToken, undefined);
  assert.equal(settings.encryptedAccessTokenRef, "enc_ref_safe_123");
});

test("existing Baileys/Web bot remains compatible", () => {
  const botDoc = {
    $id: "bot_web",
    config_settings: {
      prompt: "AI prompt",
    },
  };

  const config = readProviderConfigFromBotDocument(botDoc);
  assert.equal(config.providerType, "whatsapp_web");
});
