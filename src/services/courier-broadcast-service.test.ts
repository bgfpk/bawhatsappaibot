import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCourierBroadcastSummary,
  parseCourierTrackingIds,
  sanitizeCourierText,
} from "./courier-broadcast-service.ts";

test("Courier broadcast parser handles lines commas spaces and stable dedupe", () => {
  assert.deepEqual(
    parseCourierTrackingIds("29612990000137\n24612990000136, 28612990000135   24612990000136\n\n29612990000137"),
    ["13483533368630", "13183100404355", "15802545815309"],
  );
});

test("Courier broadcast summary separates fresh sends from duplicates", () => {
  const summary = buildCourierBroadcastSummary([
    { trackingId: "1", status: "sent_fresh", messageId: "m1" },
    { trackingId: "2", status: "duplicate_not_resent", messageId: "m2" },
    { trackingId: "3", status: "skipped", reason: "insufficient_wallet" },
    { trackingId: "4", status: "failed", reason: "No customer phone matched this tracking ID" },
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.freshSent, 1);
  assert.equal(summary.duplicate, 1);
  assert.equal(summary.sent, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.success, false);
  assert.match(summary.message, /Fresh sent: 1, Duplicates: 1/);
});

test("Courier error sanitizer redacts secret-shaped values", () => {
  const sanitized = sanitizeCourierText("PostEx failed token: abc123 api_key=secret-key api_password top-secret");
  assert.doesNotMatch(sanitized, /abc123|secret-key|top-secret/);
  assert.match(sanitized, /\[redacted\]/);
});
