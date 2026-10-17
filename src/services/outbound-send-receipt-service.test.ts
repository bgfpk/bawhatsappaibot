import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import {
  buildOutboundReceiptId,
  clearOutboundReceipts,
  createOutboundReceiptAttempt,
} from "./outbound-send-receipt-service.ts";

const RECEIPT_DIR = path.join(process.cwd(), "data", "outbound-send-receipts");

test.afterEach(() => {
  clearOutboundReceipts();
});

test("receipt file stores metadata only and does not include raw message text or secrets", () => {
  const sensitiveText = "secret-api-key and customer private message";
  const receipt = createOutboundReceiptAttempt({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageType: "text",
    contextType: "ai_text_reply",
    contextId: "evt-5",
    campaignType: "ai_reply",
    billingAction: "customer_ai_text_reply",
    walletChargeAmount: 0.003,
    idempotencyKey: "ai-text:evt-5",
    messageFingerprint: buildOutboundReceiptId(sensitiveText),
  });

  const file = path.join(RECEIPT_DIR, `${receipt.receiptId}.json`);
  const saved = fs.readFileSync(file, "utf8");

  assert.doesNotMatch(saved, /secret-api-key/);
  assert.doesNotMatch(saved, /customer private message/);
  assert.match(saved, /customer_ai_text_reply/);
});

import {
  findOutboundReceiptByMessageId,
  updateOutboundReceipt,
  updateOutboundReceiptProviderStatus,
} from "./outbound-send-receipt-service.ts";

test("providerStatus lifecycle: sent -> delivered -> read updates single receipt", () => {
  const receipt = createOutboundReceiptAttempt({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageType: "text",
    idempotencyKey: "test:msg:001",
  });

  const testWamid = `wamid.HBgLTest_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Outbound send completes with wamid
  updateOutboundReceipt(receipt.receiptId, {
    sendStatus: "sent",
    messageId: testWamid,
  });

  // 1. Sent callback
  const sentUpdate = updateOutboundReceiptProviderStatus(testWamid, "sent", {
    botId: "bot_1",
    userId: "user_1",
  });
  assert.ok(sentUpdate);
  assert.equal(sentUpdate.receiptId, receipt.receiptId);
  assert.equal(sentUpdate.providerStatus, "sent");

  // Duplicate sent callback is idempotent
  const sentAgain = updateOutboundReceiptProviderStatus(testWamid, "sent", {
    botId: "bot_1",
    userId: "user_1",
  });
  assert.equal(sentAgain?.receiptId, receipt.receiptId);
  assert.equal(sentAgain?.providerStatus, "sent");

  // 2. Delivered callback
  const deliveredUpdate = updateOutboundReceiptProviderStatus(testWamid, "delivered", {
    botId: "bot_1",
    userId: "user_1",
  });
  assert.equal(deliveredUpdate?.receiptId, receipt.receiptId);
  assert.equal(deliveredUpdate?.providerStatus, "delivered");

  // 3. Read callback
  const readUpdate = updateOutboundReceiptProviderStatus(testWamid, "read", {
    botId: "bot_1",
    userId: "user_1",
  });
  assert.equal(readUpdate?.receiptId, receipt.receiptId);
  assert.equal(readUpdate?.providerStatus, "read");
});

test("providerStatus failed records error code without marking delivered", () => {
  const receipt = createOutboundReceiptAttempt({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageType: "text",
    idempotencyKey: "test:msg:002",
  });

  const testFailedWamid = `wamid.HBgLFailed_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  updateOutboundReceipt(receipt.receiptId, {
    sendStatus: "sent",
    messageId: testFailedWamid,
  });

  const failedUpdate = updateOutboundReceiptProviderStatus(testFailedWamid, "failed", {
    botId: "bot_1",
    userId: "user_1",
    errorCode: "131056",
  });

  assert.ok(failedUpdate);
  assert.equal(failedUpdate.providerStatus, "failed");
  assert.equal(failedUpdate.providerErrorCode, "131056");
});

test("unknown provider message ID returns null and creates NO new receipt", () => {
  const res = updateOutboundReceiptProviderStatus("wamid.UNKNOWN_NONEXISTENT", "delivered", {
    botId: "bot_1",
    userId: "user_1",
  });
  assert.equal(res, null);

  const lookup = findOutboundReceiptByMessageId("wamid.UNKNOWN_NONEXISTENT");
  assert.equal(lookup, null);
});
