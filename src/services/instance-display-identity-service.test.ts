import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInstanceIdentitySummary,
  formatInstancePhone,
  getInstanceConnectionStatus,
  getInstanceDisplayIdentity,
  getInstanceShortIdentity,
  normalizeInstancePhone,
} from "./instance-display-identity-service.ts";

test("normalizeInstancePhone extracts phone from WhatsApp JID formats", () => {
  assert.equal(normalizeInstancePhone("contact-e4ed32210a80@example.invalid"), "195545134641");
  assert.equal(normalizeInstancePhone("923001234567:contact-3b974a7f1d9b@example.invalid"), "195545134641");
  assert.equal(normalizeInstancePhone("+92 300 1234567"), "195545134641");
  assert.equal(normalizeInstancePhone("abc"), "");
});

test("formatInstancePhone returns a readable phone label", () => {
  assert.equal(formatInstancePhone("contact-e4ed32210a80@example.invalid"), "+144225232320");
  assert.equal(formatInstancePhone(""), "");
});

test("getInstanceDisplayIdentity prefers connected WhatsApp number", () => {
  const label = getInstanceDisplayIdentity({
    $id: "bot_random123",
    name: "Main Sales Number",
    jid: "contact-e4ed32210a80@example.invalid",
  });

  assert.equal(label, "+923001234567 · Main Sales Number");
});

test("getInstanceDisplayIdentity falls back safely before connection", () => {
  assert.equal(getInstanceDisplayIdentity({ name: "Main Sales Number" }), "Main Sales Number · Not connected");
  assert.equal(getInstanceDisplayIdentity({ $id: "bot_random123" }), "bot_random123 · Not connected");
  assert.equal(getInstanceShortIdentity({ $id: "bot_random123" }), "bot_random123");
});

test("getInstanceConnectionStatus derives connected and inactive states", () => {
  assert.equal(getInstanceConnectionStatus({ jid: "contact-e4ed32210a80@example.invalid" }), "connected");
  assert.equal(getInstanceConnectionStatus({ is_active: 0 }), "inactive");
  assert.equal(getInstanceConnectionStatus({ connectionStatus: "QR-READY" }), "qr-ready");
});

test("buildInstanceIdentitySummary exposes visible identity and internal id separately", () => {
  const summary = buildInstanceIdentitySummary({
    $id: "bot_random123",
    name: "Main Sales Number",
    jid: "contact-e4ed32210a80@example.invalid",
  });

  assert.deepEqual(summary, {
    displayIdentity: "+923001234567 · Main Sales Number",
    shortIdentity: "+144225232320",
    phone: "+144225232320",
    connectedNumber: "+144225232320",
    internalId: "bot_random123",
    name: "Main Sales Number",
    status: "connected",
    isConnected: true,
  });
});
