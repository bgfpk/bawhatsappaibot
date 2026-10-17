import test from "node:test";
import assert from "node:assert/strict";

import { buildCustomerOrderSummaryMessage } from "./order-summary-message-service.ts";

test("confirmed order sends full summary and skips unknown fields safely", () => {
  const message = buildCustomerOrderSummaryMessage({
    customerName: "Emma",
    customerPhone: "+44 7700 900123",
    productName: "Starter Plan",
    variation: "Annual",
    quantity: 2,
    priceText: "GBP 199",
    cityName: "London",
    deliveryAddress: "22 King Street",
    paymentMethod: "Bank transfer",
  }, { order_id: "ORD123" }, "english");

  assert.equal(message.includes("Order confirmed."), true);
  assert.equal(message.includes("*Order ID:* ORD123"), true);
  assert.equal(message.includes("*Name:* Emma"), true);
  assert.equal(message.includes("*Phone:* +44 7700 900123"), true);
  assert.equal(message.includes("*Product:* Starter Plan"), true);
  assert.equal(message.includes("*Option:* Annual"), true);
  assert.equal(message.includes("*Quantity:* 2"), true);
  assert.equal(message.includes("*Total:* GBP 199"), true);
  assert.equal(message.includes("*Location:* London"), true);
  assert.equal(message.includes("*Address:* 22 King Street"), true);
  assert.equal(message.includes("*Payment:* Bank transfer"), true);
  assert.equal(/undefined|null/i.test(message), false);
});

test("order summary does not duplicate name or use domain text as customer name", () => {
  const message = buildCustomerOrderSummaryMessage({
    customerName: "arfaqali com",
    customerPhone: "10909373441",
    productName: "Large Bike Cover With Lock Option",
    variation: "Navy Blue",
    quantity: 1,
    totalPrice: 1540,
    customFields: {
      Name: "arfaqali com",
      Landmark: "Eid Gah Road",
    },
  }, { order_id: "ORD999" }, "english");

  assert.equal(message.includes("*Name:* arfaqali com"), false);
  assert.equal((message.match(/\*Name:\*/g) || []).length, 0);
  assert.equal(message.includes("*Landmark:* Eid Gah Road"), true);
});
