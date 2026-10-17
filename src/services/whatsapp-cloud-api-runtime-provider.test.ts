// src/services/whatsapp-cloud-api-runtime-provider.test.ts
//
// Unit tests for the Cloud API runtime provider builder (Phase 4R).
// Uses Node native test runner — no Jest globals.
// No real network requests are made; fetchImpl is always injected.

import test from "node:test";
import assert from "node:assert/strict";
import {
  createWhatsAppCloudApiRuntimeProvider,
  summarizeCloudApiRuntimeProviderResult,
} from "./whatsapp-cloud-api-runtime-provider.ts";
import type { CloudApiRuntimeConfigResult } from "./whatsapp-cloud-api-runtime-config.ts";
import type { FetchImpl, FetchRequestInit, FetchResponse } from "./whatsapp-cloud-api-http-client.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A runtime config that is fully ready. */
function makeReadyConfig(overrides: Partial<CloudApiRuntimeConfigResult> = {}): CloudApiRuntimeConfigResult {
  return {
    runtimeEnabled: true,
    activeRuntimeProvider: "whatsapp_cloud_api",
    phoneNumberId: "13992721329",
    businessAccountId: "biz_123",
    accessToken: "test_access_token_xyz",
    ...overrides,
  };
}

/** A runtime config where runtimeEnabled is false. */
function makeDisabledConfig(reason: string): CloudApiRuntimeConfigResult {
  return {
    runtimeEnabled: false,
    activeRuntimeProvider: "whatsapp_web",
    reason,
  };
}

interface MockFetchCall {
  url: string;
  init?: FetchRequestInit;
}

/** Creates a mock fetch that records calls and returns a controlled success response. */
function makeMockFetch(opts: {
  ok?: boolean;
  status?: number;
  jsonBody?: unknown;
  throwWith?: Error;
} = {}): { fetch: FetchImpl; calls: MockFetchCall[] } {
  const calls: MockFetchCall[] = [];
  const fetch: FetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (opts.throwWith) throw opts.throwWith;
    const ok = opts.ok ?? true;
    const status = opts.status ?? 200;
    const jsonBody = opts.jsonBody ?? { messages: [{ id: "wamid.test_001" }] };
    const response: FetchResponse = {
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      json: async () => jsonBody,
      text: async () => JSON.stringify(jsonBody),
    };
    return response;
  };
  return { fetch, calls };
}

// ---------------------------------------------------------------------------
// Tests: Disabled / not-ready paths
// ---------------------------------------------------------------------------

test("returns disabled when runtimeEnabled is false", () => {
  const config = makeDisabledConfig("provider_not_cloud_api");
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.provider, null);
  assert.equal(result.reason, "provider_not_cloud_api");
});

test("returns disabled when runtimeEnabled is false with missing_token_ref reason", () => {
  const config = makeDisabledConfig("missing_token_ref");
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "missing_token_ref");
});

test("returns disabled when runtimeEnabled is false with decrypt_failed reason", () => {
  const config = makeDisabledConfig("decrypt_failed");
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "decrypt_failed");
});

test("returns disabled when phoneNumberId is missing from ready config", () => {
  const config = makeReadyConfig({ phoneNumberId: undefined });
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "missing_phone_number_id");
  assert.equal(result.provider, null);
});

test("returns disabled when phoneNumberId is empty string", () => {
  const config = makeReadyConfig({ phoneNumberId: "" });
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "missing_phone_number_id");
});

test("returns disabled when accessToken is missing", () => {
  const config = makeReadyConfig({ accessToken: undefined });
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "missing_access_token");
  assert.equal(result.provider, null);
});

test("returns disabled when accessToken is empty string", () => {
  const config = makeReadyConfig({ accessToken: "" });
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  assert.equal(result.enabled, false);
  assert.equal(result.reason, "missing_access_token");
});

// ---------------------------------------------------------------------------
// Tests: Ready / enabled path
// ---------------------------------------------------------------------------

test("returns enabled provider when config is fully ready", () => {
  const { fetch } = makeMockFetch();
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig(),
    fetchImpl: fetch,
  });

  assert.equal(result.enabled, true);
  assert.ok(result.provider !== null, "provider must not be null when enabled");
  if (result.enabled) {
    assert.equal(result.phoneNumberId, "13992721329");
  }
});

test("returned provider is a WhatsAppCloudApiTransportProvider instance", () => {
  const { fetch } = makeMockFetch();
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig(),
    fetchImpl: fetch,
  });

  assert.ok(result.enabled);
  if (result.enabled) {
    assert.equal(typeof result.provider.sendText, "function");
    assert.equal(typeof result.provider.sendMedia, "function");
    assert.equal(typeof result.provider.getStatus, "function");
    assert.equal(typeof result.provider.start, "function");
  }
});

test("provider is returned in disabled state (start() not called)", () => {
  const { fetch } = makeMockFetch();
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig(),
    fetchImpl: fetch,
  });

  assert.ok(result.enabled);
  if (result.enabled) {
    // Provider is not started — status should be "disabled"
    assert.equal(result.provider.getStatus(), "disabled");
  }
});

test("created provider sends through injected mock fetch when sendText is called", async () => {
  const { fetch, calls } = makeMockFetch({ ok: true, jsonBody: { messages: [{ id: "wamid.mock_001" }] } });
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig({ phoneNumberId: "11402935250" }),
    fetchImpl: fetch,
  });

  assert.ok(result.enabled);
  if (result.enabled) {
    const sendResult = await result.provider.sendText("contact-e4ed32210a80@example.invalid", "Hello test");
    assert.equal(calls.length, 1, "mock fetch must be called exactly once");
    // URL should contain the phoneNumberId
    assert.ok(calls[0].url.includes("11402935250"), "URL must include phoneNumberId");
  }
});

test("Authorization Bearer header is passed through to mock fetch", async () => {
  const { fetch, calls } = makeMockFetch();
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig({ accessToken: "my_test_bearer_token" }),
    fetchImpl: fetch,
  });

  assert.ok(result.enabled);
  if (result.enabled) {
    await result.provider.sendText("contact-e4ed32210a80@example.invalid", "test");
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer my_test_bearer_token");
  }
});

test("phoneNumberId is preserved in the enabled result", () => {
  const { fetch } = makeMockFetch();
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig({ phoneNumberId: "130702401522" }),
    fetchImpl: fetch,
  });

  assert.ok(result.enabled);
  if (result.enabled) {
    assert.equal(result.phoneNumberId, "130702401522");
  }
});

// ---------------------------------------------------------------------------
// Tests: summarizeCloudApiRuntimeProviderResult
// ---------------------------------------------------------------------------

test("summary for disabled result never includes token", () => {
  const config = makeDisabledConfig("missing_token_ref");
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: config,
    fetchImpl: makeMockFetch().fetch,
  });

  const summary = summarizeCloudApiRuntimeProviderResult(result);
  assert.equal(summary.enabled, false);
  assert.equal(summary.reason, "missing_token_ref");
  assert.equal(summary.provider, null);
  // Must not contain any token field
  assert.ok(!("accessToken" in summary));
  assert.ok(!("token" in summary));
});

test("summary for enabled result includes phoneNumberId but never token", () => {
  const { fetch } = makeMockFetch();
  const result = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig({ phoneNumberId: "13444548552" }),
    fetchImpl: fetch,
  });

  const summary = summarizeCloudApiRuntimeProviderResult(result);
  assert.equal(summary.enabled, true);
  assert.equal(summary.phoneNumberId, "13444548552");
  // Must not contain any token field
  assert.ok(!("accessToken" in summary));
  assert.ok(!("token" in summary));
});

// ---------------------------------------------------------------------------
// Tests: Logger safety
// ---------------------------------------------------------------------------

test("logger is called on disabled path without logging token", () => {
  const logMessages: string[] = [];
  const safeLogger = {
    info: (msg: string) => logMessages.push(msg),
    warn: (msg: string) => logMessages.push(msg),
    error: (msg: string) => logMessages.push(msg),
  };

  createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeDisabledConfig("missing_token_ref"),
    fetchImpl: makeMockFetch().fetch,
    logger: safeLogger,
  });

  assert.ok(logMessages.length > 0, "Logger must be called on disabled path");
  for (const msg of logMessages) {
    assert.ok(!msg.includes("test_access_token_xyz"), `Log must not contain token: ${msg}`);
    assert.ok(!msg.toLowerCase().includes("bearer"), `Log must not contain 'bearer': ${msg}`);
  }
});

test("logger is called on ready path and logs only safe fields", () => {
  const logMessages: string[] = [];
  const safeLogger = {
    info: (msg: string) => logMessages.push(msg),
    warn: (msg: string) => logMessages.push(msg),
    error: (msg: string) => logMessages.push(msg),
  };

  const { fetch } = makeMockFetch();
  createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig: makeReadyConfig({
      accessToken: "ultra_secret_bearer_value",
      phoneNumberId: "10777035071",
    }),
    fetchImpl: fetch,
    logger: safeLogger,
  });

  assert.ok(logMessages.length > 0, "Logger must be called on ready path");
  for (const msg of logMessages) {
    assert.ok(
      !msg.includes("ultra_secret_bearer_value"),
      `Log must not contain token: ${msg}`,
    );
    assert.ok(
      !msg.toLowerCase().includes("bearer ultra"),
      `Log must not contain Bearer header value: ${msg}`,
    );
  }

  // Should log phoneNumberId (safe) and hasToken=true (safe boolean)
  const readyLog = logMessages.find((m) => m.includes("ready"));
  assert.ok(readyLog, "Should have a 'ready' log message");
  assert.ok(readyLog.includes("10777035071"), "Ready log should include phoneNumberId");
  assert.ok(readyLog.includes("hasToken=true"), "Ready log should include hasToken=true");
});

// ---------------------------------------------------------------------------
// Tests: No server/worker imports, no real network
// ---------------------------------------------------------------------------

test("module does not import bot-worker or server", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const implFile = join(thisDir, "whatsapp-cloud-api-runtime-provider.ts");

  assert.ok(!implFile.endsWith(".test.ts"), "Must resolve to the implementation file");

  const source = readFileSync(implFile, "utf-8");
  const importLines = source.split("\n").filter((line) => /^\s*import\s/.test(line));

  for (const line of importLines) {
    assert.ok(!line.includes("bot-worker"), `Must not import bot-worker: ${line.trim()}`);
    assert.ok(!line.includes("server.ts"), `Must not import server.ts: ${line.trim()}`);
    assert.ok(!line.includes("ai-handler"), `Must not import ai-handler: ${line.trim()}`);
    assert.ok(!line.includes("tracked-sender"), `Must not import tracked-sender: ${line.trim()}`);
    assert.ok(!line.includes("db-service"), `Must not import db-service: ${line.trim()}`);
  }
});

test("no real network requests in tests — all fetch calls use injected mock", () => {
  // All tests above inject fetchImpl from makeMockFetch().
  // This test verifies by static inspection that the builder itself does not
  // hardcode any fetch call — it only uses the injected fetchImpl.
  const implSource = createWhatsAppCloudApiRuntimeProvider.toString();
  // The implementation should not contain any hardcoded URL
  assert.ok(
    !implSource.includes("graph.facebook.com"),
    "Builder must not hardcode the Cloud API URL (that belongs in the transport provider)",
  );
  // Should not reference global fetch directly (only passes fetchImpl to http client)
  assert.ok(
    !implSource.includes("globalThis.fetch"),
    "Builder must not reference globalThis.fetch directly",
  );
});
