import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAccountStatementRows,
  buildTransparencyCsv,
  buildTransparencyRows,
  formatWalletTransactionDescription,
} from "./billing-report-service.ts";

test("account statement usage rows show charged, regular, and saved discount pricing", () => {
  const rows = buildAccountStatementRows({
    usageRows: [
      { timestamp: 1_780_000_000, type: "text_reply", cost: 0.006, amount: 2 },
    ],
    walletTransactions: [
      { created_at: 1_780_000_100, type: "topup", amount: 10, description: "Creem wallet top-up $10 confirmed" },
      { created_at: 1_780_000_200, type: "ai_text_reply_debit", amount: -0.003, description: "AI text response debit (1 reply)" },
    ],
  });

  assert.equal(rows.length, 2);
  assert.match(rows[0].description, /Charged \$0\.003 · regular \$0\.005 · saved \$0\.002/);
  assert.match(rows[0].description, /Save \$0\.002 \(40% off\)/);
});

test("wallet usage debit descriptions append discount details when raw text is old", () => {
  const description = formatWalletTransactionDescription({
    type: "ai_text_reply_debit",
    description: "AI text response debit (1 reply)",
  });

  assert.match(description, /AI text response debit/);
  assert.match(description, /Charged \$0\.003 · regular \$0\.005 · saved \$0\.002/);
});

test("transparency exports include discount-aware descriptions and csv description column", () => {
  const rows = buildTransparencyRows({
    usageRows: [{ timestamp: 1_780_000_000, type: "ai_smart_followup_text", cost: 0.003, amount: 1 }],
    walletTransactions: [{ created_at: 1_780_000_100, type: "ai_ai_smart_followup_text_debit", amount: -0.003, description: "AI smart follow-up text debit (1 message)" }],
    receipts: [{ sentTimestamp: 1_780_000_200, billingAction: "customer_update_stock_text", charged: true, walletChargeAmount: 0.003, sendStatus: "sent", receiptId: "receipt_123456", idempotencyKey: "update_123456", messageId: "wamid_123456" }],
  });

  assert.equal(rows.length, 3);
  assert.match(rows[0].description, /Charged \$0\.003 · regular \$0\.005 · saved \$0\.002/);
  assert.match(rows[2].description, /Charged \$0\.003 · regular \$0\.005 · saved \$0\.002/);

  const csv = buildTransparencyCsv({ rows });
  assert.match(csv, /"description"/);
  assert.match(csv, /Charged \$0\.003 · regular \$0\.005 · saved \$0\.002/);
});
