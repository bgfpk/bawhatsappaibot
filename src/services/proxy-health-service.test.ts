import assert from "node:assert/strict";
import test from "node:test";

import { maskProxyUrl, normalizeProxyUrl } from "./proxy-agent-service.ts";
import {
  checkSystemProxy,
  sanitizeProxyErrorMessage,
  shouldTreatAsGenericProxyFailure,
  testProxyUrl,
} from "./proxy-health-service.ts";

test("webshare-style proxy URL stays raw internally and masked only for display", () => {
  const raw = "http://username:secret-password@198.51.100.10:8080";
  assert.equal(normalizeProxyUrl(raw), raw);
  assert.equal(maskProxyUrl(raw), "http://username:***@198.51.100.10:8080/");
});

test("generic proxy check success still returns success when WhatsApp suitability fails", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: any) => {
    const href = String(url);
    if (href.includes("ipv4.webshare.io")) {
      return new Response("198.51.100.20", { status: 200 });
    }
    if (href.includes("web.whatsapp.com")) {
      throw new Error("WhatsApp timed out");
    }
    throw new Error("Unexpected URL");
  });

  const result = await testProxyUrl("http://username:secret-password@198.51.100.10:8080");
  assert.equal(result.latency >= 0, true);
  assert.equal(result.whatsappReachable, false);
  assert.match(result.whatsappWarning, /WhatsApp timed out/);
  assert.equal(fetchMock.mock.calls.length, 2);
});

test("generic proxy failure sanitizes any credential-bearing URL from the error", () => {
  const error = new Error("Proxy http://username:secret-password@198.51.100.10:8080 failed with 407");
  const sanitized = sanitizeProxyErrorMessage(error);
  assert.match(sanitized, /username:\*\*\*/);
  assert.doesNotMatch(sanitized, /secret-password/);
});

test("generic proxy check failure marks system proxy as errored with a sanitized reason", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Proxy http://username:secret-password@198.51.100.10:8080 failed with 407");
  });

  const updates: Array<{ id: string; latency: number | null; errorMsg: string | null }> = [];
  const result = await checkSystemProxy({
    id: "proxy-1",
    url: "http://username:secret-password@198.51.100.10:8080",
  }, {
    getSystemProxies: async () => [],
    updateSystemProxyStatus: async (id, latency, errorMsg) => {
      updates.push({ id, latency, errorMsg });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.latency, null);
  assert.match(String(updates[0]?.errorMsg || ""), /username:\*\*\*/);
  assert.doesNotMatch(String(updates[0]?.errorMsg || ""), /secret-password/);
});

test("WhatsApp-specific failure is not treated as a generic dead proxy signal", () => {
  assert.equal(shouldTreatAsGenericProxyFailure(new Error("WhatsApp connection closed before stable session")), false);
  assert.equal(shouldTreatAsGenericProxyFailure(new Error("Proxy authentication failed with HTTP 407")), true);
});
