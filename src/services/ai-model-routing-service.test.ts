import test from "node:test";
import assert from "node:assert/strict";

import { resolveAiModelForPurpose } from "./ai-model-routing-service.ts";
import {
  __resetGeminiModelAvailabilityTestDeps,
  __setGeminiModelAvailabilityTestDeps,
} from "./gemini-model-availability-service.ts";

test.afterEach(() => {
  __resetGeminiModelAvailabilityTestDeps();
});

test("summary routes to Flash-Lite when cached availability is true", async () => {
  __setGeminiModelAvailabilityTestDeps({
    getSystemConfig: async () => JSON.stringify({
      cheapModelAvailable: true,
      cheapModelName: "gemini-2.5-flash-lite",
      lastCheckedAt: 123,
      lastErrorSafe: "",
    }),
  } as any);

  const route = await resolveAiModelForPurpose("summary");

  assert.equal(route.model, "gemini-2.5-flash-lite");
  assert.equal(route.route, "cheap_helper");
});

test("main customer reply stays on Flash", async () => {
  __setGeminiModelAvailabilityTestDeps({
    getSystemConfig: async () => JSON.stringify({ cheapModelAvailable: true, cheapModelName: "gemini-2.5-flash-lite" }),
  } as any);

  const route = await resolveAiModelForPurpose("default_reply");

  assert.equal(route.model, "gemini-2.5-flash");
  assert.equal(route.route, "default_reply");
});

test("unknown or unavailable cheap model falls back to Flash", async () => {
  __setGeminiModelAvailabilityTestDeps({
    getSystemConfig: async () => JSON.stringify({ cheapModelAvailable: false, cheapModelName: "gemini-2.5-flash-lite" }),
  } as any);

  const route = await resolveAiModelForPurpose("learning");

  assert.equal(route.model, "gemini-2.5-flash");
  assert.equal(route.route, "cheap_unavailable_fallback");
});
