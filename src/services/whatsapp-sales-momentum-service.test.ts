import test from "node:test";
import assert from "node:assert/strict";

import {
  isBusinessOrBrandName,
  extractStructuredEntities,
  determineSalesStage,
  buildSalesMomentumPromptInstruction,
  type SalesStage,
} from "./whatsapp-sales-momentum-service.ts";

test("1. Starts Digital is recognized as a business/brand name, not a personal name", () => {
  assert.equal(isBusinessOrBrandName("Starts Digital"), true);
  assert.equal(isBusinessOrBrandName("starts digital"), true);
  assert.equal(isBusinessOrBrandName("LuxWear Apparel"), true);
  assert.equal(isBusinessOrBrandName("Trendify Agency"), true);
  assert.equal(isBusinessOrBrandName("Bilal Ahmed"), false);
  assert.equal(isBusinessOrBrandName("Sara Khan"), false);
});

test("2. Entity extractor does NOT extract business/brand name as personal name", () => {
  const message = "Hi, we are Starts Digital. We run an e-commerce agency on Shopify.";
  const entities = extractStructuredEntities(message);

  assert.equal(entities.businessName, "Starts Digital");
  assert.equal(entities.personName, undefined);
  assert.equal(entities.websiteOrPlatform, "shopify");
});

test("3. Entity extractor preserves confirmed personal name when business name is mentioned later", () => {
  const profile = { customerName: "Hamza" };
  const message = "Our company is Alpha Logistics and we need WhatsApp automation.";
  const entities = extractStructuredEntities(message, [], profile);

  assert.equal(entities.personName, "Hamza");
  assert.equal(entities.businessName, "Alpha Logistics");
});

test("4. Explicit personal name introduction is extracted accurately", () => {
  const message = "Hi, my name is Daniyal from Prime Marketing.";
  const entities = extractStructuredEntities(message);

  assert.equal(entities.personName, "Daniyal");
  assert.equal(entities.businessName, "Prime Marketing");
});

test("5. Identifies commercial pain and advances sales stage to PAIN_IDENTIFIED", () => {
  const message = "Our sales dropped significantly this month and ads are not converting.";
  const stage = determineSalesStage({ text: message });

  assert.equal(stage, "PAIN_IDENTIFIED");
});

test("6. Buying signal: Price question advances stage to PRICING", () => {
  const message = "What is the price of the Growth package?";
  const stage = determineSalesStage({ text: message });

  assert.equal(stage, "PRICING");
});

test("7. Buying signal: Onboarding/Setup question advances stage to BUYING_INTENT", () => {
  const message = "How can we get started and what is the payment method?";
  const stage = determineSalesStage({ text: message });

  assert.equal(stage, "BUYING_INTENT");
});

test("8. Support inquiry is categorized as EXISTING_CUSTOMER_SUPPORT, not aggressive sales", () => {
  const message = "Where is my order? The tracking id is PK98234 and it's delayed.";
  const stage = determineSalesStage({ text: message });

  assert.equal(stage, "EXISTING_CUSTOMER_SUPPORT");
});

test("9. Starts Digital sales momentum prompt contains strict performance fee and entity separation rules", () => {
  const instruction = buildSalesMomentumPromptInstruction({
    stage: "SOLUTION_DISCUSSION",
    entities: { businessName: "Starts Digital" },
    isSalesContext: true,
    hasBuyingIntent: false,
    hasIdentifiedPain: true,
    hasConfirmedPersonName: false,
    previousPricingAnswered: false,
    discoveredFacts: ["low ROAS"],
  });

  assert.match(instruction, /Follow Understand -> Find Pain -> Recommend -> Explain Value -> Close/);
  assert.match(instruction, /STOP asking discovery questions/);
  assert.match(instruction, /NEVER treat that as the customer's personal name/);
  assert.match(instruction, /Do NOT invent a restriction that fees apply only to courier-delivered/);
  assert.match(instruction, /state naturally that the team needs to confirm that specific point/);
});
