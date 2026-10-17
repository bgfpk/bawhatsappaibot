import assert from "node:assert/strict";
import {
  getMissingLeadFields,
  isOrderEditable,
  normalizeBusinessFlow,
  normalizeRecordType,
  shouldRequireCustomField,
  withRecordMetadata,
} from "../src/services/record-flow-service.ts";

const requiredField = { name: "Preferred service date", instructions: "Ask customer before saving the lead" };
const optionalField = { name: "Internal note", instructions: "Optional, manual later" };

assert.equal(normalizeBusinessFlow("ecommerce"), "product");
assert.equal(normalizeBusinessFlow("products"), "product");
assert.equal(normalizeBusinessFlow("product"), "product");
assert.equal(normalizeBusinessFlow("service"), "service");
assert.equal(normalizeBusinessFlow("services"), "service");

assert.equal(normalizeRecordType("", "service"), "lead");
assert.equal(normalizeRecordType("", "product"), "order");
assert.equal(shouldRequireCustomField(requiredField), true);
assert.equal(shouldRequireCustomField(optionalField), false);

assert.deepEqual(
  getMissingLeadFields({ customFields: {} }, [requiredField, optionalField]),
  ["Preferred service date"],
);
assert.deepEqual(
  getMissingLeadFields({ customFields: { "Preferred service date": "Monday" } }, [requiredField, optionalField]),
  [],
);

const incompleteLead = withRecordMetadata({
  recordData: { customFields: {}, customerPhone: "123" },
  businessFlow: "service",
  recordType: "lead",
  missingFields: ["Preferred service date"],
});
assert.equal(incompleteLead.recordType, "lead");
assert.equal(incompleteLead.recordStatus, "incomplete");
assert.equal(incompleteLead.businessFlow, "service");

const completeOrder = withRecordMetadata({
  recordData: { transactionStatus: "Confirmed order", customerPhone: "123" },
  businessFlow: "product",
  recordType: "order",
  missingFields: [],
  recordStatus: "complete",
});
assert.equal(completeOrder.recordType, "order");
assert.equal(completeOrder.recordStatus, "complete");

assert.equal(isOrderEditable({ recordType: "lead", createdAt: 1 }, Math.floor(Date.now() / 1000)), true);
assert.equal(isOrderEditable({ trackingNumber: "TRACKED", createdAt: Math.floor(Date.now() / 1000) }), false);
assert.equal(isOrderEditable({ transactionStatus: "Dispatched", createdAt: Math.floor(Date.now() / 1000) }), false);
assert.equal(isOrderEditable({ createdAt: Math.floor(Date.now() / 1000) - 25 * 60 * 60 }, Math.floor(Date.now() / 1000)), false);

console.log("record-flow tests passed");

