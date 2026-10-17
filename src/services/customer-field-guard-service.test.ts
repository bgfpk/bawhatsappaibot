import test from "node:test";
import assert from "node:assert/strict";

import {
  filterMissingFieldsAgainstKnownValues,
  getFieldCollectionLockReason,
  isInstructionLikeFieldName,
  sanitizeConfiguredCustomerFields,
  shouldAllowFieldCollectionRestart,
} from "./customer-field-guard-service.ts";

test("instruction-like field names are filtered globally", () => {
  assert.equal(isInstructionLikeFieldName("FINAL COMPLETION RULE"), true);
  assert.equal(isInstructionLikeFieldName("IMPORTANT RULE"), true);
  assert.equal(isInstructionLikeFieldName("Patient Gender"), false);
  assert.deepEqual(sanitizeConfiguredCustomerFields([
    { name: "FINAL COMPLETION RULE" },
    { name: "Patient Gender" },
  ]), [
    { name: "Patient Gender" },
  ]);
});

test("known CRM values beat stale missing-field summaries", () => {
  const result = filterMissingFieldsAgainstKnownValues({
    missingFields: ["Gender", "City", "FINAL COMPLETION RULE"],
    latestOrder: {
      cityName: "Lahore",
      customFields: {
        Gender: "Male",
        "FINAL COMPLETION RULE": "Yes done please",
      },
    },
  });

  assert.deepEqual(result.filtered, []);
  assert.deepEqual(result.ignoredKnownValue, ["Gender", "City"]);
  assert.deepEqual(result.ignoredInstructionLike, ["FINAL COMPLETION RULE"]);
});

test("field collection locks after summary, payment request, and confirmation", () => {
  assert.equal(getFieldCollectionLockReason({
    profile: { leadOrderSummarySent: true, doNotRestartQuestions: true },
    latestOrder: {},
    state: {},
    history: [{ role: "model", text: "Your appointment details are:" }],
  }), "summary_sent");

  assert.equal(getFieldCollectionLockReason({
    profile: { leadOrderSummarySent: true, doNotRestartQuestions: true },
    latestOrder: { paymentMethod: "Bank transfer" },
    state: {},
    history: [{ role: "model", text: "Please share payment screenshot after bank transfer." }],
  }), "payment_requested");

  assert.equal(getFieldCollectionLockReason({
    profile: { leadOrderConfirmed: true },
    latestOrder: {},
    state: {},
    history: [],
  }), "confirmed");
});

test("field collection restart is allowed only for explicit edit-like requests", () => {
  assert.equal(shouldAllowFieldCollectionRestart("Please reschedule my appointment"), true);
  assert.equal(shouldAllowFieldCollectionRestart("Okay thanks"), false);
});
