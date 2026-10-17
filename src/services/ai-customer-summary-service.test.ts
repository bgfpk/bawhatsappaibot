import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomerChatSummaryWithAiFallback,
  renderAiCustomerSummaryJson,
} from "./ai-customer-summary-service.ts";

test("AI summary valid JSON renders clean Phase 1 admin sections", () => {
  const rendered = renderAiCustomerSummaryJson({
    currentStatus: ["Name: Muhammad Jamal", "Phone: 03001234567", "Product: Bike cover"],
    orderLeadState: "Awaiting address",
    languagePreference: "Urdu/Roman Urdu",
    conversationTimeline: ["Customer asked price.", "AI shared available color options."],
    nextBestAction: ["Ask only for complete address."],
    privateNotes: ["Customer requested grey color only."],
  });

  assert.match(rendered, /Current Status:/);
  assert.match(rendered, /Conversation Timeline:/);
  assert.match(rendered, /Lead\/Order Details:/);
  assert.match(rendered, /Next Best Action:/);
  assert.match(rendered, /Private Notes:/);
  assert.doesNotMatch(rendered, /Muhammad Jamal/);
  assert.doesNotMatch(rendered, /03001234567/);
  assert.match(rendered, /Urdu\/Roman Urdu/);
  assert.equal((rendered.match(/Current Status:/g) || []).length <= 1, true);
});

test("AI summary failure falls back to software summary", async () => {
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: "",
    softwareSummary: "Current:\n- Product: Starter Plan\nPending / Next step:\n- Ask for phone",
  }, {
    generateJson: async () => { throw new Error("provider down"); },
  });

  assert.equal(result.source, "software_fallback");
  assert.match(result.summary, /Product: Starter Plan/);
  assert.match(result.summary, /Ask for phone/);
});

test("invalid JSON retries once and succeeds with compact AI summary", async () => {
  let calls = 0;
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: "",
    softwareSummary: "Current:\n- Status: generic fallback",
  }, {
    generateJson: async () => {
      calls += 1;
      if (calls === 1) return "{ invalid";
      return {
        currentFacts: ["Interest: Growth plan", "Status: interested in trial/pricing details"],
        timeline: ["Customer asked about plans.", "Customer said he is interested in Growth."],
        pendingNextStep: ["Ask whether customer wants the 7-day free trial."],
        notes: ["Do not ask business type again unless needed for setup."],
        languagePreference: "English",
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "ai");
  assert.match(result.summary, /Growth plan/i);
  assert.match(result.summary, /7-day free trial/i);
});

test("truncated JSON retries once and succeeds", async () => {
  let calls = 0;
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: "",
    softwareSummary: "Current:\n- Status: fallback",
  }, {
    generateJson: async () => {
      calls += 1;
      if (calls === 1) throw new Error("truncated_ai_summary_json");
      return {
        currentFacts: ["Name: Ahad Firdosi", "Interest: BlackArrow Growth plan"],
        timeline: ["Customer asked what services BlackArrow provides."],
        pendingNextStep: ["Ask whether customer wants the 7-day free trial."],
        notes: [],
        languagePreference: "English",
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "ai");
  assert.doesNotMatch(result.summary, /Ahad Firdosi/);
  assert.match(result.summary, /Growth plan/i);
});

test("retry failure falls back after second invalid JSON", async () => {
  let calls = 0;
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: "",
    softwareSummary: "Current:\n- Product: Starter Plan\nPending / Next step:\n- Ask for phone",
  }, {
    generateJson: async () => {
      calls += 1;
      return "{ invalid";
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "software_fallback");
  assert.match(result.summary, /Starter Plan/);
});

test("old important facts are preserved during AI summary refresh", async () => {
  const existingSummary = [
    "Current:",
    "- Business/use case: clinic, doctor timings, patient questions, appointment booking",
    "- Language preference: Urdu/Roman Urdu",
    "",
    "Notes:",
    "- Do not ask business type again.",
  ].join("\n");

  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary,
    softwareSummary: "Current:\n- Status: pricing explained",
  }, {
    generateJson: async () => ({
      currentFacts: ["Status: trial interested"],
      timeline: ["AI explained pricing."],
      pendingNextStep: ["Explain setup."],
    }),
  });

  assert.equal(result.source, "ai");
  assert.match(result.summary, /clinic/i);
  assert.match(result.summary, /doctor timings/i);
  assert.match(result.summary, /appointment/i);
  assert.match(result.summary, /Urdu\/Roman Urdu/i);
  assert.match(result.summary, /Do not ask business type again/i);
});

test("AI summary rejects fake values and duplicate Current sections", () => {
  const rendered = renderAiCustomerSummaryJson({
    currentFacts: ["Current: - Current: - Name: ji", "City: unknown city", "Phone: 03348309310"],
    timeline: ["Customer: full transcript line should not be pasted", "Customer shared phone number."],
    pendingNextStep: ["Ask for delivery address."],
  });

  assert.equal((rendered.match(/Current Status:/g) || []).length <= 1, true);
  assert.doesNotMatch(rendered, /\bji\b/i);
  assert.doesNotMatch(rendered, /unknown city/i);
  assert.doesNotMatch(rendered, /Customer:/i);
  assert.doesNotMatch(rendered, /03348309310/);
});

test("AI summary safely normalizes object values without rendering object noise", () => {
  const rendered = renderAiCustomerSummaryJson({
    currentFacts: [{ text: "Name: Ahad Firdosi" }, { label: "Interest: Growth plan" }],
    businessOrUseCase: ["WhatsApp automation", { description: "AI replies and follow-ups" }],
    orderLeadState: { status: "Interested in trial/pricing details" },
    timeline: [{ summary: "Customer asked what services BlackArrow provides." }],
    pendingNextStep: [{ value: "Ask whether customer wants the 7-day free trial." }],
    notes: [{ detail: "Do not ask business type again unless needed for setup." }],
    languagePreference: { value: "English" },
  });

  assert.doesNotMatch(rendered, /\[object object\]/i);
  assert.doesNotMatch(rendered, /Ahad Firdosi/);
  assert.match(rendered, /Growth plan/i);
  assert.match(rendered, /Interested in trial\/pricing details/i);
});

test("AI summary normalizes missing array fields before rendering", () => {
  const rendered = renderAiCustomerSummaryJson({
    currentFacts: undefined,
    conversationTimeline: undefined,
    nextBestAction: undefined,
    privateNotes: undefined,
    businessOrUseCase: "WhatsApp automation",
    productOrServiceInterest: "Growth plan",
  });

  assert.match(rendered, /Business\/use case: WhatsApp automation/i);
  assert.match(rendered, /Interest: Growth plan/i);
});

test("AI summary fallback handles malformed old summary and empty message list", async () => {
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: { currentFacts: undefined, timeline: "legacy bad value" } as any,
    history: [],
    softwareSummary: "Current:\n- Interest: BlackArrow setup\nPending / Next step:\n- Ask whether customer wants a setup walkthrough.",
  }, {
    generateJson: async () => { throw new Error("provider down"); },
  });

  assert.equal(result.source, "software_fallback");
  assert.match(result.summary, /BlackArrow setup/i);
  assert.match(result.summary, /setup walkthrough/i);
  assert.doesNotMatch(result.summary, /\[object object\]/i);
});

test("AI summary preserves clinic use case and Roman Urdu preference", async () => {
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: "",
    softwareSummary: "",
  }, {
    generateJson: async () => ({
      businessOrUseCase: "clinic; doctor timings and appointment booking",
      languagePreference: "Roman Urdu",
      doNotAskAgain: ["business type"],
      pendingNextStep: ["Ask only for appointment date."],
    }),
  });

  assert.match(result.summary, /clinic/i);
  assert.match(result.summary, /doctor timings/i);
  assert.match(result.summary, /appointment/i);
  assert.match(result.summary, /Roman Urdu/i);
  assert.match(result.summary, /business type/i);
});

test("Growth plan example produces useful AI summary instead of old generic fallback lines", async () => {
  const result = await buildCustomerChatSummaryWithAiFallback({
    existingSummary: [
      "Current:",
      "- Name: Ahad Firdosi",
      "- Phone: 923066935544",
      "- Status: human review",
      "- Delivery: N/A",
      "- Language: english",
      "",
      "Timeline:",
      "- Customer asked for media/check details.",
      "- AI replied with sales/support guidance.",
      "- AI shared price or option details.",
    ].join("\n"),
    softwareSummary: [
      "Current:",
      "- Name: Ahad Firdosi",
      "- Phone: 923066935544",
      "",
      "Timeline:",
      "- Customer asked for media/check details.",
      "- AI replied with sales/support guidance.",
      "- AI shared price or option details.",
    ].join("\n"),
  }, {
    generateJson: async () => ({
      currentFacts: [
        "Name: Ahad Firdosi",
        "Phone: 923066935544",
        "Interest: BlackArrow Growth plan",
        "Status: interested in trial/pricing details",
      ],
      timeline: [
        "Customer asked what services BlackArrow provides.",
        "AI explained WhatsApp automation, AI replies, media/voice understanding, product/order data, templates, sequences, admin alerts, courier integrations, and follow-ups.",
        "Customer asked about plans and pricing.",
        "AI explained Starter, Growth, Pro, annual pricing, and 7-day trial with $1 AI test credit.",
        "Customer said he is interested in Growth.",
        "AI explained Growth plan features.",
      ],
      pendingNextStep: [
        "Ask whether customer wants to start the 7-day free trial or has questions about Growth features.",
      ],
      notes: ["Do not ask business type again unless needed for setup."],
      languagePreference: "English",
      doNotAskAgain: ["business type"],
    }),
  });

  assert.equal(result.source, "ai");
  assert.match(result.summary, /Interest: BlackArrow Growth plan/i);
  assert.match(result.summary, /Customer asked what services BlackArrow provides/i);
  assert.match(result.summary, /Customer asked about plans and pricing/i);
  assert.match(result.summary, /7-day free trial/i);
  assert.doesNotMatch(result.summary, /Customer asked for media\/check details/i);
  assert.doesNotMatch(result.summary, /AI replied with sales\/support guidance/i);
  assert.doesNotMatch(result.summary, /AI shared price or option details/i);
});
