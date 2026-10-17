import assert from "node:assert/strict";
import {
  getCustomerLastInteractionTimestamp,
  getCustomerSummaryDisplayState,
  sortCustomersByLastInteraction,
} from "../src/services/customer-display-state-service.ts";

const customers = [
  {
    customer_id: "note-only-profile-update",
    $updatedAt: "2026-06-14T12:00:00.000Z",
    profile: { customerInstructions: "profile edit only" },
  },
  {
    customer_id: "older-real-message",
    $updatedAt: "2026-06-14T13:00:00.000Z",
    last_message_at: 100,
    profile: { lastMessage: "hello" },
  },
  {
    customer_id: "newer-real-message",
    $updatedAt: "2026-06-14T09:00:00.000Z",
    profile: { lastCustomerMessageAt: 200, lastMessage: "latest" },
  },
];

const sorted = sortCustomersByLastInteraction(customers);
assert.equal(sorted[0].customer_id, "newer-real-message");
assert.equal(sorted[1].customer_id, "older-real-message");
assert.equal(sorted[2].customer_id, "note-only-profile-update");
assert.equal(getCustomerLastInteractionTimestamp(customers[1]), 100);

assert.deepEqual(getCustomerSummaryDisplayState({
  last_message_at: 100,
  profile: { lastMessage: "hello" },
}), {
  summary: "Summary will update after the next meaningful message.",
  pending: true,
  canRefresh: true,
});

assert.deepEqual(getCustomerSummaryDisplayState({
  profile: { chatSummary: "Known customer prefers email follow-up." },
}), {
  summary: "Known customer prefers email follow-up.",
  pending: false,
  canRefresh: false,
});

console.log("customer-display-state-tests passed");
