import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isProbablyIncompleteCustomerReply,
  buildCompleteReplyRepairPrompt,
  formatWhatsappReply,
} from "./reply-style-service.ts";

test("1. valid short answers are not marked incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply("Yes, I am here."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Ji bilkul available hai."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Sure, we can help."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Order confirmed!"), false);
});

test("2. short questions ending in ? or Urdu question mark are not marked incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply("Yes, I'm here. How can I help?"), false);
  assert.equal(isProbablyIncompleteCustomerReply("How can I help?"), false);
  assert.equal(isProbablyIncompleteCustomerReply("What size do you need?"), false);
  assert.equal(isProbablyIncompleteCustomerReply("Can you please share your address?"), false);
  assert.equal(isProbablyIncompleteCustomerReply("آپ کا کیا نام ہے؟"), false);
});

test("3. formatted WhatsApp replies with bold, bullets, and numbered steps are not marked incomplete", () => {
  const reply = `Here are our packages:

- *Starter:* $29/mo
- *Pro:* $89/mo
- *Enterprise:* Custom pricing`;

  assert.equal(isProbablyIncompleteCustomerReply(reply), false);

  const steps = `Please follow these steps:

1. *Select Package:* Choose Pro or Starter
2. *Send Payment:* Share receipt screenshot
3. *Activation:* Account is activated in 5 mins`;

  assert.equal(isProbablyIncompleteCustomerReply(steps), false);
});

test("4. replies ending in URLs, prices, or numbers are not marked incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply("Check out our site at https://blackarrow-source.offline.invalid/pricing"), false);
  assert.equal(isProbablyIncompleteCustomerReply("Total price is $99"), false);
  assert.equal(isProbablyIncompleteCustomerReply("Your tracking ID is 987654321"), false);
});

test("5. genuine truncated outputs (trailing commas, ellipsis, dangling conjunctions) are detected as incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply("We have small, medium,"), true);
  assert.equal(isProbablyIncompleteCustomerReply("Please hold on while I check..."), true);
  assert.equal(isProbablyIncompleteCustomerReply("We offer high quality products and"), true);
  assert.equal(isProbablyIncompleteCustomerReply("Aap ka parcel deliver hoga lekin"), true);
  assert.equal(isProbablyIncompleteCustomerReply("Hum deliver kartay hain kyunke"), true);
});

test("6. dangling trailing question starters without punctuation are detected as incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply("Sure, how can I"), true);
  assert.equal(isProbablyIncompleteCustomerReply("Hello, can you please"), true);
  assert.equal(isProbablyIncompleteCustomerReply("Please tell me which"), true);
});

test("7. buildCompleteReplyRepairPrompt constructs prompt with latest customer text and broken draft", () => {
  const prompt = buildCompleteReplyRepairPrompt({
    latestCustomerText: "What are your delivery charges?",
    incompleteReply: "Delivery charges are Rs. 200 and",
    language: "English",
  });
  assert.ok(prompt.includes("What are your delivery charges?"));
  assert.ok(prompt.includes("Delivery charges are Rs. 200 and"));
  assert.ok(prompt.includes("English"));
});

test("8. repair prompt for incomplete order summary blocks premature order confirmation", () => {
  const prompt = buildCompleteReplyRepairPrompt({
    latestCustomerText: "My name is Ali",
    incompleteReply: "Order Summary:\nName: Ali",
    language: "English",
    orderSummaryBlocked: true,
  });
  assert.ok(prompt.includes("incomplete order summary"));
  assert.ok(prompt.includes("ask only for the single next missing order detail"));
});

test("9. generic customer-facing failure response is eliminated from normal conversation", () => {
  const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
  const replyStyleSource = fs.readFileSync(new URL("./reply-style-service.ts", import.meta.url), "utf8");
  assert.equal(handlerSource.includes("Please send your message again"), false);
  assert.equal(handlerSource.includes("Sorry, I couldn't complete that reply"), false);
  assert.equal(replyStyleSource.includes("Please send your message again"), false);
  assert.equal(replyStyleSource.includes("Sorry, I couldn't complete that reply"), false);
});

test("10. Urdu failure fallback is eliminated from normal conversation", () => {
  const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
  const replyStyleSource = fs.readFileSync(new URL("./reply-style-service.ts", import.meta.url), "utf8");
  assert.equal(handlerSource.includes("معذرت، جواب مکمل نہیں ہو سکا"), false);
  assert.equal(replyStyleSource.includes("معذرت، جواب مکمل نہیں ہو سکا"), false);
});

test("11. Roman Urdu failure fallback is eliminated from normal conversation", () => {
  const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
  const replyStyleSource = fs.readFileSync(new URL("./reply-style-service.ts", import.meta.url), "utf8");
  assert.equal(handlerSource.includes("Mafi chahtay hain, reply complete nahi ho saka"), false);
  assert.equal(replyStyleSource.includes("Mafi chahtay hain, reply complete nahi ho saka"), false);
});

test("12. Arabic failure fallback is eliminated from normal conversation", () => {
  const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
  const replyStyleSource = fs.readFileSync(new URL("./reply-style-service.ts", import.meta.url), "utf8");
  assert.equal(handlerSource.includes("عذراً، لم أتمكن من إكمال الرد"), false);
  assert.equal(replyStyleSource.includes("عذراً، لم أتمكن من إكمال الرد"), false);
});

test("13. internal failures must throw retryable errors instead of sending canned failure replies", () => {
  const handlerSource = fs.readFileSync(new URL("./ai-handler.ts", import.meta.url), "utf8");
  assert.equal(handlerSource.includes("buildSafeCompleteReplyFallback"), false);
  assert.match(handlerSource, /throw createAiReplyRetryableError\("AI reply was unsafe or incomplete after repair"/);
});

test("14. Short Roman Urdu conversation responses are valid and not flagged incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply("Ji bilkul, main madad kar sakta hoon."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Haan g, available hai."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Price Rs. 1500 hai."), false);
  assert.equal(isProbablyIncompleteCustomerReply("Shukriya!"), false);
});

test("15. Unclosed quotes at the end of output are detected as incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply('We have items called "Starter'), true);
  assert.equal(isProbablyIncompleteCustomerReply("Our package is 'Pro"), true);
});

test("16. Full formatted WhatsApp reply is cleaned and normalized without breaking completeness", () => {
  const formatted = formatWhatsappReply("Yes! How can I help you today?");
  assert.equal(isProbablyIncompleteCustomerReply(formatted), false);
});

test("17. Empty or whitespace-only reply is considered incomplete", () => {
  assert.equal(isProbablyIncompleteCustomerReply(""), true);
  assert.equal(isProbablyIncompleteCustomerReply("   "), true);
  assert.equal(isProbablyIncompleteCustomerReply(null), true);
  assert.equal(isProbablyIncompleteCustomerReply(undefined), true);
});

test("18. Long detailed multi-line message ending properly is not marked incomplete", () => {
  const longMsg = `Welcome to BlackArrow!

We offer the leading WhatsApp automation platform for businesses:
1. *Smart CRM:* Seamless customer lead tracking
2. *Realtime Console:* Full diagnostic and telemetry visibility
3. *Voice Simulation:* Human-like audio replies

Feel free to ask any question to get started.`;

  assert.equal(isProbablyIncompleteCustomerReply(longMsg), false);
});
