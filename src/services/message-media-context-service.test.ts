import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetMessageMediaContextTestDeps,
  __setMessageMediaContextTestDeps,
  buildRecentMediaContextIndexKey,
  buildMediaContextHistoryText,
  buildMediaConfigFingerprint,
  buildMediaContextKey,
  buildMediaContextRefKey,
  buildMediaHash,
  buildMediaPayloadFingerprint,
  findBestSavedMediaContextForReference,
  getSavedMediaContext,
  getSavedMediaContextByMessage,
  hasSameFailedMediaContext,
  hasUsefulSavedMediaContext,
  listRecentSavedMediaContexts,
  messageReferencesRememberedMedia,
  saveMediaContext,
} from "./message-media-context-service.ts";

test.afterEach(() => {
  __resetMessageMediaContextTestDeps();
});

test("durable media context stores and reloads useful image understanding in system config storage", async () => {
  const store = new Map<string, string>();
  __setMessageMediaContextTestDeps({
    getSystemConfig: async (key) => store.get(key) || null,
    setSystemConfig: async (key, value) => {
      store.set(key, value);
    },
  });

  const mediaHash = buildMediaHash(Buffer.from("image-bytes"));
  const payloadFingerprint = buildMediaPayloadFingerprint({
    mediaHash,
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
  });
  const configFingerprint = buildMediaConfigFingerprint({
    purpose: "customer_ai_image_understanding",
    latestCustomerText: "What is in this image?",
    caption: "Please check this",
  });

  const saved = await saveMediaContext({
    type: "image",
    provider: "platform_gemini",
    model: "models/gemini-2.5-flash",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_1",
    mediaHash,
    purpose: "customer_ai_image_understanding",
    useful: true,
    summary: "Premium fertilizer flower seeds combo pack poster.",
    visibleText: "Black Gold Fertilizer",
    transcript: "",
    language: "en",
    confidence: 0.92,
    failureReason: "",
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    payloadFingerprint,
    configFingerprint,
  });

  const loaded = await getSavedMediaContext({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_1",
    mediaHash,
    type: "image",
    purpose: "customer_ai_image_understanding",
  });

  assert.equal(saved.mediaHash, mediaHash);
  assert.equal(buildMediaContextKey(saved).includes("customer_media_understanding"), true);
  assert.equal(buildMediaContextRefKey(saved).includes("customer_media_understanding_ref"), true);
  assert.equal(hasUsefulSavedMediaContext(loaded), true);
  assert.match(String(loaded?.summary || ""), /fertilizer/i);
});

test("durable media context can remember a failed audio understanding without treating it as useful", async () => {
  const store = new Map<string, string>();
  __setMessageMediaContextTestDeps({
    getSystemConfig: async (key) => store.get(key) || null,
    setSystemConfig: async (key, value) => {
      store.set(key, value);
    },
  });

  const mediaHash = buildMediaHash(Buffer.from("audio-bytes"));
  const payloadFingerprint = buildMediaPayloadFingerprint({
    mediaHash,
    sourceMime: "audio/ogg; codecs=opus",
    normalizedMime: "audio/wav",
  });
  const configFingerprint = buildMediaConfigFingerprint({
    purpose: "customer_ai_audio_understanding",
    latestCustomerText: "Please check this voice note",
  });

  await saveMediaContext({
    type: "audio",
    provider: "platform_gemini",
    model: "models/gemini-2.5-flash",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_2",
    mediaHash,
    purpose: "customer_ai_audio_understanding",
    useful: false,
    summary: "",
    visibleText: "",
    transcript: "",
    language: "",
    confidence: 0,
    failureReason: "empty_audio_understanding",
    sourceMime: "audio/ogg; codecs=opus",
    normalizedMime: "audio/wav",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    payloadFingerprint,
    configFingerprint,
  });

  const loaded = await getSavedMediaContext({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_2",
    mediaHash,
    type: "audio",
    purpose: "customer_ai_audio_understanding",
  });

  assert.equal(hasUsefulSavedMediaContext(loaded), false);
  assert.equal(hasSameFailedMediaContext(loaded, { payloadFingerprint, configFingerprint }), true);
  assert.equal(loaded?.failureReason, "empty_audio_understanding");
});

test("durable audio transcript can be resolved by message id for feed or history display", async () => {
  const store = new Map<string, string>();
  __setMessageMediaContextTestDeps({
    getSystemConfig: async (key) => store.get(key) || null,
    setSystemConfig: async (key, value) => {
      store.set(key, value);
    },
  });

  const mediaHash = buildMediaHash(Buffer.from("audio-transcript"));
  await saveMediaContext({
    type: "audio",
    provider: "platform_gemini",
    model: "models/gemini-2.5-flash",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_audio_1",
    mediaHash,
    purpose: "customer_ai_audio_understanding",
    useful: true,
    summary: "Customer is asking about clinic timing.",
    visibleText: "",
    transcript: "Please send me the clinic timing.",
    language: "en",
    confidence: 0.91,
    failureReason: "",
    sourceMime: "audio/ogg; codecs=opus",
    normalizedMime: "audio/wav",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    payloadFingerprint: "payload_1",
    configFingerprint: "config_1",
  });

  const loaded = await getSavedMediaContextByMessage({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_audio_1",
    type: "audio",
    purpose: "customer_ai_audio_understanding",
  });

  assert.match(buildMediaContextHistoryText(loaded, "Voice note received, transcript unavailable"), /^Voice note:/);
  assert.match(buildMediaContextHistoryText(loaded, "Voice note received, transcript unavailable"), /clinic timing/i);
});

test("failed durable media result does not block a later changed config fingerprint", () => {
  const failedRecord = {
    type: "image" as const,
    provider: "platform_gemini",
    model: "models/gemini-2.5-flash",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_img_1",
    mediaHash: "hash_1",
    purpose: "customer_ai_image_understanding",
    useful: false,
    summary: "",
    visibleText: "",
    transcript: "",
    language: "",
    confidence: 0,
    failureReason: "empty_image_understanding",
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    payloadFingerprint: "payload_same",
    configFingerprint: "config_old",
  };

  assert.equal(hasSameFailedMediaContext(failedRecord, { payloadFingerprint: "payload_same", configFingerprint: "config_old" }), true);
  assert.equal(hasSameFailedMediaContext(failedRecord, { payloadFingerprint: "payload_same", configFingerprint: "config_new" }), false);
});

test("text-only message referencing SlimSip reuses recent durable image context by name match", async () => {
  const store = new Map<string, string>();
  __setMessageMediaContextTestDeps({
    getSystemConfig: async (key) => store.get(key) || null,
    setSystemConfig: async (key, value) => {
      store.set(key, value);
    },
  });

  await saveMediaContext({
    type: "image",
    provider: "deepinfra_vision",
    model: "meta-vision",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_slimsip",
    mediaHash: buildMediaHash(Buffer.from("slimsip-image")),
    purpose: "customer_ai_image_understanding",
    useful: true,
    summary: "SlimSip product pouch with visible label and benefits.",
    visibleText: "SlimSip",
    transcript: "",
    language: "en",
    confidence: 0.95,
    failureReason: "",
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    payloadFingerprint: "payload_slimsip",
    configFingerprint: "config_slimsip",
  });
  await saveMediaContext({
    type: "image",
    provider: "deepinfra_vision",
    model: "meta-vision",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_other",
    mediaHash: buildMediaHash(Buffer.from("other-image")),
    purpose: "customer_ai_image_understanding",
    useful: true,
    summary: "Herbal tea label with ingredients.",
    visibleText: "Herbal Tea",
    transcript: "",
    language: "en",
    confidence: 0.9,
    failureReason: "",
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
    createdAt: 2,
    updatedAt: 2,
    version: 1,
    payloadFingerprint: "payload_other",
    configFingerprint: "config_other",
  });

  const match = await findBestSavedMediaContextForReference({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    latestUserText: "Do you remember SlimSip? Tell me in voice message.",
  });

  assert.equal(match?.messageId, "msg_slimsip");
  assert.match(String(match?.summary || ""), /SlimSip/i);
});

test("recent durable media list preserves newest useful contexts for remembered product lookup", async () => {
  const store = new Map<string, string>();
  __setMessageMediaContextTestDeps({
    getSystemConfig: async (key) => store.get(key) || null,
    setSystemConfig: async (key, value) => {
      store.set(key, value);
    },
  });

  await saveMediaContext({
    type: "image",
    provider: "deepinfra_vision",
    model: "meta-vision",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_one",
    mediaHash: buildMediaHash(Buffer.from("one")),
    purpose: "customer_ai_image_understanding",
    useful: true,
    summary: "Old product summary.",
    visibleText: "Old",
    transcript: "",
    language: "en",
    confidence: 0.5,
    failureReason: "",
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    payloadFingerprint: "payload_one",
    configFingerprint: "config_one",
  });
  await saveMediaContext({
    type: "image",
    provider: "deepinfra_vision",
    model: "meta-vision",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageId: "msg_two",
    mediaHash: buildMediaHash(Buffer.from("two")),
    purpose: "customer_ai_image_understanding",
    useful: true,
    summary: "New product summary.",
    visibleText: "New",
    transcript: "",
    language: "en",
    confidence: 0.7,
    failureReason: "",
    sourceMime: "image/jpeg",
    normalizedMime: "image/jpeg",
    createdAt: 2,
    updatedAt: 2,
    version: 1,
    payloadFingerprint: "payload_two",
    configFingerprint: "config_two",
  });

  const recent = await listRecentSavedMediaContexts({
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
  });

  assert.equal(recent.length, 2);
  assert.equal(recent[0].messageId, "msg_two");
  assert.equal(store.has(buildRecentMediaContextIndexKey({ botId: "bot_1", customerJid: "contact-e4ed32210a80@example.invalid" })), true);
});

test("remembered media reference detector catches generic product and image callbacks", () => {
  assert.equal(messageReferencesRememberedMedia("Do you remember SlimSip?"), true);
  assert.equal(messageReferencesRememberedMedia("What about the image I sent?"), true);
  assert.equal(messageReferencesRememberedMedia("Please share the clinic timing."), false);
});
