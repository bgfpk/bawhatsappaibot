// src/services/whatsapp-outbound-policy-service.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveWhatsAppOutboundPolicy,
} from "./whatsapp-outbound-policy-service.ts";

test("WhatsApp Web: always allows free-form messaging regardless of timestamp", () => {
  const result = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_web",
    messagePurpose: "ai_reply",
    latestInboundAt: null, // no inbound history
  });

  assert.equal(result.allowed, true);
  assert.equal(result.sendMode, "freeform");
  assert.equal(result.reason, "web_unrestricted");
});

test("Cloud API + window OPEN: allows free-form message", () => {
  const now = 1700000000000;
  const latestInbound = now - 60000; // 1 min ago

  const result = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "ai_reply",
    latestInboundAt: latestInbound,
    nowMs: now,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.sendMode, "freeform");
  assert.equal(result.reason, "window_open");
  assert.equal(result.serviceWindow.isOpen, true);
});

test("Cloud API + window CLOSED + no template: blocks with cloud_template_required", () => {
  const now = 1700000000000;
  const latestInbound = now - (25 * 60 * 60 * 1000); // 25 hours ago

  const result = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "fixed_followup",
    latestInboundAt: latestInbound,
    nowMs: now,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.sendMode, "blocked");
  assert.equal(result.reason, "cloud_template_required");
  assert.equal(result.serviceWindow.isOpen, false);
});

test("Cloud API + window CLOSED + approved template: allows template send", () => {
  const now = 1700000000000;
  const latestInbound = now - (25 * 60 * 60 * 1000); // 25 hours ago

  const result = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "fixed_followup",
    latestInboundAt: latestInbound,
    nowMs: now,
    configuredTemplate: {
      name: "followup_check",
      language: "en_US",
      status: "APPROVED",
    },
  });

  assert.equal(result.allowed, true);
  assert.equal(result.sendMode, "template");
  assert.equal(result.reason, "window_closed_template_mapped");
  assert.equal(result.template?.name, "followup_check");
});

test("Cloud API + window CLOSED + pending/rejected template: blocks send", () => {
  const now = 1700000000000;
  const latestInbound = now - (30 * 60 * 60 * 1000);

  const result = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "smart_followup",
    latestInboundAt: latestInbound,
    nowMs: now,
    configuredTemplate: {
      name: "followup_check",
      language: "en_US",
      status: "PENDING",
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.sendMode, "blocked");
  assert.ok(result.reason.includes("template_not_approved"));
});

test("Cloud API + no inbound history: evaluates as closed window and requires template", () => {
  const result = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "broadcast",
    latestInboundAt: null,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.sendMode, "blocked");
  assert.equal(result.reason, "cloud_template_required");
  assert.equal(result.serviceWindow.reason, "no_inbound_history");
});
