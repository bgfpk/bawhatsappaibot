import test from "node:test";
import assert from "node:assert/strict";

import {
  isSequenceItemDelivered,
  normalizeSequenceItemResult,
  summarizeSequenceItemResults,
} from "./sequence-delivery-result-service.ts";

test("sequence delivery result requires WhatsApp send evidence", () => {
  assert.equal(isSequenceItemDelivered({ status: "sent", messageId: "m1" }), true);
  assert.equal(isSequenceItemDelivered({ status: "sent", receiptId: "r1" }), true);
  assert.equal(isSequenceItemDelivered({ status: "sent" }), false);
  assert.equal(isSequenceItemDelivered({ status: "duplicate", messageId: "m1" }), true);
  assert.equal(isSequenceItemDelivered({ status: "skipped", reason: "insufficient_wallet" }), false);
  assert.equal(isSequenceItemDelivered({ status: "invalid_media" }), false);
});

test("sequence summary requires every item to be sent", () => {
  const summary = summarizeSequenceItemResults([
    { status: "sent", messageId: "m1" },
    { status: "skipped", reason: "insufficient_wallet" },
    { status: "failed", reason: "relay_error" },
  ]);

  assert.equal(summary.complete, false);
  assert.equal(summary.sent, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 1);
  assert.match(summary.reason, /2:skipped:insufficient_wallet/);
});

test("sequence result normalizes missing relay output to failed", () => {
  assert.deepEqual(normalizeSequenceItemResult(null), {
    status: "failed",
    reason: "missing_relay_result",
  });
});
