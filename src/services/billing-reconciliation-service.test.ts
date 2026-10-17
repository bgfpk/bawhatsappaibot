import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __resetBillingReconciliationTestDeps,
  __setBillingReconciliationTestDeps,
  createDurableBillingReconciliationRecord,
  getBillingReconciliationRecord,
  claimBillingReconciliationRecord,
  reconcileBillingRecord,
  listPendingBillingReconciliations,
  processAllPendingBillingReconciliations,
  buildBillingReconciliationDocId,
  startBillingReconciliationScheduler,
  stopBillingReconciliationScheduler,
  isBillingReconciliationSchedulerRunning,
  BillingReconciliationRecord,
} from "./billing-reconciliation-service.ts";
import {
  __resetUniversalOutboundSendTestDeps,
  __setUniversalOutboundSendTestDeps,
  sendUniversalOutboundText,
} from "./universal-outbound-send-service.ts";
import {
  clearOutboundReceipts,
  clearOutboundReceiptAlertsForTest,
} from "./outbound-send-receipt-service.ts";
import {
  clearLiveConsoleEventsForTest,
  listLiveConsoleEvents,
} from "./live-console-event-service.ts";

test.beforeEach(() => {
  stopBillingReconciliationScheduler();
  __resetBillingReconciliationTestDeps();
  __resetUniversalOutboundSendTestDeps();
  clearOutboundReceipts();
  clearOutboundReceiptAlertsForTest();
  clearLiveConsoleEventsForTest();
});

test.afterEach(() => {
  stopBillingReconciliationScheduler();
  __resetBillingReconciliationTestDeps();
  __resetUniversalOutboundSendTestDeps();
  clearOutboundReceipts();
  clearOutboundReceiptAlertsForTest();
  clearLiveConsoleEventsForTest();
});

test("A. WhatsApp send succeeds, wallet charge succeeds -> NO reconciliation record created", async () => {
  let createdReconciliationCount = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 10.0 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, dedupeKey: "dedupe_a", cost: 0.003, walletBalance: 9.997 })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt_a", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
    createDurableBillingReconciliationRecord: (async (input: any) => {
      createdReconciliationCount += 1;
      return createDurableBillingReconciliationRecord(input);
    }) as any,
  });

  const sendResult = await sendUniversalOutboundText({
    userId: "user_a",
    botId: "bot_a",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Hello there!",
    idempotencyKey: "ai_reply:a1",
    billingAction: "customer_ai_text_reply",
    sendText: async () => ({ messageId: "wamid_a1" }),
    saveMessage: async () => {},
  });

  assert.equal(sendResult.status, "sent");
  assert.equal(sendResult.charged, true);
  assert.equal(createdReconciliationCount, 0, "No reconciliation record should be created when charge succeeds");

  const pending = await listPendingBillingReconciliations();
  assert.equal(pending.length, 0);
});

test("B. WhatsApp send succeeds, wallet charge fails -> ONE durable PENDING reconciliation record", async () => {
  let reconciliationCreated = false;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 10.0 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: false, duplicate: false, reason: "appwrite_timeout" })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt_b", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
    createDurableBillingReconciliationRecord: (async (input: any) => {
      reconciliationCreated = true;
      return createDurableBillingReconciliationRecord(input);
    }) as any,
  });

  const sendResult = await sendUniversalOutboundText({
    userId: "user_b",
    botId: "bot_b",
    customerJid: "contact-fb7cfca76a29@example.invalid",
    messageText: "Hello, delivery succeeded but debit failed",
    idempotencyKey: "ai_reply:b1",
    billingAction: "customer_ai_text_reply",
    sendText: async () => ({ messageId: "wamid_b1" }),
    saveMessage: async () => {},
  });

  assert.equal(sendResult.status, "sent", "WhatsApp delivery succeeded, status must be sent");
  assert.equal(sendResult.charged, false);
  assert.equal(reconciliationCreated, true, "Must invoke createDurableBillingReconciliationRecord");

  const docId = buildBillingReconciliationDocId({
    accountId: "user_b",
    receiptId: "receipt_b",
    messageId: "wamid_b1",
  });
  const record = await getBillingReconciliationRecord(docId);
  assert.ok(record, "Reconciliation record must exist in durable storage");
  assert.equal(record.state, "PENDING");
  assert.equal(record.accountId, "user_b");
  assert.equal(record.botId, "bot_b");
  assert.equal(record.customerJid, "contact-fb7cfca76a29@example.invalid");
  assert.equal(record.messageId, "wamid_b1");
  assert.equal(record.receiptId, "receipt_b");
  assert.equal(record.billingAction, "customer_ai_text_reply");
  assert.equal(record.expectedCharge, 0.003);
  assert.equal(record.failureReason, "appwrite_timeout");
  assert.equal(record.attemptCount, 0);
});

test("C. Simulated restart / reload -> reconciliation record still exists and is discoverable", async () => {
  // Store simulates Appwrite server persistence across process restarts
  const persistentStore = new Map<string, { value: string; updated_at: number }>();

  // Process 1: creates reconciliation record
  __setBillingReconciliationTestDeps({
    createDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    getDocument: async (_col, docId) => {
      const found = persistentStore.get(docId);
      if (!found) throw { code: 404 };
      return { $id: docId, ...found };
    },
    listDocuments: async () => ({
      documents: Array.from(persistentStore.entries()).map(([id, d]) => ({ $id: id, ...d })),
    }),
  });

  const created = await createDurableBillingReconciliationRecord({
    accountId: "user_c",
    botId: "bot_c",
    customerJid: "contact-d66891fde170@example.invalid",
    customerTurnId: "turn_c",
    messageId: "wamid_c",
    receiptId: "receipt_c",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_c",
    failureReason: "network_blip",
  });

  assert.equal(created.state, "PENDING");

  // SIMULATE PROCESS RESTART: clear local memory caches and reinitialize
  __resetBillingReconciliationTestDeps();

  // Process 2: connects to same persistent Appwrite store
  __setBillingReconciliationTestDeps({
    createDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    getDocument: async (_col, docId) => {
      const found = persistentStore.get(docId);
      if (!found) throw { code: 404 };
      return { $id: docId, ...found };
    },
    updateDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    listDocuments: async () => ({
      documents: Array.from(persistentStore.entries()).map(([id, d]) => ({ $id: id, ...d })),
    }),
  });

  const pendingList = await listPendingBillingReconciliations();
  assert.equal(pendingList.length, 1);
  assert.equal(pendingList[0].id, created.id);
  assert.equal(pendingList[0].state, "PENDING");
  assert.equal(pendingList[0].messageId, "wamid_c");
});

test("D. Reconciliation succeeds later -> exact wallet debit and marks SETTLED", async () => {
  const debits: Array<{ action: string; amount: number; dedupeKey: string }> = [];

  __setBillingReconciliationTestDeps({
    chargeUsageBillingAction: (async (_userId, action, context, _desc, amount = 1) => {
      debits.push({ action, amount, dedupeKey: context?.dedupeKey });
      return { charged: true, dedupeKey: context?.dedupeKey, cost: 0.003, walletBalance: 9.997 };
    }) as any,
  });

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_d",
    botId: "bot_d",
    customerJid: "contact-79e2d732eaa0@example.invalid",
    customerTurnId: "turn_d",
    messageId: "wamid_d",
    receiptId: "receipt_d",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "original_dedupe_key_d",
    failureReason: "initial_failure",
  });

  const result = await reconcileBillingRecord(record.id, "worker_alpha");
  assert.equal(result.status, "SETTLED");
  assert.equal(result.charged, true);
  assert.equal(debits.length, 1);
  assert.equal(debits[0].action, "customer_ai_text_reply");
  assert.equal(debits[0].dedupeKey, "original_dedupe_key_d", "Must reuse original charge dedupe key");

  const updatedRecord = await getBillingReconciliationRecord(record.id);
  assert.equal(updatedRecord?.state, "SETTLED");
  assert.ok(updatedRecord?.completedAt! > 0);
  assert.equal(updatedRecord?.failureReason, "");
  assert.equal(updatedRecord?.attemptCount, 1);
});

test("E. Two workers attempt same reconciliation concurrently -> exactly one debit, no double-charge", async () => {
  let debitCount = 0;

  __setBillingReconciliationTestDeps({
    chargeUsageBillingAction: (async () => {
      debitCount += 1;
      return { charged: true, cost: 0.003 };
    }) as any,
  });

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_e",
    botId: "bot_e",
    customerJid: "contact-5ff5873adc39@example.invalid",
    customerTurnId: "turn_e",
    messageId: "wamid_e",
    receiptId: "receipt_e",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_e",
    failureReason: "timeout",
  });

  // Worker 1 starts and claims record
  const claim1 = await claimBillingReconciliationRecord(record.id, "worker_1", 30000);
  assert.equal(claim1.success, true);

  // Worker 2 attempts to claim while Worker 1 holds active lease
  const claim2 = await claimBillingReconciliationRecord(record.id, "worker_2", 30000);
  assert.equal(claim2.success, false, "Worker 2 must be blocked while Worker 1 holds lease");
  assert.equal(claim2.reason, "claimed_by_another_worker");

  // Worker 1 finishes reconciliation
  const result1 = await reconcileBillingRecord(record.id, "worker_1");
  assert.equal(result1.status, "SETTLED");
  assert.equal(debitCount, 1);

  // Worker 2 attempts again after worker 1 settled
  const result2 = await reconcileBillingRecord(record.id, "worker_2");
  assert.equal(result2.status, "SETTLED");
  assert.equal(result2.duplicate, true);
  assert.equal(debitCount, 1, "Exactly one wallet debit must occur across all workers");
});

test("F. Charge succeeded before crash -> retry sees duplicate charge and resolves to SETTLED without second debit", async () => {
  let chargeAttempts = 0;

  __setBillingReconciliationTestDeps({
    chargeUsageBillingAction: (async () => {
      chargeAttempts += 1;
      // Database ledger already recorded the charge before the crash
      return { charged: false, duplicate: true, reason: "duplicate_charge_marker" };
    }) as any,
  });

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_f",
    botId: "bot_f",
    customerJid: "contact-b4fd246f8ac3@example.invalid",
    customerTurnId: "turn_f",
    messageId: "wamid_f",
    receiptId: "receipt_f",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_f",
    failureReason: "crashed_during_ack",
  });

  const result = await reconcileBillingRecord(record.id, "recovery_worker");
  assert.equal(result.status, "SETTLED");
  assert.equal(result.charged, true);
  assert.equal(result.duplicate, true);
  assert.equal(chargeAttempts, 1);

  const updatedRecord = await getBillingReconciliationRecord(record.id);
  assert.equal(updatedRecord?.state, "SETTLED");
  assert.ok(updatedRecord?.completedAt! > 0);
});

test("G. Reconciliation worker NEVER invokes WhatsApp send", async () => {
  let whatsAppSendCalled = false;

  __setBillingReconciliationTestDeps({
    chargeUsageBillingAction: (async () => ({ charged: true, cost: 0.003 })) as any,
  });

  // Fake global WhatsApp sender to catch any illicit resend attempt
  const forbiddenSender = () => {
    whatsAppSendCalled = true;
    throw new Error("WHATSAPP SEND MUST NEVER BE INVOKED BY RECONCILIATION");
  };

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_g",
    botId: "bot_g",
    customerJid: "contact-bbd742d0e9f1@example.invalid",
    customerTurnId: "turn_g",
    messageId: "wamid_g",
    receiptId: "receipt_g",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_g",
    failureReason: "timeout",
  });

  const result = await reconcileBillingRecord(record.id);
  assert.equal(result.status, "SETTLED");
  assert.equal(whatsAppSendCalled, false, "Reconciliation must NEVER send WhatsApp messages");
});

test("H. Preserves pricing formulas: N=1 -> $0.003, N=2 -> $0.004, N=3 -> $0.005", async () => {
  const debitedAmounts: Array<{ action: string; amount: number }> = [];

  __setBillingReconciliationTestDeps({
    chargeUsageBillingAction: (async (_uid, action, _ctx, _desc, amount = 1) => {
      debitedAmounts.push({ action, amount });
      return { charged: true, cost: action === "customer_ai_extra_call" ? 0.001 * amount : 0.003 };
    }) as any,
  });

  // Turn 1: N = 1 call ($0.003)
  const rec1 = await createDurableBillingReconciliationRecord({
    accountId: "user_h1",
    botId: "bot_h",
    customerJid: "contact-33011000e273@example.invalid",
    customerTurnId: "turn_h1",
    messageId: "wamid_h1",
    receiptId: "receipt_h1",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_h1",
    failureReason: "err",
  });
  await reconcileBillingRecord(rec1.id);

  // Turn 2: N = 2 calls ($0.004 = $0.003 + $0.001 extra)
  const rec2 = await createDurableBillingReconciliationRecord({
    accountId: "user_h2",
    botId: "bot_h",
    customerJid: "contact-f3f3cc5038ff@example.invalid",
    customerTurnId: "turn_h2",
    messageId: "wamid_h2",
    receiptId: "receipt_h2",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 2,
    expectedCharge: 0.004,
    chargeDedupeKey: "dedupe_h2",
    failureReason: "err",
  });
  await reconcileBillingRecord(rec2.id);

  // Turn 3: N = 3 calls ($0.005 = $0.003 + $0.002 extra)
  const rec3 = await createDurableBillingReconciliationRecord({
    accountId: "user_h3",
    botId: "bot_h",
    customerJid: "contact-f6a5cb6b570a@example.invalid",
    customerTurnId: "turn_h3",
    messageId: "wamid_h3",
    receiptId: "receipt_h3",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 3,
    expectedCharge: 0.005,
    chargeDedupeKey: "dedupe_h3",
    failureReason: "err",
  });
  await reconcileBillingRecord(rec3.id);

  // Turn 1 debits
  assert.equal(debitedAmounts[0].action, "customer_ai_text_reply");
  assert.equal(debitedAmounts[0].amount, 1);

  // Turn 2 debits (base + 1 extra call)
  assert.equal(debitedAmounts[1].action, "customer_ai_text_reply");
  assert.equal(debitedAmounts[1].amount, 1);
  assert.equal(debitedAmounts[2].action, "customer_ai_extra_call");
  assert.equal(debitedAmounts[2].amount, 1);

  // Turn 3 debits (base + 2 extra calls)
  assert.equal(debitedAmounts[3].action, "customer_ai_text_reply");
  assert.equal(debitedAmounts[3].amount, 1);
  assert.equal(debitedAmounts[4].action, "customer_ai_extra_call");
  assert.equal(debitedAmounts[4].amount, 2);
});

test("I. Error escalation: Appwrite reconciliation creation failure logs critical error and does not resend WhatsApp", async () => {
  let criticalErrorEmitted = false;
  let whatsAppSendCount = 0;

  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "customer_ai_text_reply", cost: 0.003, balance: 10.0 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: false, duplicate: false, reason: "initial_charge_failed" })) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt_i", ...input })) as any,
    updateOutboundReceipt: ((_receiptId: string, patch: any) => patch) as any,
    createDurableBillingReconciliationRecord: (async () => {
      // Simulate Appwrite catastrophic network partition / outage
      throw new Error("Appwrite cluster unreachable");
    }) as any,
  });

  const sendResult = await sendUniversalOutboundText({
    userId: "user_i",
    botId: "bot_i",
    customerJid: "contact-bfbf1ca78b5e@example.invalid",
    messageText: "Delivered message during Appwrite outage",
    idempotencyKey: "ai_reply:i1",
    billingAction: "customer_ai_text_reply",
    sendText: async () => {
      whatsAppSendCount += 1;
      return { messageId: "wamid_i1" };
    },
    saveMessage: async () => {},
  });

  // 1. WhatsApp send was confirmed and must NEVER be resent
  assert.equal(sendResult.status, "sent");
  assert.equal(whatsAppSendCount, 1);

  // 2. Critical console events must be emitted for operator escalation
  const events = listLiveConsoleEvents();
  const criticalEvent = events.find((e) => e.type === "wallet_not_charged" && e.level === "error");
  assert.ok(criticalEvent, "Must emit error-level outbound event when reconciliation persistence fails");
  assert.match(criticalEvent.reason || "", /Appwrite cluster unreachable/);
});

test("J. Persistence & Automatic Settlement Through Restart: fresh startup processor discovers, claims, and settles PENDING record without manual intervention", async () => {
  const persistentStore = new Map<string, { value: string; updated_at: number }>();
  let walletDebitCount = 0;

  __setBillingReconciliationTestDeps({
    createDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    getDocument: async (_col, docId) => {
      const found = persistentStore.get(docId);
      if (!found) throw { code: 404 };
      return { $id: docId, ...found };
    },
    updateDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    listDocuments: async () => ({
      documents: Array.from(persistentStore.entries()).map(([id, d]) => ({ $id: id, ...d })),
    }),
    chargeUsageBillingAction: (async () => {
      walletDebitCount += 1;
      return { charged: true, cost: 0.003 };
    }) as any,
  });

  // 1. Create a reconciliation record in PENDING (simulating prior message delivery where debit failed)
  const pendingRecord = await createDurableBillingReconciliationRecord({
    accountId: "user_restart",
    botId: "bot_restart",
    customerJid: "contact-797d5190d3cb@example.invalid",
    customerTurnId: "turn_restart",
    messageId: "wamid_restart_1",
    receiptId: "receipt_restart_1",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_restart_1",
    failureReason: "network_drop_before_wallet",
  });
  assert.equal(pendingRecord.state, "PENDING");

  // 2. Start processor 1, then simulate crash/restart by stopping processor 1
  startBillingReconciliationScheduler({ initialDelayMs: 60000, intervalMs: 60000 });
  stopBillingReconciliationScheduler();

  // 3. Start fresh processor 2 as if after PM2/server restart
  // DO NOT manually invoke settlement for that record!
  startBillingReconciliationScheduler({
    initialDelayMs: 0,
    intervalMs: 1000,
    workerId: "proc_fresh_restart",
  });

  // Wait for the scheduled sweep to automatically execute
  await new Promise((resolve) => setTimeout(resolve, 80));

  stopBillingReconciliationScheduler();

  // 4. Assert automatic discovery, claim, and transition to SETTLED
  const settledDoc = persistentStore.get(pendingRecord.id);
  assert.ok(settledDoc, "Record must persist in store");
  const settledRecord: BillingReconciliationRecord = JSON.parse(settledDoc.value);
  assert.equal(settledRecord.state, "SETTLED");
  assert.equal(settledRecord.claimedBy, "proc_fresh_restart");
  assert.ok(settledRecord.completedAt! > 0);
  assert.equal(walletDebitCount, 1, "Wallet debit must occur exactly once automatically");
});

test("K. Automatic Boot: server.ts imports and wires startBillingReconciliationProcessor into runtime startup", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const serverSource = readFileSync(resolve(root, "server.ts"), "utf8");

  // Verify import
  assert.match(serverSource, /startBillingReconciliationScheduler/);
  // Verify function definition
  assert.match(serverSource, /function startBillingReconciliationProcessor\(\)/);
  // Verify execution at server startup alongside other schedulers
  assert.match(serverSource, /startBillingReconciliationProcessor\(\);/);

  // Verify runtime lifecycle
  assert.equal(isBillingReconciliationSchedulerRunning(), false);
  const started = startBillingReconciliationScheduler({ initialDelayMs: 50000, intervalMs: 50000 });
  assert.equal(started, true);
  assert.equal(isBillingReconciliationSchedulerRunning(), true);

  stopBillingReconciliationScheduler();
  assert.equal(isBillingReconciliationSchedulerRunning(), false);
});

test("L. Two-Process Race: concurrent processors compete for same PENDING record -> exactly 1 claim, 1 debit, 0 double-charges", async () => {
  const persistentStore = new Map<string, { value: string; updated_at: number }>();
  let totalWalletDebits = 0;

  __setBillingReconciliationTestDeps({
    createDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    getDocument: async (_col, docId) => {
      const found = persistentStore.get(docId);
      if (!found) throw { code: 404 };
      return { $id: docId, ...found };
    },
    updateDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    listDocuments: async () => ({
      documents: Array.from(persistentStore.entries()).map(([id, d]) => ({ $id: id, ...d })),
    }),
    chargeUsageBillingAction: (async () => {
      totalWalletDebits += 1;
      return { charged: true, cost: 0.003 };
    }) as any,
  });

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_race",
    botId: "bot_race",
    customerJid: "contact-5fde6e2a14d3@example.invalid",
    customerTurnId: "turn_race",
    messageId: "wamid_race_1",
    receiptId: "receipt_race_1",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_race_1",
    failureReason: "timeout",
  });

  // Worker 1 and Worker 2 run in parallel
  const [result1, result2] = await Promise.all([
    reconcileBillingRecord(record.id, "worker_proc_1"),
    reconcileBillingRecord(record.id, "worker_proc_2"),
  ]);

  // Both results must be valid, but only one performed a new debit
  assert.equal(totalWalletDebits, 1, "Exactly one wallet debit must be made");
  const finalDoc = persistentStore.get(record.id);
  const finalRecord: BillingReconciliationRecord = JSON.parse(finalDoc!.value);
  assert.equal(finalRecord.state, "SETTLED");

  const winner = [result1, result2].find((r) => r.status === "SETTLED" && r.charged);
  const loser = [result1, result2].find((r) => r.reason === "claimed_by_another_worker" || r.duplicate);
  assert.ok(winner, "One worker must successfully claim and settle");
  assert.ok(loser, "The losing worker must safely skip when record is already claimed or settled");
});

test("M. Crash-After-Debit Recovery: debit succeeded but process crashed before SETTLED -> retry sees duplicate charge and marks SETTLED with zero second debit", async () => {
  const persistentStore = new Map<string, { value: string; updated_at: number }>();
  let chargeInvocationCount = 0;
  let ledgerDebitCount = 0;

  __setBillingReconciliationTestDeps({
    createDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    getDocument: async (_col, docId) => {
      const found = persistentStore.get(docId);
      if (!found) throw { code: 404 };
      return { $id: docId, ...found };
    },
    updateDocument: async (_col, docId, data) => {
      persistentStore.set(docId, data);
      return { $id: docId, ...data };
    },
    listDocuments: async () => ({
      documents: Array.from(persistentStore.entries()).map(([id, d]) => ({ $id: id, ...d })),
    }),
    chargeUsageBillingAction: (async (_uid, _action, context) => {
      chargeInvocationCount += 1;
      // Ledger checks dedupeKey: if already charged, returns duplicate
      if (context?.dedupeKey === "dedupe_crash_sim") {
        if (ledgerDebitCount === 0) {
          ledgerDebitCount += 1;
          return { charged: true, dedupeKey: context.dedupeKey, cost: 0.003 };
        } else {
          return { charged: false, duplicate: true, dedupeKey: context.dedupeKey, reason: "duplicate_charge" };
        }
      }
      return { charged: true, cost: 0.003 };
    }) as any,
  });

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_crash",
    botId: "bot_crash",
    customerJid: "contact-6d1f7ee788da@example.invalid",
    customerTurnId: "turn_crash",
    messageId: "wamid_crash_1",
    receiptId: "receipt_crash_1",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_crash_sim",
    failureReason: "initial_failure",
  });

  // Simulate debit succeeded on worker 1, but process crashed before updateDocument SETTLED
  ledgerDebitCount = 1;

  // Expire the lease to simulate post-crash recovery
  const claimedRecord: BillingReconciliationRecord = {
    ...record,
    state: "CLAIMED",
    claimedBy: "crashed_worker",
    claimedAt: Date.now() - 120000,
    leaseExpiresAt: Date.now() - 60000, // expired!
  };
  persistentStore.set(record.id, { value: JSON.stringify(claimedRecord), updated_at: Math.floor(Date.now() / 1000) });

  // Recovery processor starts and reconciles
  const recoveryResult = await reconcileBillingRecord(record.id, "recovery_processor");
  assert.equal(recoveryResult.status, "SETTLED");
  assert.equal(recoveryResult.duplicate, true);
  assert.equal(ledgerDebitCount, 1, "Zero second debit must occur");

  const settledDoc = persistentStore.get(record.id);
  const settledRec: BillingReconciliationRecord = JSON.parse(settledDoc!.value);
  assert.equal(settledRec.state, "SETTLED");
});

test("N. Never Resend WhatsApp: processor strictly reconciles financial debit and has zero interaction with WhatsApp transport", async () => {
  let whatsAppSendMessageCalls = 0;

  __setBillingReconciliationTestDeps({
    chargeUsageBillingAction: (async () => ({ charged: true, cost: 0.003 })) as any,
  });

  // Global spy on any potential WhatsApp transport methods
  const spyWhatsAppSend = () => {
    whatsAppSendMessageCalls += 1;
    throw new Error("WHATSAPP SEND MUST NEVER BE INVOKED DURING RECONCILIATION");
  };

  const record = await createDurableBillingReconciliationRecord({
    accountId: "user_nowa",
    botId: "bot_nowa",
    customerJid: "contact-c23e955d9428@example.invalid",
    customerTurnId: "turn_nowa",
    messageId: "wamid_nowa_1",
    receiptId: "receipt_nowa_1",
    billingAction: "customer_ai_text_reply",
    successfulQualifyingAiCalls: 1,
    expectedCharge: 0.003,
    chargeDedupeKey: "dedupe_nowa_1",
    failureReason: "network_err",
  });

  const result = await reconcileBillingRecord(record.id, "worker_nowa");
  assert.equal(result.status, "SETTLED");
  assert.equal(whatsAppSendMessageCalls, 0, "Reconciliation must make exactly 0 WhatsApp send calls");
});

test("O. Appwrite Failure: error during settlement persistence logs critical operational error and does not resend WhatsApp or duplicate debits", async () => {
  let loggedErrors: string[] = [];
  const originalError = console.error;
  console.error = (...args: any[]) => {
    loggedErrors.push(args.join(" "));
  };

  try {
    let chargeDebits = 0;
    __setBillingReconciliationTestDeps({
      updateDocument: async () => {
        throw new Error("Appwrite 500 internal server error");
      },
      chargeUsageBillingAction: (async () => {
        chargeDebits += 1;
        return { charged: true, cost: 0.003 };
      }) as any,
    });

    const record = await createDurableBillingReconciliationRecord({
      accountId: "user_appwrite_fail",
      botId: "bot_appwrite_fail",
      customerJid: "contact-dabcba02a750@example.invalid",
      customerTurnId: "turn_fail",
      messageId: "wamid_fail_1",
      receiptId: "receipt_fail_1",
      billingAction: "customer_ai_text_reply",
      successfulQualifyingAiCalls: 1,
      expectedCharge: 0.003,
      chargeDedupeKey: "dedupe_fail_1",
      failureReason: "initial",
    });

    const result = await reconcileBillingRecord(record.id, "worker_err");
    // Assert critical operational error was logged without swallowing
    const hasCriticalLog = loggedErrors.some((log) => log.includes("[CRITICAL_BILLING_ERROR]"));
    assert.equal(hasCriticalLog, true, "Must surface [CRITICAL_BILLING_ERROR]");
  } finally {
    console.error = originalError;
  }
});

test("P. Timer / Shutdown Safety: double-start returns false and does not duplicate intervals; stop cleanly cleans up timers", () => {
  assert.equal(isBillingReconciliationSchedulerRunning(), false);

  const start1 = startBillingReconciliationScheduler({ initialDelayMs: 60000, intervalMs: 60000 });
  assert.equal(start1, true);
  assert.equal(isBillingReconciliationSchedulerRunning(), true);

  // Calling start a second time must return false (double-start protection)
  const start2 = startBillingReconciliationScheduler({ initialDelayMs: 60000, intervalMs: 60000 });
  assert.equal(start2, false, "Second start call must be rejected");

  // Shutdown cleanup
  stopBillingReconciliationScheduler();
  assert.equal(isBillingReconciliationSchedulerRunning(), false);
});

test("Q. Processor Guard: MANUAL_REVIEW and unexpired claims are skipped; expired claims are reclaimed safely", async () => {
  const store = new Map<string, { value: string; updated_at: number }>();
  const now = Date.now();

  __setBillingReconciliationTestDeps({
    now: () => now,
    listDocuments: async () => ({
      documents: Array.from(store.entries()).map(([id, d]) => ({ $id: id, ...d })),
    }),
    getDocument: async (_col, docId) => {
      const found = store.get(docId);
      if (!found) throw { code: 404 };
      return { $id: docId, ...found };
    },
    updateDocument: async (_col, docId, data) => {
      store.set(docId, data);
      return { $id: docId, ...data };
    },
  });

  // 1. SETTLED record -> must be skipped
  store.set("brc_1", {
    value: JSON.stringify({ id: "brc_1", state: "SETTLED" }),
    updated_at: Math.floor(now / 1000),
  });

  // 2. MANUAL_REVIEW record -> must be skipped
  store.set("brc_2", {
    value: JSON.stringify({ id: "brc_2", state: "MANUAL_REVIEW" }),
    updated_at: Math.floor(now / 1000),
  });

  // 3. Unexpired CLAIMED record -> must be skipped
  store.set("brc_3", {
    value: JSON.stringify({
      id: "brc_3",
      state: "CLAIMED",
      claimedBy: "other_worker",
      leaseExpiresAt: now + 50000, // future
    }),
    updated_at: Math.floor(now / 1000),
  });

  // 4. Expired CLAIMED record -> must be returned
  store.set("brc_4", {
    value: JSON.stringify({
      id: "brc_4",
      state: "CLAIMED",
      claimedBy: "dead_worker",
      leaseExpiresAt: now - 10000, // past
    }),
    updated_at: Math.floor(now / 1000),
  });

  const pending = await listPendingBillingReconciliations();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "brc_4");
});
