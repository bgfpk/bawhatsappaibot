import test from "node:test";
import assert from "node:assert/strict";

import { buildAiSmartFollowupMessage, buildIncompleteLeadOrderFollowupQuestion, getAiSmartFollowupMissingDetails, isIncompleteAiSmartFollowup } from "./ai-smart-followup-service.ts";

test("AI smart follow-up blocks known truncated examples", () => {
  assert.equal(isIncompleteAiSmartFollowup("Hi Amjad, Hope you'"), true);
  assert.equal(isIncompleteAiSmartFollowup("Hi Saad, hope you're doing"), true);
  assert.equal(isIncompleteAiSmartFollowup("Hello! We noticed you were interested in"), true);
  assert.equal(isIncompleteAiSmartFollowup("Hi Salman, We can definitely"), true);
  assert.equal(isIncompleteAiSmartFollowup("Hello Maqbool Hussa Which"), true);
  assert.equal(isIncompleteAiSmartFollowup("Thanks for reaching out! To help"), true);
  assert.equal(isIncompleteAiSmartFollowup("Thanks for sharing about Bari Engineering!\n\nHow"), true);
});

test("AI smart follow-up accepts a short complete useful message", () => {
  assert.equal(isIncompleteAiSmartFollowup("Hi Saad, are you still interested in the order?"), false);
});

test("AI smart follow-up missing address fallback is complete and sendable", () => {
  const message = buildIncompleteLeadOrderFollowupQuestion({
    profile: { missingCustomFields: ["address"] },
    language: "roman_urdu",
  });
  assert.match(message, /address/i);
  assert.equal(isIncompleteAiSmartFollowup(message), false);
});

test("AI smart follow-up extracts missing required fields", () => {
  assert.deepEqual(getAiSmartFollowupMissingDetails({
    requiredCustomFields: ["Phone", "Address"],
    customFieldValues: { Phone: "+92 300 1112222" },
  }), ["Address"]);
});

test("AI smart follow-up extracts missing details from active record", () => {
  assert.deepEqual(getAiSmartFollowupMissingDetails({}, {
    order_data: {
      recordStatus: "incomplete",
      missingCustomFields: ["Delivery Address", "Phone"],
    },
  }), ["Delivery Address", "Phone"]);
});

test("AI smart follow-up fallback uses active record context instead of generic text", () => {
  const message = buildIncompleteLeadOrderFollowupQuestion({
    activeRecord: { productName: "Starter Plan" },
    language: "english",
  });

  assert.match(message, /Starter Plan/);
  assert.doesNotMatch(message, /complete this now/i);
  assert.equal(isIncompleteAiSmartFollowup(message), false);
});

test("AI smart follow-up text generation routes through backend text provider", async () => {
  const calls: any[] = [];
  const message = await buildAiSmartFollowupMessage({
    customer: { name: "Ahad" },
    profile: { customerName: "Ahad", lastMessage: "price?" },
    chatHistory: [{ role: "user", text: "price?" }],
    businessInstructions: "Answer pricing questions clearly.",
    campaignInstruction: "Ask whether they want to continue.",
    providerContext: { accountId: "acct_1", botId: "bot_1", billingContext: { customerJid: "contact-e4ed32210a80@example.invalid" } },
    textProviderGenerate: async (input: any) => {
      calls.push(input);
      return {
        text: "Hi Ahad, do you want to continue with the next step?",
        provider: "deepinfra",
        model: "deepseek-ai/DeepSeek-V4-Flash",
        promptTokens: 10,
        completionTokens: 8,
        cachedTokens: 0,
        estimatedCost: 0,
        requestStatus: "success",
        fallbackUsed: false,
        rawUsageSafe: {},
        latencyMs: 1,
        telemetry: {},
      };
    },
  });

  assert.equal(message, "Hi Ahad, do you want to continue with the next step?");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].purpose, "ai_smart_followup_generation");
  assert.equal(calls[0].accountId, "acct_1");
  assert.equal(calls[0].botId, "bot_1");
  assert.match(calls[0].stablePrompt, /BlackArrow writing a short WhatsApp follow-up/);
});

test("AI smart follow-up repairs incomplete DeepInfra output through backend text provider", async () => {
  const purposes: string[] = [];
  const message = await buildAiSmartFollowupMessage({
    customer: { name: "Ahad" },
    profile: { lastMessage: "mujhe detail chahiye" },
    chatHistory: [{ role: "user", text: "mujhe detail chahiye" }],
    textProviderGenerate: async (input: any) => {
      purposes.push(input.purpose);
      return {
        text: input.purpose === "ai_smart_followup_generation" ? "Hi Ahad, We can" : "Assalamualaikum, kya main aap ke liye next step continue kar dun?",
        provider: "deepinfra",
        model: "deepseek-ai/DeepSeek-V4-Flash",
        promptTokens: 1,
        completionTokens: 1,
        cachedTokens: 0,
        estimatedCost: 0,
        requestStatus: "success",
        fallbackUsed: false,
        rawUsageSafe: {},
        latencyMs: 1,
        telemetry: {},
      };
    },
  });

  assert.equal(message, "Assalamualaikum, kya main aap ke liye next step continue kar dun?");
  assert.deepEqual(purposes, ["ai_smart_followup_generation", "ai_smart_followup_repair"]);
});
