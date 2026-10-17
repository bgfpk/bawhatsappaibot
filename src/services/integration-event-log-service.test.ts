import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeIntegrationEventStatus,
  publicIntegrationEventLog,
  sanitizeIntegrationEventMetadata,
  summarizeIntegrationEvents,
} from "./integration-event-log-service.ts";

test("normalizeIntegrationEventStatus maps supported statuses", () => {
  assert.equal(normalizeIntegrationEventStatus("success"), "success");
  assert.equal(normalizeIntegrationEventStatus("error"), "failed");
  assert.equal(normalizeIntegrationEventStatus("skip"), "skipped");
  assert.equal(normalizeIntegrationEventStatus("duplicate"), "duplicate");
  assert.equal(normalizeIntegrationEventStatus("unknown"), "failed");
});

test("sanitizeIntegrationEventMetadata keeps safe fields and drops secrets", () => {
  const metadata = sanitizeIntegrationEventMetadata({
    name: "Ali",
    email: "contact-9d86ec2b59bb@example.invalid",
    apiKey: "secret",
    webhookSecret: "secret",
    pageUrl: "https://example.com/pricing",
    message: "long customer message should not be stored here",
  });

  assert.deepEqual(metadata, {
    name: "Ali",
    email: "contact-9d86ec2b59bb@example.invalid",
    pageUrl: "https://example.com/pricing",
  });
});

test("publicIntegrationEventLog normalizes lightweight event rows", () => {
  const row = publicIntegrationEventLog({
    id: "evt_1",
    provider: "woocommerce",
    eventType: "order.created",
    status: "success",
    idempotencyKey: "order_100",
    metadata: { orderId: "100", token: "hidden" },
    createdAt: 123,
  });

  assert.equal(row.id, "evt_1");
  assert.equal(row.provider, "woocommerce");
  assert.equal(row.status, "success");
  assert.deepEqual(row.metadata, { orderId: "100" });
});

test("summarizeIntegrationEvents reports last success/failure and counts", () => {
  const summary = summarizeIntegrationEvents([
    { id: "fail", status: "failed", reason: "bad auth", createdAt: 30 },
    { id: "duplicate", status: "duplicate", createdAt: 20 },
    { id: "success", status: "success", leadId: "lead_1", createdAt: 10 },
  ]);

  assert.equal(summary.recentCount, 3);
  assert.equal(summary.counts.total, 3);
  assert.equal(summary.counts.success, 1);
  assert.equal(summary.counts.failed, 1);
  assert.equal(summary.counts.duplicate, 1);
  assert.equal(summary.lastSuccess?.id, "success");
  assert.equal(summary.lastFailure?.id, "fail");
});
