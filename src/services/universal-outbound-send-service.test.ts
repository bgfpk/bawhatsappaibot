import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetUniversalOutboundSendTestDeps,
  __setUniversalOutboundSendTestDeps,
  sendUniversalOutboundText,
} from "./universal-outbound-send-service.ts";
import { clearOutboundReceipts } from "./outbound-send-receipt-service.ts";
import { clearLiveConsoleEventsForTest, listLiveConsoleEvents } from "./live-console-event-service.ts";
import {
  __resetAiProviderCallLedgerTestDeps,
  __setAiProviderCallLedgerTestDeps,
} from "./ai-provider-call-ledger-service.ts";

test.afterEach(() => {
  __resetUniversalOutboundSendTestDeps();
  __resetAiProviderCallLedgerTestDeps();
  clearOutboundReceipts();
  clearLiveConsoleEventsForTest();
});

test("successful outbound message creates receipt-backed charge once", async () => {
  const receipts = new Map<string, any>();
  let chargeDescription = "";

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 1 })) as any,
    chargeUsageBillingAction: (async (_userId: string | undefined, _action: any, _context: any, description = "") => {
      chargeDescription = description;
      return { charged: true, dedupeKey: "dedupe-ai-1", cost: 0.003, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => {
      const receipt = { receiptId: "receipt-ai-1", ...input };
      receipts.set(receipt.receiptId, receipt);
      return receipt;
    }) as any,
    updateOutboundReceipt: ((receiptId: string, patch: any) => {
      receipts.set(receiptId, { ...(receipts.get(receiptId) || {}), ...patch });
      return receipts.get(receiptId);
    }) as any,
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Thanks for your order.",
    idempotencyKey: "ai-text:evt-1",
    billingAction: "customer_ai_text_reply",
    contextType: "ai_text_reply",
    contextId: "evt-1",
    campaignType: "ai_reply",
    sendText: async () => ({ messageId: "wamid-ai-1" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "sent");
  assert.equal(result.chargeAmount, 0.003);
  assert.match(chargeDescription, /receipt:receipt-ai-1/);
  assert.equal(receipts.get("receipt-ai-1")?.sendStatus, "sent");
  assert.equal(receipts.get("receipt-ai-1")?.charged, true);
});

test("duplicate retry with same idempotency key does not double send or charge", async () => {
  let sendCalls = 0;
  let chargeCalls = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, dedupeKey: "dedupe-ai-2", cost: 0.003, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: ((idempotencyKey: string) => idempotencyKey === "ai-text:evt-2"
      ? {
          receiptId: "receipt-ai-2",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          userId: "user_1",
          botId: "bot_1",
          customerJid: "contact-4e899668752d@example.invalid",
          remoteJid: "contact-4e899668752d@example.invalid",
          fromMe: true,
          sentTimestamp: Date.now(),
          messageType: "text",
          contextType: "ai_text_reply",
          contextId: "evt-2",
          campaignType: "ai_reply",
          idempotencyKey,
          sendStatus: "sent",
          messageId: "wamid-ai-2",
          billingAction: "customer_ai_text_reply" as const,
          charged: true,
          duplicateCharge: false,
          walletChargeAmount: 0.003,
          errorReason: "",
          chargeDedupeKey: "dedupe-ai-2",
        }
      : null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "unused", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Checking in.",
    idempotencyKey: "ai-text:evt-2",
    billingAction: "customer_ai_text_reply",
    sendText: async () => {
      sendCalls += 1;
      return { messageId: "wamid-new" };
    },
  });

  assert.equal(result.status, "duplicate");
  assert.equal(sendCalls, 0);
  assert.equal(chargeCalls, 0);
});

test("new valid message after old receipt is not blocked by stale base idempotency key", async () => {
  let sendCalls = 0;
  let chargeCalls = 0;
  const createdKeys: string[] = [];

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, dedupeKey: "dedupe-ai-3", cost: 0.003, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: ((key: string) => key === "ai-text:evt-3"
      ? {
          receiptId: "receipt-ai-3-old",
          createdAt: Date.now() - 60000,
          updatedAt: Date.now() - 60000,
          userId: "user_1",
          botId: "bot_1",
          customerJid: "contact-4e899668752d@example.invalid",
          remoteJid: "contact-4e899668752d@example.invalid",
          fromMe: true,
          sentTimestamp: Date.now() - 60000,
          messageType: "text",
          contextType: "ai_text_reply",
          contextId: "evt-3",
          campaignType: "ai_reply",
          billingAction: "customer_ai_text_reply",
          walletChargeAmount: 0.003,
          idempotencyKey: key,
          sendStatus: "sent",
          messageId: "wamid-ai-3-old",
          errorReason: "",
          chargeDedupeKey: "dedupe-ai-3-old",
          charged: true,
          duplicateCharge: false,
          messageFingerprint: "oldfingerprint123",
        }
      : null) as any,
    createOutboundReceiptAttempt: ((input: any) => {
      createdKeys.push(input.idempotencyKey);
      return { receiptId: "receipt-ai-3-new", ...input };
    }) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "A different new message",
    idempotencyKey: "ai-text:evt-3",
    billingAction: "customer_ai_text_reply",
    sendText: async () => {
      sendCalls += 1;
      return { messageId: "wamid-ai-3-new" };
    },
  });

  assert.equal(result.status, "sent");
  assert.equal(sendCalls, 1);
  assert.equal(chargeCalls, 1);
  assert.equal(createdKeys.length, 1);
  assert.match(createdKeys[0], /^ai-text:evt-3:/);
});

test("saveMessage failure after WhatsApp success does not trigger resend path or block billing", async () => {
  let chargeCalls = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, dedupeKey: "dedupe-ai-4", cost: 0.003, walletBalance: 1, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-ai-4", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Order confirmed",
    idempotencyKey: "ai-text:evt-4",
    billingAction: "customer_ai_text_reply",
    sendText: async () => ({ messageId: "wamid-ai-4" }),
    saveMessage: async () => {
      throw new Error("db_write_failed");
    },
  });

  assert.equal(result.status, "sent");
  assert.equal(result.messageId, "wamid-ai-4");
  assert.equal(chargeCalls, 1);
});

test("insufficient wallet skip emits a live console event", async () => {
  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: false, action: "ai_smart_followup_text", cost: 0.003, reason: "insufficient_wallet", balance: 0 })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-wallet-block", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Checking in.",
    idempotencyKey: "followup:wallet-block",
    billingAction: "ai_smart_followup_text",
    contextType: "ai_smart_followup",
    sendText: async () => {
      throw new Error("should_not_send");
    },
  });

  const events = listLiveConsoleEvents({ accountId: "user_1", botId: "bot_1" });
  assert.equal(result.status, "skipped");
  assert.equal(events.some((event) => event.type === "insufficient_wallet" && event.reason === "insufficient_wallet"), true);
});

test("successful receipt-backed AI send updates provider ledger outcome", async () => {
  let ledgerPatch: any = null;
  __setAiProviderCallLedgerTestDeps({
    listDocuments: async () => ({
      documents: [{
        $id: "aipl_ai_1",
        value: JSON.stringify({
          id: "aipl_ai_1",
          accountId: "user_1",
          botId: "bot_1",
          customerJid: "contact-4e899668752d@example.invalid",
          billingGroupKey: "evt-ledger-1",
          reasonLabels: [],
          finalSendOutcome: "pending",
          chargeOutcome: "unknown",
        }),
        updated_at: 2000,
      }],
    }),
    updateDocument: async (_databaseId, _collection, _id, patch) => {
      ledgerPatch = JSON.parse(String(patch.value || "{}"));
      return patch;
    },
    now: () => 2010,
  } as any);
  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 1 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, dedupeKey: "dedupe-ledger", cost: 0.003, walletBalance: 1, breakdown: [] })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-ledger-1", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  const result = await sendUniversalOutboundText({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Thanks for your order.",
    idempotencyKey: "ai-text:evt-ledger-1",
    billingAction: "customer_ai_text_reply",
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid-ledger-1" }),
    saveMessage: async () => {},
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.status, "sent");
  assert.equal(ledgerPatch.finalSendOutcome, "sent");
  assert.equal(ledgerPatch.chargeOutcome, "charged");
  assert.equal(ledgerPatch.receiptId, "receipt-ledger-1");
  assert.equal(ledgerPatch.relatedMessageId, "wamid-ledger-1");
});

test("customer AI extra calls billing: 1 call = $0.003, 2 calls = $0.004, 3 calls = $0.005, 4 calls = $0.006", async () => {
  const chargedActions: Array<{ action: string; eventId: string; amount?: number }> = [];
  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async (_userId: string, action: string) => ({
      allowed: true,
      action,
      cost: 0.003,
      balance: 10,
    })) as any,
    chargeUsageBillingAction: (async (_userId: string, action: string, ctx: any, _desc: string, amount?: number) => {
      chargedActions.push({ action, eventId: ctx.eventId, amount });
      return { charged: true, dedupeKey: `dedupe-${ctx.eventId}`, cost: action === "customer_ai_extra_call" ? 0.001 * (amount || 1) : 0.003, walletBalance: 10, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: `receipt-${input.idempotencyKey}`, ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });

  // Turn A: 1 call (extraAiCallsCount = 0) -> Total $0.003
  const resA = await sendUniversalOutboundText({
    userId: "user_turn_a",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    messageText: "Reply 1",
    idempotencyKey: "ai-text:turn-a",
    billingAction: "customer_ai_text_reply",
    extraAiCallsCount: 0,
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid-turn-a" }),
    saveMessage: async () => {},
  });
  assert.equal(resA.status, "sent");
  assert.equal(resA.chargeAmount, 0.003);

  // Turn B: 2 calls (extraAiCallsCount = 1) -> Total $0.004 (base $0.003 + 1 extra $0.001)
  const resB = await sendUniversalOutboundText({
    userId: "user_turn_b",
    botId: "bot_1",
    customerJid: "contact-f5c429663c13@example.invalid",
    messageText: "Reply 2",
    idempotencyKey: "ai-text:turn-b",
    billingAction: "customer_ai_text_reply",
    extraAiCallsCount: 1,
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid-turn-b" }),
    saveMessage: async () => {},
  });
  assert.equal(resB.status, "sent");
  assert.equal(resB.chargeAmount, 0.004);

  // Turn C: 3 calls (extraAiCallsCount = 2) -> Total $0.005
  const resC = await sendUniversalOutboundText({
    userId: "user_turn_c",
    botId: "bot_1",
    customerJid: "contact-c7ce50b277e8@example.invalid",
    messageText: "Reply 3",
    idempotencyKey: "ai-text:turn-c",
    billingAction: "customer_ai_text_reply",
    extraAiCallsCount: 2,
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid-turn-c" }),
    saveMessage: async () => {},
  });
  assert.equal(resC.status, "sent");
  assert.equal(resC.chargeAmount, 0.005);

  // Turn D: 4 calls (extraAiCallsCount = 3) -> Total $0.006
  const resD = await sendUniversalOutboundText({
    userId: "user_turn_d",
    botId: "bot_1",
    customerJid: "contact-983b92b20971@example.invalid",
    messageText: "Reply 4",
    idempotencyKey: "ai-text:turn-d",
    billingAction: "customer_ai_text_reply",
    extraAiCallsCount: 3,
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid-turn-d" }),
    saveMessage: async () => {},
  });
  assert.equal(resD.status, "sent");
  assert.equal(resD.chargeAmount, 0.006);

  // Verify charged actions in ledger
  assert.ok(chargedActions.some(c => c.action === "customer_ai_text_reply" && c.eventId === "ai-text:turn-a"));
  assert.ok(chargedActions.some(c => c.action === "customer_ai_text_reply" && c.eventId === "ai-text:turn-b"));
  assert.ok(chargedActions.some(c => c.action === "customer_ai_extra_call" && c.eventId === "ai-text:turn-b:extra_calls" && c.amount === 1));
  assert.ok(chargedActions.some(c => c.action === "customer_ai_extra_call" && c.eventId === "ai-text:turn-c:extra_calls" && c.amount === 2));
  assert.ok(chargedActions.some(c => c.action === "customer_ai_extra_call" && c.eventId === "ai-text:turn-d:extra_calls" && c.amount === 3));
});
