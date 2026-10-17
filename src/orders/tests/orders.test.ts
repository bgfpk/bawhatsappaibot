import test from "node:test";
import assert from "node:assert/strict";
import { filterOrders, normalizeOrderRecord } from "../order-model";

test("normalizeOrderRecord: parses order record correctly", () => {
  const item = normalizeOrderRecord({
    $id: "ord_101",
    customer_name: "Farhan Siddiqui",
    customer_phone: "15914013519",
    total: 3500,
    status: "Confirmed",
  });

  assert.equal(item.id, "ord_101");
  assert.equal(item.customerName, "Farhan Siddiqui");
  assert.equal(item.customerPhone, "15914013519");
  assert.equal(item.totalAmount, 3500);
  assert.equal(item.status, "Confirmed");
});

test("filterOrders: filters by query and status", () => {
  const list = [
    normalizeOrderRecord({ $id: "ord_1", customer_name: "Usman Khan", status: "Pending" }),
    normalizeOrderRecord({ $id: "ord_2", customer_name: "Bilal Ahmed", status: "Delivered" }),
  ];

  const searched = filterOrders(list, "usman", "all");
  assert.equal(searched.length, 1);
  assert.equal(searched[0].customerName, "Usman Khan");

  const pending = filterOrders(list, "", "pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].customerName, "Usman Khan");
});
