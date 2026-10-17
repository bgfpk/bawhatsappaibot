import test from "node:test";
import assert from "node:assert/strict";

import { sendMarketingFollowupMessage } from "./marketing-followup-send-service.ts";
import {
  __resetUniversalOutboundSendTestDeps,
  __setUniversalOutboundSendTestDeps,
} from "./universal-outbound-send-service.ts";
import { clearOutboundReceipts } from "./outbound-send-receipt-service.ts";

test.afterEach(() => {
  __resetUniversalOutboundSendTestDeps();
  clearOutboundReceipts();
});

test("WhatsApp send success marks follow-up sent and charges wallet once", async () => {
  const steps: string[] = [];
  const receipts = new Map<string, any>();
  let chargeCalls = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      steps.push("charge");
      return { charged: true, dedupeKey: "dedupe-1", cost: 0.001, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => {
      const receipt = { receiptId: "receipt-1", ...input };
      receipts.set(receipt.receiptId, receipt);
      return receipt;
    }) as any,
    updateOutboundReceipt: ((receiptId: string, patch: any) => {
      receipts.set(receiptId, { ...(receipts.get(receiptId) || {}), ...patch });
      return receipts.get(receiptId);
    }) as any,
  });

  const result = await sendMarketingFollowupMessage({
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Hello there",
    eventId: "followup::1",
    userId: "user_1",
    previewBilling: async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001 }),
    sendText: async () => {
      steps.push("send");
      return { messageId: "wamid-1" };
    },
    saveMessage: async (_jid, _text, messageId) => {
      steps.push(`save:${messageId}`);
    },
    chargeBilling: async () => ({ charged: true, cost: 0.001 }),
  });

  assert.equal(result.status, "sent");
  assert.equal(result.sentMessageId, "wamid-1");
  assert.equal(result.charged, true);
  assert.equal(chargeCalls, 1);
  assert.deepEqual(steps, ["send", "save:wamid-1", "charge"]);
  assert.equal(receipts.get("receipt-1")?.sendStatus, "sent");
});

test("WhatsApp send failure marks failed and does not charge wallet", async () => {
  let charged = false;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => {
      charged = true;
      return { charged: true, dedupeKey: "dedupe-2", cost: 0.001, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-2", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendMarketingFollowupMessage({
    botId: "bot_1",
    customerJid: "contact-f3f781b8bf14@example.invalid",
    messageText: "Hello there",
    eventId: "followup::2",
    userId: "user_1",
    previewBilling: async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001 }),
    sendText: async () => {
      throw new Error("socket hang up");
    },
    saveMessage: async () => {
      throw new Error("should not save");
    },
    chargeBilling: async () => ({ charged: true, cost: 0.001 }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "socket hang up");
  assert.equal(charged, false);
});

test("insufficient wallet skips send and does not mark sent", async () => {
  let sendCalls = 0;
  let chargeCalls = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: false, action: "marketing_auto_bot_text", cost: 0.001, reason: "insufficient_funds" })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, dedupeKey: "dedupe-3", cost: 0.001, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-3", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendMarketingFollowupMessage({
    botId: "bot_1",
    customerJid: "contact-19129b37ea1c@example.invalid",
    messageText: "Hello there",
    eventId: "followup::3",
    userId: "user_1",
    previewBilling: async () => ({ allowed: false, action: "marketing_auto_bot_text", cost: 0.001, reason: "insufficient_funds" }),
    sendText: async () => {
      sendCalls += 1;
      return { messageId: "wamid-2" };
    },
    saveMessage: async () => {},
    chargeBilling: async () => ({ charged: true, cost: 0.001 }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "insufficient_funds");
  assert.equal(sendCalls, 0);
  assert.equal(chargeCalls, 0);
});

test("same campaign retry does not double charge", async () => {
  let sendCalls = 0;
  let chargeCalls = 0;
  let existingReceipt: any = null;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, dedupeKey: "dedupe-4", cost: 0.001, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => existingReceipt) as any,
    createOutboundReceiptAttempt: ((input: any) => {
      existingReceipt = { receiptId: "receipt-4", ...input };
      return existingReceipt;
    }) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => {
      existingReceipt = { ...(existingReceipt || {}), ...patch };
      return existingReceipt;
    }) as any),
  });

  const first = await sendMarketingFollowupMessage({
    botId: "bot_1",
    customerJid: "contact-8e1f72f64c5b@example.invalid",
    messageText: "Hello there",
    eventId: "followup::4",
    userId: "user_1",
    previewBilling: async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001 }),
    sendText: async () => {
      sendCalls += 1;
      return { messageId: "wamid-4" };
    },
    saveMessage: async () => {},
    chargeBilling: async () => ({ charged: true, cost: 0.001 }),
  });
  existingReceipt = { ...existingReceipt, sendStatus: "sent", messageId: "wamid-4", charged: true };

  const second = await sendMarketingFollowupMessage({
    botId: "bot_1",
    customerJid: "contact-8e1f72f64c5b@example.invalid",
    messageText: "Hello there",
    eventId: "followup::4",
    userId: "user_1",
    previewBilling: async () => ({ allowed: true, action: "marketing_auto_bot_text", cost: 0.001 }),
    sendText: async () => {
      sendCalls += 1;
      return { messageId: "wamid-5" };
    },
    saveMessage: async () => {},
    chargeBilling: async () => ({ charged: true, cost: 0.001 }),
  });

  assert.equal(first.charged, true);
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "duplicate_not_resent");
  assert.equal(second.charged, true);
  assert.equal(sendCalls, 1);
  assert.equal(chargeCalls, 1);
});

test("AI smart follow-up uses AI follow-up pricing metadata", async () => {
  let capturedAction = "";

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async (_userId: string | undefined, action: string) => {
      capturedAction = action;
      return { allowed: true, action, cost: 0.003, balance: 1 };
    }) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, dedupeKey: "dedupe-ai-followup", cost: 0.003, walletBalance: 1, breakdown: [] })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-ai-followup", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendMarketingFollowupMessage({
    botId: "bot_1",
    customerJid: "contact-536599a30dc3@example.invalid",
    messageText: "Still interested?",
    eventId: "followup::ai-1",
    userId: "user_1",
    previewBilling: async () => ({ allowed: true, action: "ai_smart_followup_text", cost: 0.003 }),
    sendText: async () => ({ messageId: "wamid-ai-followup-1" }),
    saveMessage: async () => {},
    chargeBilling: async () => ({ charged: true, cost: 0.003 }),
  });

  assert.equal(capturedAction, "ai_smart_followup_text");
  assert.equal(result.status, "sent");
  assert.equal(result.chargeAmount, 0.003);
});
