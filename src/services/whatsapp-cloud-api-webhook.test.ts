// src/services/whatsapp-cloud-api-webhook.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verifyCloudApiWebhookChallenge,
  verifyMetaWebhookSignature,
  extractCloudApiWebhookEvents,
  summarizeCloudApiWebhookEvent
} from "./whatsapp-cloud-api-webhook.ts";

test("valid challenge returns challenge", () => {
  const result = verifyCloudApiWebhookChallenge({
    mode: "subscribe",
    verifyToken: "my_verify_token",
    challenge: "challenge_123",
    expectedVerifyToken: "my_verify_token"
  });
  assert.equal(result.success, true);
  assert.equal(result.challenge, "challenge_123");
});

test("invalid challenge token fails safely", () => {
  const result = verifyCloudApiWebhookChallenge({
    mode: "subscribe",
    verifyToken: "wrong_token",
    challenge: "challenge_123",
    expectedVerifyToken: "my_verify_token"
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, "token_mismatch");
  assert.equal(result.challenge, undefined);
});

test("malformed challenge input fails safely", () => {
  const result = verifyCloudApiWebhookChallenge({});
  assert.equal(result.success, false);
  assert.equal(result.reason, "missing_parameters");
});

test("valid signature passes", () => {
  const body = JSON.stringify({ event: "test" });
  const appSecret = "secret_123";
  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(body);
  const signature = `sha256=${hmac.digest("hex")}`;

  const isValid = verifyMetaWebhookSignature({ body, signature, appSecret });
  assert.equal(isValid, true);
});

test("invalid signature fails", () => {
  const body = JSON.stringify({ event: "test" });
  const appSecret = "secret_123";
  const signature = "sha256=invalid_signature_hex_value";

  const isValid = verifyMetaWebhookSignature({ body, signature, appSecret });
  assert.equal(isValid, false);
});

test("missing signature/secret/body fails safely", () => {
  assert.equal(verifyMetaWebhookSignature({ body: "" }), false);
  assert.equal(verifyMetaWebhookSignature({ body: "{}", signature: "sha256=abc" }), false);
  assert.equal(verifyMetaWebhookSignature({ body: "{}", appSecret: "abc" }), false);
});

test("payload extraction handles message webhook", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry_1",
        changes: [
          {
            value: {
              metadata: {
                display_phone_number: "10318274253",
                phone_number_id: "phone_id_1"
              },
              contacts: [
                {
                  profile: {
                    name: "Alice"
                  },
                  wa_id: "alice_wa_id"
                }
              ],
              messages: [
                {
                  from: "alice_wa_id",
                  id: "msg_id_1",
                  timestamp: "1576953452",
                  type: "text",
                  text: {
                    body: "Hello"
                  }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const events = extractCloudApiWebhookEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].object, "whatsapp_business_account");
  assert.equal(events[0].entryId, "entry_1");
  assert.equal(events[0].phoneNumberId, "phone_id_1");
  assert.equal(events[0].displayPhoneNumber, "10318274253");
  assert.equal(events[0].contactName, "Alice");
  assert.equal(events[0].contactWaId, "alice_wa_id");
  assert.ok(events[0].message);
  assert.equal(events[0].message.id, "msg_id_1");
  assert.equal(events[0].message.type, "text");
  assert.equal(events[0].message.textBody, "Hello");
});

test("payload extraction handles status webhook", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry_1",
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: "phone_id_1"
              },
              statuses: [
                {
                  id: "status_msg_1",
                  status: "read",
                  timestamp: "1147644352",
                  recipient_id: "recipient_wa_id"
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const events = extractCloudApiWebhookEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].entryId, "entry_1");
  assert.ok(events[0].status);
  assert.equal(events[0].status.id, "status_msg_1");
  assert.equal(events[0].status.status, "read");
  assert.equal(events[0].status.recipientId, "recipient_wa_id");
});

test("payload extraction handles message_template_status_update webhook", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_id_123",
        changes: [
          {
            field: "message_template_status_update",
            value: {
              event: "APPROVED",
              message_template_id: "tpl_id_999",
              message_template_name: "order_confirmation",
              message_template_language: "en_US",
              reason: "NONE",
            },
          },
        ],
      },
    ],
  };

  const events = extractCloudApiWebhookEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].entryId, "waba_id_123");
  assert.ok(events[0].templateStatus);
  assert.equal(events[0].templateStatus.wabaId, "waba_id_123");
  assert.equal(events[0].templateStatus.templateId, "tpl_id_999");
  assert.equal(events[0].templateStatus.templateName, "order_confirmation");
  assert.equal(events[0].templateStatus.language, "en_US");
  assert.equal(events[0].templateStatus.event, "APPROVED");
});

test("payload extraction handles malformed payload safely", () => {
  assert.deepEqual(extractCloudApiWebhookEvents(null), []);
  assert.deepEqual(extractCloudApiWebhookEvents({}), []);
  assert.deepEqual(extractCloudApiWebhookEvents({ entry: "not_an_array" }), []);
});

test("safe summary does not expose secrets", () => {
  const event = {
    object: "whatsapp_business_account",
    entryId: "entry_1",
    phoneNumberId: "phone_123",
    displayPhoneNumber: "555-555",
    contactWaId: "wa_456",
    message: {
      id: "msg_123",
      from: "wa_456",
      timestamp: 12345,
      type: "text",
      rawPayload: {}
    }
  };

  const summary = summarizeCloudApiWebhookEvent(event);
  assert.equal(summary.object, "whatsapp_business_account");
  assert.equal(summary.entryId, "entry_1");
  assert.equal(summary.phoneNumberId, "phone_123");
  assert.equal(summary.displayPhoneNumber, "555-555");
  assert.equal(summary.contactWaId, "wa_456");
  assert.equal(summary.hasMessage, true);
  assert.equal(summary.messageId, "msg_123");
  assert.equal(summary.messageType, "text");

  // Verify signature secrets / raw secrets are not present
  const keys = Object.keys(summary);
  assert.equal(keys.includes("appSecret"), false);
  assert.equal(keys.includes("clientSecret"), false);
  assert.equal(keys.includes("webhookVerifyToken"), false);
});
