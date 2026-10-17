import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetAiProviderRetryPolicyTestDeps,
  __setAiProviderRetryPolicyTestDeps,
  getPerModelAttemptDelayMs,
  runModelFallbackSequence,
} from "./ai-provider-retry-policy-service.ts";

test.afterEach(() => {
  __resetAiProviderRetryPolicyTestDeps();
});

test("503 on gemini-2.5-flash retries same model 3 times before fallback", async () => {
  const calls: string[] = [];
  const sleeps: number[] = [];
  __setAiProviderRetryPolicyTestDeps({
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  });

  const result = await runModelFallbackSequence({
    models: ["gemini-2.5-flash", "gemini-3-flash-preview"],
    attemptRequest: async (model, context) => {
      calls.push(`${model}:${context.attemptNumber}`);
      if (model === "gemini-2.5-flash") {
        throw new Error("503 UNAVAILABLE, high demand");
      }
      return { ok: true, model };
    },
  });

  assert.deepEqual(calls, [
    "gemini-2.5-flash:1",
    "gemini-2.5-flash:2",
    "gemini-2.5-flash:3",
    "gemini-3-flash-preview:1",
  ]);
  assert.deepEqual(sleeps, [2000, 3000]);
  assert.deepEqual(result, { ok: true, model: "gemini-3-flash-preview" });
});

test("timeout on primary retries same model 3 times before fallback", async () => {
  const calls: string[] = [];
  __setAiProviderRetryPolicyTestDeps({ sleep: async () => {} });

  await assert.rejects(() => runModelFallbackSequence({
    models: ["gemini-2.5-flash"],
    attemptRequest: async (model, context) => {
      calls.push(`${model}:${context.attemptNumber}`);
      throw new Error("AI provider timed out after 35s for model gemini-2.5-flash");
    },
  }));

  assert.deepEqual(calls, [
    "gemini-2.5-flash:1",
    "gemini-2.5-flash:2",
    "gemini-2.5-flash:3",
  ]);
});

test("empty response retries same model before fallback", async () => {
  const calls: string[] = [];
  __setAiProviderRetryPolicyTestDeps({ sleep: async () => {} });

  const result = await runModelFallbackSequence({
    models: ["gemini-2.5-flash", "gemini-3-flash-preview"],
    attemptRequest: async (model, context) => {
      calls.push(`${model}:${context.attemptNumber}`);
      return { model, text: "" };
    },
    validateResponse: (response: any) => ({ ok: Boolean(response?.text), reason: "empty response" }),
  }).catch((error) => ({ error }));

  assert.equal(Boolean((result as any).error), true);
  assert.deepEqual(calls, [
    "gemini-2.5-flash:1",
    "gemini-2.5-flash:2",
    "gemini-2.5-flash:3",
    "gemini-3-flash-preview:1",
    "gemini-3-flash-preview:2",
    "gemini-3-flash-preview:3",
  ]);
});

test("invalid request does not waste 3 retries", async () => {
  const calls: string[] = [];
  __setAiProviderRetryPolicyTestDeps({ sleep: async () => {} });

  await assert.rejects(() => runModelFallbackSequence({
    models: ["gemini-2.5-flash", "gemini-3-flash-preview"],
    attemptRequest: async (model, context) => {
      calls.push(`${model}:${context.attemptNumber}`);
      throw new Error(`400 INVALID_ARGUMENT for ${model}`);
    },
  }));

  assert.deepEqual(calls, [
    "gemini-2.5-flash:1",
    "gemini-3-flash-preview:1",
  ]);
});

test("persistent retry schedule stays every 1 minute", () => {
  assert.equal(getPerModelAttemptDelayMs(1), 0);
  assert.equal(getPerModelAttemptDelayMs(2), 2000);
  assert.equal(getPerModelAttemptDelayMs(3), 3000);
});
