// src/services/whatsapp-cloud-api-media-e2e.test.ts
//
// End-to-end integration tests for WhatsApp Cloud API Prompt 3 Media Parity:
// - Inbound media conversion and provider-aware download
// - Outbound image, voice note (voice: true), document, and sticker delivery
// - Real WAMID tracking and billing safety
// - Magic signature tampering rejection

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { cloudIncomingMessageToLocalHistoryMessage } from "./whatsapp-cloud-api-local-history-adapter.ts";
import { downloadWhatsAppMediaBuffer } from "./whatsapp-media-download.ts";
import { createCloudApiTrackedSender } from "./whatsapp-cloud-api-tracked-sender.ts";
import { WhatsAppCloudApiTransportProvider } from "./whatsapp-cloud-api-transport-provider.ts";
import { NormalizedIncomingMessage } from "./whatsapp-transport-types.ts";

test("E2E: Inbound Cloud image webhook event converts to history and downloads via Cloud client", async () => {
  const imageBytes = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("mock high-res JPEG photo contents"),
  ]);

  const inboundEvent: NormalizedIncomingMessage = {
    providerType: "whatsapp_cloud_api",
    chatId: "contact-e4ed32210a80@example.invalid",
    messageId: "wamid.inbound_img_001",
    senderName: "Customer John",
    timestamp: 1720000000000,
    messageType: "image",
    hasMedia: true,
    mediaId: "meta_media_inbound_img_888",
    mediaMimeType: "image/jpeg",
    caption: "Is this item available?",
    isGroup: false,
    rawProviderPayload: {
      phoneNumberId: "phone_12345",
    },
  };

  // 1. Convert inbound event to Baileys-compatible local history
  const historyMessage = cloudIncomingMessageToLocalHistoryMessage(inboundEvent);
  assert.ok(historyMessage);
  assert.equal(historyMessage.key.id, "wamid.inbound_img_001");
  assert.equal(historyMessage.key.remoteJid, "contact-e4ed32210a80@example.invalid");
  assert.ok(historyMessage.message.imageMessage);
  assert.equal(historyMessage.message.imageMessage.caption, "Is this item available?");
  assert.equal(historyMessage.message.imageMessage.cloudMedia.mediaId, "meta_media_inbound_img_888");

  // 2. Download via provider-aware download helper
  const mockDownloadMedia = async (opts: any) => {
    assert.equal(opts.mediaId, "meta_media_inbound_img_888");
    assert.equal(opts.phoneNumberId, "phone_12345");
    assert.equal(opts.accessToken, "mock_token_abc");
    return {
      buffer: imageBytes,
      mimeType: "image/jpeg",
    };
  };

  const downloadedBuffer = await downloadWhatsAppMediaBuffer(
    historyMessage.message.imageMessage,
    "image",
    undefined,
    {
      mediaId: historyMessage.message.imageMessage.cloudMedia.mediaId,
      phoneNumberId: historyMessage.message.imageMessage.cloudMedia.phoneNumberId,
      accessToken: "mock_token_abc",
      downloadMediaImpl: mockDownloadMedia as any,
    }
  );

  assert.equal(downloadedBuffer.length, imageBytes.length);
  assert.equal(downloadedBuffer.toString("utf8", 4), "mock high-res JPEG photo contents");
});

test("E2E: Outbound voice note with ptt: true uploads voice buffer and delivers with audio.voice: true", async () => {
  const validOgg = Buffer.concat([
    Buffer.from("OggS\x00\x02"),
    Buffer.from("voice reply bytes"),
  ]);

  let uploadCalledWithKind = "";
  const mockMediaClient = {
    uploadMedia: async (opts: any) => {
      uploadCalledWithKind = opts.kind;
      return { success: true, mediaId: "meta_uploaded_voice_999" };
    },
  };

  let messagesApiPayload: any = null;
  const mockHttpClient = {
    post: async (url: string, body: any) => {
      messagesApiPayload = body;
      return {
        messaging_product: "whatsapp",
        contacts: [{ input: "157311815005", wa_id: "157311815005" }],
        messages: [{ id: "wamid.outbound_voice_success_123" }],
      };
    },
  };

  const transport = new WhatsAppCloudApiTransportProvider({
    httpClient: mockHttpClient,
    phoneNumberId: "phone_555",
    accessToken: "token_xyz",
    mediaClient: mockMediaClient as any,
  });

  const sentIds = new Set<string>();
  const sock = createCloudApiTrackedSender({
    cloudProvider: transport,
    sentIds,
    botIdentityJid: "contact-9fd0d47ff29f@example.invalid",
  });

  assert.equal(sock.supportsVoiceSend, true);

  // Send voice note
  const sendResult = await sock.sendMessage("contact-f3e665cdb447@example.invalid", {
    audio: validOgg,
    mimetype: "audio/ogg; codecs=opus",
    ptt: true,
  });

  assert.equal(sendResult.key.id, "wamid.outbound_voice_success_123");
  assert.equal(uploadCalledWithKind, "voice");
  assert.ok(sentIds.has("wamid.outbound_voice_success_123"));

  // Check payload to Meta /messages API
  assert.deepEqual(messagesApiPayload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "157311815005",
    type: "audio",
    audio: {
      id: "meta_uploaded_voice_999",
      voice: true,
    },
  });
});

test("E2E: Outbound document delivery sets document.filename and returns real WAMID", async () => {
  const validPdf = Buffer.concat([
    Buffer.from("%PDF-1.4 sample PDF header"),
    Buffer.from("sample invoice contents"),
  ]);

  const mockMediaClient = {
    uploadMedia: async () => ({ success: true, mediaId: "meta_doc_id_444" }),
  };

  let messagesApiPayload: any = null;
  const mockHttpClient = {
    post: async (url: string, body: any) => {
      messagesApiPayload = body;
      return {
        messaging_product: "whatsapp",
        messages: [{ id: "wamid.doc_delivery_wamid_555" }],
      };
    },
  };

  const transport = new WhatsAppCloudApiTransportProvider({
    httpClient: mockHttpClient,
    phoneNumberId: "phone_555",
    accessToken: "token_xyz",
    mediaClient: mockMediaClient as any,
  });

  const sentIds = new Set<string>();
  const sock = createCloudApiTrackedSender({
    cloudProvider: transport,
    sentIds,
    botIdentityJid: "contact-9fd0d47ff29f@example.invalid",
  });

  const sendResult = await sock.sendMessage("contact-6c9bc40fc084@example.invalid", {
    document: validPdf,
    mimetype: "application/pdf",
    fileName: "Order_Invoice_101.pdf",
    caption: "Thank you for your business!",
  });

  assert.equal(sendResult.key.id, "wamid.doc_delivery_wamid_555");
  assert.ok(sentIds.has("wamid.doc_delivery_wamid_555"));
  assert.deepEqual(messagesApiPayload, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "110064053003",
    type: "document",
    document: {
      id: "meta_doc_id_444",
      filename: "Order_Invoice_101.pdf",
      caption: "Thank you for your business!",
    },
  });
});

test("E2E: Tampered binary signature fails before network call and does not bill", async () => {
  const fakePng = Buffer.from("not a real png header, just plain text");

  let networkCallAttempted = false;
  const mockHttpClient = {
    post: async () => {
      networkCallAttempted = true;
      return { messages: [{ id: "should_not_happen" }] };
    },
  };

  const transport = new WhatsAppCloudApiTransportProvider({
    httpClient: mockHttpClient,
    phoneNumberId: "phone_555",
    accessToken: "token_xyz",
  });

  const sentIds = new Set<string>();
  const sock = createCloudApiTrackedSender({
    cloudProvider: transport,
    sentIds,
  });

  await assert.rejects(
    async () => {
      await sock.sendMessage("contact-6c9bc40fc084@example.invalid", {
        image: fakePng,
        mimetype: "image/png",
      });
    },
    /media_signature_mismatch/
  );

  assert.equal(networkCallAttempted, false, "Network call must not occur when binary signature check fails");
  assert.equal(sentIds.size, 0, "No message ID should be recorded in sentIds on failure");
});
