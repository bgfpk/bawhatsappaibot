import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomerBotPromptAssembly } from "./customer-bot-prompt-service.ts";
import { logGeminiCacheTelemetry } from "./gemini-cache-service.ts";
import { sanitizeSmartBrainResult } from "./universal-smart-conversation-brain-service.ts";

function buildPromptInput(overrides: Partial<any> = {}) {
  return {
    userConfig: {
      bot_name: "Ayla",
      business_type: "fashion",
      preferred_language: "english",
      bot_gender: "female",
      bot_voice: "Aoede",
    },
    basePrompt: "Be helpful. Mention delivery timelines only when known.",
    learnedRulesText: "Refunds need manager review.\nOffer size help before asking for an order.",
    instanceCustomFields: [
      { name: "Size", instructions: "Ask only if not already clear." },
      { name: "Color", instructions: "Confirm selected color before save." },
    ],
    instanceReplyBehavior: "text_preferred",
    products: [
      {
        id: "p2",
        name: "Zara Dress",
        sku: "ZD-02",
        description: "Silk evening dress",
        base_price: 4500,
        stock: 4,
        variations: [
          { name: "Color", options: [{ name: "Black", sku: "ZD-02-BLK", stock: 2, price: 4500 }] },
        ],
      },
      {
        id: "p1",
        name: "Aster Suit",
        sku: "AS-01",
        description: "Formal stitched suit",
        base_price: 3800,
        stock: 7,
        variations: [
          { name: "Size", options: [{ name: "Medium", sku: "AS-01-M", stock: 3, price: 3800 }] },
        ],
      },
    ],
    cachedMediaTemplates: [
      { caption: "bridal collection photos" },
      { caption: "summer lawn video" },
    ],
    cachedKeywordSequences: {
      z_last: { config: { name: "Summer Lawn", shortcut_code: "summer_lawn", instructions: "Send when user wants lawn suits.", trigger_keywords: ["lawn"] }, templates: [{}] },
      a_first: { config: { name: "Bridal Set", shortcut_code: "bridal_set", instructions: "Send when user wants bridal outfits.", trigger_keywords: ["bridal"] }, templates: [{}] },
    },
    languagePreference: { language: "english", preferredLanguage: "english" },
    effectiveProfile: {
      customerPhone: "195545134641",
      trackingId: "TRK-1",
      customerReplyPreference: "text_only",
      seq_sent_summer_lawn: true,
    },
    savedDeliveryName: "Sara",
    replyBehavior: "text_only",
    personaPreference: { personaGender: "female", voiceGender: "female", selectedVoice: "Aoede" },
    effectiveChatSummary: "Customer likes formal wear and asked about delivery.",
    customerInstructions: "Prefers stitched suits first.",
    lastUserMsgText: "Show me formal black options",
    lastUserMsgIsVoice: false,
    lastUserMsgHasImage: false,
    aiMessagesCount: 8,
    sequenceBlockReason: "",
    ...overrides,
  };
}

function guidanceSection(dynamicContext: string) {
  const marker = "=== DYNAMIC SMART CONVERSATION GUIDANCE ===";
  const start = dynamicContext.indexOf(marker);
  if (start < 0) return "";
  return dynamicContext.slice(start);
}

test("stable business prompt stays identical across customer-specific changes", () => {
  const first = buildCustomerBotPromptAssembly(buildPromptInput());
  const second = buildCustomerBotPromptAssembly(buildPromptInput({
    effectiveProfile: {
      customerPhone: "106753021472",
      trackingId: "TRK-9",
      customerReplyPreference: "voice_only",
      seq_sent_summer_lawn: false,
    },
    savedDeliveryName: "Areeba",
    replyBehavior: "voice_only",
    effectiveChatSummary: "Customer asked for voice replies and tracking help.",
    customerInstructions: "Keep it short.",
    lastUserMsgText: "Please send voice note",
    lastUserMsgIsVoice: true,
    aiMessagesCount: 12,
  }));

  assert.equal(first.stablePrefixHash, second.stablePrefixHash);
  assert.equal(first.stablePrefix, second.stablePrefix);
  assert.notEqual(first.dynamicContext, second.dynamicContext);
  assert.ok(!first.stablePrefix.includes("195545134641"));
  assert.ok(!first.stablePrefix.includes("Show me formal black options"));
});

test("stable prefix changes when catalog changes", () => {
  const first = buildCustomerBotPromptAssembly(buildPromptInput());
  const second = buildCustomerBotPromptAssembly(buildPromptInput({
    products: [
      ...buildPromptInput().products,
      {
        id: "p3",
        name: "Cotton Kurti",
        sku: "CK-10",
        description: "Daily wear kurti",
        base_price: 2100,
        stock: 9,
        variations: [],
      },
    ],
  }));

  assert.notEqual(first.stablePrefixHash, second.stablePrefixHash);
});

test("stable sections are ordered before dynamic sections and sorted deterministically", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput());

  assert.ok(result.stablePrefix.includes("=== STABLE GLOBAL SYSTEM ==="));
  assert.ok(result.stablePrefix.includes("=== STABLE BUSINESS ==="));
  assert.ok(result.stablePrefix.includes("=== STABLE CATALOG ==="));
  assert.ok(result.stablePrefix.includes("=== STABLE REUSABLE CONTENT INDEX ==="));
  assert.ok(result.dynamicContext.includes("=== DYNAMIC CUSTOMER ==="));
  assert.ok(result.dynamicContext.includes("=== DYNAMIC CONVERSATION ==="));

  const catalogIndex = result.stablePrefix.indexOf("Item: Aster Suit");
  const secondCatalogIndex = result.stablePrefix.indexOf("Item: Zara Dress");
  assert.ok(catalogIndex >= 0 && secondCatalogIndex > catalogIndex);

  const bridalIndex = result.stablePrefix.indexOf("Sequence: Bridal Set");
  const lawnIndex = result.stablePrefix.indexOf("Sequence: Summer Lawn");
  assert.ok(bridalIndex >= 0 && lawnIndex > bridalIndex);
});

test("AI reply prompt includes saved summary and memory rules before generating response", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    effectiveChatSummary: [
      "Current:",
      "- Business/use case: clinic, doctor timings, patient questions, appointment booking",
      "- Language preference: Urdu/Roman Urdu",
      "",
      "Notes:",
      "- Do not ask business type again.",
    ].join("\n"),
  }));

  assert.match(result.stablePrefix, /Customer memory rules:/);
  assert.match(result.stablePrefix, /Do not ask for business type/i);
  assert.match(result.dynamicContext, /Customer summary:/);
  assert.match(result.dynamicContext, /clinic, doctor timings/i);
  assert.match(result.dynamicContext, /Urdu\/Roman Urdu/i);
});

test("AI reply prompt includes current business date/time and timezone", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    userConfig: {
      ...buildPromptInput().userConfig,
      business_timezone: "Asia/Dubai",
    },
  }));

  assert.match(result.dynamicContext, /Current business date\/time:/);
  assert.match(result.dynamicContext, /Business timezone: Asia\/Dubai/);
  assert.match(result.dynamicContext, /Do not infer time from the server timezone/);
  assert.ok(!result.stablePrefix.includes("Current business date/time:"));
});

test("AI reply prompt includes limited website knowledge in dynamic context only", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    websiteKnowledgeText: [
      "Website Knowledge from synced WordPress content.",
      "1. Return Policy (page)",
      "URL: https://shop.example.com/returns",
      "Snippet: Returns are accepted within seven days for unused products.",
    ].join("\n"),
  }));

  assert.match(result.dynamicContext, /DYNAMIC WEBSITE KNOWLEDGE/);
  assert.match(result.dynamicContext, /Return Policy/);
  assert.doesNotMatch(result.stablePrefix, /Return Policy/);
});

test("business instructions are not compacted out of the AI prompt context", () => {
  const drInstructions = [
    "Role: You are Dr. Ihsan Karim clinic booking assistant.",
    "Doctor info: Dr. Ihsan Karim handles orthopedic consultations.",
    "Timing: Ask preferred day and time before promising a slot.",
    "Fee/payment: Consultation fee is 3000 PKR and payment must be made before confirmation.",
    "Location exact reply: Clinic is at Main Boulevard, Lahore near Liberty.",
    "Booking details: collect patient name, phone, age, issue, and preferred slot.",
    "Payment proof rule: ask for a payment screenshot before marking booking confirmed.",
    "Safety rules: do not diagnose emergency cases; direct urgent patients to emergency care.",
    "Conversation behavior: be polite, concise, and do not invent doctor availability.",
  ].join("\n");

  const result = buildCustomerBotPromptAssembly(buildPromptInput({ basePrompt: drInstructions }));

  assert.match(result.stablePrefix, /Dr\. Ihsan Karim clinic booking assistant/);
  assert.match(result.stablePrefix, /Consultation fee is 3000 PKR/);
  assert.match(result.stablePrefix, /Clinic is at Main Boulevard, Lahore near Liberty/);
  assert.match(result.stablePrefix, /payment screenshot/);
  assert.match(result.stablePrefix, /direct urgent patients to emergency care/);
  assert.match(result.stablePrefix, /do not invent doctor availability/);
});

test("custom plan school conversation prompt includes qualification guidance", () => {
  const assembly = buildCustomerBotPromptAssembly(buildPromptInput({
    userConfig: { business_type: "service", bot_name: "BlackArrow" },
    basePrompt: "We sell BlackArrow subscriptions and custom plans.",
    lastUserMsgText: "I need custom plan for school parent attendance homework messages",
  }));

  assert.match(assembly.stablePrefix, /Custom plan handling/i);
  assert.match(assembly.stablePrefix, /number of customers\/parents\/students\/leads/i);
  assert.match(assembly.stablePrefix, /School use cases are service\/communication leads/i);
});

test("customer bot prompt stays training-first without fixed fallback wording", () => {
  const assembly = buildCustomerBotPromptAssembly(buildPromptInput());

  assert.match(assembly.stablePrefix, /Reply according to the business training\/instructions, catalog, templates, and recent relevant customer context/i);
  assert.match(assembly.stablePrefix, /If an exact business-specific answer is not available in the training\/context, do not invent the exact fact/i);
  assert.match(assembly.stablePrefix, /Do not use fixed fallback lines/i);
  assert.doesNotMatch(assembly.stablePrefix, /I can see the earlier reply was not clear enough/i);
  assert.doesNotMatch(assembly.stablePrefix, /This needs confirmation from the team/i);
});

test("cache telemetry log does not include full customer message or phone number", () => {
  const prompt = buildCustomerBotPromptAssembly(buildPromptInput());
  const response = {
    usageMetadata: {
      promptTokenCount: 6930,
      candidatesTokenCount: 110,
      cachedContentTokenCount: 0,
    },
  };

  const emitted: any[] = [];
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (value?: any) => {
    logs.push(String(value || ""));
  };

  try {
    logGeminiCacheTelemetry(response, { emit: (_event: string, payload: any) => emitted.push(payload) }, "customer-bot", {
      model: "gemini-2.5-flash",
      botId: "bot_123",
      stablePrefixHash: prompt.stablePrefixHash,
      stablePrefixLength: prompt.stablePrefixLength,
      stablePrefixTokenEstimate: prompt.stablePrefixTokenEstimate,
      explicitCacheEnabled: true,
      explicitCacheUsed: true,
      explicitCacheCreated: false,
      explicitCacheNameShort: "abc123456789",
    });
  } finally {
    console.log = originalLog;
  }

  const combined = `${logs.join("\n")}\n${emitted.map((item) => item.msg).join("\n")}`;
  assert.ok(combined.includes("stableHash="));
  assert.ok(combined.includes("explicit=true"));
  assert.ok(combined.includes("used=true"));
  assert.ok(combined.includes("cached=0"));
  assert.ok(!combined.includes("195545134641"));
  assert.ok(!combined.includes("Show me formal black options"));
});

test("Smart Brain advisory guidance appears only when provided", () => {
  const withoutGuidance = buildCustomerBotPromptAssembly(buildPromptInput());
  assert.ok(!withoutGuidance.dynamicContext.includes("Smart Conversation Guidance"));

  const withGuidance = buildCustomerBotPromptAssembly(buildPromptInput({
    smartConversationGuidance: sanitizeSmartBrainResult({
      business_type: "service",
      intent: "service_quote",
      stage: "interested",
      risk_level: "medium",
      lead_quality: "warm",
      next_best_action: "ask_one_field",
      recommended_reply_style: "qualifying",
      missing_required_fields: ["Location"],
      facts_to_use: ["Customer needs office cleaning"],
      facts_to_avoid: ["Do not promise exact quote"],
      confidence: 0.9,
    }),
  }));
  assert.match(withGuidance.dynamicContext, /Smart Conversation Guidance \(advisory, not source of truth\)/);
  assert.match(withGuidance.dynamicContext, /"intent":"service_quote"/);
});

test("Smart Brain guidance is advisory and verified facts override it", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    smartConversationGuidance: sanitizeSmartBrainResult({
      business_type: "ecommerce",
      intent: "product",
      stage: "interested",
      risk_level: "low",
      lead_quality: "warm",
      next_best_action: "answer",
      recommended_reply_style: "concise",
      confidence: 0.9,
    }),
  }));
  const section = guidanceSection(result.dynamicContext);
  assert.match(section, /Use this guidance only as helpful context/);
  assert.match(section, /Verified business data, catalog, order state, policies, and customer messages override this guidance/);
  assert.match(section, /If guidance conflicts with verified facts, ignore guidance/);
  assert.match(section, /Do not invent prices, stock, fees, medical advice, admission approval, exact quotes, or guaranteed results/);
});

test("Smart Brain guidance does not include full Brain JSON or cache metadata", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    smartConversationGuidance: sanitizeSmartBrainResult({
      business_type: "school",
      intent: "admission",
      stage: "interested",
      risk_level: "low",
      lead_quality: "hot",
      next_best_action: "ask_one_field",
      recommended_reply_style: "qualifying",
      school_admission_context: { privateNote: "internal admission analysis" },
      confidence: 0.92,
      cache_context_key: "smart_brain:phase_c:school",
    }),
  }));
  const section = guidanceSection(result.dynamicContext);
  assert.ok(!section.includes("school_admission_context"));
  assert.ok(!section.includes("confidence"));
  assert.ok(!section.includes("cache_context_key"));
  assert.ok(!section.includes("internal admission analysis"));
});

test("Smart Brain guidance scrubs phone numbers and caps lists", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    smartConversationGuidance: sanitizeSmartBrainResult({
      business_type: "service",
      intent: "service_quote",
      stage: "interested",
      risk_level: "low",
      lead_quality: "warm",
      next_best_action: "ask_one_field",
      recommended_reply_style: "qualifying",
      missing_required_fields: ["Phone 03001234567", "Location", "Budget", "Urgency", "Project size", "Extra"],
      facts_to_use: ["Call 03001234567", "Office cleaning", "Evening preferred", "Lahore", "Extra fact"],
      facts_to_avoid: ["exact quote", "site visit promise", "discount", "guarantee", "extra avoid"],
      handoff_reason: "Customer phone 03001234567 should not leak",
      confidence: 0.9,
    }),
  }));
  const section = guidanceSection(result.dynamicContext);
  assert.ok(!section.includes("15811061380"));
  assert.match(section, /\[phone omitted\]/);
  const parsed = JSON.parse(section.match(/\{.*\}/s)?.[0] || "{}");
  assert.equal(parsed.missing_required_fields.length, 4);
  assert.equal(parsed.facts_to_use.length, 4);
  assert.equal(parsed.facts_to_avoid.length, 4);
});

test("prompt includes CRM-first facts before customer summary", () => {
  const result = buildCustomerBotPromptAssembly(buildPromptInput({
    crmFirstContext: "CRM/customer structured facts are the source of truth.\n{\"appointmentDate\":\"23 June\",\"appointmentTime\":\"2 PM\"}",
    effectiveChatSummary: "Loose summary says ask for appointment time again.",
  }));

  const crmIndex = result.dynamicContext.indexOf("CRM/customer structured facts (source of truth)");
  const summaryIndex = result.dynamicContext.indexOf("Customer summary:");
  assert.ok(crmIndex > -1);
  assert.ok(summaryIndex > crmIndex);
  assert.match(result.stablePrefix, /Never ask for details already present/i);
  assert.match(result.stablePrefix, /Never echo/i);
});
