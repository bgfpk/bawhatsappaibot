import test from "node:test";
import assert from "node:assert/strict";

import {
  isPollutedCustomerSummaryInput,
  runCustomerSummaryQualityGate,
  shouldAdvanceSummaryRefreshMarker,
} from "./customer-summary-quality-gate-service.ts";

test("quality gate accepts clean Starter setup summary after cleanup", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Interest: BlackArrow Starter plan, order limit, and setup",
    "- Status: interested in trial/setup guidance",
    "- Language: English",
    "",
    "Timeline:",
    "- Customer asked about the Starter plan order limit.",
    "- AI explained Starter includes 300 orders/month and costs $9/month or $65/year.",
    "- Customer asked how to set up BlackArrow.",
    "",
    "Pending / Next step:",
    "- Help customer start setup or answer setup questions.",
  ].join("\n"));

  assert.equal(result.accepted, true);
  assert.match(result.summary, /Starter plan, order limit, and setup/);
  assert.doesNotMatch(result.summary, /923066935544/);
});

test("quality gate allows same field label in different valid sections", () => {
  const result = runCustomerSummaryQualityGate([
    "Conversation Summary:",
    "- Current customer need: Custom plan for school communication",
    "- Current stage: warm lead",
    "- Important missing info: number of parents/students",
    "- Next best action: ask monthly message volume.",
    "",
    "Lead/Business details:",
    "- Business/use case: School communication",
    "- Plan interest: Custom plan",
    "",
    "Private Notes:",
    "- Business/use case: Warm school lead for parent updates.",
  ].join("\n"));

  assert.equal(result.accepted, true);
  assert.doesNotMatch(result.reasons.join(","), /duplicate_field:business\/use case/);
});

test("quality gate splits inline chains and removes duplicates before save", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Name: Ahad Firdosi Phone: 923066935544 Status: human review Language: english Name: Ahad Firdosi",
    "",
    "Pending / Next step:",
    "- Help customer start setup or answer setup questions.",
    "- Help customer start setup or answer setup questions.",
  ].join("\n"));

  assert.equal(result.accepted, true);
  assert.match(result.summary, /- Status: human review/);
  assert.equal((result.summary.match(/Help customer start setup/g) || []).length, 1);
});

test("quality gate rejects generic fallback and draft pollution when nothing useful remains", () => {
  const result = runCustomerSummaryQualityGate([
    "Timeline:",
    "- Customer asked for media/check details.",
    "- AI replied with sales/support guidance.",
    "Notes:",
    "- Missing: Service",
    "- Ask only for Se",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /empty_summary|no_specific_customer_facts/);
});

test("quality gate rejects generic phrases anywhere in raw summary text", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Timeline:",
    "- Customer asked about setup. - AI replied with sales/support guidance.",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /generic_fallback_text/);
});

test("quality gate rejects mid-word timeline endings", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Timeline:",
    "- Customer inquired abou",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /mid_word_ending|cutoff_fragment/);
});

test("quality gate rejects repeated raw Customer said transcript chains", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Timeline:",
    "- Customer said: its showing error Customer said: Media Customer said: done",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /customer_said_chain|raw_transcript_line/);
});

test("quality gate rejects too many vague Missing fields", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Pending / Next step:",
    "- Missing: details",
    "- Missing: info",
    "- Missing: field",
    "- Missing: unknown",
    "- Missing: service",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /too_many_missing_fields|vague_missing_field/);
});

test("quality gate rejects lowercase mixed paragraph status", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- status: human review Customer is asking about setup and wants pricing",
    "",
    "Pending / Next step:",
    "- Help customer start setup or answer setup questions.",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /mixed_status_paragraph/);
});

test("quality gate rejects Timeline and Pending embedded bullet chains", () => {
  const result = runCustomerSummaryQualityGate([
    "Current:",
    "- Name: Ahad Firdosi",
    "",
    "Timeline:",
    "- Customer asked about setup. - AI explained QR connection.",
    "",
    "Pending / Next step:",
    "- Help customer start setup or answer setup questions. - Send tutorial link.",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /embedded_bullet_chain:timeline/);
  assert.match(result.reasons.join(","), /embedded_bullet_chain:pending \/ next step/);
});

test("polluted old summary input is detected before merge reuse", () => {
  assert.equal(isPollutedCustomerSummaryInput("Current:\n- Name: Ahad Phone: 923 Status: human review"), true);
  assert.equal(isPollutedCustomerSummaryInput("Timeline:\n- Customer asked for media/check details. - AI replied"), true);
  assert.equal(isPollutedCustomerSummaryInput("Pending / Next step:\n- Help customer start setup or answer se"), true);
  assert.equal(isPollutedCustomerSummaryInput("Current:\n- Interest: Growth plan\n- Status: interested"), false);
});

test("quality gate rejects voice-placeholder-only summary", () => {
  const result = runCustomerSummaryQualityGate([
    "Conversation Timeline:",
    "- Voice note received, transcript unavailable",
  ].join("\n"));

  assert.equal(result.accepted, false);
  assert.match(result.reasons.join(","), /voice_transcript_missing|empty_summary|no_specific_customer_facts/);
});

test("chatSummaryLastMessageAt marker advances only after accepted newly saved summary", () => {
  assert.equal(shouldAdvanceSummaryRefreshMarker({ gateAccepted: true, preservedExisting: false }), true);
  assert.equal(shouldAdvanceSummaryRefreshMarker({ gateAccepted: false, preservedExisting: false }), false);
  assert.equal(shouldAdvanceSummaryRefreshMarker({ gateAccepted: true, preservedExisting: true }), false);
});
