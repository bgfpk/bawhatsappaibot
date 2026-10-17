// src/services/whatsapp-cloud-api-service-window.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWhatsAppCloudServiceWindow,
  normalizeTimestampToMs,
  resolveCustomerServiceWindow,
  WHATSAPP_SERVICE_WINDOW_DURATION_MS,
} from "./whatsapp-cloud-api-service-window.ts";

test("evaluateWhatsAppCloudServiceWindow: no inbound timestamp returns closed", () => {
  const result1 = evaluateWhatsAppCloudServiceWindow(null);
  assert.equal(result1.isOpen, false);
  assert.equal(result1.latestInboundAt, null);
  assert.equal(result1.expiresAt, null);
  assert.equal(result1.remainingMs, 0);
  assert.equal(result1.reason, "no_inbound_history");

  const result2 = evaluateWhatsAppCloudServiceWindow(undefined);
  assert.equal(result2.isOpen, false);
  assert.equal(result2.reason, "no_inbound_history");

  const result3 = evaluateWhatsAppCloudServiceWindow(0);
  assert.equal(result3.isOpen, false);
  assert.equal(result3.reason, "no_inbound_history");
});

test("evaluateWhatsAppCloudServiceWindow: fresh inbound message is open", () => {
  const now = 1700000000000;
  const latestInbound = now - 5000; // 5 seconds ago
  const result = evaluateWhatsAppCloudServiceWindow(latestInbound, now);

  assert.equal(result.isOpen, true);
  assert.equal(result.latestInboundAt, latestInbound);
  assert.equal(result.expiresAt, latestInbound + WHATSAPP_SERVICE_WINDOW_DURATION_MS);
  assert.equal(result.remainingMs, WHATSAPP_SERVICE_WINDOW_DURATION_MS - 5000);
  assert.equal(result.reason, "window_open");
});

test("evaluateWhatsAppCloudServiceWindow: 23 hours 59 minutes is open", () => {
  const now = 1700000000000;
  const elapsedMs = 23 * 60 * 60 * 1000 + 59 * 60 * 1000; // 23h 59m
  const latestInbound = now - elapsedMs;
  const result = evaluateWhatsAppCloudServiceWindow(latestInbound, now);

  assert.equal(result.isOpen, true);
  assert.equal(result.remainingMs, 60 * 1000); // 1 minute remaining
  assert.equal(result.reason, "window_open");
});

test("evaluateWhatsAppCloudServiceWindow: 1ms before 24h expiry is open", () => {
  const now = 1700000000000;
  const latestInbound = now - (WHATSAPP_SERVICE_WINDOW_DURATION_MS - 1);
  const result = evaluateWhatsAppCloudServiceWindow(latestInbound, now);

  assert.equal(result.isOpen, true);
  assert.equal(result.remainingMs, 1);
  assert.equal(result.reason, "window_open");
});

test("evaluateWhatsAppCloudServiceWindow: exact 24h boundary is closed (fail closed)", () => {
  const now = 1700000000000;
  const latestInbound = now - WHATSAPP_SERVICE_WINDOW_DURATION_MS;
  const result = evaluateWhatsAppCloudServiceWindow(latestInbound, now);

  assert.equal(result.isOpen, false);
  assert.equal(result.remainingMs, 0);
  assert.equal(result.expiresAt, now);
  assert.equal(result.reason, "window_expired");
});

test("evaluateWhatsAppCloudServiceWindow: 1ms after 24h boundary is closed", () => {
  const now = 1700000000000;
  const latestInbound = now - (WHATSAPP_SERVICE_WINDOW_DURATION_MS + 1);
  const result = evaluateWhatsAppCloudServiceWindow(latestInbound, now);

  assert.equal(result.isOpen, false);
  assert.equal(result.remainingMs, 0);
  assert.equal(result.reason, "window_expired");
});

test("evaluateWhatsAppCloudServiceWindow: 48 hours after inbound is closed", () => {
  const now = 1700000000000;
  const latestInbound = now - (48 * 60 * 60 * 1000);
  const result = evaluateWhatsAppCloudServiceWindow(latestInbound, now);

  assert.equal(result.isOpen, false);
  assert.equal(result.remainingMs, 0);
  assert.equal(result.reason, "window_expired");
});

test("normalizeTimestampToMs handles both seconds and milliseconds", () => {
  // Seconds (10 digits)
  assert.equal(normalizeTimestampToMs(1700000000), 1700000000000);
  // Milliseconds (13 digits)
  assert.equal(normalizeTimestampToMs(1700000000123), 1700000000123);
  // String seconds
  assert.equal(normalizeTimestampToMs("1353143134"), 1700000000000);
  // Invalid
  assert.equal(normalizeTimestampToMs("not_a_number"), null);
  assert.equal(normalizeTimestampToMs(null), null);
  assert.equal(normalizeTimestampToMs(-100), null);
});

test("resolveCustomerServiceWindow derives from customer profile lastInboundWhatsAppAt", async () => {
  const now = 1700000000000;
  const profile = {
    lastInboundWhatsAppAt: now - 3600000, // 1 hour ago
    lastBotMessageAt: now - 60000,
  };

  const result = await resolveCustomerServiceWindow({
    customerProfile: profile,
    nowMs: now,
  });

  assert.equal(result.isOpen, true);
  assert.equal(result.latestInboundAt, now - 3600000);
  assert.equal(result.remainingMs, 23 * 3600000);
});

test("resolveCustomerServiceWindow returns closed when profile has no inbound timestamp", async () => {
  const profile = {
    lastBotMessageAt: Date.now() - 60000,
    name: "Customer A",
  };

  const result = await resolveCustomerServiceWindow({
    customerProfile: profile,
  });

  assert.equal(result.isOpen, false);
  assert.equal(result.reason, "no_inbound_history");
});
