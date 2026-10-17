import test from "node:test";
import assert from "node:assert/strict";

import { buildCustomerBotModelRequest } from "./gemini-explicit-cache-request-service.ts";

const baseContents = [{ role: "user", parts: [{ text: "Customer asked about delivery." }] }];

test("explicit cache disabled uses full prompt path", () => {
  const result = buildCustomerBotModelRequest({
    modelName: "gemini-2.5-flash",
    primaryModel: "gemini-2.5-flash",
    contents: baseContents,
    systemInstruction: "stable + dynamic full prompt",
    dynamicSystemInstruction: "dynamic only",
    tools: [{ functionDeclarations: [] }],
    useExplicitCache: false,
  });

  assert.equal(result.usedExplicitCache, false);
  assert.equal(result.config.systemInstruction, "stable + dynamic full prompt");
  assert.equal(Array.isArray(result.config.tools), true);
  assert.deepEqual(result.contents, baseContents);
});

test("fallback model receives full prompt instead of cache-only runtime context", () => {
  const result = buildCustomerBotModelRequest({
    modelName: "gemini-3-flash-preview",
    primaryModel: "gemini-2.5-flash",
    contents: baseContents,
    systemInstruction: "stable + dynamic full prompt",
    dynamicSystemInstruction: "dynamic only",
    tools: [{ functionDeclarations: [] }],
    cachedContentName: "cachedContents/abc123456789",
    useExplicitCache: true,
  });

  assert.equal(result.usedExplicitCache, false);
  assert.equal(result.config.cachedContent, undefined);
  assert.equal(result.config.systemInstruction, "stable + dynamic full prompt");
  assert.deepEqual(result.contents, baseContents);
});

test("normal non-cached path keeps stable business context and dynamic customer context together", () => {
  const fullPrompt = "STABLE BUSINESS\nProducts and policy\n\nDYNAMIC CUSTOMER\nCustomer profile and latest message";
  const result = buildCustomerBotModelRequest({
    modelName: "gemini-2.5-flash",
    primaryModel: "gemini-2.5-flash",
    contents: baseContents,
    systemInstruction: fullPrompt,
    dynamicSystemInstruction: "dynamic only",
    tools: [{ functionDeclarations: [] }],
    useExplicitCache: false,
  });

  assert.match(String(result.config.systemInstruction), /STABLE BUSINESS/);
  assert.match(String(result.config.systemInstruction), /DYNAMIC CUSTOMER/);
  assert.deepEqual(result.contents, baseContents);
});

test("explicit cache path moves runtime context into contents and omits generate-level instructions and tools", () => {
  const result = buildCustomerBotModelRequest({
    modelName: "gemini-2.5-flash",
    primaryModel: "gemini-2.5-flash",
    contents: baseContents,
    systemInstruction: "stable + dynamic full prompt",
    dynamicSystemInstruction: "dynamic only",
    tools: [{ functionDeclarations: [] }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    cachedContentName: "cachedContents/abc123456789",
    useExplicitCache: true,
  });

  assert.equal(result.usedExplicitCache, true);
  assert.equal(result.config.cachedContent, "cachedContents/abc123456789");
  assert.equal(typeof result.config.systemInstruction, "undefined");
  assert.equal(typeof result.config.tools, "undefined");
  assert.equal(typeof result.config.toolConfig, "undefined");
  assert.equal(result.contents.length, 2);
  assert.match(String(result.contents[0]?.parts?.[0]?.text || ""), /dynamic only/);
});
