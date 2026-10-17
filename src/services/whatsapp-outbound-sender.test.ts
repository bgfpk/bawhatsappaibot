// src/services/whatsapp-outbound-sender.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createWhatsAppOutboundSender } from "./whatsapp-outbound-sender.ts";
import { WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";

test("Baileys text send calls injected sender with exact { text } payload", async () => {
  let receivedJid = "";
  let receivedPayload: any = null;

  const mockBaileysSend = async (jid: string, payload: any) => {
    receivedJid = jid;
    receivedPayload = payload;
    return { key: { id: "baileys_msg_123" } };
  };

  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_web",
    baileysSendMessage: mockBaileysSend,
  });

  const result = await sender.sendText("contact-b7fef06f39af@example.invalid", "hello world");
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "baileys_msg_123");
  assert.equal(receivedJid, "contact-b7fef06f39af@example.invalid");
  assert.deepEqual(receivedPayload, { text: "hello world" });
});

test("Cloud API text send calls cloudProvider.sendText", async () => {
  let receivedJid = "";
  let receivedText = "";
  let receivedOptions: any = null;

  const mockCloudProvider = {
    sendText: async (jid: string, text: string, options: any) => {
      receivedJid = jid;
      receivedText = text;
      receivedOptions = options;
      return { success: true, providerMessageId: "cloud_msg_999" };
    },
  } as unknown as WhatsAppTransportProvider;

  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_cloud_api",
    cloudProvider: mockCloudProvider,
  });

  const result = await sender.sendText("contact-583caa0441c5@example.invalid", "hello cloud", { foo: "bar" });
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "cloud_msg_999");
  assert.equal(receivedJid, "contact-583caa0441c5@example.invalid");
  assert.equal(receivedText, "hello cloud");
  assert.deepEqual(receivedOptions, { foo: "bar" });
});

test("missing Baileys sender returns controlled failure", async () => {
  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_web",
  });

  const result = await sender.sendText("contact-bb1fa5c89e92@example.invalid", "test missing");
  assert.equal(result.success, false);
  assert.match(result.errorMessage || "", /baileysSendMessage function missing/);
});

test("missing Cloud provider returns controlled failure", async () => {
  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_cloud_api",
  });

  const result = await sender.sendText("contact-bb1fa5c89e92@example.invalid", "test missing cloud");
  assert.equal(result.success, false);
  assert.match(result.errorMessage || "", /cloudProvider object missing/);
});

test("unknown provider defaults safely to WhatsApp Web behavior", async () => {
  let receivedPayload: any = null;
  const mockBaileysSend = async (jid: string, payload: any) => {
    receivedPayload = payload;
    return { key: { id: "fallback_id" } };
  };

  const sender = createWhatsAppOutboundSender({
    providerType: "some_unknown_provider_type",
    baileysSendMessage: mockBaileysSend,
  });

  const result = await sender.sendText("contact-bb1fa5c89e92@example.invalid", "fallback test");
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "fallback_id");
  assert.deepEqual(receivedPayload, { text: "fallback test" });
});

test("errors from injected sender are caught and returned as controlled failure", async () => {
  const mockBaileysSend = async () => {
    throw new Error("Network offline");
  };

  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_web",
    baileysSendMessage: mockBaileysSend,
  });

  const result = await sender.sendText("contact-bb1fa5c89e92@example.invalid", "error test");
  assert.equal(result.success, false);
  assert.equal(result.errorMessage, "Network offline");
});

test("outbound sender does not import bot-worker.ts or server.ts", () => {
  const content = fs.readFileSync(path.join(import.meta.dirname, "whatsapp-outbound-sender.ts"), "utf-8");
  assert.equal(content.includes("bot-worker"), false);
  assert.equal(content.includes("server"), false);
});

test("Baileys media send maps to correct payload shapes", async () => {
  let receivedPayload: any = null;
  const mockBaileysSend = async (jid: string, payload: any) => {
    receivedPayload = payload;
    return { key: { id: "media_msg_123" } };
  };

  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_web",
    baileysSendMessage: mockBaileysSend,
  });

  const buffer = Buffer.from("fake data");

  // Test Image
  await sender.sendMedia({
    jid: "contact-bb1fa5c89e92@example.invalid",
    buffer,
    mimetype: "image/jpeg",
    type: "image",
    caption: "cool image",
  });
  assert.deepEqual(receivedPayload, { image: buffer, caption: "cool image" });

  // Test Voice
  await sender.sendMedia({
    jid: "contact-bb1fa5c89e92@example.invalid",
    buffer,
    mimetype: "audio/ogg; codecs=opus",
    type: "voice",
  });
  assert.deepEqual(receivedPayload, { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true });

  // Test Document
  await sender.sendMedia({
    jid: "contact-bb1fa5c89e92@example.invalid",
    buffer,
    mimetype: "application/pdf",
    type: "document",
    fileName: "report.pdf",
  });
  assert.deepEqual(receivedPayload, { document: buffer, mimetype: "application/pdf", fileName: "report.pdf" });
});

test("rawProviderResponse preserves the exact raw Baileys response object and message ID", async () => {
  const originalBaileysResponse = {
    key: { id: "baileys_actual_msg_987", remoteJid: "contact-b7fef06f39af@example.invalid", fromMe: true },
    message: { conversation: "raw match test" },
    messageTimestamp: 1719876543,
  };

  const mockBaileysSend = async () => {
    return originalBaileysResponse;
  };

  const sender = createWhatsAppOutboundSender({
    providerType: "whatsapp_web",
    baileysSendMessage: mockBaileysSend,
  });

  const result = await sender.sendText("contact-b7fef06f39af@example.invalid", "hello world");
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "baileys_actual_msg_987");
  assert.deepEqual(result.rawProviderResponse, originalBaileysResponse);
});
