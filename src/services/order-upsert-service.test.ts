import test from "node:test";
import assert from "node:assert/strict";

import { canUpdateExistingOrder, isSameOrderCustomer } from "./order-upsert-service.ts";

test("order matching stays international and does not force Pakistan phone normalization", () => {
  assert.equal(isSameOrderCustomer(
    { customerPhone: "+44 7700 900123" },
    { phone: "103313419111" },
  ), true);

  assert.equal(isSameOrderCustomer(
    { customerPhone: "+44 7700 900123" },
    { phone: "+1 202 555 0101" },
  ), false);
});

test("duplicate confirm updates the same order instead of creating a new one", () => {
  const nowSeconds = 1_720_000_000;
  assert.equal(canUpdateExistingOrder(
    {
      customerPhone: "+44 7700 900123",
      createdAt: nowSeconds - 60,
      transactionStatus: "Confirmed order",
    },
    {
      phone: "103313419111",
      productName: "Starter Plan",
      transactionStatus: "Confirmed order",
      recordStatus: "complete",
    },
    nowSeconds,
  ), true);
});

test("complete record is not overwritten by a new incomplete draft", () => {
  const nowSeconds = 1_720_000_000;
  assert.equal(canUpdateExistingOrder(
    {
      customerPhone: "+44 7700 900123",
      createdAt: nowSeconds - 60,
      transactionStatus: "Confirmed order",
      recordStatus: "complete",
    },
    {
      phone: "103313419111",
      productName: "Starter Plan",
      recordStatus: "incomplete",
      transactionStatus: "Order incomplete",
    },
    nowSeconds,
  ), false);
});
