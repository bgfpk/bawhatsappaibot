import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCacheAwareGeminiRequest,
  generateWithClientGeminiCacheAware,
} from "./client-gemini-cache-aware-generation-service.ts";
import {
  __resetGeminiExplicitCacheTestDeps,
  __setGeminiExplicitCacheTestDeps,
} from "./gemini-explicit-cache-service.ts";
import {
  __resetClientGeminiBillingTestDeps,
  __setClientGeminiBillingTestDeps,
} from "./client-gemini-billing-service.ts";
import {
  __resetClientGeminiCacheTelemetryTestDeps,
  __setClientGeminiCacheTelemetryTestDeps,
} from "./client-gemini-cache-telemetry-service.ts";
import {
  __resetAiProviderCallLedgerTestDeps,
  __setAiProviderCallLedgerTestDeps,
} from "./ai-provider-call-ledger-service.ts";

test.beforeEach(() => {
  __setAiProviderCallLedgerTestDeps({
    createDocument: async () => ({}),
    listDocuments: async () => ({ documents: [] }),
    updateDocument: async () => ({}),
    idUnique: () => "ledger_unique",
    now: () => 5000,
  } as any);
});

test.afterEach(() => {
  __resetGeminiExplicitCacheTestDeps();
  __resetClientGeminiBillingTestDeps();
  __resetClientGeminiCacheTelemetryTestDeps();
  __resetAiProviderCallLedgerTestDeps();
});

function setupBillingHarness() {
  const actions: string[] = [];
  const telemetryRows: any[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (action, parts) => [action, ...parts.filter(Boolean)].join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 1, breakdown: [] };
    },
    canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" }),
    logUsageChargeFailure: () => {},
  } as any);
  __setClientGeminiCacheTelemetryTestDeps({
    createDocument: async (_databaseId, _collection, _id, doc) => {
      telemetryRows.push(JSON.parse(String(doc.value || "{}")));
      return doc;
    },
    idUnique: () => `unique_${telemetryRows.length}`,
    now: () => 5000 + telemetryRows.length,
  } as any);
  return { actions, telemetryRows };
}

function fakeProvider(generateContent: (request: any) => Promise<any> = async () => ({ text: "ok" })) {
  return {
    provider: "platform_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    billingContext: { eventId: "msg_1", customerJid: "contact-e4ed32210a80@example.invalid" },
    ai: {
      caches: {
        create: async () => ({ name: "cachedContents/cache_1", expireTime: new Date(Date.now() + 3600000).toISOString() }),
        get: async () => ({}),
        update: async () => ({ expireTime: new Date(Date.now() + 3600000).toISOString() }),
      },
      models: { generateContent },
    },
  };
}

async function withDeepInfraFetch(response: { ok?: boolean; text?: string; status?: number }, fn: () => Promise<void>) {
  const previousKey = process.env.DEEPINFRA_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPINFRA_API_KEY = "server_only_key";
  let calls = 0;
  (globalThis as any).fetch = async () => {
    calls += 1;
    return {
      ok: response.ok !== false,
      status: response.status || (response.ok === false ? 503 : 200),
      json: async () => ({ choices: [{ message: { content: response.text ?? "DeepInfra reply" } }], usage: { prompt_tokens: 7, completion_tokens: 4, cached_tokens: 2 } }),
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

test("cache-aware request attaches cached content while keeping dynamic context out of the cache", async () => {
  __setGeminiExplicitCacheTestDeps({ isEnabled: () => true, getMinTokens: () => 1, now: () => 1000 } as any);
  const { actions, telemetryRows } = setupBillingHarness();
  let cacheCreateConfig: any = null;
  let generateRequest: any = null;
  const provider = {
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    billingContext: { eventId: "msg_1" },
    ai: {
      caches: {
        create: async (input: any) => {
          cacheCreateConfig = input.config;
          return { name: "cachedContents/cache_1", expireTime: new Date(Date.now() + 3600000).toISOString() };
        },
        get: async () => ({}),
        update: async () => ({ expireTime: new Date(Date.now() + 3600000).toISOString() }),
      },
      models: {
        generateContent: async (request: any) => {
          generateRequest = request;
          return {
            text: "ok",
            usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 700, candidatesTokenCount: 20, totalTokenCount: 1020 },
          };
        },
      },
    },
  };

  await generateWithClientGeminiCacheAware({
    provider,
    model: "gemini-2.5-flash",
    purpose: "reply_tts",
    purposeGroup: "reply_tts",
    stableContextParts: ["STABLE SYSTEM RULES"],
    contents: [{ role: "user", parts: [{ text: "PRIVATE CUSTOMER CHAT" }] }],
    config: { maxOutputTokens: 80 },
    skipBackendTextProvider: true,
  });

  assert.match(cacheCreateConfig.contents[0].parts[0].text, /STABLE SYSTEM RULES/);
  assert.doesNotMatch(cacheCreateConfig.contents[0].parts[0].text, /PRIVATE CUSTOMER CHAT/);
  assert.equal(generateRequest.config.cachedContent, "cachedContents/cache_1");
  assert.equal(generateRequest.config.systemInstruction, undefined);
  assert.match(generateRequest.contents[0].parts[0].text, /PRIVATE CUSTOMER CHAT/);
  assert.deepEqual(actions, ["client_gemini_message_cycle", "client_gemini_explicit_cache_boost"]);
  assert.equal(telemetryRows[0].cacheHit, true);
  assert.equal(telemetryRows[0].cacheAttached, true);
});

test("same stable context reuses cache and different bot creates a different cache entry", async () => {
  __setGeminiExplicitCacheTestDeps({ isEnabled: () => true, getMinTokens: () => 1, now: () => 1000 } as any);
  setupBillingHarness();
  let createCalls = 0;
  const provider = (botId: string) => ({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    userId: "acct_1",
    accountId: "acct_1",
    botId,
    billingContext: { eventId: `${botId}:event` },
    ai: {
      caches: {
        create: async () => {
          createCalls += 1;
          return { name: `cachedContents/cache_${createCalls}`, expireTime: new Date(Date.now() + 3600000).toISOString() };
        },
        get: async () => ({}),
        update: async () => ({ expireTime: new Date(Date.now() + 3600000).toISOString() }),
      },
      models: { generateContent: async () => ({ text: "ok", usageMetadata: { cachedContentTokenCount: 10, promptTokenCount: 20 } }) },
    },
  });
  const base = { model: "gemini-2.5-flash", purpose: "reply_tts", stableContextParts: ["stable"], contents: [{ role: "user", parts: [{ text: "dynamic" }] }], skipBackendTextProvider: true };

  await generateWithClientGeminiCacheAware({ provider: provider("bot_1"), ...base });
  await generateWithClientGeminiCacheAware({ provider: provider("bot_1"), ...base });
  await generateWithClientGeminiCacheAware({ provider: provider("bot_2"), ...base });

  assert.equal(createCalls, 2);
});

test("platform Gemini helper path can attach explicit cache without Cache Boost billing", async () => {
  __setGeminiExplicitCacheTestDeps({ isEnabled: () => true, getMinTokens: () => 1, now: () => 1000 } as any);
  const { actions, telemetryRows } = setupBillingHarness();
  let createCalls = 0;
  let generateRequest: any = null;
  const provider = {
    provider: "platform_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    ai: {
      caches: {
        create: async () => {
          createCalls += 1;
          return { name: "cachedContents/platform_cache_1", expireTime: new Date(Date.now() + 3600000).toISOString() };
        },
        get: async () => ({}),
        update: async () => ({ expireTime: new Date(Date.now() + 3600000).toISOString() }),
      },
      models: {
        generateContent: async (request: any) => {
          generateRequest = request;
          return {
            text: "ok",
            usageMetadata: { promptTokenCount: 1200, cachedContentTokenCount: 900, candidatesTokenCount: 20, totalTokenCount: 1220 },
          };
        },
      },
    },
  };

  await generateWithClientGeminiCacheAware({
    provider,
    model: "gemini-2.5-flash",
    purpose: "reply_tts",
    purposeGroup: "reply_tts",
    stableContextParts: ["STABLE REPAIR RULES"],
    contents: [{ role: "user", parts: [{ text: "DYNAMIC REPAIR PROMPT" }] }],
    skipBackendTextProvider: true,
  });

  assert.equal(createCalls, 1);
  assert.equal(generateRequest.config.cachedContent, "cachedContents/platform_cache_1");
  assert.deepEqual(actions, []);
  assert.equal(telemetryRows[0].provider, "platform_gemini");
  assert.equal(telemetryRows[0].cacheBoostEnabled, false);
  assert.equal(telemetryRows[0].cacheBoostCharged, false);
  assert.equal(telemetryRows[0].cacheAttached, true);
  assert.equal(telemetryRows[0].cacheHit, true);
  assert.notEqual(telemetryRows[0].cacheMissReason, "provider_not_client_gemini");
});

test("client custom Gemini keeps explicit cache disabled when Cache Boost is off", async () => {
  __setGeminiExplicitCacheTestDeps({ isEnabled: () => true, getMinTokens: () => 1, now: () => 1000 } as any);
  const { actions, telemetryRows } = setupBillingHarness();
  let createCalls = 0;
  const provider = {
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: false,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    billingContext: { eventId: "msg_no_boost" },
    ai: {
      caches: {
        create: async () => {
          createCalls += 1;
          return { name: "cachedContents/should_not_create" };
        },
        get: async () => ({}),
      },
      models: { generateContent: async () => ({ text: "ok", usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 0 } }) },
    },
  };

  await generateWithClientGeminiCacheAware({
    provider,
    model: "gemini-2.5-flash",
    purpose: "reply_tts",
    purposeGroup: "reply_tts",
    stableContextParts: ["STABLE SUMMARY RULES"],
    contents: [{ role: "user", parts: [{ text: "DYNAMIC CUSTOMER CHAT" }] }],
    skipBackendTextProvider: true,
  });

  assert.equal(createCalls, 0);
  assert.deepEqual(actions, ["client_gemini_message_cycle"]);
  assert.equal(telemetryRows[0].cacheBoostEnabled, false);
  assert.equal(telemetryRows[0].cacheBoostCharged, false);
  assert.equal(telemetryRows[0].cacheAttempted, false);
  assert.equal(telemetryRows[0].cacheMissReason, "disabled");
});

test("small stable context skips explicit cache and zero cached tokens do not charge Cache Boost", async () => {
  __setGeminiExplicitCacheTestDeps({ isEnabled: () => true, getMinTokens: () => 9999, now: () => 1000 } as any);
  const { actions, telemetryRows } = setupBillingHarness();
  let createCalls = 0;
  const provider = {
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    billingContext: { eventId: "msg_small" },
    ai: {
      caches: {
        create: async () => {
          createCalls += 1;
          return { name: "cachedContents/cache_small" };
        },
        get: async () => ({}),
      },
      models: { generateContent: async () => ({ text: "ok", usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 0 } }) },
    },
  };

  await generateWithClientGeminiCacheAware({
    provider,
    model: "gemini-2.5-flash",
    purpose: "reply_tts",
    stableContextParts: ["short"],
    contents: [{ role: "user", parts: [{ text: "dynamic customer text" }] }],
    skipBackendTextProvider: true,
  });

  assert.equal(createCalls, 0);
  assert.deepEqual(actions, ["client_gemini_message_cycle"]);
  assert.equal(telemetryRows[0].cacheMissReason, "small_context");
  assert.equal(telemetryRows[0].cacheBoostCharged, false);
});

test("buildCacheAwareGeminiRequest falls back to systemInstruction without cached content", () => {
  const request = buildCacheAwareGeminiRequest({
    provider: {},
    model: "gemini-2.5-flash",
    purpose: "ai_customer_summary",
    stableContextParts: ["STABLE"],
    dynamicContextParts: ["DYNAMIC"],
    config: { maxOutputTokens: 20 },
  });

  assert.equal(request.config.systemInstruction, "STABLE");
  assert.equal(request.config.cachedContent, undefined);
  assert.equal(request.contents[0].parts[0].text, "DYNAMIC");
  assert.equal(request.config.thinkingConfig.thinkingBudget, 0);
});

test("unsupported thinkingConfig falls back once without it", async () => {
  setupBillingHarness();
  const configs: any[] = [];
  const provider = {
    provider: "platform_gemini",
    ai: {
      models: {
        generateContent: async (request: any) => {
          configs.push(request.config);
          if (configs.length === 1) throw new Error("INVALID_ARGUMENT unknown field thinkingConfig");
          return { text: "ok" };
        },
      },
    },
  };

  const result = await generateWithClientGeminiCacheAware({
    provider,
    model: "gemini-2.5-flash",
    purpose: "reply_tts",
    stableContextParts: ["stable"],
    contents: [{ role: "user", parts: [{ text: "dynamic" }] }],
    skipBackendTextProvider: true,
  });

  assert.equal(result.text, "ok");
  assert.equal(configs.length, 2);
  assert.equal(configs[0].thinkingConfig.thinkingBudget, 0);
  assert.equal(configs[1].thinkingConfig, undefined);
});

test("normal WhatsApp English text-only reply selects DeepInfra provider", async () => {
  setupBillingHarness();
  let geminiCalled = false;
  let result: any;
  await withDeepInfraFetch({ text: "Sure, the Starter plan includes WhatsApp AI replies." }, async () => {
    result = await generateWithClientGeminiCacheAware({
      provider: fakeProvider(async () => { geminiCalled = true; return { text: "gemini" }; }),
      model: "gemini-2.5-flash",
      purpose: "customer_ai_reply",
      stableContextParts: ["BlackArrow rules and business instructions"],
      contents: [{ role: "user", parts: [{ text: "What is included in Starter plan?" }] }],
      tools: [{ functionDeclarations: [{ name: "save_order" }] }],
    });
  });

  assert.equal(result.backendTextProvider, true);
  assert.equal(result.provider, "deepinfra");
  assert.equal(result.text, "Sure, the Starter plan includes WhatsApp AI replies.");
  assert.equal(geminiCalled, false);
});

test("Urdu and Roman Urdu text-only replies select DeepInfra provider", async () => {
  setupBillingHarness();
  const texts = ["کیا آپ قیمت بتا سکتے ہیں؟", "mujhe starter plan ki details chahiye"];
  await withDeepInfraFetch({ text: "Ji, main help kar deta hun." }, async () => {
    for (const text of texts) {
      const result = await generateWithClientGeminiCacheAware({
        provider: fakeProvider(async () => ({ text: "gemini" })),
        model: "gemini-2.5-flash",
        purpose: "customer_ai_reply",
        stableContextParts: ["BlackArrow rules and language preference"],
        contents: [{ role: "user", parts: [{ text }] }],
      });
      assert.equal(result.provider, "deepinfra");
      assert.equal(result.backendTextProvider, true);
    }
  });
});

test("product and service text question selects DeepInfra provider", async () => {
  setupBillingHarness();
  let result: any;
  await withDeepInfraFetch({ text: "The service includes setup and customer support automation." }, async () => {
    result = await generateWithClientGeminiCacheAware({
      provider: fakeProvider(),
      model: "gemini-2.5-flash",
      purpose: "product_service_question",
      stableContextParts: ["Products and services context"],
      contents: [{ role: "user", parts: [{ text: "What services do you offer?" }] }],
      tools: [{ functionDeclarations: [{ name: "save_lead" }] }],
    });
  });
  assert.equal(result.provider, "deepinfra");
});

test("media and audio customer reply paths are blocked from Gemini fallback", async () => {
  setupBillingHarness();
  let geminiCalls = 0;
  await withDeepInfraFetch({ text: "should not be used" }, async () => {
    await assert.rejects(() => generateWithClientGeminiCacheAware({
      provider: fakeProvider(async () => { geminiCalls += 1; return { text: "image gemini" }; }),
      model: "gemini-2.5-flash",
      purpose: "customer_ai_reply",
      stableContextParts: ["rules"],
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: "abc" } }, { text: "what is this?" }] }],
    }), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);
    await assert.rejects(() => generateWithClientGeminiCacheAware({
      provider: fakeProvider(async () => { geminiCalls += 1; return { text: "audio gemini" }; }),
      model: "gemini-2.5-flash",
      purpose: "customer_ai_reply",
      stableContextParts: ["rules"],
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/ogg", data: "abc" } }, { text: "voice note" }] }],
    }), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);
  });
  assert.equal(geminiCalls, 0);
});

test("tool-capable WhatsApp text stays on DeepInfra", async () => {
  setupBillingHarness();
  let geminiCalled = false;
  await assert.rejects(() => generateWithClientGeminiCacheAware({
    provider: fakeProvider(async () => { geminiCalled = true; return { text: "Saved order details" }; }),
    model: "gemini-2.5-flash",
    purpose: "customer_ai_reply",
    stableContextParts: ["rules"],
    contents: [{ role: "user", parts: [{ text: "I want to order now, my address is Lahore" }] }],
    tools: [{ functionDeclarations: [{ name: "save_order" }] }],
  }), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);
  assert.equal(geminiCalled, false);
});

test("DeepInfra failure and empty output do not fall back to Gemini", async () => {
  setupBillingHarness();
  let geminiCalls = 0;
  await withDeepInfraFetch({ ok: false, status: 503 }, async () => {
    await assert.rejects(() => generateWithClientGeminiCacheAware({
      provider: fakeProvider(async () => { geminiCalls += 1; return { text: "Gemini fallback once" }; }),
      model: "gemini-2.5-flash",
      purpose: "customer_ai_reply",
      stableContextParts: ["rules"],
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
    }), /deepinfra_unavailable_text_generation_blocked/);
  });
  await withDeepInfraFetch({ text: "" }, async () => {
    await assert.rejects(() => generateWithClientGeminiCacheAware({
      provider: fakeProvider(async () => { geminiCalls += 1; return { text: "Gemini fallback once again" }; }),
      model: "gemini-2.5-flash",
      purpose: "customer_ai_reply",
      stableContextParts: ["rules"],
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
    }), /deepinfra_unavailable_text_generation_blocked/);
  });
  assert.equal(geminiCalls, 0);
});

test("skipBackendTextProvider does not bypass Gemini text block", async () => {
  setupBillingHarness();
  await assert.rejects(() => generateWithClientGeminiCacheAware({
    provider: fakeProvider(async () => ({ text: "gemini blocked" })),
    model: "gemini-2.5-flash",
    purpose: "manual_learning",
    stableContextParts: ["rules"],
    dynamicContextParts: ["Summarize this text-only learning case"],
    skipBackendTextProvider: true,
  }), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);
});
