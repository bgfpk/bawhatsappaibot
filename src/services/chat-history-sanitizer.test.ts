import test from "node:test";
import assert from "node:assert/strict";
import { extractCustomerAnswerFromQuotedMessage, extractQuotedReplyContext } from "./chat-history-sanitizer.ts";

test("customer quoting bot message plus short answer extracts only the new answer", () => {
  const text = `[Replying to: "Please confirm your city"]\nLahore`;
  assert.equal(extractCustomerAnswerFromQuotedMessage(text), "Lahore");
});

test("long quoted replies keep context", () => {
  const answer = "This is a longer message where the customer is explaining multiple details and the quote may still matter for context because it is not just a short field answer.";
  const text = `[Replying to: "Please confirm your city"]\n${answer}`;
  assert.equal(extractCustomerAnswerFromQuotedMessage(text), text);
});

test("quoted name question keeps compact field context while extracting answer", () => {
  const text = `[Replying to: "Order ke liye apna naam share kar dein"]\nHafiz Mohsin`;
  const context = extractQuotedReplyContext(text);

  assert.equal(extractCustomerAnswerFromQuotedMessage(text), "Hafiz Mohsin");
  assert.equal(context.quotedField, "name");
  assert.equal(context.customerAnswer, "Hafiz Mohsin");
});

test("short ok after quoted confirmation is recognized as confirmation", () => {
  const context = extractQuotedReplyContext(`[Replying to: "Should I confirm this order?"]\nGggg`);

  assert.equal(context.quotedField, "confirmation");
  assert.equal(context.isConfirmation, true);
});
