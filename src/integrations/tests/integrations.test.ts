import test from "node:test";
import assert from "node:assert/strict";
import { filterIntegrationEventLogs, maskSecret, type IntegrationEventLogItem } from "../integration-model";
import { PUBLIC_API_SCOPES } from "../../services/public-api-key-service";

test("maskSecret: masks tokens and keys securely", () => {
  assert.equal(maskSecret("bai_live_1234567890abcdef"), "bai_••••••••cdef");
  assert.equal(maskSecret("short"), "••••••••");
  assert.equal(maskSecret(""), "");
});

test("filterIntegrationEventLogs: filters by search term, integration, and status", () => {
  const logs: IntegrationEventLogItem[] = [
    {
      id: "log_1",
      timestamp: 1700000000000,
      integration: "Website Lead API",
      eventType: "lead.captured",
      status: "success",
      sourceRef: "lead_101",
      details: "Lead captured from website form",
    },
    {
      id: "log_2",
      timestamp: 1700000050000,
      integration: "WooCommerce",
      eventType: "order.created",
      status: "failed",
      sourceRef: "ord_202",
      details: "Invalid consumer key signature",
    },
  ];

  const searched = filterIntegrationEventLogs(logs, "captured", "all", "all");
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, "log_1");

  const byIntegration = filterIntegrationEventLogs(logs, "", "WooCommerce", "all");
  assert.equal(byIntegration.length, 1);
  assert.equal(byIntegration[0].id, "log_2");

  const byStatus = filterIntegrationEventLogs(logs, "", "all", "failed");
  assert.equal(byStatus.length, 1);
  assert.equal(byStatus[0].id, "log_2");
});

test("PUBLIC_API_SCOPES: contains authoritative scope list", () => {
  assert.ok(PUBLIC_API_SCOPES.includes("read:account"));
  assert.ok(PUBLIC_API_SCOPES.includes("write:leads"));
  assert.ok(PUBLIC_API_SCOPES.includes("read:orders"));
  assert.ok(PUBLIC_API_SCOPES.includes("write:products"));
});
