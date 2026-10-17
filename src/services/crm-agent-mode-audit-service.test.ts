import test from "node:test";
import assert from "node:assert/strict";

import {
  getCrmAgentModeReasonBucket,
  normalizeCrmAgentModeAuditStatus,
  summarizeCrmAgentModeAudit,
} from "./crm-agent-mode-audit-service.ts";

test("normalizeCrmAgentModeAuditStatus maps common statuses", () => {
  assert.equal(normalizeCrmAgentModeAuditStatus("applied"), "success");
  assert.equal(normalizeCrmAgentModeAuditStatus("success"), "success");
  assert.equal(normalizeCrmAgentModeAuditStatus("skip"), "skipped");
  assert.equal(normalizeCrmAgentModeAuditStatus("error"), "failed");
  assert.equal(normalizeCrmAgentModeAuditStatus("other"), "unknown");
});

test("getCrmAgentModeReasonBucket groups important safety reasons", () => {
  assert.equal(getCrmAgentModeReasonBucket("agent_mode_disabled"), "disabled");
  assert.equal(getCrmAgentModeReasonBucket("insufficient_wallet"), "wallet_blocked");
  assert.equal(getCrmAgentModeReasonBucket("duplicate_charge_marker"), "duplicate");
  assert.equal(getCrmAgentModeReasonBucket("unsafe action blocked"), "unsafe");
  assert.equal(getCrmAgentModeReasonBucket("no_op"), "no_op");
});

test("summarizeCrmAgentModeAudit reports counts, costs, buckets, and recommendation", () => {
  const summary = summarizeCrmAgentModeAudit([
    { status: "success", reason: "charged", charged: true, cost: 0.003, createdAt: 100 },
    { status: "skipped", reason: "insufficient_wallet", charged: false, cost: 0, createdAt: 110 },
    { status: "failed", reason: "apply_failed", charged: false, cost: 0, createdAt: 120 },
    { status: "success", reason: "duplicate_charge_marker", charged: false, cost: 0, createdAt: 130, duplicateCharge: true } as any,
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.applied, 2);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.charged, 1);
  assert.equal(summary.duplicateCharges, 1);
  assert.equal(summary.totalChargedCost, 0.003);
  assert.equal(summary.reasonBreakdown.wallet_blocked, 1);
  assert.equal(summary.reasonBreakdown.apply_failed, 1);
  assert.equal(summary.lastActionAt, 130);
  assert.ok(summary.riskFlags.includes("failed_actions_present"));
  assert.ok(summary.riskFlags.includes("wallet_blocks_present"));
  assert.ok(summary.riskFlags.includes("duplicate_charge_markers_present"));
  assert.match(summary.recommendation, /Review failed Agent Mode actions/i);
});

test("summarizeCrmAgentModeAudit handles empty logs", () => {
  const summary = summarizeCrmAgentModeAudit([]);

  assert.equal(summary.total, 0);
  assert.match(summary.recommendation, /No Agent Mode runs/i);
});
