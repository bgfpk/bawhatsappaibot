import test from "node:test";
import assert from "node:assert/strict";
import { resolveCustomerReplyLanguage } from "./customer-language-preference-service.ts";

test("existing summary is preserved when language preference is saved", () => {
  const result = resolveCustomerReplyLanguage({
    profile: {
      chatSummary: "Customer asked about blue lawn suits.\nWaiting for size confirmation.",
    },
    preferredLanguage: "english",
    latestText: "Aap blue wala medium bhej dein",
  });

  assert.ok(result.patch.chatSummary.includes("Customer asked about blue lawn suits."));
  assert.ok(result.patch.chatSummary.includes("Waiting for size confirmation."));
  assert.ok(result.patch.chatSummary.includes("Language preference:"));
  assert.ok(result.patch.chatSummary.indexOf("Customer asked about blue lawn suits.") < result.patch.chatSummary.indexOf("Language preference:"));
  assert.equal(result.patch.customerLanguagePreference, result.language);
  assert.equal(result.patch.languagePreference, result.language);
});

test("empty summary saves language preference safely", () => {
  const result = resolveCustomerReplyLanguage({
    profile: {},
    preferredLanguage: "english",
    latestText: "Mujhe price bata dein",
  });

  assert.ok(result.patch.chatSummary.includes("Language preference:"));
  assert.equal(result.patch.customerLanguagePreference, result.language);
});

test("repeated language preference update avoids duplicate summary lines", () => {
  const result = resolveCustomerReplyLanguage({
    profile: {
      chatSummary: "Customer asked for delivery timing.\nLanguage preference: roman_urdu (saved from customer messages).",
      customerLanguagePreference: "roman_urdu",
      lastDetectedCustomerLanguage: "roman_urdu",
    },
    preferredLanguage: "english",
    latestText: "Mujhe kal delivery chahiye",
  });

  const effectiveSummary = result.patch.chatSummary || "Customer asked for delivery timing.\nLanguage preference: roman_urdu (saved from customer messages).";
  const matches = String(effectiveSummary || "")
    .split("\n")
    .filter((line) => /^language preference:/i.test(line.trim()));
  assert.equal(matches.length, 1);
  assert.ok(String(effectiveSummary).includes("Customer asked for delivery timing."));
});

test("customer asking for Urdu saves Urdu/Roman Urdu preference in summary", () => {
  const result = resolveCustomerReplyLanguage({
    profile: {
      customerLanguagePreference: "english",
      lastDetectedCustomerLanguage: "roman_urdu",
      customerLanguageMismatchCount: 1,
      chatSummary: "Current:\n- Customer asked about clinic appointment booking.",
    },
    preferredLanguage: "english",
    latestText: "Aap Urdu mein bata dein",
  });

  assert.equal(result.language, "roman_urdu");
  assert.equal(result.patch.customerLanguagePreference, "roman_urdu");
  assert.match(result.patch.chatSummary, /Language preference: roman_urdu/);
  assert.match(result.patch.chatSummary, /clinic appointment booking/);
});

test("explicit please talk urdu changes language immediately", () => {
  const result = resolveCustomerReplyLanguage({
    profile: {
      customerLanguagePreference: "english",
      chatSummary: "Customer placed an order.",
    },
    preferredLanguage: "english",
    latestText: "Please talk urdu",
  });

  assert.equal(result.language, "roman_urdu");
  assert.equal(result.patch.customerLanguagePreference, "roman_urdu");
});

test("saved Roman Urdu preference is not reset by short English acknowledgement", () => {
  const result = resolveCustomerReplyLanguage({
    profile: {
      customerLanguagePreference: "roman_urdu",
      lastDetectedCustomerLanguage: "roman_urdu",
    },
    preferredLanguage: "english",
    latestText: "Ok",
  });

  assert.equal(result.language, "roman_urdu");
});
