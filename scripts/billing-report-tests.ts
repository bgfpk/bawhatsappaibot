import assert from "node:assert/strict";
import {
  buildAccountStatementRows,
  buildTransparencyCsv,
  buildTransparencyRows,
  buildTransparencyText,
  buildUsageDailySeries,
  getUsageCategoryLabel,
  sanitizeBillingDescription,
  summarizeUsageRows,
} from "../src/services/billing-report-service.ts";

const day = Math.floor(new Date("2026-06-14T10:00:00.000Z").getTime() / 1000);

const usageRows = [
  { type: "customer_ai_text_reply", amount: 2, cost: 0.002, timestamp: day },
  { type: "customer_ai_image_understanding", amount: 1, cost: 0.002, timestamp: day + 60 },
  { type: "image_understanding", amount: 1, cost: 0.007, timestamp: day + 90 },
  { type: "broadcast_tracking_text", amount: 3, cost: 0.003, timestamp: day + 120 },
  { type: "audio_understanding", amount: 1, cost: 0.01, timestamp: day + 130 },
  { type: "voice_reply_generation", amount: 1, cost: 0.02, timestamp: day + 140 },
];

const walletTransactions = [
  { type: "topup", amount: 10, description: "Creem payment blackarrow_abcdefghijklmnopqrstuvwxyz0123456789", created_at: day },
  { type: "ai_customer_reply", amount: -0.002, description: "AI usage debit | receipt: verylongreceiptidentifier123456", created_at: day + 10 },
  { type: "subscription", amount: -29, description: "Subscription transaction txn_abcdefghijklmnopqrstuvwxyz", created_at: day + 20 },
];

const receipts = [
  {
    sendStatus: "success",
    charged: true,
    walletChargeAmount: 0.001,
    billingAction: "customer_ai_text_reply",
    receiptId: "receipt_success_abcdefghijklmnopqrstuvwxyz",
    messageId: "message_success_abcdefghijklmnopqrstuvwxyz",
    sentTimestamp: day * 1000,
  },
  {
    sendStatus: "failed",
    charged: false,
    walletChargeAmount: 0.001,
    billingAction: "broadcast_tracking_text",
    receiptId: "receipt_failed_abcdefghijklmnopqrstuvwxyz",
    errorReason: "Provider failed with token secret_identifier_abcdefghijklmnopqrstuvwxyz",
    sentTimestamp: (day + 30) * 1000,
  },
];

const summaries = summarizeUsageRows(usageRows);
assert.equal(summaries.length, 5);
assert.equal(summaries.find((item) => item.key === "normal_ai_text_reply")?.label, "Normal AI text reply");
assert.equal(summaries.find((item) => item.key === "image_understanding")?.amount, 2);
assert.equal(summaries.find((item) => item.key === "voice_message_understanding")?.label, "Voice message understanding");
assert.equal(summaries.find((item) => item.key === "voice_reply_generation")?.label, "Voice reply generation");
assert.equal(getUsageCategoryLabel("customer_ai_voice_reply"), "Voice reply generation");
assert.equal(summaries.reduce((sum, item) => Number((sum + item.cost).toFixed(6)), 0), 0.044);

const daily = buildUsageDailySeries(usageRows);
assert.equal(daily.length, 1);
assert.equal(daily[0].cost, 0.044);
assert.equal(daily[0].image_understanding, 0.009);

const statementRows = buildAccountStatementRows({ usageRows, walletTransactions });
assert.ok(statementRows.some((row) => row.type === "Wallet top-up/deposit" && row.amount === 10));
assert.ok(statementRows.some((row) => row.type === "Subscription charge/renewal" && row.amount === -29));
assert.ok(!statementRows.some((row) => row.description.includes("receipt:")));
assert.equal(
  statementRows
    .filter((row) => row.type === "Daily usage spend")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0),
  0.044
);

const transparencyRows = buildTransparencyRows({ usageRows, walletTransactions, receipts });
assert.equal(transparencyRows.find((row) => row.source === "receipt" && row.status === "failed")?.amount, 0);
assert.ok(transparencyRows.every((row) => !row.description.includes("abcdefghijklmnopqrstuvwxyz")));

const text = buildTransparencyText({
  date: "2026-06-14",
  userLabel: "current account",
  rows: transparencyRows,
  receiptsAvailable: true,
});
assert.ok(text.includes("usage_analytics"));
assert.ok(text.includes("receipt"));
assert.ok(!text.includes("abcdefghijklmnopqrstuvwxyz"));

const csv = buildTransparencyCsv({ rows: transparencyRows });
assert.ok(csv.startsWith('"timestamp","source","category/action","status","amount","reason","evidence"'));
assert.ok(csv.includes('"receipt"'));
assert.ok(!csv.includes("secret_identifier_abcdefghijklmnopqrstuvwxyz"));

assert.equal(sanitizeBillingDescription("Payment transaction txn_abcdefghijklmnopqrstuvwxyz"), "Payment transaction txn_...wxyz");
assert.equal(sanitizeBillingDescription("Contact +1 555 111 2222 and contact-2f5256f18e8b@example.invalid"), "Contact phone_*** and whatsapp_***");

console.log("billing-report-tests passed");
