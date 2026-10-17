import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMissingRequiredFieldQuestion,
  pickNextMissingRequiredField,
} from "./missing-field-question-service.ts";

test("missing field helper asks only the first required field", () => {
  assert.equal(pickNextMissingRequiredField(["City", "Quantity"]), "City");
  assert.equal(
    buildMissingRequiredFieldQuestion({ missingFields: ["City", "Quantity"], language: "english", recordType: "lead" }),
    "Please share your city so I can guide you properly.",
  );
});

test("missing field helper does not ask phone when no phone field is missing", () => {
  const question = buildMissingRequiredFieldQuestion({
    missingFields: ["Quantity"],
    language: "english",
    recordType: "order",
  });

  assert.equal(question, "How many pieces do you need?");
  assert.doesNotMatch(question, /phone/i);
});

test("missing field helper ignores instruction-like labels and phrases gender safely", () => {
  assert.equal(pickNextMissingRequiredField(["FINAL COMPLETION RULE", "Gender"]), "Gender");
  assert.equal(
    buildMissingRequiredFieldQuestion({ missingFields: ["Gender"], language: "english", recordType: "lead" }),
    "Please share the patient's gender.",
  );
});
