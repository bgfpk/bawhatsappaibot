import test from "node:test";
import assert from "node:assert/strict";

import { extractConfiguredCustomFieldState } from "./custom-field-state-service.ts";

test("AI extracts all custom fields from one natural customer message", () => {
  const result = extractConfiguredCustomFieldState({
    configuredFields: [
      { name: "Full Name", instructions: "Ask customer full name." },
      { name: "Business Details", instructions: "Ask customer business details." },
      { name: "Email", instructions: "Ask customer email." },
      { name: "Budget", instructions: "Ask customer budget." },
    ],
    history: [
      {
        role: "user",
        text: "My name is Sarah Connor. I run a bridal boutique. Email contact-1b0df3084513@example.invalid and my budget is around USD 500.",
      },
    ],
  });

  assert.deepEqual(result.values, {
    "Full Name": "Sarah Connor",
    "Business Details": "a bridal boutique",
    "Email": "contact-1b0df3084513@example.invalid",
    "Budget": "USD 500",
  });
  assert.deepEqual(result.missing, []);
});

test("manual owner-provided custom field data is respected", () => {
  const result = extractConfiguredCustomFieldState({
    configuredFields: [
      { name: "Service Needed", instructions: "Ask customer service needed." },
      { name: "Preferred Date", instructions: "Ask customer preferred date." },
    ],
    history: [
      { role: "model", text: "Service Needed: SEO Audit" },
      { role: "model", text: "[Manual media caption]: Preferred Date: Monday morning" },
    ],
  });

  assert.equal(result.values["Service Needed"], "SEO Audit");
  assert.equal(result.values["Preferred Date"], "Monday morning");
  assert.deepEqual(result.missing, []);
});

test("appointment custom fields are extracted from natural service messages", () => {
  const result = extractConfiguredCustomFieldState({
    configuredFields: [
      { name: "Appointment Date" },
      { name: "Appointment Time" },
      { name: "Preferred Doctor" },
      { name: "Location" },
      { name: "Students Count" },
    ],
    history: [
      { role: "user", text: "Dr Muhammad Ahmad Shoukat ke sath 23 June ko 2 sy 3 bajy k darmyan appointment. Location Lahore. Students 250" },
    ],
  });

  assert.equal(result.values["Appointment Date"], "23 June");
  assert.match(result.values["Appointment Time"], /2 sy 3 bajy/i);
  assert.equal(result.values["Preferred Doctor"], "Dr Muhammad Ahmad Shoukat");
  assert.equal(result.values["Location"], "Lahore");
  assert.equal(result.values["Students Count"], "250");
  assert.deepEqual(result.missing, []);
});
