import test from "node:test";
import assert from "node:assert/strict";

import { wrapGeminiClientWithBackendTextProvider } from "./gemini-provider-service.ts";

function request(text: string, config: any = {}) {
  return {
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      systemInstruction: "Stable BlackArrow customer reply prompt",
      maxOutputTokens: 300,
      ...config,
    },
  };
}

async function withDeepInfraEnv(response: { ok?: boolean; text?: string; status?: number }, fn: () => Promise<void>) {
  const previousKey = process.env.DEEPINFRA_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPINFRA_API_KEY = "server_only_test_key";
  let calls = 0;
  (globalThis as any).fetch = async () => {
    calls += 1;
    return {
      ok: response.ok !== false,
      status: response.status || (response.ok === false ? 503 : 200),
      json: async () => ({
        choices: [{ message: { content: response.text ?? "DeepInfra customer reply" } }],
        usage: { prompt_tokens: 9, completion_tokens: 5, cached_tokens: 3 },
      }),
    } as any;
  };
  try {
    await fn();
  } finally {
    if (previousKey === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previousKey;
    (globalThis as any).fetch = previousFetch;
  }
  return calls;
}

async function captureLogs(fn: () => Promise<void>) {
  const previousInfo = console.info;
  const previousWarn = console.warn;
  const lines: string[] = [];
  console.info = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  console.warn = (...args: any[]) => { lines.push(args.map(String).join(" ")); };
  try {
    await fn();
  } finally {
    console.info = previousInfo;
    console.warn = previousWarn;
  }
  return lines.join("\n");
}

function wrappedBase(geminiText = "Gemini fallback reply") {
  let geminiCalls = 0;
  const baseAi = {
    models: {
      generateContent: async () => {
        geminiCalls += 1;
        return { text: geminiText, candidates: [{ content: { parts: [{ text: geminiText }] } }] };
      },
    },
  };
  const ai = wrapGeminiClientWithBackendTextProvider(baseAi, {
    provider: "platform_gemini",
    purpose: "customer_ai_reply",
    accountId: "acct_1",
    botId: "bot_1",
    billingContext: { customerJid: "contact-e4ed32210a80@example.invalid" },
  });
  return { ai, getGeminiCalls: () => geminiCalls };
}

test("primary runtime wrapper sends normal WhatsApp text-only reply to DeepInfra first", async () => {
  const { ai, getGeminiCalls } = wrappedBase();
  let result: any;
  const logs = await captureLogs(async () => {
    await withDeepInfraEnv({ text: "DeepInfra handled normal text." }, async () => {
      result = await ai.models.generateContent(request("AOA Kese hen ap?"));
    });
  });

  assert.equal(result.provider, "deepinfra");
  assert.equal(result.text, "DeepInfra handled normal text.");
  assert.equal(getGeminiCalls(), 0);
  assert.match(logs, /backend_text_provider_decision purpose=customer_ai_reply useDeepInfra=true/);
  assert.match(logs, /backend_text_provider_call provider=deepinfra/);
  assert.match(logs, /backend_text_provider_result provider=deepinfra/);
});

test("trivial ok text still reaches DeepInfra when AI reply is needed", async () => {
  const { ai, getGeminiCalls } = wrappedBase();
  await withDeepInfraEnv({ text: "Ji, main help kar raha hun. Aap kis cheez ke bare mein poochna chahte hain?" }, async () => {
    const result = await ai.models.generateContent(request("ok"));
    assert.equal(result.provider, "deepinfra");
    assert.match(result.text, /help|madad|poochna/i);
  });
  assert.equal(getGeminiCalls(), 0);
});

test("globally configured tools do not automatically force Gemini", async () => {
  const { ai, getGeminiCalls } = wrappedBase();
  await withDeepInfraEnv({ text: "Kis cheez ke liye help chahiye?" }, async () => {
    const result = await ai.models.generateContent(request("Kis ko?", {
      tools: [{ functionDeclarations: [{ name: "save_order" }, { name: "sendMediaFile" }] }],
    }));
    assert.equal(result.provider, "deepinfra");
  });
  assert.equal(getGeminiCalls(), 0);
});

test("actual tool-required text skips DeepInfra with gemini_tool_required", async () => {
  const { ai, getGeminiCalls } = wrappedBase("Gemini tool path");
  const logs = await captureLogs(async () => {
    await withDeepInfraEnv({ text: "should not be used" }, async () => {
      const result = await ai.models.generateContent(request("Please send photo of product", {
        tools: [{ functionDeclarations: [{ name: "sendMediaFile" }] }],
      }));
      assert.equal(result.text, "Gemini tool path");
    });
  });
  assert.equal(getGeminiCalls(), 1);
  assert.match(logs, /backend_text_provider_skipped provider=gemini skipReason=gemini_tool_required/);
});

test("media and audio stay on Gemini while text JSON stays on DeepInfra", async () => {
  const { ai, getGeminiCalls } = wrappedBase("Gemini path");
  await withDeepInfraEnv({ text: "json response" }, async () => {
    const media = await ai.models.generateContent({ model: "gemini", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: "abc" } }] }], config: { systemInstruction: "rules" } });
    const audio = await ai.models.generateContent({ model: "gemini", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/ogg", data: "abc" } }] }], config: { systemInstruction: "rules" } });
    const schema = await ai.models.generateContent(request("give json", { responseMimeType: "application/json" }));
    assert.equal(media.text, "Gemini path");
    assert.equal(audio.text, "Gemini path");
    assert.equal(schema.provider, "deepinfra");
    assert.equal(getGeminiCalls(), 2);
  });
});

test("missing DeepInfra key blocks Gemini text fallback", async () => {
  const previousKey = process.env.DEEPINFRA_API_KEY;
  delete process.env.DEEPINFRA_API_KEY;
  const { ai, getGeminiCalls } = wrappedBase("Gemini because missing key");
  const logs = await captureLogs(async () => {
    await assert.rejects(() => ai.models.generateContent(request("hello")), /deepinfra_unavailable_text_generation_blocked/);
  });
  if (previousKey === undefined) delete process.env.DEEPINFRA_API_KEY;
  else process.env.DEEPINFRA_API_KEY = previousKey;
  assert.equal(getGeminiCalls(), 0);
  assert.match(logs, /skipReason=provider_not_configured/);
});

test("DeepInfra failure blocks Gemini fallback and surfaces policy error", async () => {
  const { ai, getGeminiCalls } = wrappedBase("Gemini fallback once");
  const logs = await captureLogs(async () => {
    await withDeepInfraEnv({ ok: false, status: 503 }, async () => {
      await assert.rejects(() => ai.models.generateContent(request("hello")), /deepinfra_unavailable_text_generation_blocked/);
    });
  });
  assert.equal(getGeminiCalls(), 0);
  assert.match(logs, /deepinfra_unavailable_text_generation_blocked/);
});
