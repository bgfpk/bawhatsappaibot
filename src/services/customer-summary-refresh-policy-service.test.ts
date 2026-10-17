import test from "node:test";
import assert from "node:assert/strict";

import { classifyCustomerSummaryRefreshNeed } from "./customer-summary-refresh-policy-service.ts";

test("summary refresh policy skips trivial and duplicate customer messages", () => {
  assert.equal(classifyCustomerSummaryRefreshNeed({ newMessages: [{ role: "user", text: "ok" }] }).needsAiSummary, false);
  assert.equal(classifyCustomerSummaryRefreshNeed({ newMessages: [{ role: "user", text: "👍👍" }] }).reason, "emoji_only");
  assert.equal(classifyCustomerSummaryRefreshNeed({
    newMessages: [{ role: "user", text: "same address" }],
    existingSummary: "Current:\n- Address: Lahore",
  }).reason, "repeated_delivery_request");
  assert.equal(classifyCustomerSummaryRefreshNeed({
    newMessages: [{ role: "user", text: "15811061380" }],
    profile: { customerPhone: "15811061380" },
    existingSummary: "Current:\n- Phone: 03001234567",
  }).reason, "repeated_known_detail");
  assert.equal(classifyCustomerSummaryRefreshNeed({
    newMessages: [{ role: "user", text: "I need the Growth plan for my clinic." }],
    existingSummary: "Current:\n- Status: interested",
  }).needsAiSummary, true);
  assert.equal(classifyCustomerSummaryRefreshNeed({
    newMessages: [{ role: "user", text: "Voice note received, transcript unavailable" }],
  }).reason, "voice_transcript_missing");
  assert.equal(classifyCustomerSummaryRefreshNeed({
    newMessages: [{ role: "user", text: "Voice note: customer asked pricing for warehouse racks and Lahore delivery." }],
  }).reason, "meaningful_voice_note");
});
