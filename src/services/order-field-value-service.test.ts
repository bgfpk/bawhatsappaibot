import test from "node:test";
import assert from "node:assert/strict";

import { cleanOrderFieldValue, sanitizeOrderCustomFields } from "./order-field-value-service.ts";
import { buildConfirmedOrderSummaryRows } from "./order-summary-message-service.ts";

test("not found placeholders are rejected as order field values", () => {
  assert.equal(cleanOrderFieldValue("not found"), "");
  assert.equal(cleanOrderFieldValue("name not found"), "");
  assert.equal(cleanOrderFieldValue("not provided"), "");
});

test("final order summary does not display placeholder name", () => {
  const rows = buildConfirmedOrderSummaryRows({
    customerName: "not found",
    customerPhone: "15811061380",
    productName: "Sample Product",
    quantity: 1,
    totalPrice: 1000,
  }, { order_id: "ORD1" });

  assert.equal(rows.some((row) => /Name/i.test(row)), false);
});

test("instruction-like custom field names are not saved as customer fields", () => {
  assert.deepEqual(sanitizeOrderCustomFields({
    "FINAL COMPLETION RULE": "Yes done please",
    "Patient Gender": "Male",
  }), {
    "Patient Gender": "Male",
  });
});
