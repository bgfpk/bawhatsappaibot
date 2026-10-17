import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiGeneratedOrderLeadSummary,
  buildStructuredOrderLeadSummary,
} from "./ai-order-lead-summary-service.ts";

test("AI-generated order summary uses structured fields only", async () => {
  const text = await buildAiGeneratedOrderLeadSummary({
    orderData: {
      recordStatus: "complete",
      customerName: "Muhammad Jamal",
      customerPhone: "11797336533",
      productName: "Standard Size Bike Cover With Lock Option",
      variation: "Grey",
      quantity: 1,
      totalPrice: 1340,
      cityName: "Lahore",
      deliveryAddress: "House 1, Street 2, Gulberg Area, Lahore, Near mosque",
      paymentMethod: "COD",
      orderReferenceNumber: "ORD123",
    },
    savedRef: { order_id: "ORD123" },
  }, {
    generateText: async () => "Status: Confirmed\nCustomer: Muhammad Jamal\nProduct: Standard Size Bike Cover With Lock Option\nColor: Grey\nTotal: 1340",
  });

  assert.match(text, /Status: Confirmed/);
  assert.match(text, /Muhammad Jamal/);
  assert.match(text, /Grey/);
  assert.doesNotMatch(text, /undefined|null/i);
});

test("pending order with missing address city payment stays pending", () => {
  const text = buildStructuredOrderLeadSummary({
    orderData: {
      recordStatus: "incomplete",
      customerName: "Muhammad Jamal",
      customerPhone: "11797336533",
      productName: "Bike Cover",
      variation: "Grey",
      quantity: 1,
      totalPrice: 1340,
      missingFields: ["Address", "City", "Payment Method"],
    },
  });

  assert.match(text, /Status: Awaiting details/);
  assert.match(text, /Missing:/);
  assert.match(text, /Address/);
  assert.match(text, /City/);
  assert.match(text, /Payment Method/);
  assert.match(text, /Ask customer only for missing details/);
});

test("confirmed order summary is clean when required fields are complete", () => {
  const text = buildStructuredOrderLeadSummary({
    orderData: {
      transactionStatus: "Confirmed order",
      customerName: "Sara Khan",
      customerPhone: "15811061380",
      productName: "Starter Plan",
      quantity: 1,
      totalPrice: 199,
      cityName: "London",
      deliveryAddress: "House 22, Street 5, King Area, London, Near station",
      paymentMethod: "Bank transfer",
      orderReferenceNumber: "ORD999",
    },
    savedRef: { order_id: "ORD999" },
  });

  assert.match(text, /Status: Confirmed/);
  assert.match(text, /Order ID: ORD999/);
  assert.match(text, /Customer: Sara Khan/);
  assert.doesNotMatch(text, /Missing:/);
  assert.doesNotMatch(text, /undefined|null/i);
});
