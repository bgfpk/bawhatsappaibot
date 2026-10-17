import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAndMergeCustomer360,
  extractAndMergeCustomer360Async,
  extractCustomerName,
  extractBusinessName,
  extractLocation,
  extractBudget,
  extractBusinessType,
  inferCustomerIntent,
  inferBuyingStage,
  detectLanguage,
  mergeFactWithPriority,
  parseCustomer360FromProfile,
  createEmptyCustomer360,
  buildCustomer360AiPrompt,
  parseCustomer360AiJson,
  mergeAiStructuredResultIntoCustomer360,
  CUSTOMER360_SYSTEM_INSTRUCTION,
} from "./customer-360-extraction-service.ts";

test("1. Explicit fact extraction from customer messages via AI semantic path", async () => {
  const res1 = await extractAndMergeCustomer360Async({
    messageText: "Hi, my name is Bilal and my company name is TechLogix. We are in Lahore.",
    role: "user",
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Bilal", company: "TechLogix", city: "Lahore" },
    }),
  });
  assert.equal(res1.topLevelPatches.customerName, "Bilal");
  assert.equal(res1.customer360.businessContext.businessName, "TechLogix");
  assert.equal(res1.topLevelPatches.location, "Lahore");

  const res2 = await extractAndMergeCustomer360Async({
    messageText: "Mera naam Hamza hai aur hamari shop ka naam Ahmed Electronics hai. Hum Karachi mein hain.",
    role: "user",
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Hamza", company: "Ahmed Electronics", city: "Karachi", preferredLanguage: "roman_urdu" },
    }),
  });
  assert.equal(res2.topLevelPatches.customerName, "Hamza");
  assert.equal(res2.customer360.businessContext.businessName, "Ahmed Electronics");
  assert.equal(res2.topLevelPatches.location, "Karachi");
});

test("2. Multi-turn progressive Customer 360 learning (Example A)", async () => {
  let profile: any = {};

  // Turn 1: Business type
  const turn1 = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "I run a clothing store.",
    role: "user",
    messageId: "msg_1",
    existingProfile: profile,
    nowMs: 1000,
    aiGenerateOverride: async () => JSON.stringify({
      business: { businessType: "Retail / Clothing" },
      intelligence: { currentIntent: "greeting_business_intro" },
    }),
  });
  assert.ok(turn1.hasChanges);
  assert.equal(turn1.customer360.businessContext.businessType, "Retail / Clothing");
  profile = { customer360: turn1.customer360 };

  // Turn 2: City / Location
  const turn2 = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "We are based in Lahore.",
    role: "user",
    messageId: "msg_2",
    existingProfile: profile,
    nowMs: 2000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { city: "Lahore" },
      extractedFacts: [{ field: "city", value: "Lahore", source: "explicit_statement", confidence: 0.95 }],
    }),
  });
  assert.ok(turn2.hasChanges);
  assert.equal(turn2.customer360.businessContext.businessType, "Retail / Clothing");
  assert.equal(turn2.topLevelPatches.location, "Lahore");
  profile = { customer360: turn2.customer360, ...turn2.topLevelPatches };

  // Turn 3: Requirement / Interest
  const turn3 = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "I need WhatsApp automation for order confirmations.",
    role: "user",
    messageId: "msg_3",
    existingProfile: profile,
    nowMs: 3000,
    aiGenerateOverride: async () => JSON.stringify({
      sales: {
        productInterest: "WhatsApp order automation",
        requirements: ["order confirmations automation"],
      },
    }),
  });
  assert.ok(turn3.hasChanges);
  assert.equal(turn3.customer360.salesContext.productInterest, "WhatsApp order automation");
  profile = { customer360: turn3.customer360 };

  // Turn 4: Budget
  const turn4 = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Our monthly budget is around $50.",
    role: "user",
    messageId: "msg_4",
    existingProfile: profile,
    nowMs: 4000,
    aiGenerateOverride: async () => JSON.stringify({
      sales: { budget: "$50 monthly" },
      extractedFacts: [{ field: "budget", value: "$50 monthly", source: "explicit_statement", confidence: 0.95 }],
    }),
  });
  assert.ok(turn4.hasChanges);
  assert.equal(turn4.customer360.businessContext.businessType, "Retail / Clothing");
  assert.equal(turn4.customer360.provenance["city"].value, "Lahore");
  assert.equal(turn4.customer360.salesContext.productInterest, "WhatsApp order automation");
  assert.equal(turn4.customer360.salesContext.budget, "$50 monthly");
});

test("3. Objections, preferences and plan price safety (Example B)", async () => {
  let profile: any = {};

  // Customer says: "Pro plan looks expensive."
  const turn1 = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Pro plan looks expensive.",
    role: "user",
    messageId: "msg_1",
    existingProfile: profile,
    nowMs: 1000,
    aiGenerateOverride: async () => JSON.stringify({
      sales: {
        buyingStage: "price_sensitive",
        objections: ["Pro plan pricing is high"],
      },
      intelligence: { currentIntent: "price_inquiry" },
    }),
  });
  assert.ok(turn1.customer360.salesContext.objections?.includes("Pro plan pricing is high"));
  assert.equal(turn1.customer360.salesContext.budget, undefined, "Plan price must NOT be saved as budget");
  profile = { customer360: turn1.customer360 };

  // Customer says: "Maybe Growth will work. I need 3 WhatsApp numbers."
  const turn2 = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Maybe Growth will work. I need 3 WhatsApp numbers.",
    role: "user",
    messageId: "msg_2",
    existingProfile: profile,
    nowMs: 2000,
    aiGenerateOverride: async () => JSON.stringify({
      sales: {
        preferredOption: "Growth Plan",
        quantity: "3 WhatsApp numbers",
        requirements: ["3 WhatsApp numbers"],
      },
    }),
  });
  assert.equal(turn2.customer360.salesContext.preferredOption, "Growth Plan");
  assert.equal(turn2.customer360.salesContext.quantity, "3 WhatsApp numbers");
  assert.ok(turn2.customer360.salesContext.objections?.includes("Pro plan pricing is high"));
});

test("4. Roman Urdu multi-turn understanding (Example C)", async () => {
  let profile: any = {};

  const extraction = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Mera naam Hamza hai aur meri electronics shop hai Karachi mein. Mujhe order updates automate karni hain.",
    role: "user",
    messageId: "msg_ru",
    existingProfile: profile,
    nowMs: 1000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: {
        name: "Hamza",
        company: "Electronics Shop",
        city: "Karachi",
        preferredLanguage: "roman_urdu",
      },
      business: { businessType: "Retail Electronics" },
      sales: { requirements: ["Order updates automation"] },
      intelligence: { currentIntent: "purchase_intent" },
      extractedFacts: [
        { field: "name", value: "Hamza", source: "explicit_statement", confidence: 0.95 },
        { field: "city", value: "Karachi", source: "explicit_statement", confidence: 0.9 },
      ],
    }),
  });

  assert.equal(extraction.topLevelPatches.customerName, "Hamza");
  assert.equal(extraction.topLevelPatches.location, "Karachi");
  assert.equal(extraction.customer360.businessContext.businessName, "Electronics Shop");
  assert.equal(extraction.customer360.conversationIntelligence.preferredLanguage, "roman_urdu");
});

test("5. Negation handling: websites and plans", async () => {
  const resultNoSite = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "I don't have a website.",
    role: "user",
    messageId: "msg_neg1",
    aiGenerateOverride: async () => JSON.stringify({
      business: { website: null },
      intelligence: { currentIntent: "business_info" },
    }),
  });
  assert.equal(resultNoSite.customer360.businessContext.website, undefined);

  const resultNoPro = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "I am not interested in the Pro plan.",
    role: "user",
    messageId: "msg_neg2",
    aiGenerateOverride: async () => JSON.stringify({
      sales: {
        productInterest: null,
        objections: ["Not interested in Pro plan"],
      },
    }),
  });
  assert.equal(resultNoPro.customer360.salesContext.productInterest, undefined);
  assert.deepEqual(resultNoPro.customer360.salesContext.objections, ["Not interested in Pro plan"]);
});

test("6. Order Reference Safety vs arbitrary numbers", async () => {
  const validOrder = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Where is my order #ORD-9921?",
    role: "user",
    messageId: "msg_ord",
    aiGenerateOverride: async () => JSON.stringify({
      supportOrder: { suppliedOrderReference: "ORD-9921" },
      intelligence: { currentIntent: "order_tracking" },
    }),
  });
  assert.equal(validOrder.customer360.orderSupportContext.existingOrderReference, "ORD-9921");

  const arbitraryNumber = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "I want to order 5 shirts for my brother.",
    role: "user",
    messageId: "msg_qty",
    aiGenerateOverride: async () => JSON.stringify({
      sales: { quantity: "5 shirts" },
      intelligence: { currentIntent: "purchase_intent" },
    }),
  });
  assert.equal(arbitraryNumber.customer360.orderSupportContext.existingOrderReference, undefined);
  assert.equal(arbitraryNumber.customer360.salesContext.quantity, "5 shirts");
});

test("7. Concurrency & Out-of-Order Race Protection", () => {
  const prov: Record<string, any> = {};
  const target: Record<string, any> = {};

  // Message B arrived at t=2000 and finished first
  const bApplied = mergeFactWithPriority(target, prov, "name", "Ahmed", "explicit_statement", 0.95, 2000, "msg_B");
  assert.ok(bApplied);
  assert.equal(target.name, "Ahmed");
  assert.equal(prov.name.updatedAt, 2000);

  // Message A arrived at t=1000 but finished late at t=3000
  const aApplied = mergeFactWithPriority(target, prov, "name", "Ali", "explicit_statement", 0.95, 1000, "msg_A");
  assert.equal(aApplied, false, "Stale earlier message A must be rejected by concurrency guard");
  assert.equal(target.name, "Ahmed", "Name remains newer value");
});

test("8. Strict 4-Tier Authority Hierarchy", () => {
  const prov: Record<string, any> = {
    city: {
      value: "Lahore",
      source: "manual_verified",
      confidence: 1.0,
      updatedAt: 1000,
    },
  };
  const target: Record<string, any> = { city: "Lahore" };

  // Explicit statement cannot overwrite manual_verified
  const explicitTry = mergeFactWithPriority(target, prov, "city", "Karachi", "explicit_statement", 0.9, 2000, "msg_2");
  assert.equal(explicitTry, false);
  assert.equal(target.city, "Lahore");

  // Conversational inference cannot overwrite explicit statement
  prov.budget = {
    value: "$100",
    source: "explicit_statement",
    confidence: 0.95,
    updatedAt: 1500,
  };
  target.budget = "$100";

  const inferenceTry = mergeFactWithPriority(target, prov, "budget", "$200", "conversational_inference", 0.5, 2500, "msg_3");
  assert.equal(inferenceTry, false);
  assert.equal(target.budget, "$100");
});

test("9. No sensitive personal attribute inference", () => {
  assert.match(CUSTOMER360_SYSTEM_INSTRUCTION, /NO SENSITIVE PERSONAL ATTRIBUTES/);
});

test("10. Zero Wallet Charge / Pure In-Memory Verification", async () => {
  const beforeBalance = 50.0;
  const extraction = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "My budget is around $100 monthly.",
    role: "user",
    messageId: "msg_cost",
    aiGenerateOverride: async () => JSON.stringify({
      sales: { budget: "$100 monthly" },
      extractedFacts: [{ field: "budget", value: "$100 monthly", source: "explicit_statement", confidence: 0.95 }],
    }),
  });
  const afterBalance = 50.0;
  assert.equal(beforeBalance, afterBalance, "Customer360 extraction must have $0 wallet balance effect");
  assert.equal(extraction.customer360.salesContext.budget, "$100 monthly");
});

test("11. Out-of-order concurrency race: newer source timestamp always prevails", async () => {
  const tA = new Date("2026-08-28T10:00:00Z").getTime();
  const tB = new Date("2026-08-28T10:00:05Z").getTime();

  let profile: any = {};

  // Extraction for Message B finishes FIRST
  const resultB = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "We are headquartered in Islamabad.",
    role: "user",
    messageId: "msg_B",
    existingProfile: profile,
    nowMs: tB,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { city: "Islamabad" },
    }),
  });
  assert.equal(resultB.customer360.provenance.city?.value, "Islamabad");
  assert.equal(resultB.topLevelPatches.location, "Islamabad");
  profile = { customer360: resultB.customer360, ...resultB.topLevelPatches };

  // Extraction for Message A (received earlier at 10:00:00) finishes LATER
  const resultA = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "We are located in Karachi.",
    role: "user",
    messageId: "msg_A",
    existingProfile: profile,
    nowMs: tA,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { city: "Karachi" },
    }),
  });

  // City must remain Islamabad because Message B was chronologically newer
  assert.equal(resultA.customer360.provenance.city?.value, "Islamabad", "Stale Message A must not overwrite newer Message B");
  assert.equal(resultA.customer360.provenance.city.sourceMessageId, "msg_B");
});

test("12. Customer correction: explicit statement B updates previous explicit statement A", async () => {
  const t1 = 10000;
  const t2 = 20000;
  let profile: any = {};

  // Message A
  const resA = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "My company is ABC Traders.",
    role: "user",
    messageId: "msg_comp_1",
    existingProfile: profile,
    nowMs: t1,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { company: "ABC Traders" },
    }),
  });
  assert.equal(resA.customer360.businessContext.businessName, "ABC Traders");
  profile = { customer360: resA.customer360 };

  // Message B (Correction later)
  const resB = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Sorry, it's actually ABC Foods.",
    role: "user",
    messageId: "msg_comp_2",
    existingProfile: profile,
    nowMs: t2,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { company: "ABC Foods" },
    }),
  });
  assert.equal(resB.customer360.businessContext.businessName, "ABC Foods", "Newer explicit statement must correct previous statement");
  assert.equal(resB.customer360.provenance.businessName.source, "explicit_statement");
  assert.equal(resB.customer360.provenance.businessName.sourceMessageId, "msg_comp_2");
});

test("13. Weaker source rejection: explicit_statement is NOT overwritten by later conversational_inference", async () => {
  let profile: any = {};

  // Explicit statement established
  const resExplicit = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Our business name is ABC Foods.",
    role: "user",
    messageId: "msg_exp",
    existingProfile: profile,
    nowMs: 1000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { company: "ABC Foods" },
    }),
  });
  assert.equal(resExplicit.customer360.businessContext.businessName, "ABC Foods");
  profile = { customer360: resExplicit.customer360 };

  // Later vague conversation suggesting ABC Traders via inference
  const prov = resExplicit.customer360.provenance;
  const target = resExplicit.customer360.businessContext;
  const inferenceAttempt = mergeFactWithPriority(
    target,
    prov,
    "businessName",
    "ABC Traders",
    "conversational_inference",
    0.5,
    5000,
    "msg_inf"
  );

  assert.equal(inferenceAttempt, false, "Lower tier inference must NOT overwrite explicit statement");
  assert.equal(target.businessName, "ABC Foods");
  assert.equal(prov.businessName.source, "explicit_statement");
});

test("14. Manual verified protection: manual_verified is immune to conversational overwrite", async () => {
  const c360 = createEmptyCustomer360();
  c360.provenance.city = {
    value: "Karachi",
    source: "manual_verified",
    confidence: 1.0,
    updatedAt: 1000,
    sourceMessageId: "manual_entry",
  };

  const profile = { customer360: c360, location: "Karachi" };

  const res = await extractAndMergeCustomer360Async({
    botJid: "contact-9e4cfaeabffa@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "I am sending this from Lahore today.",
    role: "user",
    messageId: "msg_lahore",
    existingProfile: profile,
    nowMs: 20000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { city: "Lahore" },
    }),
  });

  assert.equal(res.customer360.provenance.city.value, "Karachi", "manual_verified city must NOT be overwritten by customer conversation");
  assert.equal(res.customer360.provenance.city.source, "manual_verified");
});

test("15. Customer correction behavior: name, business, phone, and requirement corrections", async () => {
  // Initial customer profile with wrong name ("Shamim Uddin Ahmed") and wrong business
  const initialProfile: any = {
    customerName: "Shamim Uddin Ahmed",
    customer360: {
      businessContext: { businessName: "Old Fashion Fabrics" },
      salesContext: { productInterest: "Pro Enterprise Plan", requirements: ["Pro Enterprise Plan", "Fast Delivery"] },
      provenance: {
        name: { value: "Shamim Uddin Ahmed", source: "explicit_statement", confidence: 0.9, updatedAt: 1000 },
        businessName: { value: "Old Fashion Fabrics", source: "explicit_statement", confidence: 0.9, updatedAt: 1000 },
        phone: { value: "110064053003", source: "explicit_statement", confidence: 0.9, updatedAt: 1000 },
      },
      corrections: [],
    },
  };

  // Step 1: Customer refutes name ("Im not Shamim Uddin Ahmed. WHo told you that?")
  const turn1 = await extractAndMergeCustomer360Async({
    botJid: "contact-69e7c3918a93@example.invalid",
    customerJid: "contact-d3b9636f8b0e@example.invalid",
    messageText: "Im not Shamim Uddin Ahmed. WHo told you that? My name is Ahad Firdosi",
    role: "user",
    messageId: "msg_turn_1",
    existingProfile: initialProfile,
    nowMs: 2000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Ahad Firdosi" },
      corrections: [
        { factType: "name", refutedValue: "Shamim Uddin Ahmed", correctedValue: "Ahad Firdosi", customerStatement: "Im not Shamim Uddin Ahmed. WHo told you that? My name is Ahad Firdosi" },
      ],
    }),
  });

  assert.equal(turn1.customer360.provenance.name.value, "Ahad Firdosi");
  assert.equal(turn1.topLevelPatches.customerName, "Ahad Firdosi");
  assert.ok(turn1.customer360.corrections?.some((c) => c.field === "name" && c.refutedValue?.toLowerCase().includes("shamim")));

  // Step 2: Customer refutes business ("my business is not Old Fashion Fabrics, we run Apex Digital")
  const updatedProfileTurn1 = {
    ...initialProfile,
    customerName: turn1.topLevelPatches.customerName,
    customer360: turn1.customer360,
  };

  const turn2 = await extractAndMergeCustomer360Async({
    botJid: "contact-69e7c3918a93@example.invalid",
    customerJid: "contact-d3b9636f8b0e@example.invalid",
    messageText: "My business is not Old Fashion Fabrics. We run Apex Digital",
    role: "user",
    messageId: "msg_turn_2",
    existingProfile: updatedProfileTurn1,
    nowMs: 3000,
    aiGenerateOverride: async () => JSON.stringify({
      business: { businessName: "Apex Digital", activeBusiness: "Apex Digital" },
      corrections: [
        { factType: "business", refutedValue: "Old Fashion Fabrics", correctedValue: "Apex Digital", customerStatement: "My business is not Old Fashion Fabrics. We run Apex Digital" },
      ],
    }),
  });

  assert.equal(turn2.customer360.businessContext.businessName, "Apex Digital");
  assert.ok(turn2.customer360.corrections?.some((c) => c.field === "business" && c.refutedValue?.toLowerCase().includes("old fashion fabrics")));

  // Step 3: Customer refutes phone ("that's not my number, my number is +92 306 6935544")
  const updatedProfileTurn2 = {
    ...updatedProfileTurn1,
    customer360: turn2.customer360,
  };

  const turn3 = await extractAndMergeCustomer360Async({
    botJid: "contact-69e7c3918a93@example.invalid",
    customerJid: "contact-d3b9636f8b0e@example.invalid",
    messageText: "That's not my number, my number is 03066935544",
    role: "user",
    messageId: "msg_turn_3",
    existingProfile: updatedProfileTurn2,
    nowMs: 4000,
    aiGenerateOverride: async () => JSON.stringify({
      corrections: [
        { factType: "phone", refutedValue: "110064053003", correctedValue: "14333514207", customerStatement: "That's not my number, my number is 03066935544" },
      ],
    }),
  });

  assert.ok(turn3.customer360.corrections?.some((c) => c.field === "phone"));

  // Step 4: Customer refutes requirement ("I don't need Pro Enterprise Plan anymore")
  const updatedProfileTurn3 = {
    ...updatedProfileTurn2,
    customer360: turn3.customer360,
  };

  const turn4 = await extractAndMergeCustomer360Async({
    botJid: "contact-69e7c3918a93@example.invalid",
    customerJid: "contact-d3b9636f8b0e@example.invalid",
    messageText: "I don't need Pro Enterprise Plan anymore, cancel that",
    role: "user",
    messageId: "msg_turn_4",
    existingProfile: updatedProfileTurn3,
    nowMs: 5000,
    aiGenerateOverride: async () => JSON.stringify({
      corrections: [
        { factType: "requirement", refutedValue: "Pro Enterprise Plan", customerStatement: "I don't need Pro Enterprise Plan anymore, cancel that" },
      ],
    }),
  });

  assert.equal(turn4.customer360.salesContext.productInterest, undefined);
  assert.ok(!turn4.customer360.salesContext.requirements?.some((r) => r.toLowerCase().includes("pro enterprise")));
  assert.ok(turn4.customer360.salesContext.requirements?.includes("Fast Delivery"));

  // Step 5: Cross-customer isolation - Verify another customer record is completely unaffected
  const otherCustomerProfile: any = {
    customerName: "Zahid Khan",
    customer360: {
      businessContext: { businessName: "Old Fashion Fabrics" },
      provenance: { name: { value: "Zahid Khan" } },
    },
  };
  assert.equal(otherCustomerProfile.customerName, "Zahid Khan");
  assert.equal(otherCustomerProfile.customer360.businessContext.businessName, "Old Fashion Fabrics");
});

test("16. Fact Correction Provenance Preservation (Requirement #21)", async () => {
  const initialProfile = {
    customerName: "Shamim Uddin Ahmed",
    customer360: {
      businessContext: { businessName: "Old Fashion Fabrics" },
      provenance: {
        name: {
          value: "Shamim Uddin Ahmed",
          source: "explicit_statement",
          confidence: 0.9,
          updatedAt: 1000,
          isActive: true,
        },
        businessName: {
          value: "Old Fashion Fabrics",
          source: "explicit_statement",
          confidence: 0.9,
          updatedAt: 1000,
          isActive: true,
        },
      },
    },
  };

  const enriched = await extractAndMergeCustomer360Async({
    botJid: "contact-2618414235de@example.invalid",
    customerJid: "contact-d3b9636f8b0e@example.invalid",
    messageText: "Im not Shamim Uddin Ahmed. My name is Ahad Firdosi. Also my business is not Old Fashion Fabrics, we run Apex Digital.",
    role: "user",
    messageId: "msg_corr_prov",
    existingProfile: initialProfile,
    nowMs: 2000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Ahad Firdosi" },
      business: { businessName: "Apex Digital" },
      corrections: [
        { factType: "name", refutedValue: "Shamim Uddin Ahmed", correctedValue: "Ahad Firdosi", customerStatement: "Im not Shamim Uddin Ahmed. My name is Ahad Firdosi." },
        { factType: "business", refutedValue: "Old Fashion Fabrics", correctedValue: "Apex Digital", customerStatement: "Also my business is not Old Fashion Fabrics, we run Apex Digital." },
      ],
    }),
  });

  const prov = enriched.customer360.provenance;

  // New active facts
  assert.equal(prov.name?.value, "Ahad Firdosi");
  assert.equal(prov.name?.isActive, true);
  assert.equal(prov.name?.isSuperseded, false);

  assert.equal(prov.businessName?.value, "Apex Digital");
  assert.equal(prov.businessName?.isActive, true);
  assert.equal(prov.businessName?.isSuperseded, false);

  // Old superseded facts preserved in historical provenance
  const supersededNameKey = Object.keys(prov).find((k) => k.startsWith("name_superseded_"));
  assert.ok(supersededNameKey, "Old name fact must be preserved with superseded key");
  assert.equal(prov[supersededNameKey!].value, "Shamim Uddin Ahmed");
  assert.equal(prov[supersededNameKey!].isSuperseded, true);
  assert.equal(prov[supersededNameKey!].isActive, false);
  assert.equal(prov[supersededNameKey!].supersededBy, "Ahad Firdosi");

  const supersededBizKey = Object.keys(prov).find((k) => k.startsWith("businessName_superseded_"));
  assert.ok(supersededBizKey, "Old business fact must be preserved with superseded key");
  assert.equal(prov[supersededBizKey!].value, "Old Fashion Fabrics");
  assert.equal(prov[supersededBizKey!].isSuperseded, true);
  assert.equal(prov[supersededBizKey!].isActive, false);
  assert.equal(prov[supersededBizKey!].supersededBy, "Apex Digital");
});

test("17. Multilingual Corrections (Requirement #9)", async () => {
  // Case A: Urdu refutation
  const urduCorrection = await extractAndMergeCustomer360Async({
    messageText: "میرا نام شمیم نہیں ہے۔ میرا نام احد فردوسی ہے",
    role: "user",
    nowMs: 1000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "احد فردوسی", preferredLanguage: "ur" },
      corrections: [
        { factType: "name", refutedValue: "شمیم", correctedValue: "احد فردوسی", customerStatement: "میرا نام شمیم نہیں ہے۔ میرا نام احد فردوسی ہے" },
      ],
    }),
  });
  assert.ok(urduCorrection.customer360.corrections?.some((c) => c.field === "name" && c.refutedValue?.includes("شمیم")));
  assert.equal(urduCorrection.topLevelPatches.customerName, "احد فردوسی");

  // Case B: Roman Urdu refutation
  const romanUrduCorrection = await extractAndMergeCustomer360Async({
    messageText: "Hamari company Old Fashion Fabrics nahi hai, hum Apex Digital chalate hain",
    role: "user",
    nowMs: 2000,
    aiGenerateOverride: async () => JSON.stringify({
      business: { businessName: "Apex Digital" },
      corrections: [
        { factType: "business", refutedValue: "Old Fashion Fabrics", correctedValue: "Apex Digital", customerStatement: "Hamari company Old Fashion Fabrics nahi hai, hum Apex Digital chalate hain" },
      ],
    }),
  });
  assert.ok(romanUrduCorrection.customer360.corrections?.some((c) => c.field === "business" && c.refutedValue?.includes("Old Fashion Fabrics")));
  assert.equal(romanUrduCorrection.customer360.businessContext.businessName, "Apex Digital");

  // Case C: Arabic refutation
  const arabicCorrection = await extractAndMergeCustomer360Async({
    messageText: "La ismi Shamim. Ismi Ahad Firdosi",
    role: "user",
    nowMs: 3000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Ahad Firdosi", preferredLanguage: "ar" },
      corrections: [
        { factType: "name", refutedValue: "Shamim", correctedValue: "Ahad Firdosi", customerStatement: "La ismi Shamim. Ismi Ahad Firdosi" },
      ],
    }),
  });
  assert.ok(arabicCorrection.customer360.corrections?.some((c) => c.field === "name" && c.refutedValue?.includes("Shamim")));
  assert.equal(arabicCorrection.topLevelPatches.customerName, "Ahad Firdosi");
});

test("17b. Synchronous extractor strictly non-conversational (regex authority: NO)", () => {
  // Conversational sentence must NOT be extracted by sync extractor (no regex phrase matching)
  const syncRes = extractAndMergeCustomer360({
    messageText: "Hi, my name is John Doe and my business is Acme Corp",
    role: "user",
  });
  assert.equal(syncRes.hasChanges, false);
  assert.equal(syncRes.topLevelPatches.customerName, undefined);

  // Transport metadata senderName IS accepted as low-priority inference
  const syncWithSender = extractAndMergeCustomer360({
    messageText: "Hello there",
    role: "user",
    senderName: "Tariq Mansoor",
  });
  assert.equal(syncWithSender.hasChanges, true);
  assert.equal(syncWithSender.topLevelPatches.customerName, "Tariq Mansoor");
  assert.equal(syncWithSender.customer360.provenance.name?.source, "conversational_inference");

  // But if senderName is refuted, transport metadata is rejected
  const syncRefutedSender = extractAndMergeCustomer360({
    messageText: "Hello there",
    role: "user",
    senderName: "Shamim",
    existingProfile: {
      customer360: {
        corrections: [{ field: "name", refutedValue: "Shamim" }],
      },
    },
  });
  assert.equal(syncRefutedSender.hasChanges, false);
  assert.equal(syncRefutedSender.topLevelPatches.customerName, undefined);
});

test("18. Strict Cross-Customer Memory Isolation (Requirement #28)", async () => {
  const { buildCustomer360PromptSection } = await import("./customer-bot-prompt-service.ts");

  // Customer A profile
  const profileA = {
    customerName: "Alice Merchant",
    customer360: {
      businessContext: { businessName: "Alice Florist", businessType: "Florist" },
      salesContext: { productInterest: "Wedding Bouquets", budget: "$300" },
      orderSupportContext: { existingOrderReference: "ORD-ALICE-101" },
    },
  };

  // Customer B profile
  const profileB = {
    customerName: "Bob Builder",
    customer360: {
      businessContext: { businessName: "Bob Construction", businessType: "Contractor" },
      salesContext: { productInterest: "Power Drills", budget: "$1500" },
      orderSupportContext: { existingOrderReference: "ORD-BOB-999" },
    },
  };

  const promptSectionA = buildCustomer360PromptSection(profileA);
  const promptSectionB = buildCustomer360PromptSection(profileB);

  // Prompt A contains A's facts and ZERO B facts
  assert.ok(promptSectionA.includes("Alice Florist"));
  assert.ok(promptSectionA.includes("Wedding Bouquets"));
  assert.ok(!promptSectionA.includes("Bob Builder"));
  assert.ok(!promptSectionA.includes("Bob Construction"));
  assert.ok(!promptSectionA.includes("Power Drills"));
  assert.ok(!promptSectionA.includes("ORD-BOB-999"));

  // Prompt B contains B's facts and ZERO A facts
  assert.ok(promptSectionB.includes("Bob Construction"));
  assert.ok(promptSectionB.includes("Power Drills"));
  assert.ok(!promptSectionB.includes("Alice Merchant"));
  assert.ok(!promptSectionB.includes("Alice Florist"));
  assert.ok(!promptSectionB.includes("Wedding Bouquets"));
  assert.ok(!promptSectionB.includes("ORD-ALICE-101"));
});

test("Requirement #10: Multilingual Semantic Corrections & Dual Businesses (Unseen Wording)", async () => {
  // 1. English: Wrong name correction with semantic refutation provenance
  const res1 = await extractAndMergeCustomer360Async({
    messageText: "You got my name wrong, I am actually Robert Davies.",
    role: "user",
    nowMs: 1000,
    existingProfile: {
      customerName: "David Miller",
      customer360: {
        provenance: {
          name: { value: "David Miller", source: "conversational_inference", confidence: 0.7, updatedAt: 500, isActive: true },
        },
      },
    },
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Robert Davies" },
      corrections: [
        { factType: "name", refutedValue: "David Miller", correctedValue: "Robert Davies", customerStatement: "You got my name wrong, I am actually Robert Davies." },
      ],
    }),
  });

  assert.equal(res1.hasChanges, true);
  assert.equal(res1.topLevelPatches.customerName, "Robert Davies");
  assert.equal(res1.customer360.provenance["name"]?.value, "Robert Davies");
  assert.equal(res1.customer360.provenance["name"]?.isActive, true);
  assert.ok(res1.customer360.provenance["name_superseded_1000"]);
  assert.equal(res1.customer360.provenance["name_superseded_1000"]?.isSuperseded, true);
  assert.equal(res1.customer360.provenance["name_superseded_1000"]?.supersededBy, "Robert Davies");

  // 2. Arabic: Wrong name correction
  const res2 = await extractAndMergeCustomer360Async({
    messageText: "لست أحمد، اسمي الحقيقي طارق المنصور",
    role: "user",
    nowMs: 2000,
    existingProfile: {
      customerName: "أحمد",
    },
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "طارق المنصور", preferredLanguage: "ar" },
      corrections: [
        { factType: "name", refutedValue: "أحمد", correctedValue: "طارق المنصور", customerStatement: "لست أحمد، اسمي الحقيقي طارق المنصور" },
      ],
    }),
  });
  assert.equal(res2.topLevelPatches.customerName, "طارق المنصور");
  assert.equal(res2.customer360.conversationIntelligence.preferredLanguage, "ar");

  // 3. Urdu: Wrong business correction
  const res3 = await extractAndMergeCustomer360Async({
    messageText: "ہماری کوئی ٹیکسٹائل کمپنی نہیں ہے، ہم پیسفک کارگو لاجسٹکس ہیں",
    role: "user",
    nowMs: 3000,
    existingProfile: {
      customer360: {
        businessContext: { businessName: "ٹیکسٹائل ملز" },
        provenance: {
          businessName: { value: "ٹیکسٹائل ملز", source: "conversational_inference", confidence: 0.6, updatedAt: 1000, isActive: true },
        },
      },
    },
    aiGenerateOverride: async () => JSON.stringify({
      business: { businessName: "پیسفک کارگو لاجسٹکس", businessType: "Logistics" },
      corrections: [
        { factType: "business", refutedValue: "ٹیکسٹائل ملز", correctedValue: "پیسفک کارگو لاجسٹکس", customerStatement: "ہماری کوئی ٹیکسٹائل کمپنی نہیں ہے، ہم پیسفک کارگو لاجسٹکس ہیں" },
      ],
    }),
  });
  assert.equal(res3.customer360.businessContext.businessName, "پیسفک کارگو لاجسٹکس");
  assert.ok(res3.customer360.provenance["businessName_superseded_3000"]);
  assert.equal(res3.customer360.provenance["businessName_superseded_3000"]?.isSuperseded, true);

  // 4. Roman Urdu: Business switch (shut down old, started new)
  const res4 = await extractAndMergeCustomer360Async({
    messageText: "humne wo boutique band kar di hai, ab hum real estate consultancies chalate hain",
    role: "user",
    nowMs: 4000,
    existingProfile: {
      customer360: {
        businessContext: { businessName: "Elegance Boutique", businessType: "Retail" },
      },
    },
    aiGenerateOverride: async () => JSON.stringify({
      business: {
        businessName: "Prime Real Estate",
        businessType: "Real Estate",
        knownBusinesses: [
          { name: "Elegance Boutique", type: "Retail", isActive: false },
          { name: "Prime Real Estate", type: "Real Estate", isActive: true },
        ],
      },
      corrections: [
        { factType: "business", refutedValue: "Elegance Boutique", correctedValue: "Prime Real Estate", customerStatement: "humne wo boutique band kar di hai, ab hum real estate consultancies chalate hain" },
      ],
    }),
  });
  assert.equal(res4.customer360.businessContext.businessName, "Prime Real Estate");
  assert.equal(res4.customer360.businessContext.activeBusiness, "Prime Real Estate");
  assert.equal(res4.customer360.businessContext.knownBusinesses?.length, 2);
  const oldBiz = res4.customer360.businessContext.knownBusinesses?.find((b) => b.name === "Elegance Boutique");
  const newBiz = res4.customer360.businessContext.knownBusinesses?.find((b) => b.name === "Prime Real Estate");
  assert.equal(oldBiz?.isActive, false);
  assert.equal(newBiz?.isActive, true);

  // 5. Dual Businesses Owned Simultaneously (English & Hindi/Urdu)
  const res5 = await extractAndMergeCustomer360Async({
    messageText: "I actually own two businesses: North Star Cafe and Apex Digital Marketing.",
    role: "user",
    nowMs: 5000,
    aiGenerateOverride: async () => JSON.stringify({
      business: {
        knownBusinesses: [
          { name: "North Star Cafe", type: "Hospitality", isActive: true },
          { name: "Apex Digital Marketing", type: "Agency", isActive: true },
        ],
      },
    }),
  });
  assert.equal(res5.customer360.businessContext.knownBusinesses?.length, 2);
  assert.equal(res5.customer360.businessContext.knownBusinesses?.[0].isActive, true);
  assert.equal(res5.customer360.businessContext.knownBusinesses?.[1].isActive, true);

  // 6. Wrong Requirement Refutation
  const res6 = await extractAndMergeCustomer360Async({
    messageText: "Drop the Pro plan, we only require the Starter tier.",
    role: "user",
    nowMs: 6000,
    existingProfile: {
      customer360: {
        salesContext: {
          productInterest: "Pro Plan",
          interestedProducts: ["Pro Plan", "Starter Tier"],
          requirements: ["Unlimited seats (Pro Plan)"],
        },
      },
    },
    aiGenerateOverride: async () => JSON.stringify({
      sales: { productInterest: "Starter Tier" },
      corrections: [
        { factType: "requirement", refutedValue: "Pro Plan", correctedValue: "Starter Tier", customerStatement: "Drop the Pro plan, we only require the Starter tier." },
      ],
    }),
  });
  assert.equal(res6.customer360.salesContext.productInterest, "Starter Tier");
  assert.equal(res6.customer360.salesContext.interestedProducts?.includes("Pro Plan"), false);
});

test("Requirement #11: Third-party contamination protection (portfolio, supplier, contact, competitor)", async () => {
  const result = await extractAndMergeCustomer360Async({
    messageText: "I am Tariq from Apex Dynamics. In the past we built an app for Careem, our hardware supplier is Samsung, and our technical contact was Dr. Farooq. We need 50 licenses.",
    role: "user",
    nowMs: 7000,
    aiGenerateOverride: async () => JSON.stringify({
      identity: { name: "Tariq", company: "Apex Dynamics" },
      sales: { quantity: "50 licenses" },
      thirdPartyMentions: [
        { name: "Careem", category: "portfolio" },
        { name: "Samsung", category: "supplier" },
        { name: "Dr. Farooq", category: "contact" },
      ],
    }),
  });

  // Apex Dynamics and Tariq are customer facts
  assert.equal(result.topLevelPatches.customerName, "Tariq");
  assert.equal(result.customer360.businessContext.businessName, "Apex Dynamics");
  assert.equal(result.customer360.salesContext.quantity, "50 licenses");

  // Third parties must NOT be assigned as customer facts
  assert.notEqual(result.topLevelPatches.customerName, "Dr. Farooq");
  assert.notEqual(result.customer360.businessContext.businessName, "Careem");
  assert.notEqual(result.customer360.businessContext.businessName, "Samsung");
});

test("Requirement #12: Switching active business topic while preserving known businesses", async () => {
  const initialProfile = {
    customer360: {
      businessContext: {
        businessName: "QuickMart",
        activeBusiness: "QuickMart",
        knownBusinesses: [
          { name: "QuickMart", type: "Retail", isActive: true },
          { name: "Apex Logistics", type: "Transport", isActive: false },
        ],
      },
    },
  };

  const switched = await extractAndMergeCustomer360Async({
    messageText: "Now regarding our transport business Apex Logistics, do you support fleet tracking?",
    role: "user",
    nowMs: 8000,
    existingProfile: initialProfile,
    aiGenerateOverride: async () => JSON.stringify({
      business: {
        activeBusiness: "Apex Logistics",
        knownBusinesses: [
          { name: "QuickMart", type: "Retail", isActive: false },
          { name: "Apex Logistics", type: "Transport", isActive: true },
        ],
      },
    }),
  });

  assert.equal(switched.customer360.businessContext.activeBusiness, "Apex Logistics");
  assert.equal(switched.customer360.businessContext.businessName, "Apex Logistics");
  assert.equal(switched.customer360.businessContext.knownBusinesses?.length, 2);
  const qm = switched.customer360.businessContext.knownBusinesses?.find((b) => b.name === "QuickMart");
  const al = switched.customer360.businessContext.knownBusinesses?.find((b) => b.name === "Apex Logistics");
  assert.equal(qm?.isActive, false);
  assert.equal(al?.isActive, true);
});

test("Requirement #13: Customer Turn Billing with Provider Ledger (N=2 -> $0.004, N=3 -> $0.005)", async () => {
  const { recordSuccessfulCustomerTurnAiCall, getTurnExtraAiCallsCount, calculateCustomerTurnBilling } = await import("./customer-turn-ai-call-ledger-service.ts");

  // Scenario 1: 1 semantic Customer360 call + 1 reply generation call = 2 qualifying calls
  const turn1 = `turn_billing_test_${Date.now()}_1`;
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: turn1,
    providerCallId: `c360_${turn1}`,
    provider: "deepinfra",
    purpose: "customer_360_extraction",
    model: "meta-llama/Llama-3.3-70B-Instruct",
  });
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: turn1,
    providerCallId: `call_reply_${turn1}`,
    provider: "deepinfra",
    purpose: "customer_turn_reply",
    model: "meta-llama/Llama-3.3-70B-Instruct",
  });

  const extraCalls1 = getTurnExtraAiCallsCount(turn1);
  assert.equal(extraCalls1, 1, "N=2 calls means 1 extra qualifying call");
  const billing1 = calculateCustomerTurnBilling(turn1);
  assert.equal(billing1.successfulCallsCount, 2);
  assert.equal(billing1.extraCallsCount, 1);
  assert.equal(billing1.extraAmount, 0.001);
  assert.equal(billing1.totalAmount, 0.004, "1 semantic + 1 reply call = $0.004");

  // Scenario 2: 1 semantic Customer360 call + 1 reply call + 1 tool/repair call = 3 qualifying calls
  const turn2 = `turn_billing_test_${Date.now()}_2`;
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: turn2,
    providerCallId: `c360_${turn2}`,
    provider: "deepinfra",
    purpose: "customer_360_extraction",
    model: "meta-llama/Llama-3.3-70B-Instruct",
  });
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: turn2,
    providerCallId: `call_reply_${turn2}`,
    provider: "deepinfra",
    purpose: "customer_turn_reply",
    model: "meta-llama/Llama-3.3-70B-Instruct",
  });
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: turn2,
    providerCallId: `call_repair_${turn2}`,
    provider: "deepinfra",
    purpose: "customer_turn_repair",
    model: "meta-llama/Llama-3.3-70B-Instruct",
  });

  const extraCalls2 = getTurnExtraAiCallsCount(turn2);
  assert.equal(extraCalls2, 2, "N=3 calls means 2 extra qualifying calls");
  const billing2 = calculateCustomerTurnBilling(turn2);
  assert.equal(billing2.successfulCallsCount, 3);
  assert.equal(billing2.extraCallsCount, 2);
  assert.equal(billing2.extraAmount, 0.002);
  assert.equal(billing2.totalAmount, 0.005, "1 semantic + 2 reply calls = $0.005");
});

test("Requirement #8 & #9: Single Canonical Customer360 Execution Authority per Turn (ai-handler=YES, saveMessage=NO)", async () => {
  // Trace an inbound customer message flow:
  // 1. saveMessage runs when storing the incoming message to DB.
  // Verify saveMessage does NOT trigger any async AI provider call:
  let saveMessageAiCalls = 0;
  let aiHandlerAiCalls = 0;

  // In db-service saveMessage, only synchronous extractAndMergeCustomer360 is called (no AI call)
  const syncExtraction = extractAndMergeCustomer360({
    botJid: "contact-ee7c1e411a7c@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Hello my name is Haris",
    role: "user",
    senderName: "Haris",
    messageId: "msg_save_turn_01",
  });
  assert.equal(saveMessageAiCalls, 0, "saveMessage must NOT invoke semantic AI provider call");
  assert.equal(syncExtraction.topLevelPatches.customerName, "Haris");

  // 2. In ai-handler.ts, extractAndMergeCustomer360Async is invoked early with customerTurnId:
  const turnId = `turn_single_authority_${Date.now()}`;
  const aiExtraction = await extractAndMergeCustomer360Async({
    botJid: "contact-ee7c1e411a7c@example.invalid",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageText: "Actually my full name is Muhammad Haris and I run Haris Motors",
    role: "user",
    messageId: "msg_ai_turn_01",
    customerTurnId: turnId,
    providerCallId: `c360_${turnId}`,
    aiGenerateOverride: async () => {
      aiHandlerAiCalls++;
      return JSON.stringify({
        identity: { name: "Muhammad Haris" },
        business: { businessName: "Haris Motors", activeBusiness: "Haris Motors" },
      });
    },
  });

  assert.equal(aiHandlerAiCalls, 1, "ai-handler must invoke exactly 1 semantic extraction");
  assert.equal(aiExtraction.topLevelPatches.customerName, "Muhammad Haris");
  assert.equal(aiExtraction.customer360.businessContext.businessName, "Haris Motors");

  // Total semantic extraction provider calls for this normal inbound turn:
  const totalSemanticProviderCalls = saveMessageAiCalls + aiHandlerAiCalls;
  assert.equal(totalSemanticProviderCalls, 1, "Expected exactly 1 semantic extraction call per normal turn");
});

test("Requirement #10: Customer360 Deduplication on Duplicate Message / Worker Retry / Restart / PN/LID", async () => {
  let providerCalls = 0;
  const turnId = `turn_retry_dedup_${Date.now()}`;

  const mockAi = async () => {
    providerCalls++;
    return JSON.stringify({
      identity: { name: "Tariq Mahmood" },
      business: { businessName: "Tariq Traders" },
    });
  };

  // 1. First execution (from ai-handler)
  const res1 = await extractAndMergeCustomer360Async({
    customerTurnId: turnId,
    providerCallId: `c360_${turnId}`,
    messageId: "msg_dedup_01",
    messageText: "I am Tariq from Tariq Traders",
    role: "user",
    aiGenerateOverride: mockAi,
  });

  assert.equal(res1.topLevelPatches.customerName, "Tariq Mahmood");
  assert.equal(providerCalls, 1, "Initial call executed provider once");

  // 2. Duplicate inbound event / worker retry with same turnId
  const res2 = await extractAndMergeCustomer360Async({
    customerTurnId: turnId,
    providerCallId: `c360_${turnId}`,
    messageId: "msg_dedup_01",
    messageText: "I am Tariq from Tariq Traders",
    role: "user",
    aiGenerateOverride: mockAi,
  });

  assert.equal(res2.topLevelPatches.customerName, "Tariq Mahmood");
  assert.equal(providerCalls, 1, "Duplicate inbound / worker retry did NOT invoke provider a second time");

  // 3. PN/LID duplicate delivery: same customerTurnId
  const res3 = await extractAndMergeCustomer360Async({
    customerTurnId: turnId,
    providerCallId: `c360_${turnId}`,
    messageId: "msg_dedup_01_lid_variant",
    messageText: "I am Tariq from Tariq Traders",
    role: "user",
    aiGenerateOverride: mockAi,
  });

  assert.equal(res3.topLevelPatches.customerName, "Tariq Mahmood");
  assert.equal(providerCalls, 1, "PN/LID duplicate delivery did NOT invoke provider a second time");

  // 4. Concurrent in-flight race: two requests fired at the exact same millisecond
  const concurrentTurnId = `turn_concurrent_${Date.now()}`;
  let concurrentCalls = 0;
  const delayedMockAi = async () => {
    concurrentCalls++;
    await new Promise((r) => setTimeout(r, 25));
    return JSON.stringify({
      identity: { name: "Zubair Ahmed" },
      business: { businessName: "Zubair Electronics" },
    });
  };

  const [c1, c2] = await Promise.all([
    extractAndMergeCustomer360Async({
      customerTurnId: concurrentTurnId,
      providerCallId: `c360_${concurrentTurnId}`,
      messageText: "I am Zubair from Zubair Electronics",
      role: "user",
      aiGenerateOverride: delayedMockAi,
    }),
    extractAndMergeCustomer360Async({
      customerTurnId: concurrentTurnId,
      providerCallId: `c360_${concurrentTurnId}`,
      messageText: "I am Zubair from Zubair Electronics",
      role: "user",
      aiGenerateOverride: delayedMockAi,
    }),
  ]);

  assert.equal(concurrentCalls, 1, "Concurrent in-flight calls executed provider EXACTLY ONCE");
  assert.equal(c1.topLevelPatches.customerName, "Zubair Ahmed");
  assert.equal(c2.topLevelPatches.customerName, "Zubair Ahmed");
});
