import test from "node:test";
import assert from "node:assert/strict";
import { buildBillingTransactionItems, buildUsageRecordItems } from "../billing-adapter.ts";

test("Billing Adapter Parity", async (t) => {
  await t.test("buildBillingTransactionItems maps topup, usage, and plan purchases correctly", () => {
    const rawTx = [
      {
        $id: "tx_1",
        created_at: 1750000000,
        type: "topup",
        description: "Credit card topup $20",
        amount: 20.0,
        running_balance: 20.0,
      },
      {
        $id: "tx_2",
        created_at: 1750001000,
        type: "usage",
        description: "AI Voice Reply",
        amount: -0.05,
        running_balance: 19.95,
      },
      {
        $id: "tx_3",
        created_at: 1750002000,
        type: "plan_purchase",
        description: "Growth Plan Upgrade",
        amount: 29.0,
        running_balance: 0.0,
      },
    ];

    const items = buildBillingTransactionItems(rawTx);
    assert.equal(items.length, 3);
    assert.equal(items[0].type, "topup");
    assert.equal(items[0].amountUsd, 20.0);
    assert.equal(items[1].type, "usage");
    assert.equal(items[1].amountUsd, -0.05); // Negative debit
    assert.equal(items[2].type, "plan_purchase");
  });

  await t.test("buildUsageRecordItems maps analytics data rows cleanly", () => {
    const rawAnalytics = [
      {
        $id: "an_1",
        created_at: 1750000000,
        type: "ai_text_reply",
        count: 10,
        cost: 0.10,
        instance: "Bot Alpha",
      },
    ];

    const items = buildUsageRecordItems(rawAnalytics);
    assert.equal(items.length, 1);
    assert.equal(items[0].category, "ai_text_reply");
    assert.equal(items[0].count, 10);
    assert.equal(items[0].totalUsd, 0.10);
    assert.equal(items[0].instanceName, "Bot Alpha");
  });

  await t.test("parseTimestampToEpochMs parses ISO strings and Appwrite $createdAt without Date.now() fallback", () => {
    const rawIsoTx = [
      {
        $id: "tx_iso",
        date: "2026-08-09T12:00:00.000Z",
        type: "topup",
        amount: 50.0,
      },
      {
        $id: "tx_appwrite",
        $createdAt: "2026-08-08T10:30:00.000Z",
        type: "usage",
        amount: 1.5,
      },
    ];

    const items = buildBillingTransactionItems(rawIsoTx);
    assert.equal(items[0].timestamp, Date.parse("2026-08-09T12:00:00.000Z"));
    assert.equal(items[1].timestamp, Date.parse("2026-08-08T10:30:00.000Z"));
  });

  await t.test("buildBillingTransactionItems classifies all required transaction types correctly", () => {
    const rawTransactions = [
      { $id: "tx_1", type: "signup_credit", amount: 1.0, created_at: 1750000000 },
      { $id: "tx_2", type: "topup", amount: 20.0, created_at: 1750001000 },
      { $id: "tx_3", type: "creem_pending", amount: 15.0, created_at: 1750002000 },
      { $id: "tx_4", type: "subscription", amount: 29.0, created_at: 1750003000 },
      { $id: "tx_5", type: "addon", amount: 10.0, created_at: 1750004000 },
      { $id: "tx_6", type: "setup", amount: 50.0, created_at: 1750005000 },
      { $id: "tx_7", type: "refund", amount: 10.0, created_at: 1750006000 },
      { $id: "tx_8", type: "reversal", amount: 5.0, created_at: 1750007000 },
      { $id: "tx_9", type: "ai_text_reply", amount: 0.05, created_at: 1750008000 },
      { $id: "tx_10", type: "manual_adjustment", amount: 2.0, created_at: 1750009000 },
      { $id: "tx_11", type: "custom_unknown_action", amount: 5.0, created_at: 1750010000 },
    ];

    const items = buildBillingTransactionItems(rawTransactions);
    assert.equal(items.length, 11);
    assert.equal(items[0].type, "topup");
    assert.equal(items[0].description, "Signup/free credit");
    assert.equal(items[1].type, "topup");
    assert.equal(items[1].description, "Wallet top-up/deposit");
    assert.equal(items[2].type, "topup");
    assert.equal(items[2].description, "Creem checkout pending");
    assert.equal(items[3].type, "plan_purchase");
    assert.equal(items[3].description, "Subscription charge/renewal");
    assert.equal(items[4].type, "addon_purchase");
    assert.equal(items[4].description, "Add-on charge");
    assert.equal(items[5].type, "addon_purchase");
    assert.equal(items[5].description, "Setup service");
    assert.equal(items[6].type, "adjustment");
    assert.equal(items[6].description, "Refund/reversal");
    assert.equal(items[7].type, "adjustment");
    assert.equal(items[7].description, "Refund/reversal");
    assert.equal(items[8].type, "usage");
    assert.equal(items[8].description, "Usage wallet debit");
    assert.equal(items[9].type, "adjustment");
    assert.equal(items[9].description, "Manual wallet adjustment");
    assert.equal(items[10].type, "topup"); // Unknown positive amount
    assert.equal(items[10].description, "Wallet deposit"); // Neutral fallback description, not fake AI Usage!
  });
});
