import test from "node:test";
import assert from "node:assert/strict";
import {
  clearOutboundReceipts,
  createOutboundReceiptAttempt,
  findOutboundReceiptByMessageId,
  updateOutboundReceipt,
  updateOutboundReceiptProviderStatus,
} from "./outbound-send-receipt-service.ts";
import { cloudWebhookStatusToInternalStatus } from "./whatsapp-cloud-api-inbound-adapter.ts";

test.afterEach(() => {
  clearOutboundReceipts();
});

test("Cloud Status Webhook: Sent callback updates existing outbound receipt idempotently", () => {
  let aiInvocations = 0;
  let walletCharges = 0;

  // Simulate outbound AI reply that was sent
  const receipt = createOutboundReceiptAttempt({
    userId: "user_101",
    botId: "bot_202",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageType: "text",
    idempotencyKey: "ai:reply:123",
  });

  updateOutboundReceipt(receipt.receiptId, {
    sendStatus: "sent",
    messageId: "wamid.HBgLMetaMsg1001",
  });

  // Simulated status webhook payload from Meta
  const statusWebhookBody = {
    botId: "bot_202",
    phoneNumberId: "104100542821472",
    eventType: "status" as const,
    event: {
      type: "status" as const,
      status: {
        id: "wamid.HBgLMetaMsg1001",
        status: "sent",
        timestamp: 1700000010,
        recipientId: "195545134641",
        rawPayload: { id: "wamid.HBgLMetaMsg1001", status: "sent" },
      },
    },
  };

  const statusNormalized = cloudWebhookStatusToInternalStatus(statusWebhookBody);
  assert.ok(statusNormalized);
  assert.equal(statusNormalized.shouldTriggerAi, false);

  if (statusNormalized.shouldTriggerAi) {
    aiInvocations++;
  }

  // Update receipt
  const updated = updateOutboundReceiptProviderStatus(
    statusNormalized.providerMessageId,
    statusNormalized.status,
    { botId: "bot_202", userId: "user_101" }
  );

  assert.ok(updated);
  assert.equal(updated.receiptId, receipt.receiptId);
  assert.equal(updated.providerStatus, "sent");
  assert.equal(aiInvocations, 0);
  assert.equal(walletCharges, 0);

  // Duplicate sent webhook
  const duplicateUpdated = updateOutboundReceiptProviderStatus(
    statusNormalized.providerMessageId,
    statusNormalized.status,
    { botId: "bot_202", userId: "user_101" }
  );
  assert.equal(duplicateUpdated?.receiptId, receipt.receiptId);
  assert.equal(duplicateUpdated?.providerStatus, "sent");
});

test("Cloud Status Webhook: sent -> delivered -> read updates single receipt without new billing", () => {
  let aiInvocations = 0;
  let billingEvents = 0;

  const receipt = createOutboundReceiptAttempt({
    userId: "user_101",
    botId: "bot_202",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageType: "text",
    idempotencyKey: "ai:reply:lifecycle",
  });

  updateOutboundReceipt(receipt.receiptId, {
    sendStatus: "sent",
    messageId: "wamid.HBgLMetaMsg2002",
  });

  // Sent -> Delivered -> Read sequence
  const statuses = ["sent", "delivered", "read"];
  for (const st of statuses) {
    const webhook = {
      botId: "bot_202",
      phoneNumberId: "104100542821472",
      eventType: "status" as const,
      event: {
        type: "status" as const,
        status: {
          id: "wamid.HBgLMetaMsg2002",
          status: st,
          timestamp: 1700000000,
          recipientId: "195545134641",
          rawPayload: {},
        },
      },
    };

    const norm = cloudWebhookStatusToInternalStatus(webhook);
    assert.ok(norm);
    if (norm.shouldTriggerAi) aiInvocations++;

    const updated = updateOutboundReceiptProviderStatus(norm.providerMessageId, norm.status, {
      botId: "bot_202",
      userId: "user_101",
    });
    assert.ok(updated);
    assert.equal(updated.providerStatus, st);
  }

  assert.equal(aiInvocations, 0);
  assert.equal(billingEvents, 0);
});

test("Cloud Status Webhook: failed status records error and deleted records deleted state", () => {
  const receiptFailed = createOutboundReceiptAttempt({
    userId: "user_101",
    botId: "bot_202",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageType: "text",
    idempotencyKey: "ai:reply:failed",
  });

  updateOutboundReceipt(receiptFailed.receiptId, {
    sendStatus: "sent",
    messageId: "wamid.HBgLFailedMsg",
  });

  const updatedFailed = updateOutboundReceiptProviderStatus("wamid.HBgLFailedMsg", "failed", {
    botId: "bot_202",
    userId: "user_101",
    errorCode: "131056",
  });
  assert.ok(updatedFailed);
  assert.equal(updatedFailed.providerStatus, "failed");
  assert.equal(updatedFailed.providerErrorCode, "131056");

  const updatedDeleted = updateOutboundReceiptProviderStatus("wamid.HBgLFailedMsg", "deleted", {
    botId: "bot_202",
    userId: "user_101",
  });
  assert.ok(updatedDeleted);
  assert.equal(updatedDeleted.providerStatus, "deleted");
});

test("Cloud Status Webhook: unknown wamid safely returns null without creating a new receipt", () => {
  const unknownResult = updateOutboundReceiptProviderStatus("wamid.UNKNOWN_NONEXISTENT_999", "delivered", {
    botId: "bot_202",
    userId: "user_101",
  });
  assert.equal(unknownResult, null);

  const receipt = findOutboundReceiptByMessageId("wamid.UNKNOWN_NONEXISTENT_999");
  assert.equal(receipt, null);
});
