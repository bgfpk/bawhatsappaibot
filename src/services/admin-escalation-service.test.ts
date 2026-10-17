import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAdminAttentionAlertMessage, detectAdminEscalation } from "./admin-escalation-service.ts";

function message(text: string, fromMe = false) {
  return { key: { fromMe }, message: { conversation: text } };
}

const scopeGuardSource = readFileSync(new URL("./business-training-scope-guard-service.ts", import.meta.url), "utf8");

test("human/admin request triggers escalation immediately on the first message", () => {
  const detection = detectAdminEscalation({
    latestUserText: "I need to talk to a human about this.",
    historyArray: [message("Hello"), message("I need to talk to a human about this.")],
  });

  assert.equal(detection.shouldEscalate, true);
  assert.equal(detection.reasonCategory, "human_requested");
});

test("normal greetings and service questions do not trigger admin escalation", () => {
  const history = [
    message("Hello"),
    message("Hello, how can I help?", true),
    message("hello"),
  ];

  const samples = [
    "Aslamu alicum",
    "Please confirm your tomorrow availability I want to discuss about auto reply, AI replies to our visitors contact via WhatsApp or website",
    "What are your services?",
    "I want to get the list of doctors at your hospital",
  ];

  for (const latestUserText of samples) {
    const detection = detectAdminEscalation({
      latestUserText,
      replyText: "Sure, here are the details.",
      historyArray: history,
    });

    assert.equal(detection.shouldEscalate, false, latestUserText);
    assert.notEqual(detection.reasonCategory, "repeated_unclear_question", latestUserText);
  }
});

test("forced admin alert reasons are normalized to the allowed set only", () => {
  const brokenReply = detectAdminEscalation({
    latestUserText: "ok",
    forcedReasonCategory: "broken_customer_reply",
  });
  const appointmentRisk = detectAdminEscalation({
    latestUserText: "ok",
    forcedReasonCategory: "appointment_or_order_confirmation_risk",
  });
  const repeated = detectAdminEscalation({
    latestUserText: "ok",
    forcedReasonCategory: "repeated_unclear_question",
  });

  assert.equal(brokenReply.shouldEscalate, true);
  assert.equal(brokenReply.reasonCategory, "broken_customer_reply_unrepairable");
  assert.equal(appointmentRisk.shouldEscalate, true);
  assert.equal(appointmentRisk.reasonCategory, "high_risk_unverified_question");
  assert.equal(repeated.shouldEscalate, false);
});

test("admin attention alert uses the cleaned reply layout", () => {
  const alert = buildAdminAttentionAlertMessage({
    sender: "contact-4e899668752d@example.invalid",
    senderName: "Salman",
    latestUserText: "I asked for refund three times, why are you sending product details?",
    replyText: "",
    reasons: ["broken_customer_reply_unrepairable"],
    reasonCategory: "broken_customer_reply_unrepairable",
    topic: "the latest answer",
    profile: {
      customerName: "Salman",
      orderStatus: "refund requested",
    },
    customerReplyText: "reply: Wa Alaikum Assalam. How can I help you today?",
  });

  assert.match(alert, /Admin Help Needed/);
  assert.match(alert, /Customer: Salman/);
  assert.match(alert, /Phone: \+12025550101/);
  assert.match(alert, /Issue:/);
  assert.match(alert, /Bot reply could not be safely repaired for the customer/);
  assert.match(alert, /Suggested action:/);
  assert.match(alert, /Please send the clean customer-facing answer directly\./);
  assert.doesNotMatch(alert, /Latest:/);
  assert.doesNotMatch(alert, /Reason:/);
  assert.doesNotMatch(alert, /Reply:/);
  assert.doesNotMatch(alert, /^reply:/m);
  assert.doesNotMatch(alert, /I asked for refund three times, why are you sending product details\?/);
  assert.ok(alert.length <= 500);
});

test("admin attention alert omits raw ID-like phone values when no clean phone is available", () => {
  const fromLid = buildAdminAttentionAlertMessage({
    sender: "12345@lid",
    senderName: "Omer",
    latestUserText: "Can I talk to a human?",
    reasons: ["human_requested"],
    reasonCategory: "human_requested",
    profile: {},
  });
  const fromInternalId = buildAdminAttentionAlertMessage({
    sender: "10268853214222",
    senderName: "Omer",
    latestUserText: "Can I talk to a human?",
    reasons: ["human_requested"],
    reasonCategory: "human_requested",
    profile: {},
  });

  assert.match(fromLid, /Customer: Omer/);
  assert.doesNotMatch(fromLid, /Phone:/);
  assert.doesNotMatch(fromLid, /12345@lid|@lid/);
  assert.doesNotMatch(fromInternalId, /Phone:/);
  assert.doesNotMatch(fromInternalId, /93845303910531/);
});

test("universal scope guard source does not hardcode Ammar or Sehat Card business rules", () => {
  assert.doesNotMatch(scopeGuardSource, /\bAmmar\b/i);
  assert.doesNotMatch(scopeGuardSource, /\bSehat Card\b/i);
});
