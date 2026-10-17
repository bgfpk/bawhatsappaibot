import test from "node:test";
import assert from "node:assert/strict";

import { hasStaleCustomerSummaryConflict } from "./customer-summary-service.ts";

test("summary conflict detection replaces stale restaurant context when current chat is school custom plan", () => {
  const oldSummary = [
    "Conversation Summary:",
    "- Current customer need: Restaurant testing phase",
    "- Current stage: testing restaurant menu automation",
  ].join("\n");
  const history = [
    { role: "user", text: "I need custom plan" },
    { role: "user", text: "I want to send messages to parents of students in our school for attendance leaves and homework." },
  ];

  assert.equal(hasStaleCustomerSummaryConflict(oldSummary, history), true);
});
