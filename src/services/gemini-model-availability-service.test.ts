import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetGeminiModelAvailabilityTestDeps,
  __setGeminiModelAvailabilityTestDeps,
  checkCheapGeminiModelAvailability,
  getCheapGeminiModelAvailabilityStatus,
} from "./gemini-model-availability-service.ts";

test.afterEach(() => {
  __resetGeminiModelAvailabilityTestDeps();
});

test("successful Flash-Lite probe marks cheap model available", async () => {
  const cache: Record<string, string> = {};
  let request: any;
  __setGeminiModelAvailabilityTestDeps({
    getClientOptions: () => ({ apiKey: "test" }) as any,
    createClient: () => ({
      models: {
        generateContent: async (input: any) => {
          request = input;
          return { text: "ok" };
        },
      },
    }),
    getSystemConfig: async (key) => cache[key],
    setSystemConfig: async (key, value) => {
      cache[key] = value;
    },
    now: () => 123,
  });

  const status = await checkCheapGeminiModelAvailability();

  assert.equal(status.cheapModelAvailable, true);
  assert.equal(status.cheapModelName, "gemini-2.5-flash-lite");
  assert.equal(status.lastCheckedAt, 123);
  assert.equal(request.config.maxOutputTokens, 4);
});

test("failed Flash-Lite probe stores safe unavailable status", async () => {
  const cache: Record<string, string> = {};
  __setGeminiModelAvailabilityTestDeps({
    getClientOptions: () => ({ apiKey: "test" }) as any,
    createClient: () => ({
      models: {
        generateContent: async () => {
          throw new Error("403 model disabled for project key AIza-secret");
        },
      },
    }),
    getSystemConfig: async (key) => cache[key],
    setSystemConfig: async (key, value) => {
      cache[key] = value;
    },
    now: () => 456,
  });

  const status = await checkCheapGeminiModelAvailability();
  const cached = await getCheapGeminiModelAvailabilityStatus();

  assert.equal(status.cheapModelAvailable, false);
  assert.equal(cached.lastCheckedAt, 456);
  assert.doesNotMatch(cached.lastErrorSafe, /customer|prompt/i);
});
