import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  __resetUniversalOutboundSendTestDeps,
  __setUniversalOutboundSendTestDeps,
  sendUniversalOutboundText,
} from "./universal-outbound-send-service.ts";
import {
  clearOutboundReceipts,
  listOutboundReceiptAlerts,
  clearOutboundReceiptAlertsForTest,
} from "./outbound-send-receipt-service.ts";
import {
  clearLiveConsoleEventsForTest,
  listLiveConsoleEvents,
} from "./live-console-event-service.ts";
import {
  __resetCustomerTurnAiCallLedgerTestDeps,
  recordSuccessfulCustomerTurnAiCallAsync,
  getTurnExtraAiCallsCountAsync,
  calculateCustomerTurnBillingAsync,
} from "./customer-turn-ai-call-ledger-service.ts";
import {
  buildAiProviderCallLedgerRecord,
} from "./ai-provider-call-ledger-service.ts";

test.afterEach(() => {
  __resetUniversalOutboundSendTestDeps();
  __resetCustomerTurnAiCallLedgerTestDeps();
  clearOutboundReceipts();
  clearOutboundReceiptAlertsForTest();
  clearLiveConsoleEventsForTest();
});

test("Scenario A: DeepInfra hosted text reply + successful send -> $0.003 base debited from wallet", async () => {
  const receipts = new Map<string, any>();
  const debits: Array<{ action: string; amount: number; description: string }> = [];

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 5.0 })) as any,
    chargeUsageBillingAction: (async (_userId: string | undefined, action: any, _context: any, description = "", amount = 1) => {
      debits.push({ action, amount, description });
      return { charged: true, dedupeKey: "dedupe-a-1", cost: 0.003, walletBalance: 4.997, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => {
      const receipt = { receiptId: "receipt-a-1", ...input };
      receipts.set(receipt.receiptId, receipt);
      return receipt;
    }) as any,
    updateOutboundReceipt: ((receiptId: string, patch: any) => {
      receipts.set(receiptId, { ...(receipts.get(receiptId) || {}), ...patch });
      return receipts.get(receiptId);
    }) as any,
  });

  const result = await sendUniversalOutboundText({
    userId: "user_a",
    botId: "bot_a",
    customerJid: "contact-85d2a3563239@example.invalid",
    messageText: "Hello, we have that item in stock!",
    idempotencyKey: "ai_text_reply:evt_a1",
    billingAction: "customer_ai_text_reply",
    provider: "deepinfra",
    contextType: "ai_text_reply",
    contextId: "turn_a1",
    customerTurnId: "turn_a1",
    extraAiCallsCount: 0,
    sendText: async () => ({ messageId: "wamid_a1" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "sent");
  assert.equal(result.charged, true);
  assert.equal(result.chargeAmount, 0.003);
  assert.equal(debits.length, 1);
  assert.equal(debits[0].action, "customer_ai_text_reply");
  assert.equal(debits[0].amount, 1);
  assert.equal(receipts.get("receipt-a-1")?.sendStatus, "sent");
  assert.equal(receipts.get("receipt-a-1")?.walletChargeAmount, 0.003);
});

test("Scenario B: 2 qualifying successful AI calls in same turn -> $0.004 total ($0.003 base + $0.001 extra)", async () => {
  const debits: Array<{ action: string; amount: number; description: string }> = [];

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 5.0 })) as any,
    chargeUsageBillingAction: (async (_userId: string | undefined, action: any, _context: any, description = "", amount = 1) => {
      debits.push({ action, amount, description });
      return { charged: true, dedupeKey: `dedupe-b-${action}`, cost: action === "customer_ai_extra_call" ? 0.001 : 0.003, walletBalance: 4.996, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-b-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  // Turn with 2 AI calls (extraAiCallsCount = 1)
  const result = await sendUniversalOutboundText({
    userId: "user_b",
    botId: "bot_b",
    customerJid: "contact-126f2cd31c20@example.invalid",
    messageText: "Here is your updated order total.",
    idempotencyKey: "ai_text_reply:evt_b1",
    billingAction: "customer_ai_text_reply",
    provider: "deepinfra",
    contextType: "ai_text_reply",
    customerTurnId: "turn_b1",
    extraAiCallsCount: 1,
    sendText: async () => ({ messageId: "wamid_b1" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "sent");
  assert.equal(result.charged, true);
  assert.equal(result.chargeAmount, 0.004);
  assert.equal(debits.length, 2);
  assert.equal(debits[0].action, "customer_ai_text_reply");
  assert.equal(debits[1].action, "customer_ai_extra_call");
  assert.equal(debits[1].amount, 1);
});

test("Scenario C: 3 qualifying successful AI calls in same turn -> $0.005 total ($0.003 base + $0.002 extra)", async () => {
  const debits: Array<{ action: string; amount: number; description: string }> = [];

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 5.0 })) as any,
    chargeUsageBillingAction: (async (_userId: string | undefined, action: any, _context: any, description = "", amount = 1) => {
      debits.push({ action, amount, description });
      return { charged: true, dedupeKey: `dedupe-c-${action}`, cost: action === "customer_ai_extra_call" ? 0.002 : 0.003, walletBalance: 4.995, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-c-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  // Turn with 3 AI calls (extraAiCallsCount = 2)
  const result = await sendUniversalOutboundText({
    userId: "user_c",
    botId: "bot_c",
    customerJid: "contact-d58a89d5392e@example.invalid",
    messageText: "Your booking is confirmed with special notes.",
    idempotencyKey: "ai_text_reply:evt_c1",
    billingAction: "customer_ai_text_reply",
    provider: "deepinfra",
    contextType: "ai_text_reply",
    customerTurnId: "turn_c1",
    extraAiCallsCount: 2,
    sendText: async () => ({ messageId: "wamid_c1" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "sent");
  assert.equal(result.charged, true);
  assert.equal(result.chargeAmount, 0.005);
  assert.equal(debits.length, 2);
  assert.equal(debits[0].action, "customer_ai_text_reply");
  assert.equal(debits[1].action, "customer_ai_extra_call");
  assert.equal(debits[1].amount, 2);
});

test("Scenario D: Failed/unsent WhatsApp delivery -> $0 charged", async () => {
  let chargeAttempts = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 5.0 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeAttempts += 1;
      return { charged: true };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-d-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  const result = await sendUniversalOutboundText({
    userId: "user_d",
    botId: "bot_d",
    customerJid: "contact-b24f3916a145@example.invalid",
    messageText: "Should not be charged if send fails",
    idempotencyKey: "ai_text_reply:evt_d1",
    billingAction: "customer_ai_text_reply",
    provider: "deepinfra",
    contextType: "ai_text_reply",
    sendText: async () => {
      throw new Error("Connection reset by peer");
    },
    saveMessage: async () => {},
  });

  assert.equal(result.status, "failed");
  assert.equal(result.charged, undefined);
  assert.equal(chargeAttempts, 0, "No wallet debit should occur when WhatsApp send fails");
});

test("Scenario E: Transport retry reusing same idempotency key -> no duplicate wallet debit", async () => {
  let chargeCalls = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 5.0 })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, dedupeKey: "dedupe-e-1" };
    }) as any,
    findOutboundReceiptByIdempotencyKey: ((idempotencyKey: string) => idempotencyKey === "ai_text_reply:evt_e1"
      ? {
          receiptId: "receipt-e-1",
          userId: "user_e",
          botId: "bot_e",
          customerJid: "contact-f7ba0cd80088@example.invalid",
          messageText: "Already sent message",
          idempotencyKey,
          sendStatus: "sent",
          messageId: "wamid_e1",
          billingAction: "customer_ai_text_reply",
          charged: true,
          duplicateCharge: false,
          walletChargeAmount: 0.003,
        }
      : null) as any,
  });

  const result = await sendUniversalOutboundText({
    userId: "user_e",
    botId: "bot_e",
    customerJid: "contact-f7ba0cd80088@example.invalid",
    messageText: "Already sent message",
    idempotencyKey: "ai_text_reply:evt_e1",
    billingAction: "customer_ai_text_reply",
    sendText: async () => ({ messageId: "should_not_be_called" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "duplicate");
  assert.equal(chargeCalls, 0, "No new debit on transport duplicate retry");
});

test("Scenario F: Client Gemini ENABLED on account in settings, but executed provider was DeepInfra -> customer_ai_text_reply IS charged", async () => {
  let billedAction = "";

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async (_userId: string | undefined, action: string) => ({
      allowed: true,
      action,
      cost: 0.003,
      balance: 10.0,
    })) as any,
    chargeUsageBillingAction: (async (_userId: string | undefined, action: any) => {
      billedAction = action;
      return { charged: true, dedupeKey: "dedupe-f-1", cost: 0.003, walletBalance: 9.997, breakdown: [] };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-f-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  // Turn executed by DeepInfra, even though account has client Gemini configured
  const result = await sendUniversalOutboundText({
    userId: "user_with_gemini_config",
    botId: "bot_f",
    customerJid: "contact-285f3e8e7743@example.invalid",
    messageText: "DeepInfra generated reply on account with client Gemini enabled in settings",
    idempotencyKey: "ai_text_reply:evt_f1",
    billingAction: "customer_ai_text_reply",
    provider: "deepinfra",
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid_f1" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "sent");
  assert.equal(result.charged, true);
  assert.equal(billedAction, "customer_ai_text_reply");
  assert.equal(result.chargeAmount, 0.003);
});

test("Scenario G: Executed provider was client_custom_gemini -> platform customer_ai_text_reply is NOT charged", async () => {
  let platformChargeCalls = 0;

  __setUniversalOutboundSendTestDeps({
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 10.0 })) as any,
    chargeUsageBillingAction: (async () => {
      platformChargeCalls += 1;
      return { charged: true };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-g-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  // Client Gemini handles its own cycle billing, so billingAction is undefined
  const result = await sendUniversalOutboundText({
    userId: "user_custom_gemini",
    botId: "bot_g",
    customerJid: "contact-b8f345e550c3@example.invalid",
    messageText: "Client gemini response",
    idempotencyKey: "ai_text_reply:evt_g1",
    billingAction: undefined, // omitted because client_custom_gemini handles its own cycle fee
    provider: "client_custom_gemini",
    contextType: "ai_text_reply",
    sendText: async () => ({ messageId: "wamid_g1" }),
    saveMessage: async () => {},
  });

  assert.equal(result.status, "sent");
  assert.equal(platformChargeCalls, 0, "Platform text reply charge must not apply to client_custom_gemini");
});

test("Scenario H: Insufficient wallet balance blocks message before WhatsApp delivery", async () => {
  let sendAttempted = false;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({
      allowed: false,
      reason: "insufficient_wallet",
      action: "customer_ai_text_reply",
      cost: 0.003,
      balance: 0.001,
    })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-h-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  const result = await sendUniversalOutboundText({
    userId: "user_broke",
    botId: "bot_h",
    customerJid: "contact-6db0c233d9ab@example.invalid",
    messageText: "Should be blocked due to insufficient wallet",
    idempotencyKey: "ai_text_reply:evt_h1",
    billingAction: "customer_ai_text_reply",
    sendText: async () => {
      sendAttempted = true;
      return { messageId: "should_not_send" };
    },
    saveMessage: async () => {},
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "insufficient_wallet");
  assert.equal(sendAttempted, false, "Message must not be sent when wallet balance is insufficient");
});

test("Scenario I: Post-send wallet debit failure appends billing_reconciliation_pending alert and does NOT crash", async () => {
  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 10.0 })) as any,
    chargeUsageBillingAction: (async () => {
      // Simulate Appwrite network glitch or lock timeout after message was already sent to WhatsApp
      return { charged: false, duplicate: false, reason: "appwrite_lock_timeout" };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-i-1", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
  });

  const result = await sendUniversalOutboundText({
    userId: "user_i",
    botId: "bot_i",
    customerJid: "contact-626862d4b59f@example.invalid",
    messageText: "Customer already received this message",
    idempotencyKey: "ai_text_reply:evt_i1",
    billingAction: "customer_ai_text_reply",
    sendText: async () => ({ messageId: "wamid_i1" }),
    saveMessage: async () => {},
  });

  // Message was already delivered to customer, so status is sent
  assert.equal(result.status, "sent");
  assert.equal(result.charged, false);

  // Durable alert must be recorded so revenue is not quietly lost
  const alerts = listOutboundReceiptAlerts("receipt-i-1");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alertType, "billing_reconciliation_pending");
  assert.equal(alerts[0].details.reason, "appwrite_lock_timeout");
  assert.equal(alerts[0].details.billingAction, "customer_ai_text_reply");
  assert.equal(alerts[0].details.chargeAmount, 0.003);
});

test("Scenario J: customer-turn-ai-call-ledger counts 1 base call + extra calls correctly for turn", async () => {
  const turnId = `test_turn_${Date.now()}`;

  // Call 1: primary reply (base call)
  await recordSuccessfulCustomerTurnAiCallAsync({
    customerTurnId: turnId,
    providerCallId: `call_1_${turnId}`,
    provider: "deepinfra",
    purpose: "customer_reply",
  });

  let extra = await getTurnExtraAiCallsCountAsync(turnId);
  assert.equal(extra, 0, "1 qualifying call has 0 extra calls (base only)");
  let billing = await calculateCustomerTurnBillingAsync(turnId);
  assert.equal(billing.totalAmount, 0.003);
  assert.equal(billing.extraCallsCount, 0);

  // Call 2: tool continuation (first extra call)
  await recordSuccessfulCustomerTurnAiCallAsync({
    customerTurnId: turnId,
    providerCallId: `call_2_${turnId}`,
    provider: "deepinfra",
    purpose: "tool_continuation",
  });

  extra = await getTurnExtraAiCallsCountAsync(turnId);
  assert.equal(extra, 1, "2 qualifying calls has 1 extra call ($0.003 + $0.001 = $0.004)");
  billing = await calculateCustomerTurnBillingAsync(turnId);
  assert.equal(billing.totalAmount, 0.004);
  assert.equal(billing.extraCallsCount, 1);

  // Call 3: repair or guard (second extra call)
  await recordSuccessfulCustomerTurnAiCallAsync({
    customerTurnId: turnId,
    providerCallId: `call_3_${turnId}`,
    provider: "deepinfra",
    purpose: "repair_incomplete_reply",
  });

  extra = await getTurnExtraAiCallsCountAsync(turnId);
  assert.equal(extra, 2, "3 qualifying calls has 2 extra calls ($0.003 + $0.002 = $0.005)");
  billing = await calculateCustomerTurnBillingAsync(turnId);
  assert.equal(billing.totalAmount, 0.005);
  assert.equal(billing.extraCallsCount, 2);
});

test("Scenario K: ai-provider-call-ledger-service maps DeepInfra customer replies to customer_ai_text_reply", () => {
  const deepInfraRecord = buildAiProviderCallLedgerRecord({
    provider: {
      provider: "deepinfra",
      purpose: "customer_reply",
      skipPlatformAiUsageCharges: true, // even if account config flag had this set
    },
    result: {},
  });

  assert.equal(
    deepInfraRecord.walletChargeCategory,
    "customer_ai_text_reply",
    "DeepInfra customer replies must be classified as customer_ai_text_reply regardless of account config"
  );

  const clientGeminiRecord = buildAiProviderCallLedgerRecord({
    provider: {
      provider: "client_custom_gemini",
      purpose: "customer_reply",
    },
    result: {},
  });

  assert.equal(
    clientGeminiRecord.walletChargeCategory,
    "client_gemini_message_cycle",
    "Actual client_custom_gemini provider must map to client_gemini_message_cycle"
  );
});

test("Scenario L: ai-handler source contract verifies actualProvider billing settlement", async () => {
  const handlerSource = await fs.readFile(
    path.join(process.cwd(), "src/services/ai-handler.ts"),
    "utf-8"
  );

  // 1. sendAiTextMessage must accept actualProvider and billingAction
  assert.ok(
    handlerSource.includes("actualProvider?: string;"),
    "sendAiTextMessage must accept actualProvider"
  );
  assert.ok(
    handlerSource.includes("billingAction?: BillableUsageAction;"),
    "sendAiTextMessage must accept billingAction"
  );

  // 2. effectiveBillingAction must settle customer_ai_text_reply for DeepInfra or ai_text_reply
  assert.ok(
    handlerSource.includes("const isClientCustomGemini = input.actualProvider === \"client_custom_gemini\";"),
    "Must check if actual executed provider is client_custom_gemini"
  );
  assert.ok(
    handlerSource.includes("if (input.actualProvider === \"deepinfra\" || input.contextType === \"ai_text_reply\")"),
    "Must enforce customer_ai_text_reply for deepinfra or ai_text_reply"
  );

  // 3. Customer reply send site passes actualProvider: effectiveProvider
  assert.ok(
    handlerSource.includes("actualProvider: effectiveProvider,"),
    "Reply send site must pass actualProvider: effectiveProvider"
  );

  // 4. sendUniversalOutboundText receives customerTurnId and provider
  assert.ok(
    handlerSource.includes("customerTurnId: input.customerTurnId,"),
    "sendUniversalOutboundText must receive customerTurnId"
  );
  assert.ok(
    handlerSource.includes("provider: input.actualProvider || \"deepinfra\","),
    "sendUniversalOutboundText must receive actual provider"
  );
});
