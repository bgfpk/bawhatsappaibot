import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  __clearGeminiMediaUnderstandingCacheForTests,
  __resetGeminiMediaUnderstandingTestDeps,
  __setGeminiMediaUnderstandingTestDeps,
  buildGeminiMediaRequest,
  generateGeminiMediaUnderstanding,
} from "./gemini-media-understanding-service.ts";

test("Gemini media understanding locks to Gemini 2.5 Flash and never uses Flash-Lite", async () => {
  const code = await fs.readFile(path.join(process.cwd(), "src/services/gemini-media-understanding-service.ts"), "utf-8");
  assert.match(code, /models\/gemini-2\.5-flash/);
  assert.doesNotMatch(code, /flash-lite/i);
});

test("Gemini media understanding builds minimal media-only request", async () => {
  const request = buildGeminiMediaRequest({
    purpose: "customer_ai_image_understanding",
    instruction: "Return JSON only",
    media: {
      kind: "image",
      buffer: Buffer.from("image"),
      mimeType: "image/jpeg",
    },
    responseMimeType: "application/json",
    maxOutputTokens: 220,
  });

  assert.equal(request.model, "models/gemini-2.5-flash");
  assert.equal(request.config.maxOutputTokens, 220);
  assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
  assert.equal("includeThoughts" in request.config, false);
  assert.match(JSON.stringify(request), /inlineData/);
});

test("Gemini media calls use lowest supported thinking setting for image and audio understanding", () => {
  const imageRequest = buildGeminiMediaRequest({
    purpose: "customer_ai_image_understanding",
    instruction: "Return JSON only",
    media: { kind: "image", buffer: Buffer.from("image"), mimeType: "image/jpeg" },
    maxOutputTokens: 220,
  });
  const audioRequest = buildGeminiMediaRequest({
    purpose: "customer_ai_audio_understanding",
    instruction: "Return JSON only",
    media: { kind: "audio", buffer: Buffer.from("audio"), mimeType: "audio/wav" },
    maxOutputTokens: 220,
  });

  assert.equal(imageRequest.config.thinkingConfig.thinkingBudget, 0);
  assert.equal(audioRequest.config.thinkingConfig.thinkingBudget, 0);
  assert.equal(JSON.stringify(imageRequest.config).includes("thoughtSummary"), false);
  assert.equal(JSON.stringify(audioRequest.config).includes("thoughtSummary"), false);
});

test("usage metadata logs thoughtTokens and estimated cost safely", async () => {
  const logs: string[] = [];
  __clearGeminiMediaUnderstandingCacheForTests();
  __setGeminiMediaUnderstandingTestDeps({
    logInfo: (message) => logs.push(message),
    logWarn: (message) => logs.push(message),
    createClient: async () => ({
      provider: "platform_gemini",
      ai: {
        models: {
          generateContent: async () => ({
            text: `{"useful":true,"summary":"ok"}`,
            candidates: [{ finishReason: "STOP", content: { parts: [{ text: `{"useful":true,"summary":"ok"}` }] } }],
            usageMetadata: {
              promptTokenCount: 419,
              candidatesTokenCount: 90,
              thoughtsTokenCount: 198,
              totalTokenCount: 707,
            },
          }),
        },
      },
    }) as any,
  });

  await generateGeminiMediaUnderstanding({
    purpose: "customer_ai_image_understanding",
    instruction: "Return JSON only",
    media: { kind: "image", buffer: Buffer.from("image"), mimeType: "image/jpeg" },
    providerContext: { botId: "bot_1", billingContext: { messageId: "msg_1", customerJid: "contact-d46626999a99@example.invalid" } },
    maxOutputTokens: 220,
  });

  assert.equal(logs.some((entry) => entry.includes("gemini_media_usage purpose=customer_ai_image_understanding inputTokens=419 outputTokens=90 thoughtTokens=198 totalTokens=707")), true);
  assert.equal(logs.some((entry) => entry.includes("gemini_media_cost_estimate purpose=customer_ai_image_understanding")), true);
  assert.equal(logs.some((entry) => entry.includes("gemini_media_cost_guard warning=high_thought_tokens purpose=customer_ai_image_understanding thoughtTokens=198")), true);
  __resetGeminiMediaUnderstandingTestDeps();
});

test("duplicate media message with same messageId media and purpose reuses result and does not call Gemini again", async () => {
  let calls = 0;
  __clearGeminiMediaUnderstandingCacheForTests();
  __setGeminiMediaUnderstandingTestDeps({
    createClient: async () => ({
      provider: "platform_gemini",
      ai: {
        models: {
          generateContent: async () => {
            calls += 1;
            return {
              text: `{"useful":true,"summary":"ok"}`,
              candidates: [{ finishReason: "STOP", content: { parts: [{ text: `{"useful":true,"summary":"ok"}` }] } }],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
            };
          },
        },
      },
    }) as any,
  });

  const request = {
    purpose: "customer_ai_image_understanding",
    instruction: "Return JSON only",
    media: { kind: "image" as const, buffer: Buffer.from("same-image"), mimeType: "image/jpeg" },
    providerContext: { botId: "bot_1", billingContext: { messageId: "msg_2", customerJid: "contact-d46626999a99@example.invalid" } },
    maxOutputTokens: 220,
  };
  const first = await generateGeminiMediaUnderstanding(request);
  const second = await generateGeminiMediaUnderstanding(request);

  assert.equal(calls, 1);
  assert.equal(first.text, second.text);
  __resetGeminiMediaUnderstandingTestDeps();
});

test("failed same-payload Gemini media request is not retried blindly", async () => {
  let calls = 0;
  __clearGeminiMediaUnderstandingCacheForTests();
  __setGeminiMediaUnderstandingTestDeps({
    createClient: async () => ({
      provider: "platform_gemini",
      ai: {
        models: {
          generateContent: async () => {
            calls += 1;
            throw new Error("provider_failed");
          },
        },
      },
    }) as any,
  });

  const request = {
    purpose: "customer_ai_audio_understanding",
    instruction: "Return JSON only",
    media: { kind: "audio" as const, buffer: Buffer.from("same-audio"), mimeType: "audio/wav" },
    providerContext: { botId: "bot_1", billingContext: { messageId: "msg_3", customerJid: "contact-d46626999a99@example.invalid" } },
    maxOutputTokens: 220,
  };
  const first = await generateGeminiMediaUnderstanding(request);
  const second = await generateGeminiMediaUnderstanding(request);

  assert.equal(first.requestStatus, "failed");
  assert.equal(second.requestStatus, "failed");
  assert.equal(calls, 1);
  __resetGeminiMediaUnderstandingTestDeps();
});
