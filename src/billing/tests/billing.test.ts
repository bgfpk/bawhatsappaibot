import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAccountCurrency,
  filterUsageRecords,
  filterBillingTransactions,
  type UsageRecordItem,
  type BillingTransactionItem,
} from "../billing-model";

test("formatAccountCurrency: formats USD and PKR correctly", () => {
  assert.equal(formatAccountCurrency(25.5, "USD"), "$25.50");
  assert.equal(formatAccountCurrency(0, "USD"), "$0.00");
  assert.equal(formatAccountCurrency(-0, "USD"), "$0.00");
  assert.ok(formatAccountCurrency(10, "PKR").includes("Rs."));
});

test("formatAccountCurrency: microcharge display precision for sub-cent values", () => {
  assert.equal(formatAccountCurrency(0.003), "$0.003");
  assert.equal(formatAccountCurrency(-0.003), "-$0.003");
  assert.equal(formatAccountCurrency(0.001), "$0.001");
  assert.equal(formatAccountCurrency(-0.001), "-$0.001");
  assert.equal(formatAccountCurrency(0.0005), "$0.0005");
  assert.equal(formatAccountCurrency(-0.0005), "-$0.0005");
  // Debit in billing history must not display as $-0.00
  assert.notEqual(formatAccountCurrency(-0.001), "$-0.00");
  assert.notEqual(formatAccountCurrency(-0.0005), "$-0.00");
  assert.notEqual(formatAccountCurrency(-0.003), "$-0.00");
});

test("filterUsageRecords: filters usage items by category and search query", () => {
  const records: UsageRecordItem[] = [
    {
      id: "u1",
      timestamp: 1700000000000,
      category: "ai_text",
      categoryLabel: "AI Text Reply",
      unitPriceUsd: 0.001,
      count: 10,
      totalUsd: 0.01,
      instanceName: "Main Store",
    },
    {
      id: "u2",
      timestamp: 1700000050000,
      category: "voice",
      categoryLabel: "Voice Generation",
      unitPriceUsd: 0.005,
      count: 2,
      totalUsd: 0.01,
      instanceName: "Support Bot",
    },
  ];

  const searchVoice = filterUsageRecords(records, "voice", "all");
  assert.equal(searchVoice.length, 1);
  assert.equal(searchVoice[0].id, "u2");

  const byCat = filterUsageRecords(records, "", "ai_text");
  assert.equal(byCat.length, 1);
  assert.equal(byCat[0].id, "u1");
});

test("filterBillingTransactions: filters ledger transactions correctly", () => {
  const txs: BillingTransactionItem[] = [
    {
      id: "tx1",
      timestamp: 1700000000000,
      type: "topup",
      description: "Wallet Top-up via Credit Card",
      amountUsd: 50,
      runningBalanceUsd: 50,
      referenceId: "ref_101",
    },
    {
      id: "tx2",
      timestamp: 1700000050000,
      type: "plan_purchase",
      description: "Growth Plan Monthly Subscription",
      amountUsd: -29,
      runningBalanceUsd: 21,
      referenceId: "ref_102",
    },
  ];

  const topupsOnly = filterBillingTransactions(txs, "", "topup");
  assert.equal(topupsOnly.length, 1);
  assert.equal(topupsOnly[0].id, "tx1");

  const searchGrowth = filterBillingTransactions(txs, "Growth", "all");
  assert.equal(searchGrowth.length, 1);
  assert.equal(searchGrowth[0].id, "tx2");
});

test("Usage Breakdown: maintains descending sort order and selectable limit behavior", () => {
  const records: UsageRecordItem[] = [
    { id: "u3", timestamp: 1700000030000, category: "customer_ai", categoryLabel: "Customer AI Reply", unitPriceUsd: 0.001, count: 1, totalUsd: 0.001 },
    { id: "u2", timestamp: 1700000020000, category: "customer_ai", categoryLabel: "Customer AI Reply", unitPriceUsd: 0.001, count: 1, totalUsd: 0.001 },
    { id: "u1", timestamp: 1700000010000, category: "customer_ai", categoryLabel: "Customer AI Reply", unitPriceUsd: 0.001, count: 1, totalUsd: 0.001 },
  ];

  // Filtering does not revert sort order to oldest-first; newest entry remains top
  const filtered = filterUsageRecords(records, "Customer", "customer_ai");
  assert.equal(filtered.length, 3);
  assert.equal(filtered[0].id, "u3"); // newest
  assert.equal(filtered[2].id, "u1"); // oldest

  // Simulating selectable limits: 10, 100, 1000
  const limit10 = records.slice(0, 10);
  assert.equal(limit10.length, 3);
  assert.equal(limit10[0].id, "u3");

  // Simulating new usage event arrival: inserts at top, maintains limit, oldest falls out
  const limit = 2; // test limit constraint
  const newEvent: UsageRecordItem = {
    id: "u4",
    timestamp: 1700000040000,
    category: "customer_ai",
    categoryLabel: "Customer AI Reply",
    unitPriceUsd: 0.001,
    count: 1,
    totalUsd: 0.001,
  };

  const updated = [newEvent, ...records]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  assert.equal(updated.length, 2);
  assert.equal(updated[0].id, "u4"); // newest becomes row 1
  assert.equal(updated[1].id, "u3");
  // u2 and u1 fell out as oldest
});
