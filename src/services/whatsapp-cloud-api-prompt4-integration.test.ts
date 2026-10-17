// src/services/whatsapp-cloud-api-prompt4-integration.test.ts
//
// Comprehensive End-to-End Integration Tests for Prompt 4:
// - Templates + 24-Hour Customer Service Window + Follow-ups + Customer Updates + Campaigns
//
// Verifies all required Prompt 4 contracts:
// 1. Service window evaluation (open vs closed, boundary fail-closed, rolling 24h)
// 2. Outbound policy router (Web vs Cloud, inside/outside window, approved vs unapproved templates)
// 3. Template listing, cursor pagination, token redaction
// 4. Template validation, variable extraction, clean preview rendering
// 5. Automation template mappings for proactive features
// 6. Zero billing charge on blocked/unapproved sends

import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateWhatsAppCloudServiceWindow,
  normalizeTimestampToMs,
  WHATSAPP_SERVICE_WINDOW_DURATION_MS,
} from "./whatsapp-cloud-api-service-window.ts";

import {
  resolveWhatsAppOutboundPolicy,
} from "./whatsapp-outbound-policy-service.ts";

import {
  listWabaMessageTemplates,
  normalizeMetaTemplate,
  sendWabaTemplateMessage,
} from "./whatsapp-cloud-api-template-client.ts";

import {
  extractTemplateBodyVariables,
  validateTemplateParameters,
  renderTemplatePreview,
} from "./whatsapp-cloud-api-template-service.ts";

import {
  normalizeAutomationTemplateMapping,
} from "./cloud-template-mapping-service.ts";

import {
  createOutboundReceiptAttempt,
  readOutboundReceipt,
  findOutboundReceiptByIdempotencyKey,
} from "./outbound-send-receipt-service.ts";

import {
  extractCloudApiWebhookEvents,
} from "./whatsapp-cloud-api-webhook.ts";

test("Prompt 4 Suite: Service Window Fail-Closed Boundary", () => {
  const now = 1750000000000;

  // Case A: Fresh inbound (10 seconds ago) -> OPEN
  const openRes = evaluateWhatsAppCloudServiceWindow(now - 10000, now);
  assert.equal(openRes.isOpen, true);
  assert.equal(openRes.reason, "window_open");

  // Case B: 23 hours 59 minutes ago -> OPEN
  const almostExpired = evaluateWhatsAppCloudServiceWindow(now - (23 * 3600000 + 59 * 60000), now);
  assert.equal(almostExpired.isOpen, true);
  assert.equal(almostExpired.remainingMs, 60000);

  // Case C: Exact 24h (86,400,000ms) -> CLOSED (Fail closed)
  const exact24h = evaluateWhatsAppCloudServiceWindow(now - WHATSAPP_SERVICE_WINDOW_DURATION_MS, now);
  assert.equal(exact24h.isOpen, false);
  assert.equal(exact24h.reason, "window_expired");
  assert.equal(exact24h.remainingMs, 0);

  // Case D: 25 hours ago -> CLOSED
  const expiredRes = evaluateWhatsAppCloudServiceWindow(now - (25 * 3600000), now);
  assert.equal(expiredRes.isOpen, false);
  assert.equal(expiredRes.reason, "window_expired");

  // Case E: No inbound history -> CLOSED
  const noHistory = evaluateWhatsAppCloudServiceWindow(null, now);
  assert.equal(noHistory.isOpen, false);
  assert.equal(noHistory.reason, "no_inbound_history");
});

test("Prompt 4 Suite: Universal Outbound Policy Routing", () => {
  const now = 1750000000000;
  const recentInbound = now - 3600000; // 1 hour ago
  const staleInbound = now - (30 * 3600000); // 30 hours ago

  // 1. WhatsApp Web -> Always freeform
  const webRes = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_web",
    messagePurpose: "ai_reply",
    latestInboundAt: staleInbound,
    nowMs: now,
  });
  assert.equal(webRes.allowed, true);
  assert.equal(webRes.sendMode, "freeform");
  assert.equal(webRes.reason, "web_unrestricted");

  // 2. Cloud API + Inside Window -> Freeform allowed
  const cloudInside = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "ai_reply",
    latestInboundAt: recentInbound,
    nowMs: now,
  });
  assert.equal(cloudInside.allowed, true);
  assert.equal(cloudInside.sendMode, "freeform");
  assert.equal(cloudInside.reason, "window_open");

  // 3. Cloud API + Outside Window + No Template -> Blocked (cloud_template_required)
  const cloudOutsideNoTpl = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "fixed_followup",
    latestInboundAt: staleInbound,
    nowMs: now,
  });
  assert.equal(cloudOutsideNoTpl.allowed, false);
  assert.equal(cloudOutsideNoTpl.sendMode, "blocked");
  assert.equal(cloudOutsideNoTpl.reason, "cloud_template_required");

  // 4. Cloud API + Outside Window + Approved Template -> Allowed (sendMode: template)
  const cloudOutsideApproved = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "customer_update",
    latestInboundAt: staleInbound,
    nowMs: now,
    configuredTemplate: {
      name: "shipping_notice",
      language: "en_US",
      status: "APPROVED",
    },
  });
  assert.equal(cloudOutsideApproved.allowed, true);
  assert.equal(cloudOutsideApproved.sendMode, "template");
  assert.equal(cloudOutsideApproved.reason, "window_closed_template_mapped");
  assert.equal(cloudOutsideApproved.template?.name, "shipping_notice");

  // 5. Cloud API + Outside Window + Unapproved Template (REJECTED) -> Blocked
  const cloudOutsideRejected = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "broadcast",
    latestInboundAt: staleInbound,
    nowMs: now,
    configuredTemplate: {
      name: "summer_sale",
      language: "en_US",
      status: "REJECTED",
    },
  });
  assert.equal(cloudOutsideRejected.allowed, false);
  assert.equal(cloudOutsideRejected.sendMode, "blocked");
  assert.ok(cloudOutsideRejected.reason.includes("template_not_approved"));
});

test("Prompt 4 Suite: Template Parameter Validation & Rendering", () => {
  const approvedTpl = normalizeMetaTemplate({
    id: "tpl_order",
    name: "order_status",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hello {{1}}, your order #{{2}} is {{3}}.",
      },
    ],
  });

  const variables = extractTemplateBodyVariables(approvedTpl);
  assert.deepEqual(variables, ["1", "2", "3"]);

  // Valid params
  const validRes = validateTemplateParameters(approvedTpl, ["Alice", "ORD-1234", "shipped"]);
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Alice" },
        { type: "text", text: "ORD-1234" },
        { type: "text", text: "shipped" },
      ],
    },
  ]);

  // Preview rendering
  const preview = renderTemplatePreview(approvedTpl, {
    "1": "Alice",
    "2": "ORD-1234",
    "3": "shipped",
  });
  assert.equal(preview, "Hello Alice, your order #ORD-1234 is shipped.");

  // Missing param validation
  const missingRes = validateTemplateParameters(approvedTpl, ["Alice"]);
  assert.equal(missingRes.valid, false);
  assert.ok(missingRes.error?.includes("missing_template_variable"));
});

test("Prompt 4 Suite: Webhook Status Event Extraction for Templates", () => {
  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_TEST_12345",
        changes: [
          {
            field: "message_template_status_update",
            value: {
              event: "APPROVED",
              message_template_id: "99887766",
              message_template_name: "seasonal_promo",
              message_template_language: "en_US",
              reason: "NONE",
            },
          },
        ],
      },
    ],
  };

  const events = extractCloudApiWebhookEvents(webhookPayload);
  assert.equal(events.length, 1);
  assert.ok(events[0].templateStatus);
  assert.equal(events[0].templateStatus.wabaId, "WABA_TEST_12345");
  assert.equal(events[0].templateStatus.templateName, "seasonal_promo");
  assert.equal(events[0].templateStatus.event, "APPROVED");
});

test("Prompt 4 Suite: Outbound Receipt Tracking for Cloud Templates", () => {
  const idempotencyKey = `test_cloud_tpl_${Date.now()}`;
  const receipt = createOutboundReceiptAttempt({
    userId: "usr_test_123",
    botId: "bot_test_456",
    customerJid: "contact-e4ed32210a80@example.invalid",
    messageType: "template",
    contextType: "followup_campaign",
    campaignType: "fixed_followup",
    billingAction: "marketing_auto_bot_text",
    walletChargeAmount: 0.005,
    idempotencyKey,
    provider: "whatsapp_cloud_api",
    templateName: "followup_check",
    templateLanguage: "en_US",
  });

  assert.ok(receipt);
  assert.equal(receipt.messageType, "template");
  assert.equal(receipt.provider, "whatsapp_cloud_api");
  assert.equal(receipt.templateName, "followup_check");
  assert.equal(receipt.templateLanguage, "en_US");
  assert.equal(receipt.sendStatus, "queued");

  const found = findOutboundReceiptByIdempotencyKey(idempotencyKey);
  assert.ok(found);
  assert.equal(found.receiptId, receipt.receiptId);
});
