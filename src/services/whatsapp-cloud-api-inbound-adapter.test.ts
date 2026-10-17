// src/services/whatsapp-cloud-api-inbound-adapter.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCloudApiCustomerJid,
  cloudWebhookEventToInternalIncomingMessage,
  cloudWebhookStatusToInternalStatus,
  summarizeCloudApiInboundAdapterResult,
} from "./whatsapp-cloud-api-inbound-adapter.ts";

test("buildCloudApiCustomerJid maps waId correctly to s.whatsapp.net jid", () => {
  assert.equal(buildCloudApiCustomerJid("1277547175"), "contact-fcf57a3c231e@example.invalid");
  assert.equal(buildCloudApiCustomerJid(" +1 (234) 567-890 "), "contact-fcf57a3c231e@example.invalid");
  assert.equal(buildCloudApiCustomerJid(""), "");
});

test("cloudWebhookEventToInternalIncomingMessage maps text message successfully", () => {
  const envelope: any = {
    botId: "bot_123",
    phoneNumberId: "phone_abc",
    eventType: "message",
    event: {
      type: "message",
      phoneNumberId: "phone_abc",
      displayPhoneNumber: "12345",
      contact: {
        name: "Alice",
        waId: "14817605550",
      },
      message: {
        id: "msg_id_meta",
        from: "14817605550",
        timestamp: 1672531199,
        type: "text",
        textBody: "Hello from Cloud API",
      },
    },
  };

  const result = cloudWebhookEventToInternalIncomingMessage(envelope);
  assert.ok(result);
  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.botId, "bot_123");
  assert.equal(result.chatId, "contact-21c14151522b@example.invalid");
  assert.equal(result.messageId, "msg_id_meta");
  assert.equal(result.senderName, "Alice");
  assert.equal(result.timestamp, 1672531199 * 1000);
  assert.equal(result.messageType, "text");
  assert.equal(result.text, "Hello from Cloud API");
  assert.equal(result.hasMedia, false);
  assert.equal(result.isGroup, false);
  assert.equal(result.displayPhoneNumber, "12345");
});

test("cloudWebhookEventToInternalIncomingMessage maps image message with media metadata successfully", () => {
  const envelope: any = {
    botId: "bot_123",
    phoneNumberId: "phone_abc",
    eventType: "message",
    event: {
      type: "message",
      phoneNumberId: "phone_abc",
      contact: {
        name: "Alice",
        waId: "14817605550",
      },
      message: {
        id: "msg_id_meta_image",
        from: "14817605550",
        timestamp: 1672531199,
        type: "image",
        rawPayload: {
          image: {
            id: "media_id_456",
            mime_type: "image/jpeg",
            caption: "Nice photo",
          },
        },
      },
    },
  };

  const result = cloudWebhookEventToInternalIncomingMessage(envelope);
  assert.ok(result);
  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.messageType, "image");
  assert.equal(result.hasMedia, true);
  assert.equal(result.mediaId, "media_id_456");
  assert.equal(result.mediaMimeType, "image/jpeg");
  assert.equal(result.caption, "Nice photo");
});

test("cloudWebhookEventToInternalIncomingMessage returns null for malformed or non-message envelopes", () => {
  assert.equal(cloudWebhookEventToInternalIncomingMessage(null as any), null);
  assert.equal(cloudWebhookEventToInternalIncomingMessage({ eventType: "status" } as any), null);
  assert.equal(cloudWebhookEventToInternalIncomingMessage({ eventType: "message" } as any), null);
  assert.equal(cloudWebhookEventToInternalIncomingMessage({ eventType: "message", event: {} } as any), null);
});

test("cloudWebhookStatusToInternalStatus maps status event successfully", () => {
  const envelope: any = {
    botId: "bot_123",
    phoneNumberId: "phone_abc",
    eventType: "status",
    event: {
      type: "status",
      phoneNumberId: "phone_abc",
      status: {
        id: "status_id_meta",
        status: "delivered",
        timestamp: 1672531199,
        recipientId: "14817605550",
        rawPayload: {
          errors: [
            {
              code: 131047,
              title: "Message failed to send",
              message: "Recipient is not a valid WhatsApp user",
            },
          ],
        },
      },
    },
  };

  const result = cloudWebhookStatusToInternalStatus(envelope);
  assert.ok(result);
  assert.equal(result.providerType, "whatsapp_cloud_api");
  assert.equal(result.providerMessageId, "status_id_meta");
  assert.equal(result.status, "delivered");
  assert.equal(result.timestamp, 1672531199 * 1000);
  assert.equal(result.recipientId, "14817605550");
  assert.equal(result.phoneNumberId, "phone_abc");
  assert.equal(result.shouldTriggerAi, false);
  assert.ok(result.errors);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 131047);
  assert.equal(result.errors[0].message, "Recipient is not a valid WhatsApp user");
});

test("cloudWebhookStatusToInternalStatus returns null for malformed or non-status envelopes", () => {
  assert.equal(cloudWebhookStatusToInternalStatus(null as any), null);
  assert.equal(cloudWebhookStatusToInternalStatus({ eventType: "message" } as any), null);
  assert.equal(cloudWebhookStatusToInternalStatus({ eventType: "status" } as any), null);
  assert.equal(cloudWebhookStatusToInternalStatus({ eventType: "status", event: {} } as any), null);
});

test("summarizeCloudApiInboundAdapterResult produces safe summary objects without secrets", () => {
  const malformedSummary = summarizeCloudApiInboundAdapterResult(null);
  assert.deepEqual(malformedSummary, { status: "unsupported_or_malformed" });

  const msgResult = {
    providerType: "whatsapp_cloud_api",
    botId: "bot_123",
    chatId: "contact-21c14151522b@example.invalid",
    messageId: "msg_id_meta",
    messageType: "text",
    hasMedia: false,
    text: "Confidential plain body",
  };
  const msgSummary = summarizeCloudApiInboundAdapterResult(msgResult);
  assert.equal(msgSummary.status, "success");
  assert.equal(msgSummary.type, "message");
  assert.equal(msgSummary.messageId, "msg_id_meta");
  assert.equal(msgSummary.text, undefined); // No confidential body is present in summary

  const statusResult = {
    providerType: "whatsapp_cloud_api",
    providerMessageId: "status_id_meta",
    recipientId: "14817605550",
    status: "failed",
    shouldTriggerAi: false,
    errors: [{ code: 100 }],
  };
  const statusSummary = summarizeCloudApiInboundAdapterResult(statusResult);
  assert.equal(statusSummary.status, "success");
  assert.equal(statusSummary.type, "status");
  assert.equal(statusSummary.messageStatus, "failed");
  assert.equal(statusSummary.shouldTriggerAi, false);
});
