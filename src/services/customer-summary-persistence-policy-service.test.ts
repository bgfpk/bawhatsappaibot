import test from "node:test";
import assert from "node:assert/strict";

import { choosePersistedCustomerSummary } from "./customer-summary-persistence-policy-service.ts";

test("existing good AI summary is kept when temporary fallback is weaker", () => {
  const result = choosePersistedCustomerSummary({
    existingSummary: [
      "Current:",
      "- Name: Ahad Firdosi",
      "- Interest: BlackArrow Starter plan, order limit, and setup",
      "",
      "Timeline:",
      "- Customer asked about the Starter plan order limit.",
    ].join("\n"),
    existingSource: "ai",
    candidateSummary: [
      "Current:",
      "- Name: Ahad Firdosi - Phone: 923066935544 - Status: human review",
      "",
      "Pending / Next step:",
      "- Ask customer what they need.",
    ].join("\n"),
    candidateSource: "software_fallback",
    fallbackReason: "ai_summary_unavailable",
  });

  assert.equal(result.preservedExisting, true);
  assert.equal(result.source, "ai");
  assert.match(result.summary, /Starter plan, order limit, and setup/i);
  assert.doesNotMatch(result.summary, /Ask customer what they need/i);
});

test("existing useful software summary is kept when a later fallback is weaker", () => {
  const result = choosePersistedCustomerSummary({
    existingSummary: [
      "Current:",
      "- Name: Ahad Firdosi",
      "- Phone: 923066935544",
      "- Interest: BlackArrow Starter plan, order limit, and setup",
      "- Status: interested in trial/setup guidance",
      "",
      "Timeline:",
      "- Customer asked about the Starter plan order limit.",
      "- AI explained Starter includes 300 orders/month and costs $9/month or $65/year.",
      "- Customer asked how to set up BlackArrow.",
    ].join("\n"),
    existingSource: "software_fallback",
    candidateSummary: [
      "Current:",
      "- Name: Ahad Firdosi",
      "",
      "Pending / Next step:",
      "- Ask customer what they need.",
    ].join("\n"),
    candidateSource: "software_fallback",
    fallbackReason: "ai_summary_unavailable",
  });

  assert.equal(result.preservedExisting, true);
  assert.match(result.summary, /Starter plan, order limit, and setup/i);
  assert.doesNotMatch(result.summary, /Ask customer what they need/i);
});
