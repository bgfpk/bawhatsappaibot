import test from "node:test";
import assert from "node:assert/strict";

import { buildMissingOrderFieldsMessage, getMissingOrderFields } from "./order-required-fields-service.ts";

test("required fields with both customerName and name report only one name field", () => {
  const missing = getMissingOrderFields({
    customerPhone: "+1 202 555 0101",
    productName: "Starter Plan",
    deliveryAddress: "400 Market Street, Toronto",
    cityName: "Toronto",
    customFields: {},
  }, [
    { name: "Customer Name", instructions: "Ask customer name." },
    { name: "Name", instructions: "Ask customer full name." },
  ]);

  assert.deepEqual(missing, ["Customer Name"]);

  const message = buildMissingOrderFieldsMessage(missing, "english", [], {
    customerPhone: "+1 202 555 0101",
    productName: "Starter Plan",
    deliveryAddress: "400 Market Street, Toronto",
    cityName: "Toronto",
  });
  assert.equal(message, "");
});

test("missing-field helper does not generate customer-facing copy", () => {
  const message = buildMissingOrderFieldsMessage(
    ["Customer Name", "Name", "Customer Phone"],
    "english",
    [],
    { productName: "Headphones", deliveryAddress: "Main Street 12" },
  );

  assert.equal(message, "");
});

test("lead or order is not marked complete if required custom fields are missing", () => {
  const missing = getMissingOrderFields({
    customerName: "Sarah",
    customerPhone: "+1 202 555 0188",
    productName: "Growth Plan",
    deliveryAddress: "400 Market Street, Toronto",
    customFields: {
      "Business Details": "Retail boutique",
    },
  }, [
    { name: "Business Details", instructions: "Ask customer business details." },
    { name: "Preferred Date", instructions: "Ask customer preferred date." },
  ]);

  assert.deepEqual(missing, ["Preferred Date"]);
});

test("lead or order becomes complete when all required custom fields are collected", () => {
  const missing = getMissingOrderFields({
    customerName: "Sarah",
    customerPhone: "+1 202 555 0188",
    productName: "Growth Plan",
    deliveryAddress: "400 Market Street, Toronto",
    customFields: {
      "Business Details": "Retail boutique",
      "Preferred Date": "Friday",
    },
  }, [
    { name: "Business Details", instructions: "Ask customer business details." },
    { name: "Preferred Date", instructions: "Ask customer preferred date." },
  ]);

  assert.deepEqual(missing, []);
});

test("validated office address is not re-asked during final save", () => {
  const missing = getMissingOrderFields({
    customerName: "Sajjad",
    customerPhone: "+92 300 0000000",
    productName: "Bike Cover",
    quantity: 1,
    totalPrice: 1200,
    deliveryAddress: "Office 20-A Main Boulevard Road Township Lahore Military Accounts Society Lahore",
    cityName: "Lahore",
    notes: "Business type: office",
    addressValidationValid: true,
    addressValidationAccepted: true,
    customFields: {},
  }, []);

  assert.deepEqual(missing, []);
});

test("raw arbitrary field labels are not converted into customer-facing prompts", () => {
  const message = buildMissingOrderFieldsMessage(
    ["Business Details", "Preferred Date"],
    "english",
    [
      { name: "Business Details", instructions: "Ask customer business details." },
      { name: "Preferred Date", instructions: "Ask customer preferred date." },
    ],
    { customerName: "Sarah", customerPhone: "+1 202 555 0188" },
  );

  assert.equal(message, "");
});
