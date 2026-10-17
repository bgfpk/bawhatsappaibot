import test from "node:test";
import assert from "node:assert/strict";

import { detectLatestListRequest, evaluateLatestQuestionSafety } from "./business-training-scope-guard-service.ts";

test("latest list request detector catches universal list intents", () => {
  const examples = [
    "I want to get the list of doctors at your hospital",
    "Send your services list",
    "Share the product catalog",
    "What packages do you have?",
    "Please send the price list",
    "Available options?",
    "What are your branch timings?",
  ];

  for (const example of examples) {
    assert.equal(detectLatestListRequest(example), true, example);
  }
});

test("latest list request mismatch suppresses stale appointment flow without escalating", () => {
  const result = evaluateLatestQuestionSafety({
    latestUserText: "I want to get the list of doctors at your hospital",
    replyText: "Aap ne stomach infection ke liye appointment kaha tha. Age aur gender bata dein.",
    recentBotReplyText: "Aap ne stomach infection ke liye appointment kaha tha. Age aur gender bata dein.",
    verifiedContextText: "Doctors list is available in business data.",
    historyTexts: ["Need appointment for stomach infection"],
  });

  assert.equal(result.latestListRequest, true);
  assert.equal(result.latestListReplyMismatch, true);
  assert.equal(result.oldContextSuppressed, true);
  assert.equal(result.shouldEscalate, false);
});

test("list request mismatch catches field collection before the list", () => {
  const result = evaluateLatestQuestionSafety({
    latestUserText: "Please share your services list",
    replyText: "Please share your name and phone number first.",
    verifiedContextText: "Services and pricing are configured.",
  });

  assert.equal(result.latestListRequest, true);
  assert.equal(result.latestListReplyMismatch, true);
});

test("supported services answer is not marked as broken fallback behavior", () => {
  const result = evaluateLatestQuestionSafety({
    latestUserText: "What are your services?",
    replyText: "We offer skin consultation, hair treatment, and laser guidance. Which service would you like to know more about?",
    verifiedContextText: "Services: skin consultation, hair treatment, laser guidance.",
  });

  assert.equal(result.brokenReply, false);
  assert.equal(result.latestListReplyMismatch, false);
});
