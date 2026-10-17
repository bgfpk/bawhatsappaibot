import test from "node:test";
import assert from "node:assert";
import { 
  normalizeBaileysIncomingMessage,
  normalizeBaileysMessageType,
  normalizeBaileysConnectionStatus,
  normalizeBaileysSendResult,
} from "./baileys-transport-normalizer.ts";

// Helper to build minimal raw message objects similar to Baileys upsert payload
function makeRawMsg({
  remoteJid = "contact-b7fef06f39af@example.invalid",
  id = "ABCD1234",
  message = {},
}) {
  return {
    key: { remoteJid, id },
    message,
  };
}


test("normalizeBaileysMessageType - text conversation", () => {
  const type = normalizeBaileysMessageType({ conversation: "hello" });
  assert.equal(type, "text");
});

test("normalizeBaileysMessageType - extended text", () => {
  const type = normalizeBaileysMessageType({ extendedTextMessage: { text: "hi" } });
  assert.equal(type, "text");
});

test("normalizeBaileysMessageType - image", () => {
  const type = normalizeBaileysMessageType({ imageMessage: { mimetype: "image/jpeg" } });
  assert.equal(type, "image");
});

test("normalizeBaileysMessageType - audio voice flag", () => {
  const voice = normalizeBaileysMessageType({ audioMessage: { ptt: true } });
  const audio = normalizeBaileysMessageType({ audioMessage: { ptt: false } });
  assert.equal(voice, "voice");
  assert.equal(audio, "audio");
});

test("normalizeBaileysIncomingMessage - basic text", () => {
  const raw = makeRawMsg({
    message: { conversation: "hello world" },
  });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.providerType, "whatsapp_web");
  assert.equal(norm.chatId, "contact-b7fef06f39af@example.invalid");
  assert.equal(norm.messageId, "ABCD1234");
  assert.equal(norm.messageType, "text");
  assert.equal(norm.text, "hello world");
  assert.equal(norm.hasMedia, false);
  assert.equal(norm.isGroup, false);
});

test("normalizeBaileysIncomingMessage - image with caption", () => {
  const raw = makeRawMsg({
    message: { imageMessage: { mimetype: "image/png", caption: "look", mediaKey: "key123" } },
  });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.messageType, "image");
  assert.equal(norm.caption, "look");
  assert.equal(norm.mediaMimeType, "image/png");
  assert.equal(norm.mediaId, "key123");
  assert.equal(norm.hasMedia, true);
});

test("normalizeBaileysIncomingMessage - audio without transcript", () => {
  const raw = makeRawMsg({
    message: { audioMessage: { mimetype: "audio/ogg", ptt: false, mediaKey: "audkey" } },
  });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.messageType, "audio");
  assert.equal(norm.hasMedia, true);
  assert.equal(norm.mediaMimeType, "audio/ogg");
  assert.equal(norm.mediaId, "audkey");
  assert.equal(norm.text, undefined);
});

test("normalizeBaileysIncomingMessage - audio with transcript (caption)", () => {
  const raw = makeRawMsg({
    message: { audioMessage: { mimetype: "audio/ogg", ptt: false, caption: "transcript", mediaKey: "audkey" } },
  });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.text, "transcript");
});

test("normalizeBaileysIncomingMessage - document", () => {
  const raw = makeRawMsg({
    message: { documentMessage: { mimetype: "application/pdf", mediaKey: "dockey" } },
  });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.messageType, "document");
  assert.equal(norm.mediaMimeType, "application/pdf");
  assert.equal(norm.mediaId, "dockey");
});

test("normalizeBaileysIncomingMessage - sticker", () => {
  const raw = makeRawMsg({
    message: { stickerMessage: { mimetype: "image/webp", mediaKey: "stkey" } },
  });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.messageType, "sticker");
  assert.equal(norm.mediaMimeType, "image/webp");
});

test("normalizeBaileysIncomingMessage - group JID detection", () => {
  const raw = makeRawMsg({ remoteJid: "contact-d2c43a3c6662@example.invalid" });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.isGroup, true);
  assert.equal(norm.groupId, "contact-d2c43a3c6662@example.invalid");
});

test("normalizeBaileysIncomingMessage - unknown message type", () => {
  const raw = makeRawMsg({ message: { unknownField: {} } });
  const norm = normalizeBaileysIncomingMessage(raw);
  assert.equal(norm.messageType, "unknown");
  assert.equal(norm.hasMedia, false);
});

test("normalizeBaileysConnectionStatus mapping", () => {
  assert.equal(normalizeBaileysConnectionStatus("connecting"), "connecting");
  assert.equal(normalizeBaileysConnectionStatus("qr"), "qr_ready");
  assert.equal(normalizeBaileysConnectionStatus("open"), "connected");
  assert.equal(normalizeBaileysConnectionStatus("close"), "disconnected");
  assert.equal(normalizeBaileysConnectionStatus("error"), "error");
});

test("normalizeBaileysSendResult success mapping", () => {
  const result = { key: { id: "msg123", remoteJid: "123" }, status: "sent" };
  const norm = normalizeBaileysSendResult(result);
  assert.equal(norm.success, true);
  assert.equal(norm.providerMessageId, "msg123");
  assert.equal(norm.receiptStatus, "sent");
});
