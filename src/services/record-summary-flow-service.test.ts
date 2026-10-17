import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecordSummaryConfirmedPatch,
  buildRecordSummaryFingerprint,
  buildRecordSummarySentPatch,
  getRecordSummaryDecision,
  isCustomerConfirmationText,
} from "./record-summary-flow-service.ts";

const completeLead = {
  recordType: "lead",
  recordStatus: "complete",
  customerName: "Ayesha",
  customerPhone: "195545134641",
  serviceName: "Dental appointment",
  customFields: { Doctor: "Dr Ali", Time: "Monday 5pm" },
};

test("complete fields trigger summary once", () => {
  const decision = getRecordSummaryDecision({ recordData: completeLead });
  assert.equal(decision.shouldSendSummary, true);

  const patch = buildRecordSummarySentPatch({ recordData: completeLead, summaryText: "Lead summary", messageId: "m1" });
  const second = getRecordSummaryDecision({ profile: patch, recordData: completeLead });
  assert.equal(second.shouldSendSummary, false);
  assert.equal(patch.leadOrderAwaitingCustomerConfirmation, true);
  assert.equal(patch.doNotRestartQuestions, true);
});

test("customer confirmation after summary marks confirmed without restarting", () => {
  const sentPatch = buildRecordSummarySentPatch({ recordData: completeLead, summaryText: "Lead summary" });
  const decision = getRecordSummaryDecision({ profile: sentPatch, recordData: completeLead, latestCustomerText: "yes correct" });
  assert.equal(decision.shouldMarkConfirmed, true);

  const confirmed = buildRecordSummaryConfirmedPatch(sentPatch);
  assert.equal(confirmed.leadOrderConfirmed, true);
  assert.equal(confirmed.leadOrderFlowState, "confirmed");
  assert.equal(confirmed.doNotRestartQuestions, true);
});

test("changed required detail after summary asks for updated summary resend", () => {
  const sentPatch = buildRecordSummarySentPatch({ recordData: completeLead, summaryText: "Lead summary" });
  const changed = { ...completeLead, customFields: { ...completeLead.customFields, Time: "Tuesday 6pm" } };
  const decision = getRecordSummaryDecision({ profile: sentPatch, recordData: changed });

  assert.equal(decision.changedAfterSummary, true);
  assert.equal(decision.shouldSendSummary, true);
  assert.notEqual(buildRecordSummaryFingerprint(completeLead), buildRecordSummaryFingerprint(changed));
});

test("optional custom field changes do not matter when not present in record", () => {
  const fingerprint = buildRecordSummaryFingerprint(completeLead, [
    { name: "Optional Notes", instructions: "Optional, can be filled later." },
  ]);
  assert.equal(fingerprint, buildRecordSummaryFingerprint(completeLead));
});

test("confirmation detector catches short customer confirmations", () => {
  assert.equal(isCustomerConfirmationText("done"), true);
  assert.equal(isCustomerConfirmationText("please change time"), false);
});
