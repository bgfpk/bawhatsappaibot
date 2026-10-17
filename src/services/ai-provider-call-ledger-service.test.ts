import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetAiProviderCallLedgerTestDeps,
  __setAiProviderCallLedgerTestDeps,
  buildAiProviderCallLedgerRecord,
  recordAiProviderCallLedger,
  updateAiProviderCallSendOutcome,
} from "./ai-provider-call-ledger-service.ts";
import { summarizeAiProviderCallLedger } from "./ai-provider-call-ledger-diagnostics-service.ts";

test.afterEach(() => {
  __resetAiProviderCallLedgerTestDeps();
});

test("provider call ledger records purpose, account, bot, and customer-visible fields without message body", async () => {
  const writes: any[] = [];
  __setAiProviderCallLedgerTestDeps({
    createDocument: async (_databaseId, _collection, id, doc) => {
      writes.push({ id, doc });
      return doc;
    },
    idUnique: () => "unique_1",
    now: () => 2000,
  } as any);

  const result = await recordAiProviderCallLedger({
    provider: {
      provider: "platform_gemini",
      accountId: "acct_1",
      userId: "acct_1",
      botId: "bot_1",
      purpose: "customer_ai_reply",
      model: "gemini-2.5-flash",
      billingContext: { customerJid: "contact-e4ed32210a80@example.invalid", eventId: "msg_1" },
    },
    result: {
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        totalTokenCount: 120,
      },
    },
  });

  assert.equal(result.recorded, true);
  assert.equal(writes.length, 1);
  const row = JSON.parse(writes[0].doc.value);
  assert.equal(row.accountId, "acct_1");
  assert.equal(row.botId, "bot_1");
  assert.equal(row.purpose, "customer_ai_reply");
  assert.equal(row.category, "customer_reply");
  assert.equal(row.customerVisible, true);
  assert.equal(row.helper, false);
  assert.equal(row.expectedWalletCharge, 0.003);
  assert.equal(JSON.stringify(row).includes("PRIVATE CUSTOMER CHAT"), false);
});

test("helper provider call records helper=true and ledger write failure is non-blocking", async () => {
  __setAiProviderCallLedgerTestDeps({
    createDocument: async () => {
      throw new Error("schema unavailable");
    },
    idUnique: () => "unique_2",
    now: () => 2001,
  } as any);

  const record = buildAiProviderCallLedgerRecord({
    provider: {
      provider: "platform_gemini",
      accountId: "acct_1",
      botId: "bot_1",
      purpose: "ai_customer_summary",
      billingContext: { eventId: "summary_1" },
    },
  });
  const result = await recordAiProviderCallLedger({ provider: record });

  assert.equal(record.category, "summary");
  assert.equal(record.helper, true);
  assert.equal(result.recorded, false);
  assert.equal(result.reason, "write_failed");
});

test("provider call ledger send outcome updates matching AI call safely", async () => {
  const existing = {
    id: "aipl_existing",
    accountId: "acct_1",
    userId: "acct_1",
    botId: "bot_1",
    customerJid: "contact-d46626999a99@example.invalid",
    purpose: "ai_smart_followup_generation",
    category: "smart_followup",
    customerVisible: true,
    helper: false,
    background: false,
    billingGroupKey: "followup::1",
    idempotencyKey: "",
    reasonLabels: [],
    finalSendOutcome: "pending",
    chargeOutcome: "unknown",
  };
  let updated: any = null;
  __setAiProviderCallLedgerTestDeps({
    listDocuments: async () => ({ documents: [{ $id: "aipl_existing", value: JSON.stringify(existing), updated_at: 2000 }] }),
    updateDocument: async (_databaseId, _collection, _id, patch) => {
      updated = JSON.parse(patch.value);
      return patch;
    },
    now: () => 2010,
  } as any);

  const result = await updateAiProviderCallSendOutcome({
    accountId: "acct_1",
    botId: "bot_1",
    customerJid: "contact-d46626999a99@example.invalid",
    idempotencyKey: "followup::1",
    receiptId: "receipt_1",
    messageId: "wamid_1",
    finalSendOutcome: "sent",
    chargeOutcome: "charged",
  });

  assert.equal(result.updated, true);
  assert.equal(updated.finalSendOutcome, "sent");
  assert.equal(updated.chargeOutcome, "charged");
  assert.equal(updated.receiptId, "receipt_1");
  assert.equal(updated.relatedMessageId, "wamid_1");
});

test("provider call ledger diagnostics summarize helper, visible, failed, retry, and summary counts", () => {
  const docs = [
    { $id: "aipl_1", value: JSON.stringify({ accountId: "acct_1", purpose: "customer_ai_reply", category: "customer_reply", customerVisible: true, helper: false, finalSendOutcome: "sent" }) },
    { $id: "aipl_2", value: JSON.stringify({ accountId: "acct_1", purpose: "ai_customer_summary", category: "summary", customerVisible: false, helper: true, finalSendOutcome: "no_send" }) },
    { $id: "aipl_3", value: JSON.stringify({ accountId: "acct_2", purpose: "customer_ai_reply_repair", category: "repair", customerVisible: false, helper: true, finalSendOutcome: "failed" }) },
  ];

  const summary = summarizeAiProviderCallLedger(docs);

  assert.equal(summary.totalProviderCallLedgerCount, 3);
  assert.equal(summary.customerVisibleCallCount, 1);
  assert.equal(summary.helperBackgroundCallCount, 2);
  assert.equal(summary.noSendFailedCallCount, 2);
  assert.equal(summary.summaryCallCount, 1);
  assert.equal(summary.retryRepairCallCount, 1);
  assert.equal(summary.topPurposesByCallCount[0].count, 1);
});
