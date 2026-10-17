import test from "node:test";
import assert from "node:assert/strict";

import { checkFollowupStaleByLastMessage, normalizeFollowupTimestamp } from "./followup-stale-guard-service.ts";

test("followup skips if customer replied after scheduled snapshot", () => {
  const result = checkFollowupStaleByLastMessage({
    latestLastMessageAt: 1710000300,
    triggerLastMessageAt: 1710000200,
  });
  assert.equal(result.stale, true);
  assert.equal(result.reason, "customer_replied_after_trigger");
});

test("followup stale guard allows unchanged customer snapshot", () => {
  const result = checkFollowupStaleByLastMessage({
    latestLastMessageAt: 1710000200,
    triggerLastMessageAt: 1710000200,
  });
  assert.equal(result.stale, false);
});

test("followup stale guard normalizes millisecond timestamps", () => {
  assert.equal(normalizeFollowupTimestamp(1710000200000), 1710000200);
});
