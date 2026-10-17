import test from "node:test";
import assert from "node:assert/strict";

import { getCustomerSummaryDisplayState } from "./customer-display-state-service.ts";

test("customers page can request refresh for stale existing summary", () => {
  const state = getCustomerSummaryDisplayState({
    $id: "cust_1",
    last_message_at: 200,
    profile: {
      chatSummary: "Current:\n- Product: Bike Cover",
      chatSummaryLastMessageAt: 100,
      chatSummaryUpdatedAt: 100,
    },
  });

  assert.equal(state.summary.includes("Bike Cover"), true);
  assert.equal(state.pending, true);
  assert.equal(state.canRefresh, true);
});

test("current existing summary does not auto-refresh", () => {
  const state = getCustomerSummaryDisplayState({
    $id: "cust_1",
    last_message_at: 100,
    profile: {
      chatSummary: "Current:\n- Product: Bike Cover",
      chatSummaryLastMessageAt: 100,
      chatSummaryUpdatedAt: 100,
    },
  });

  assert.equal(state.pending, false);
  assert.equal(state.canRefresh, false);
});
