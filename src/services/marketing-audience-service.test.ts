import test from "node:test";
import assert from "node:assert/strict";

import { MARKETING_AUDIENCE_INCOMPLETE, hasIncompleteLeadOrOrder, isCustomerInMarketingAudience } from "./marketing-audience-service.ts";

test("incomplete audience includes incomplete orders and leads without requiring a completed order", () => {
  assert.equal(isCustomerInMarketingAudience({}, { recordType: "order", recordStatus: "incomplete" }, MARKETING_AUDIENCE_INCOMPLETE), true);
  assert.equal(isCustomerInMarketingAudience({}, { recordType: "lead", leadStatus: "incomplete" }, MARKETING_AUDIENCE_INCOMPLETE), true);
  assert.equal(isCustomerInMarketingAudience({}, { orderStatus: "awaiting confirmation" }, MARKETING_AUDIENCE_INCOMPLETE), true);
});

test("incomplete audience includes active metadata and missing required fields", () => {
  assert.equal(hasIncompleteLeadOrOrder({}, { recordMetadata: JSON.stringify({ type: "lead", status: "incomplete" }) }), true);
  assert.equal(hasIncompleteLeadOrOrder({}, { requiredCustomFields: ["city"], customFieldValues: {} }), true);
  assert.equal(hasIncompleteLeadOrOrder({}, { recordMetadata: JSON.stringify({ missingFields: ["address"] }) }), true);
});

test("incomplete audience normalizes pending detail statuses", () => {
  assert.equal(hasIncompleteLeadOrOrder({}, { orderStatus: "Order incomplete" }), true);
  assert.equal(hasIncompleteLeadOrOrder({}, { leadStatus: "pending confirmation" }), true);
  assert.equal(hasIncompleteLeadOrOrder({}, { recordStatus: "details_pending" }), true);
});

test("incomplete audience does not exclude only because recordStatus is incomplete", () => {
  assert.equal(isCustomerInMarketingAudience({ hasPlacedOrder: false }, { recordStatus: "incomplete" }, MARKETING_AUDIENCE_INCOMPLETE), true);
});
