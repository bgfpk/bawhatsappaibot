// src/services/whatsapp-cloud-api-local-history-adapter.test.ts
//
// Unit tests for the Cloud API local history message adapter (Phase 4U).
// Uses Node native test runner — no Jest globals.
//

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cloudIncomingMessageToLocalHistoryMessage,
  summarizeCloudLocalHistoryMessage,
} from "./whatsapp-cloud-api-local-history-adapter.ts";
import type { NormalizedIncomingMessage } from "./whatsapp-transport-types.ts";

// Helper to make a standard normalized text message
function makeNormalizedTextMessage(overrides: Partial<NormalizedIncomingMessage> = {}): NormalizedIncomingMessage {
  return {
    providerType: "whatsapp_cloud_api",
    chatId: "contact-fcf57a3c231e@example.invalid",
    messageId: "wamid.HBgLMTIzNDU2Nzg5MDFG",
    senderName: "Alice Miller",
    timestamp: 1718000000000, // ms (corresponds to 1718000000 sec)
    messageType: "text",
    text: "Hello world, this is a test!",
    hasMedia: false,
    isGroup: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Conversion
// ---------------------------------------------------------------------------

test("converts standard text message to Baileys-like local history shape", () => {
  const normalized = makeNormalizedTextMessage();
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);

  assert.ok(converted !== null, "Converted result should not be null");
  assert.deepEqual(converted.key, {
    remoteJid: "contact-fcf57a3c231e@example.invalid",
    fromMe: false,
    id: "wamid.HBgLMTIzNDU2Nzg5MDFG",
  });
  assert.equal(converted.messageTimestamp, 1718000000); // Converted to seconds
  assert.deepEqual(converted.message, {
    conversation: "Hello world, this is a test!",
  });
  assert.equal(converted.pushName, "Alice Miller");
});

test("fromMe is always false in converted history shape", () => {
  const normalized = makeNormalizedTextMessage();
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.equal(converted.key.fromMe, false);
});

test("remoteJid matches message chatId (customer JID)", () => {
  const normalized = makeNormalizedTextMessage({ chatId: "contact-e15ce2a62d6f@example.invalid" });
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.equal(converted.key.remoteJid, "contact-e15ce2a62d6f@example.invalid");
});

test("message id is preserved exactly", () => {
  const normalized = makeNormalizedTextMessage({ messageId: "custom-msg-id-123" });
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.equal(converted.key.id, "custom-msg-id-123");
});

test("timestamp maps safely from ms to seconds", () => {
  const normalized = makeNormalizedTextMessage({ timestamp: 1720000055000 });
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.equal(converted.messageTimestamp, 1720000055);
});

test("contact name is mapped to pushName", () => {
  const normalized = makeNormalizedTextMessage({ senderName: "Bob Smith" });
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.equal(converted.pushName, "Bob Smith");
});

test("returns null if input message is null or undefined", () => {
  assert.equal(cloudIncomingMessageToLocalHistoryMessage(null), null);
  assert.equal(cloudIncomingMessageToLocalHistoryMessage(undefined), null);
});

test("converts image message to Baileys-like imageMessage shape", () => {
  const normalized: NormalizedIncomingMessage = {
    providerType: "whatsapp_cloud_api",
    chatId: "contact-fcf57a3c231e@example.invalid",
    messageId: "wamid.img_123",
    senderName: "Alice Miller",
    timestamp: 1718000000000,
    messageType: "image",
    hasMedia: true,
    mediaId: "meta_media_id_999",
    mediaMimeType: "image/jpeg",
    caption: "Look at this product",
    isGroup: false,
  };

  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.ok(converted);
  assert.equal(converted.key.id, "wamid.img_123");
  assert.ok(converted.message.imageMessage);
  assert.equal(converted.message.imageMessage.mimetype, "image/jpeg");
  assert.equal(converted.message.imageMessage.caption, "Look at this product");
  assert.equal(converted.message.imageMessage.cloudMedia?.mediaId, "meta_media_id_999");
});

test("converts audio/voice message to Baileys-like audioMessage shape", () => {
  const normalized: NormalizedIncomingMessage = {
    providerType: "whatsapp_cloud_api",
    chatId: "contact-fcf57a3c231e@example.invalid",
    messageId: "wamid.audio_123",
    senderName: "Alice Miller",
    timestamp: 1718000000000,
    messageType: "audio",
    hasMedia: true,
    mediaId: "meta_media_audio_777",
    mediaMimeType: "audio/ogg; codecs=opus",
    isGroup: false,
  };

  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.ok(converted);
  assert.equal(converted.key.id, "wamid.audio_123");
  assert.ok(converted.message.audioMessage);
  assert.equal(converted.message.audioMessage.mimetype, "audio/ogg; codecs=opus");
  assert.equal(converted.message.audioMessage.ptt, true);
  assert.equal(converted.message.audioMessage.cloudMedia?.mediaId, "meta_media_audio_777");
});

test("converts document message to Baileys-like documentMessage shape", () => {
  const normalized: NormalizedIncomingMessage = {
    providerType: "whatsapp_cloud_api",
    chatId: "contact-fcf57a3c231e@example.invalid",
    messageId: "wamid.doc_123",
    senderName: "Alice Miller",
    timestamp: 1718000000000,
    messageType: "document",
    hasMedia: true,
    mediaId: "meta_media_doc_555",
    mediaMimeType: "application/pdf",
    caption: "Invoice for your order",
    isGroup: false,
  };

  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.ok(converted);
  assert.ok(converted.message.documentMessage);
  assert.equal(converted.message.documentMessage.mimetype, "application/pdf");
  assert.equal(converted.message.documentMessage.caption, "Invoice for your order");
  assert.equal(converted.message.documentMessage.cloudMedia?.mediaId, "meta_media_doc_555");
});

test("returns null if text field is missing or empty string on text message", () => {
  const normalized = makeNormalizedTextMessage({ text: "" });
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  assert.equal(converted, null);

  const normalized2 = makeNormalizedTextMessage({ text: undefined });
  const converted2 = cloudIncomingMessageToLocalHistoryMessage(normalized2);
  assert.equal(converted2, null);
});

// ---------------------------------------------------------------------------
// Tests: Summary Helper
// ---------------------------------------------------------------------------

test("summarize helper handles null result gracefully", () => {
  const summary = summarizeCloudLocalHistoryMessage(null);
  assert.deepEqual(summary, { status: "unsupported_or_null" });
});

test("summarize helper returns safe stats without exposing text body or raw payload", () => {
  const normalized = makeNormalizedTextMessage({
    text: "Super secret password!",
  });
  const converted = cloudIncomingMessageToLocalHistoryMessage(normalized);
  const summary = summarizeCloudLocalHistoryMessage(converted);

  assert.equal(summary.status, "success");
  assert.equal(summary.remoteJid, "contact-fcf57a3c231e@example.invalid");
  assert.equal(summary.messageId, "wamid.HBgLMTIzNDU2Nzg5MDFG");
  assert.equal(summary.textLength, 22);
  assert.equal(summary.fromMe, false);
  assert.equal(summary.hasPushName, true);

  // Assert absolute confidentiality: no password string leaks in the summary
  const summaryStr = JSON.stringify(summary);
  assert.ok(!summaryStr.includes("secret"), "Summary must not leak message content");
  assert.ok(!summaryStr.includes("password"), "Summary must not leak message content");
});

// ---------------------------------------------------------------------------
// Tests: Safety & Dependency Rules
// ---------------------------------------------------------------------------

test("module does not import server.ts or bot-worker.ts", () => {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const implFile = join(thisDir, "whatsapp-cloud-api-local-history-adapter.ts");
  const source = readFileSync(implFile, "utf-8");

  const importLines = source.split("\n").filter((line) => /^\s*import\s/.test(line));

  for (const line of importLines) {
    assert.ok(!line.includes("bot-worker"), `Must not import bot-worker: ${line.trim()}`);
    assert.ok(!line.includes("server.ts"), `Must not import server.ts: ${line.trim()}`);
  }
});
