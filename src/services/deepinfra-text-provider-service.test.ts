import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeepInfraPromptCacheKey,
  buildDeepInfraTelemetry,
  buildDeepInfraTextMessages,
  generateWithDeepInfraTextProvider,
  hasDeepInfraTextProviderKey,
} from "./deepinfra-text-provider-service.ts";

test("DeepInfra key is backend env only and missing key fails safely", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  delete process.env.DEEPINFRA_API_KEY;
  try {
    assert.equal(hasDeepInfraTextProviderKey(), false);
    const result = await generateWithDeepInfraTextProvider({ latestCustomerMessage: "hello" });
    assert.equal(result.provider, "deepinfra");
    assert.equal(result.requestStatus, "missing_key");
    assert.equal(result.text, "");
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("prompt builder keeps stable prompt before dynamic messages and latest message", () => {
  const messages = buildDeepInfraTextMessages({
    stablePrompt: "Global rules and client instructions",
    messages: [
      { role: "user", content: "old question" },
      { role: "assistant", content: "old answer" },
    ],
    latestCustomerMessage: "latest question",
  });

  assert.equal(messages[0].role, "system");
  assert.equal(messages[0].content, "Global rules and client instructions");
  assert.equal(messages.at(-1)?.role, "user");
  assert.equal(messages.at(-1)?.content, "latest question");
});

test("customer reply prompt builder adds BlackArrow quality guidance after stable prompt", () => {
  const messages = buildDeepInfraTextMessages({
    purpose: "customer_ai_reply",
    stablePrompt: "Business rules stay stable",
    latestCustomerMessage: "price?",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Business rules stay stable/);
  assert.match(messages[0].content, /BlackArrow customer reply quality rules/);
  assert.match(messages[0].content, /ask one useful next question/i);
});

test("DeepInfra success returns text and safe usage metadata", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "test_key_should_not_be_logged";
  try {
    const result = await generateWithDeepInfraTextProvider({
      stablePrompt: "rules",
      latestCustomerMessage: "hello",
      fetchImpl: async (_url: any, init: any) => {
        assert.equal(String(init.headers.Authorization).includes("test_key_should_not_be_logged"), true);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: "Hi there" } }], usage: { prompt_tokens: 10, completion_tokens: 3, cached_tokens: 2 } }),
        } as any;
      },
    });

    assert.equal(result.text, "Hi there");
    assert.equal(result.requestStatus, "success");
    assert.equal(result.promptTokens, 10);
    assert.equal(result.completionTokens, 3);
    assert.equal(result.cachedTokens, 2);
    assert.equal(result.rawUsageSafe.prompt_tokens, 10);
    assert.equal(result.rawUsageSafe.completion_tokens, 3);
    assert.equal(result.rawUsageSafe.cached_tokens, 2);
    assert.equal(JSON.stringify(result.rawUsageSafe).includes("test_key_should_not_be_logged"), false);
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("DeepInfra invalid response reports invalid_response for Gemini fallback caller", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "test_key";
  try {
    const result = await generateWithDeepInfraTextProvider({ latestCustomerMessage: "hello", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "" } }] }) } as any) });
    assert.equal(result.requestStatus, "invalid_response");
    assert.equal(result.text, "");
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("DeepInfra prompt cache key is scoped and excludes raw customer phone", async () => {
  const key = buildDeepInfraPromptCacheKey({ accountId: "acct 123", botId: "bot 456", purpose: "customer_ai_reply", customerKey: "canonical_customer" });
  assert.equal(key, "blackarrow:acct_123:bot_456:customer_ai_reply:canonical_customer");
  assert.equal(key.includes("195545134641"), false);
});

test("DeepInfra request attaches prompt cache key only in extra_body and reports safe cache metadata", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "test_key";
  try {
    let requestBody: any = null;
    const result = await generateWithDeepInfraTextProvider({
      stablePrompt: "rules",
      latestCustomerMessage: "hello",
      promptCacheKey: "blackarrow:acct:bot:customer_ai_reply",
      fetchImpl: async (_url: any, init: any) => {
        requestBody = JSON.parse(String(init.body || "{}"));
        return { ok: true, json: async () => ({ choices: [{ message: { content: "Hello" } }], usage: { prompt_cache_hit_tokens: 4 } }) } as any;
      },
    });

    assert.equal(requestBody.extra_body.prompt_cache_key, "blackarrow:acct:bot:customer_ai_reply");
    assert.equal(result.cachedTokens, 4);
    assert.equal(result.rawUsageSafe.prompt_cache_key_attached, true);
    assert.match(result.rawUsageSafe.prompt_cache_key_hash, /^[a-f0-9]{16}$/);
    assert.equal(JSON.stringify(result.rawUsageSafe).includes("blackarrow:acct:bot:customer_ai_reply"), false);
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("provider telemetry redacts customer and includes safe cache fields only", () => {
  const telemetry = buildDeepInfraTelemetry({ purpose: "customer_ai_reply", model: "deepseek-ai/DeepSeek-V4-Flash", promptTokens: 12, completionTokens: 5, cachedTokens: 1, requestStatus: "success", fallbackUsed: false, accountId: "account-secret-123", botId: "bot-secret-456", customerJid: "contact-e4ed32210a80@example.invalid", promptCacheKeyAttached: true, promptCacheKeyHash: "abc123", stablePromptHash: "def456" });
  assert.equal(telemetry.provider, "deepinfra");
  assert.equal(telemetry.customerJid, "contact-87ea082a95cc@example.invalid");
  assert.equal(telemetry.accountId, "acco...123");
  assert.equal(telemetry.promptCacheKeyAttached, true);
  assert.equal(telemetry.promptCacheKeyHash, "abc123");
  assert.equal(JSON.stringify(telemetry).includes("DEEPINFRA_API_KEY"), false);
});
