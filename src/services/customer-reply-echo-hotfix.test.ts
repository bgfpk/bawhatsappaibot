import test from "node:test";
import assert from "node:assert/strict";

import {
  extractKnownCustomerFacts,
  getEchoSimilarityScore,
  guardCustomerReply,
  isMostlyEchoOfLatestCustomerMessage,
} from "./customer-reply-quality-guard-service.ts";

const facts = extractKnownCustomerFacts({
  businessType: "services",
  customerJid: "contact-e4ed32210a80@example.invalid",
  profile: { customerPhone: "195545134641", latestProductName: "BlackArrow Starter Plan" },
});

test("echo guard blocks true echo of latest customer message", () => {
  const latest = "mujhe starter plan ki details chahiye";
  const result = guardCustomerReply({ replyText: latest, latestUserText: latest, facts, businessType: "services" });

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "echo_latest_customer_message");
  assert.equal(isMostlyEchoOfLatestCustomerMessage(latest, latest), true);
  assert.equal(getEchoSimilarityScore(latest, latest), 1);
});

test("echo guard allows useful answer that includes a small customer phrase", () => {
  const result = guardCustomerReply({
    replyText: "Starter plan ki details yeh hain: WhatsApp AI replies, customer support automation, follow-ups, and setup guidance included hain. Aap BlackArrow replies, orders, ya follow-ups ke liye use karna chahte hain?",
    latestUserText: "mujhe starter plan ki details chahiye",
    facts,
    businessType: "services",
  });

  assert.equal(result.blocked, false);
  assert.match(result.replyText, /follow-ups/i);
});

test("echo repair instruction asks for a fresh direct answer", () => {
  const result = guardCustomerReply({
    replyText: "price?",
    latestUserText: "price?",
    facts,
    businessType: "services",
  });

  assert.equal(result.blocked, true);
  assert.doesNotMatch(result.replyText, /^price\??$/i);
});
