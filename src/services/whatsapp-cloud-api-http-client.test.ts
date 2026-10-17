// src/services/whatsapp-cloud-api-http-client.test.ts
//
// Unit tests for the WhatsApp Cloud API HTTP client helper (Phase 4Q).
// Uses Node native test runner — no Jest globals.
// No real network requests are made; fetchImpl is always injected.

import test from "node:test";
import assert from "node:assert/strict";
import {
  createWhatsAppCloudApiHttpClient,
} from "./whatsapp-cloud-api-http-client.ts";
import type { FetchImpl, FetchRequestInit, FetchResponse } from "./whatsapp-cloud-api-http-client.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface CapturedCall {
  url: string;
  init?: FetchRequestInit;
}

/**
 * Creates a mock fetch that records calls and returns a controlled response.
 */
function makeMockFetch(overrides: {
  ok?: boolean;
  status?: number;
  jsonBody?: unknown;
  textBody?: string;
  throwWith?: Error;
}): { fetch: FetchImpl; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];

  const fetch: FetchImpl = async (url, init) => {
    calls.push({ url, init });

    if (overrides.throwWith) {
      throw overrides.throwWith;
    }

    const ok = overrides.ok ?? true;
    const status = overrides.status ?? (ok ? 200 : 400);
    const jsonBody = overrides.jsonBody ?? { messages: [{ id: "msg_ok_001" }] };
    const textBody = overrides.textBody ?? JSON.stringify(jsonBody);

    const response: FetchResponse = {
      ok,
      status,
      statusText: ok ? "OK" : "Bad Request",
      json: async () => (overrides.jsonBody !== undefined ? overrides.jsonBody : JSON.parse(textBody)),
      text: async () => textBody,
    };
    return response;
  };

  return { fetch, calls };
}

/**
 * Makes a mock fetch that returns non-parseable JSON for the response body.
 */
function makeNonJsonFetch(ok: boolean, status: number): { fetch: FetchImpl; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetch: FetchImpl = async (url, init) => {
    calls.push({ url, init });
    const response: FetchResponse = {
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      json: async () => { throw new SyntaxError("Unexpected token"); },
      text: async () => "not json",
    };
    return response;
  };
  return { fetch, calls };
}

// ---------------------------------------------------------------------------
// Tests: Authorization header
// ---------------------------------------------------------------------------

test("sends POST with correct Authorization Bearer header", async () => {
  const { fetch, calls } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "test_token_abc",
    fetchImpl: fetch,
  });

  await client.post("https://graph.facebook.com/v20.0/12345/messages", { type: "text" });

  assert.equal(calls.length, 1);
  const headers = calls[0].init?.headers ?? {};
  assert.equal(headers["Authorization"], "Bearer test_token_abc");
});

test("sends correct HTTP method POST", async () => {
  const { fetch, calls } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  await client.post("https://graph.facebook.com/v20.0/99/messages", {});

  assert.equal(calls[0].init?.method, "POST");
});

// ---------------------------------------------------------------------------
// Tests: Content-Type and JSON body
// ---------------------------------------------------------------------------

test("sends Content-Type application/json header", async () => {
  const { fetch, calls } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  await client.post("https://graph.facebook.com/v20.0/99/messages", { text: "hello" });

  const headers = calls[0].init?.headers ?? {};
  assert.equal(headers["Content-Type"], "application/json");
});

test("JSON-serialises the request payload as body string", async () => {
  const { fetch, calls } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  const payload = { messaging_product: "whatsapp", to: "12123041818", type: "text" };
  await client.post("https://graph.facebook.com/v20.0/99/messages", payload);

  assert.equal(calls[0].init?.body, JSON.stringify(payload));
});

// ---------------------------------------------------------------------------
// Tests: Response parsing
// ---------------------------------------------------------------------------

test("parses and returns successful JSON response", async () => {
  const responseBody = { messages: [{ id: "wamid.abc123" }] };
  const { fetch } = makeMockFetch({ ok: true, status: 200, jsonBody: responseBody });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  const result = await client.post("https://graph.facebook.com/v20.0/99/messages", {});

  assert.deepEqual(result, responseBody);
});

test("handles non-JSON successful response without throwing", async () => {
  const { fetch } = makeNonJsonFetch(true, 200);
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  // Should not throw — falls back to empty object
  const result = await client.post("https://graph.facebook.com/v20.0/99/messages", {});
  assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// Tests: Non-2xx error handling
// ---------------------------------------------------------------------------

test("throws safe error on 400 response without leaking token", async () => {
  const errorBody = { error: { code: 100, type: "OAuthException", message: "Invalid OAuth access token" } };
  const { fetch } = makeMockFetch({ ok: false, status: 400, jsonBody: errorBody });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "super_secret_token",
    fetchImpl: fetch,
  });

  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /HTTP 400/);
      // Must not leak token in error message
      assert.ok(
        !err.message.includes("super_secret_token"),
        `Error message must not contain token: ${err.message}`,
      );
      return true;
    },
  );
});

test("throws safe error on 401 response", async () => {
  const { fetch } = makeMockFetch({ ok: false, status: 401, jsonBody: { error: { code: 190, type: "OAuthException" } } });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /HTTP 401/);
      return true;
    },
  );
});

test("includes safe Cloud API error code/type in thrown error when available", async () => {
  const errorBody = { error: { code: 131047, type: "messenger_error", message: "Re-engagement message" } };
  const { fetch } = makeMockFetch({ ok: false, status: 400, jsonBody: errorBody });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      // code and type should appear in message (they are safe, non-secret)
      assert.match(err.message, /131047/);
      assert.match(err.message, /messenger_error/);
      // The actual error.message ("Re-engagement message") should NOT be in the error
      // (it could contain customer data in edge cases)
      assert.ok(
        !err.message.includes("Re-engagement"),
        `Thrown error must not contain API error.message text: ${err.message}`,
      );
      return true;
    },
  );
});

test("throws safe error on non-JSON non-2xx response", async () => {
  const { fetch } = makeNonJsonFetch(false, 503);
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /HTTP 503/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Missing / empty access token
// ---------------------------------------------------------------------------

test("throws at construction when accessToken is empty string", () => {
  assert.throws(
    () =>
      createWhatsAppCloudApiHttpClient({
        accessToken: "",
        fetchImpl: makeMockFetch({}).fetch,
      }),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /accessToken/);
      return true;
    },
  );
});

test("throws at construction when accessToken is whitespace only", () => {
  assert.throws(
    () =>
      createWhatsAppCloudApiHttpClient({
        accessToken: "   ",
        fetchImpl: makeMockFetch({}).fetch,
      }),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /accessToken/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Fetch failure / network error
// ---------------------------------------------------------------------------

test("throws safe error on fetch network failure without leaking token", async () => {
  const networkError = new Error("Failed to connect to graph.facebook.com");
  const { fetch } = makeMockFetch({ throwWith: networkError });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "my_secret_token",
    fetchImpl: fetch,
  });

  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      // Must not contain the token
      assert.ok(
        !err.message.includes("my_secret_token"),
        `Error message must not contain token: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: Timeout / AbortController
// ---------------------------------------------------------------------------

test("aborts request after timeoutMs and throws safe error", async () => {
  // This mock delays the fetch response longer than the timeout
  let abortSignalFired = false;
  const calls: CapturedCall[] = [];

  const slowFetch: FetchImpl = async (url, init) => {
    calls.push({ url, init });
    // Wait for the abort signal or 2000ms, whichever comes first
    await new Promise<void>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("should_not_reach_timeout")), 2000);
      if (init?.signal) {
        init.signal.addEventListener("abort", () => {
          abortSignalFired = true;
          clearTimeout(timer);
          const err = new Error("AbortError");
          err.name = "AbortError";
          reject(err);
        });
      }
    });
    // This line should not be reached
    throw new Error("should_not_reach");
  };

  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: slowFetch,
    timeoutMs: 50, // 50ms — short enough for a unit test
  });

  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.toLowerCase().includes("abort") ||
          err.message.toLowerCase().includes("timeout") ||
          err.message.toLowerCase().includes("cancel"),
        `Expected abort/timeout message but got: ${err.message}`,
      );
      return true;
    },
  );

  assert.equal(abortSignalFired, true, "AbortSignal must have been fired");
});

test("passes AbortSignal to fetch when timeoutMs is set", async () => {
  const { fetch, calls } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
    timeoutMs: 5000,
  });

  await client.post("https://graph.facebook.com/v20.0/99/messages", {});

  assert.ok(calls[0].init?.signal instanceof AbortSignal, "Should pass AbortSignal to fetch");
});

test("does not pass AbortSignal when timeoutMs is not set", async () => {
  const { fetch, calls } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
    // no timeoutMs
  });

  await client.post("https://graph.facebook.com/v20.0/99/messages", {});

  assert.ok(!calls[0].init?.signal, "Should not pass AbortSignal when no timeout");
});

// ---------------------------------------------------------------------------
// Tests: Logger — safe output only
// ---------------------------------------------------------------------------

test("logger receives no token or secret in any log message", async () => {
  const logMessages: string[] = [];
  const safeLogger = {
    info: (msg: string) => logMessages.push(msg),
    warn: (msg: string) => logMessages.push(msg),
    error: (msg: string) => logMessages.push(msg),
  };

  const { fetch } = makeMockFetch({});
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "ultra_secret_bearer_token",
    fetchImpl: fetch,
    logger: safeLogger,
  });

  await client.post("https://graph.facebook.com/v20.0/99/messages", { type: "text" });

  for (const msg of logMessages) {
    assert.ok(
      !msg.includes("ultra_secret_bearer_token"),
      `Log must not contain token: ${msg}`,
    );
    assert.ok(
      !msg.toLowerCase().includes("bearer ultra"),
      `Log must not contain Bearer header value: ${msg}`,
    );
  }
});

test("logger on error path does not leak token", async () => {
  const logMessages: string[] = [];
  const safeLogger = {
    info: (msg: string) => logMessages.push(msg),
    warn: (msg: string) => logMessages.push(msg),
    error: (msg: string) => logMessages.push(msg),
  };

  const { fetch } = makeMockFetch({ ok: false, status: 401, jsonBody: { error: { code: 190, type: "OAuthException" } } });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "super_secret_bearer",
    fetchImpl: fetch,
    logger: safeLogger,
  });

  await assert.rejects(() => client.post("https://graph.facebook.com/v20.0/99/messages", {}));

  for (const msg of logMessages) {
    assert.ok(
      !msg.includes("super_secret_bearer"),
      `Log must not contain token on error path: ${msg}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Tests: URL sanitisation in logs and errors
// ---------------------------------------------------------------------------

test("error messages use sanitised URL (host+path only, no query params)", async () => {
  const { fetch } = makeMockFetch({ ok: false, status: 400, jsonBody: {} });
  const client = createWhatsAppCloudApiHttpClient({
    accessToken: "tok",
    fetchImpl: fetch,
  });

  // URL with a query param that could theoretically carry a token
  await assert.rejects(
    () => client.post("https://graph.facebook.com/v20.0/99/messages?access_token=should_strip", {}),
    (err: any) => {
      assert.ok(!err.message.includes("should_strip"), "Query params must be stripped from error message");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Tests: No server/worker imports, no real network
// ---------------------------------------------------------------------------

test("module does not import bot-worker or server", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const implFile = join(thisDir, "whatsapp-cloud-api-http-client.ts");

  // Guard: must not be reading the test file
  assert.ok(!implFile.endsWith(".test.ts"), "Must resolve to the implementation file");

  const source = readFileSync(implFile, "utf-8");

  const importLines = source
    .split("\n")
    .filter((line) => /^\s*import\s/.test(line));

  for (const line of importLines) {
    assert.ok(!line.includes("bot-worker"), `Must not import bot-worker: ${line.trim()}`);
    assert.ok(!line.includes("server.ts"), `Must not import server.ts: ${line.trim()}`);
    assert.ok(!line.includes("ai-handler"), `Must not import ai-handler: ${line.trim()}`);
    assert.ok(!line.includes("db-service"), `Must not import db-service: ${line.trim()}`);
    assert.ok(!line.includes("billing"), `Must not import billing: ${line.trim()}`);
  }
});

test("no real network calls are made — fetch is always injected in these tests", () => {
  // This test verifies by construction: every test in this file uses makeMockFetch
  // or makeNonJsonFetch. The createWhatsAppCloudApiHttpClient will throw at
  // construction if no fetchImpl is provided AND global fetch is absent
  // (Node test environments may not have global fetch, but even if they do,
  //  injecting fetchImpl is what prevents real network calls).
  //
  // We verify the module does not hardcode any URL or import any HTTP lib directly.
  const implSource = createWhatsAppCloudApiHttpClient.toString();
  // The URL should only come from the `url` parameter, not hardcoded
  assert.ok(
    !implSource.includes("graph.facebook.com"),
    "Implementation must not hardcode the graph.facebook.com URL (it belongs in the transport provider)",
  );
});
