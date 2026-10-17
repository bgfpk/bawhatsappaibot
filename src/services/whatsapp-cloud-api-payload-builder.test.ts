// src/services/whatsapp-cloud-api-payload-builder.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCloudApiTextPayload,
  buildCloudApiTemplatePayload,
  buildCloudApiMediaPayload,
  buildCloudApiDocumentPayload,
  buildCloudApiAudioPayload,
  buildCloudApiMarkReadPayload,
  mapPlaceholderSendResult,
} from "./whatsapp-cloud-api-payload-builder.ts";

test("build text payload strictly matches Meta individual text contract", () => {
  const payload = buildCloudApiTextPayload("contact-e4ed32210a80@example.invalid", "Hello World");
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "text",
    text: {
      preview_url: false,
      body: "Hello World",
    },
  });
});

test("build template payload with components", () => {
  const components = [{ type: "body", parameters: [{ type: "text", text: "param" }] }];
  const payload = buildCloudApiTemplatePayload("195545134641", "welcome_template", "en_US", components);
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "template",
    template: {
      name: "welcome_template",
      language: { code: "en_US" },
      components,
    },
  });
});

test("build media payload – image with caption", () => {
  const payload = buildCloudApiMediaPayload("195545134641", "image", "media-id", "A caption");
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "image",
    image: { id: "media-id", caption: "A caption" },
  });
});

test("build media payload – sticker without caption", () => {
  const payload = buildCloudApiMediaPayload("195545134641", "sticker", "media-id");
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "sticker",
    sticker: { id: "media-id" },
  });
});

test("build document payload", () => {
  const payload = buildCloudApiDocumentPayload("195545134641", "doc-id", "file.pdf", "Doc caption");
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "document",
    document: { id: "doc-id", filename: "file.pdf", caption: "Doc caption" },
  });
});

test("build audio payload", () => {
  const payload = buildCloudApiAudioPayload("195545134641", "audio-id");
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "audio",
    audio: { id: "audio-id" },
  });
});

test("build mark‑read payload", () => {
  const payload = buildCloudApiMarkReadPayload("msg-123");
  assert.deepStrictEqual(payload, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "msg-123",
  });
});

test("map placeholder send result – success", () => {
  const metaSuccess = {
    messaging_product: "whatsapp",
    contacts: [{ input: "195545134641", wa_id: "195545134641" }],
    messages: [{ id: "wamid.msg_123" }],
  };
  const result = mapPlaceholderSendResult(metaSuccess);
  assert.ok(result.success);
  assert.equal(result.providerMessageId, "wamid.msg_123");
});

test("map placeholder send result – failure", () => {
  const metaError = {
    error: {
      message: "Rate limit reached",
      code: 130429,
    },
  };
  const result = mapPlaceholderSendResult(metaError);
  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.errorCode, "rate_limit_exceeded");
});
