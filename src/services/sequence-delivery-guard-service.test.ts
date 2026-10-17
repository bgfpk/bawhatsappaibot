import test from "node:test";
import assert from "node:assert/strict";

import { getSequenceStatusBlockReason } from "./sequence-delivery-guard-service.ts";

test("sequence guard does not block valid triggered sequences for confirmed orders", () => {
  assert.equal(getSequenceStatusBlockReason({ orderStatus: "confirmed order" }), "");
  assert.equal(getSequenceStatusBlockReason({ orderStatus: "booked" }), "");
});

test("sequence guard still blocks terminal delivery/problem statuses", () => {
  assert.match(getSequenceStatusBlockReason({ orderStatus: "delivered" }), /delivered/);
  assert.match(getSequenceStatusBlockReason({ latestTrackingStatus: "returned to sender" }), /returned/);
});
