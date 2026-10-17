import test from "node:test";
import assert from "node:assert/strict";

import { assertCompleteCustomerFacingText, containsBadCustomerFacingListFormatting, containsBrokenCustomerFacingText, validateCompleteCustomerFacingText } from "./customer-facing-message-guard-service.ts";

test("sendAiTextMessage guard blocks incomplete AI output before WhatsApp send", () => {
  const result = validateCompleteCustomerFacingText("Thanks for sharing about Bari Engineering!\n\nHow");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "incomplete_output");
});

test("completion guard accepts complete short helpful output", () => {
  assert.equal(assertCompleteCustomerFacingText("Sure, I can help."), "Sure, I can help.");
});

test("broken internal or custom-field text is blocked before WhatsApp send", () => {
  const result = validateCompleteCustomerFacingText("Appointment /time is undefined and already saved.");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "internal_or_broken_text");
  assert.equal(containsBrokenCustomerFacingText("fee Rs already saved"), true);
  assert.equal(containsBrokenCustomerFacingText("Sure, I can help with that."), false);
});

test("customer-facing guard detects bad numbered list formatting for repair", () => {
  assert.equal(
    containsBadCustomerFacingListFormatting("Hospital ke tamam doctors ki list yeh rahi: 1. Dr\nAhmad Ammar Asif 2. Dr\nSara Khan 3. Dr\nUsman Ali"),
    true
  );
  assert.equal(
    containsBadCustomerFacingListFormatting("Here are the available options:\n\n1. *Starter package*\n   Setup support\n\n2. *Growth package*\n   Priority support"),
    false
  );
});

test("fixed team confirmation fallback text is blocked before WhatsApp send", () => {
  const result = validateCompleteCustomerFacingText("This needs confirmation from the team.");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "internal_or_broken_text");
});
