import test from "node:test";
import assert from "node:assert/strict";

import { decideImageOrderExtractor } from "./image-order-extractor-gate-service.ts";

test("normal image question runs general understanding only", () => {
  const decision = decideImageOrderExtractor({
    latestCustomerText: "What is this?",
    caption: "",
    detectedType: "product_poster",
    contextText: "This looks like a flower seeds poster.",
    containsCustomerOrderData: false,
  });

  assert.deepEqual(decision, { allow: false, reason: "not_order_context" });
});

test("logo, product, and poster images skip customer or order extraction", () => {
  assert.deepEqual(decideImageOrderExtractor({
    latestCustomerText: "Ye kya hai?",
    detectedType: "logo",
    contextText: "Restaurant logo with gold lettering.",
  }), { allow: false, reason: "general_image_question" });

  assert.deepEqual(decideImageOrderExtractor({
    latestCustomerText: "Show me this product",
    detectedType: "product_photo",
    contextText: "A fertilizer product pack.",
    containsCustomerOrderData: false,
  }), { allow: false, reason: "not_order_context" });
});

test("payment, address, and business-card style images still allow extraction", () => {
  assert.deepEqual(decideImageOrderExtractor({
    latestCustomerText: "This is my payment screenshot",
    detectedType: "image_screenshot",
    contextText: "Transaction successful with amount and sender details.",
  }), { allow: true, reason: "payment_or_address_or_contact_likely" });

  assert.deepEqual(decideImageOrderExtractor({
    latestCustomerText: "Here is the business card",
    detectedType: "image_business_card",
    contextText: "Business card with phone number and address.",
  }), { allow: true, reason: "payment_or_address_or_contact_likely" });
});

test("useful general image understanding can prevent unnecessary extractor call", () => {
  const decision = decideImageOrderExtractor({
    latestCustomerText: "What is in this?",
    detectedType: "poster",
    contextText: "Promotional poster for a restaurant deal.",
    containsCustomerOrderData: false,
  });

  assert.deepEqual(decision, { allow: false, reason: "not_order_context" });
});
