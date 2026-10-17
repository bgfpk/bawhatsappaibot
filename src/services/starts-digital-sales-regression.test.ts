import test from "node:test";
import assert from "node:assert/strict";
import {
  isBusinessOrBrandName,
  separateCustomerEntities,
  detectSalesStage,
  buildSalesMomentumPromptInstruction,
  formatDirectBuyingSignalAnswer,
  formatDirectPricingAnswer,
  isUnknownPolicyQuery,
} from "./whatsapp-sales-momentum-service.ts";
import {
  normalizeWhatsAppCustomerReply,
  validateWhatsAppCustomerReply,
  repairWhatsAppCustomerReply,
} from "./whatsapp-customer-reply-contract-service.ts";
import { isLikelyBusinessName, sanitizeCustomerNameCandidate } from "./customer-identity-service.ts";
import { extractCustomerOrderState } from "./customer-state-extractor-service.ts";

test("Starts Digital: Brand and business names are never treated as customer personal name", () => {
  // Test company names
  assert.equal(isBusinessOrBrandName("Starts Digital"), true);
  assert.equal(isBusinessOrBrandName("Starts Digital Agency"), true);
  assert.equal(isBusinessOrBrandName("LuxWear Apparel"), true);
  assert.equal(isBusinessOrBrandName("TechHub Solutions"), true);
  assert.equal(isBusinessOrBrandName("Zainab"), false);
  assert.equal(isBusinessOrBrandName("Bilal Ahmed"), false);

  // Assert customer-identity-service rejects business names as personal names
  assert.equal(isLikelyBusinessName("Starts Digital"), true);
  assert.equal(sanitizeCustomerNameCandidate("Starts Digital"), "");
  assert.equal(sanitizeCustomerNameCandidate("Bilal Ahmed"), "Bilal Ahmed");

  // State extraction ensures Starts Digital does not become customerName
  const state = extractCustomerOrderState({
    profile: {},
    history: [
      { role: "model", text: "What is the name of your brand or business?" },
      { role: "user", text: "We run Starts Digital" },
    ],
  });

  assert.notEqual(state.customerName, "Starts Digital");
  assert.equal(state.businessName, "Starts Digital");
});

test("Starts Digital: Existing business facts are extracted and not requested again", () => {
  const history = [
    { role: "user", text: "Our brand is Starts Digital and our website is startsdigital.com" },
    { role: "model", text: "Great to connect! What is your current monthly ad spend and main marketing challenge?" },
    { role: "user", text: "We are spending $5000/month on Meta ads but our sales dropped and ROAS is under 1.5" },
  ];

  const entities = separateCustomerEntities(history);
  assert.equal(entities.businessName, "Starts Digital");
  assert.equal(entities.websiteOrPlatform, "startsdigital.com");
  assert.ok(entities.businessProblem?.includes("sales dropped"));

  // Stage advances to PAIN_IDENTIFIED / SOLUTION_DISCUSSION, NOT back to DISCOVERY or NEW_INQUIRY
  const stage = detectSalesStage(history, { isSalesContext: true });
  assert.ok(stage === "PAIN_IDENTIFIED" || stage === "SOLUTION_DISCUSSION");
});

test("Starts Digital: Identified pain stops discovery and transitions to solution selling", () => {
  const history = [
    { role: "user", text: "We are getting high CPC and negative ROAS on Facebook ads, burning cash." },
  ];

  const stage = detectSalesStage(history, { isSalesContext: true });
  assert.equal(stage, "PAIN_IDENTIFIED");

  const promptRules = buildSalesMomentumPromptInstruction({
    stage,
    entities: { businessProblem: "high CPC and negative ROAS" },
    isSalesContext: true,
    hasBuyingIntent: false,
    hasIdentifiedPain: true,
    hasConfirmedPersonName: false,
    previousPricingAnswered: false,
    discoveredFacts: ["high CPC", "negative ROAS"],
  });

  assert.match(promptRules, /STOP asking discovery questions/);
  assert.match(promptRules, /What service fits their need/);
  assert.match(promptRules, /Commercial value and practical result/);
});

test("Starts Digital: Pricing questions receive direct answers with authoritative configured terms", () => {
  // Test direct pricing helper
  const reply = formatDirectPricingAnswer(
    "What are your charges for performance marketing?",
    "Our performance marketing fee is 4% of total attributable order value. Setup fee is $500."
  );

  assert.ok(reply.includes("4%"));
  assert.ok(reply.includes("total attributable order value"));
  // Assert no unauthorized delivery-collected restriction was added
  assert.equal(reply.toLowerCase().includes("delivered only"), false);
  assert.equal(reply.toLowerCase().includes("collected only"), false);

  // Check buying intent signal
  const directBuyingAnswer = formatDirectBuyingSignalAnswer(
    "How much does the starter package cost?",
    "Starter package is $99/month, including ad creative management and weekly reporting."
  );
  assert.ok(directBuyingAnswer.includes("$99/month"));
});

test("Starts Digital: Configured performance fee basis is total order value without invented restrictions", () => {
  const configuredPricing = "Performance fee: 4% of total attributable order value. Minimum ad spend requirement is $3,000/month.";

  // Answer directly from configured facts
  const answer = formatDirectPricingAnswer(
    "Do you charge on delivered orders only or total orders?",
    configuredPricing
  );

  assert.match(answer, /4% of total attributable order value/);
  assert.ok(!answer.includes("courier collected only"));
});

test("Starts Digital: Missing policy is not invented and triggers team confirmation", () => {
  const userQuery = "Do you guarantee 100% money back if ROAS is not achieved in 7 days?";
  assert.equal(isUnknownPolicyQuery(userQuery), true);

  // Model context instructs natural team confirmation
  const prompt = buildSalesMomentumPromptInstruction({
    stage: "OBJECTION",
    entities: {},
    isSalesContext: true,
    hasBuyingIntent: false,
    hasIdentifiedPain: true,
    hasConfirmedPersonName: false,
    previousPricingAnswered: false,
    discoveredFacts: [],
  });

  assert.match(prompt, /state naturally that the team needs to confirm that specific point/);
  assert.match(prompt, /Do not guess an "industry standard"/);
});

test("Starts Digital: Native WhatsApp formatting is applied and verified", () => {
  const rawInput = `
## Starts Digital Performance Plan

Here is our breakdown for your brand:

| Deliverable | Detail |
|---|---|
| Strategy | Multi-channel scaling |
| Fee | 4% of revenue |

**Next Step:**
Please confirm your monthly ad spend so we can finalize onboarding.
  `;

  const normalized = normalizeWhatsAppCustomerReply(rawInput);

  // Assert headers and tables converted cleanly
  assert.equal(normalized.includes("##"), false);
  assert.equal(normalized.includes("|---|"), false);
  assert.equal(normalized.includes("**"), false);
  assert.ok(normalized.includes("*Starts Digital Performance Plan*"));
  assert.ok(normalized.includes("• *Deliverable:* Strategy | *Detail:* Multi-channel scaling"));
  assert.ok(normalized.includes("*Next Step:*"));

  // Assert validation passes
  const validation = validateWhatsAppCustomerReply(normalized, { isSales: true });
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);
});

test("Starts Digital: Concise questions stay short, complex remain complete", () => {
  const shortQuestionReply = normalizeWhatsAppCustomerReply("Yes, we manage both Meta and Google Ads for e-commerce brands.");
  const val1 = validateWhatsAppCustomerReply(shortQuestionReply);
  assert.equal(val1.ok, true);
  assert.ok(shortQuestionReply.split(/\s+/).length <= 25);

  const detailedAnswer = normalizeWhatsAppCustomerReply(
    "For Starts Digital e-commerce clients, we handle end-to-end creative testing, audience segmentation, and weekly ROAS tracking.\n\nOur performance fee is 4% of attributable revenue with no long-term lock-in.\n\nWould you like to schedule a quick onboarding call this week?"
  );
  const val2 = validateWhatsAppCustomerReply(detailedAnswer);
  assert.equal(val2.ok, true);
  assert.equal(detailedAnswer.endsWith("?"), true);
});
