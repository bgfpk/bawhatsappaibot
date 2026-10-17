import test from "node:test";
import assert from "node:assert/strict";

import { canUseDeepInfraForBackendText, generateBackendText, shouldUseDeepInfraTextProviderForPurpose } from "./ai-text-provider-service.ts";

test("DeepInfra selection allows backend text-only and rejects only raw media/audio paths", () => {
  assert.deepEqual(canUseDeepInfraForBackendText({}), { allowed: true, reason: "text_only_supported" });
  assert.equal(canUseDeepInfraForBackendText({ hasImage: true }).reason, "media_required");
  assert.equal(canUseDeepInfraForBackendText({ hasAudio: true }).reason, "audio_required");
  assert.equal(canUseDeepInfraForBackendText({ hasAudio: true, mediaContextAsText: true, mediaContextType: "audio" }).reason, "text_only_supported_after_media_context");
  assert.equal(canUseDeepInfraForBackendText({ hasImage: true, hasMedia: true, mediaContextAsText: true, mediaContextType: "image" }).reason, "text_only_supported_after_media_context");
  assert.equal(canUseDeepInfraForBackendText({ requiresGeminiTools: true }).reason, "gemini_tool_required");
  assert.equal(canUseDeepInfraForBackendText({ requiresVoice: true }).reason, "text_only_supported");
  assert.equal(canUseDeepInfraForBackendText({ requiresSchema: true }).reason, "text_only_supported");
});

test("central provider decision covers WhatsApp text reply languages and sales/support purposes", () => {
  for (const purpose of [
    "customer_ai_reply",
    "customer_support_reply",
    "sales_reply",
    "product_service_question",
    "smart_sales_text",
    "ai_smart_followup_generation",
    "customer_summary",
    "crm_note_generation",
    "lead_analysis",
    "training_compaction",
  ]) {
    const decision = shouldUseDeepInfraTextProviderForPurpose({ purpose, requireKnownPurpose: true });
    assert.equal(decision.useDeepInfra, true, purpose);
    assert.equal(decision.skipReason, "text_only_supported");
  }
});

test("provider decision reports exact skip reasons for unsafe paths", () => {
  assert.equal(shouldUseDeepInfraTextProviderForPurpose({ purpose: "image_reply", hasMedia: true }).skipReason, "media_required");
  assert.equal(shouldUseDeepInfraTextProviderForPurpose({ purpose: "voice_note", hasAudio: true }).skipReason, "audio_required");
  assert.equal(shouldUseDeepInfraTextProviderForPurpose({ purpose: "tool_call", hasToolCalls: true }).skipReason, "text_only_supported");
  assert.equal(shouldUseDeepInfraTextProviderForPurpose({ purpose: "strict_json", strictSchema: true }).skipReason, "text_only_supported");
  assert.equal(shouldUseDeepInfraTextProviderForPurpose({ purpose: "unknown", requireKnownPurpose: true }).skipReason, "text_only_supported");
});

test("backend text provider blocks Gemini fallback when DeepInfra key is missing", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  delete process.env.DEEPINFRA_API_KEY;
  try {
    const result = await generateBackendText({
      purpose: "customer_ai_reply",
      accountId: "acct_1",
      botId: "bot_1",
      latestCustomerMessage: "hello",
      customerJid: "contact-e4ed32210a80@example.invalid",
      fallbackGenerate: async () => ({ text: "Gemini fallback reply", provider: "platform_gemini", model: "gemini" }),
    });

    assert.equal(result.text, "");
    assert.equal(result.provider, "deepinfra");
    assert.equal(result.requestStatus, "missing_key");
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.fallbackReason, "deepinfra_unavailable_text_generation_blocked");
    assert.equal(result.telemetry.provider, "deepinfra");
    assert.equal(result.telemetry.fallbackUsed, false);
    assert.equal(result.telemetry.customerJid, "contact-87ea082a95cc@example.invalid");
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("backend text provider returns DeepInfra success before fallback", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "server_only_key";
  try {
    let fallbackCalled = false;
    const result = await generateBackendText({
      purpose: "customer_ai_reply",
      accountId: "acct_1",
      botId: "bot_1",
      stablePrompt: "rules",
      latestCustomerMessage: "hello",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "DeepInfra reply" } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }),
      } as any),
      fallbackGenerate: async () => {
        fallbackCalled = true;
        return { text: "fallback" };
      },
    });

    assert.equal(result.text, "DeepInfra reply");
    assert.equal(result.provider, "deepinfra");
    assert.equal(result.requestStatus, "success");
    assert.equal(result.fallbackUsed, false);
    assert.equal(fallbackCalled, false);
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("DeepInfra failure retries once and stays blocked for text", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "server_only_key";
  try {
    let attempts = 0;
    const result = await generateBackendText({
      purpose: "customer_ai_reply",
      latestCustomerMessage: "hello",
      fetchImpl: async () => {
        attempts += 1;
        return { ok: false, status: 503, json: async () => ({}) } as any;
      },
      fallbackGenerate: async () => ({ text: "Fallback once", provider: "platform_gemini" }),
    });

    assert.equal(attempts, 2);
    assert.equal(result.text, "");
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.fallbackReason, "deepinfra_unavailable_text_generation_blocked");
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});

test("both providers fail returns no customer-facing filler text", async () => {
  const previous = process.env.DEEPINFRA_API_KEY;
  process.env.DEEPINFRA_API_KEY = "server_only_key";
  try {
    const result = await generateBackendText({
      purpose: "customer_ai_reply",
      latestCustomerMessage: "hello",
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "" } }] }) } as any),
      fallbackGenerate: async () => ({ text: "" }),
    });

    assert.equal(result.text, "");
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.requestStatus, "invalid_response");
  } finally {
    if (previous === undefined) delete process.env.DEEPINFRA_API_KEY;
    else process.env.DEEPINFRA_API_KEY = previous;
  }
});
