import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetUniversalOutboundSendTestDeps,
  __setUniversalOutboundSendTestDeps,
  sendUniversalOutboundText,
} from "./universal-outbound-send-service.ts";
import { clearOutboundReceipts } from "./outbound-send-receipt-service.ts";
import { clearLiveConsoleEventsForTest, listLiveConsoleEvents } from "./live-console-event-service.ts";

test.afterEach(() => {
  __resetUniversalOutboundSendTestDeps();
  clearOutboundReceipts();
  clearLiveConsoleEventsForTest();
});

test("duplicate outbound charge is shown as no new debit", async () => {
  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: false, duplicate: true, dedupeKey: "dedupe-dup-1", cost: 0, walletBalance: 1, breakdown: [] })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-dup-1", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Thanks, I will check this for you.",
    idempotencyKey: "ai-text:dup-charge-1",
    billingAction: "customer_ai_text_reply",
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid-dup-1" }),
    saveMessage: async () => {},
  });

  const events = listLiveConsoleEvents({ accountId: "user_1", botId: "bot_1" });
  const duplicateChargeEvent = events.find((event) => event.title === "Duplicate charge ignored");
  assert.equal(result.status, "sent");
  assert.equal(result.duplicateCharge, true);
  assert.equal(duplicateChargeEvent?.message, "Wallet charge already recorded; no new debit.");
  assert.equal(duplicateChargeEvent?.metadata?.chargeStatus, "duplicate");
  assert.notEqual(duplicateChargeEvent?.type, "wallet_charged");
});
