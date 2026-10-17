import test from "node:test";
import assert from "node:assert/strict";
import {
  CRM_AGENT_MODE_ACTION,
  CRM_AGENT_MODE_AI_ACTION,
  CRM_AGENT_MODE_RULE_ACTION,
  deriveCrmAgentModeCandidates,
  getCrmAgentModeBillingAction,
  isCrmAgentActionSafe,
  normalizeCrmAgentModeSettings,
  runCrmAgentMode,
} from "./crm-agent-mode-service.ts";

test("CRM Agent Mode derives only enabled safe action categories", () => {
  const candidates = deriveCrmAgentModeCandidates({
    settings: { enabled: true, categories: { updateStageStatus: false, assignLeads: true, createFollowUps: false } },
    leads: [{ id: "lead_1", status: "Quotation Needed", dealStage: "Lead", productInterest: "Plan A", latestActivityAt: 20 }],
    assignedUsers: ["Sara"],
    now: 200000,
  });

  assert.equal(candidates.some((item) => item.action.id === "assign_lead"), true);
  assert.equal(candidates.some((item) => item.action.kind === "create_follow_up"), false);
});

test("CRM Agent Mode blocks won/lost/order-close actions even when smart action marks safe", () => {
  assert.equal(isCrmAgentActionSafe({ id: "confirm_order_stage", safe: true, kind: "update_status", payload: { status: "Order Confirmed" } }, { categories: { updateStageStatus: true } }), false);
  assert.equal(isCrmAgentActionSafe({ id: "send_quotation", safe: true, kind: "update_status", payload: { status: "Quotation Needed", dealStage: "Quotation" } }, { categories: { updateStageStatus: true } }), true);
});

test("CRM Agent Mode idempotency filters successful action keys", () => {
  const candidates = deriveCrmAgentModeCandidates({
    settings: { enabled: true },
    leads: [{ id: "lead_1", status: "New", dealStage: "Lead", productInterest: "Plan A", latestActivityAt: 20 }],
    assignedUsers: ["Sara"],
    existingActionKeys: ["lead_1:assign_lead:1970-01-03"],
    now: 200000,
  });

  assert.equal(candidates.some((item) => item.action.id === "assign_lead"), false);
});

test("CRM Agent Mode OFF blocks manual and scheduled runs without actions or charges", async () => {
  const charges: any[] = [];
  const applied: any[] = [];
  const logs: any[] = [];
  for (const force of [false, true]) {
    const result = await runCrmAgentMode("acct_1", {
      force,
      now: 200000,
      getState: async () => ({ settings: { enabled: false }, logs: [] }),
      getOverview: async () => {
        throw new Error("disabled should not load overview");
      },
      getUser: async () => ({ wallet_balance: 1 }),
      applyAction: async () => applied.push("apply"),
      chargeAction: async (_accountId: string, action: string) => charges.push(action),
      recordLog: async (_accountId: string, log: any) => {
        logs.push(log);
        return log;
      },
    });

    assert.equal(result.enabled, false);
    assert.equal(result.applied, 0);
    assert.equal(result.agentModeSkippedDisabled, true);
  }

  assert.deepEqual(charges, []);
  assert.deepEqual(applied, []);
  assert.equal(logs.every((log) => log.reason === "agent_mode_disabled" && log.charged === false && log.agentModeSkippedDisabled === true), true);
});

test("CRM Agent Mode applies Basic rule actions for free after successful automated action", async () => {
  const charges: any[] = [];
  const result = await runCrmAgentMode("acct_1", {
    now: 200000,
    getState: async () => ({ settings: { enabled: true, mode: "basic" }, logs: [] }),
    getOverview: async () => ({
      leads: [{ id: "lead_1", status: "New", dealStage: "Lead", productInterest: "Plan A", latestActivityAt: 20 }],
      followUps: [],
      callLogs: [],
      assignedUsers: ["Sara"],
    }),
    getUser: async () => ({ wallet_balance: 1 }),
    applyAction: async () => ({ applied: true }),
    chargeAction: async (_accountId: string, action: string, options: any) => {
      charges.push({ action, options });
      return { charged: true };
    },
    recordLog: async (_accountId: string, log: any) => log,
  });

  assert.equal(result.applied, 1);
  assert.equal(CRM_AGENT_MODE_ACTION, CRM_AGENT_MODE_AI_ACTION);
  assert.deepEqual(charges, []);
  assert.equal(result.logs[0].cost, 0);
  assert.equal(result.logs[0].billingAction, CRM_AGENT_MODE_RULE_ACTION);
  assert.equal(result.logs[0].reason, "free_rule_action");
  assert.equal(result.logs[0].charged, false);
});

test("CRM Agent Mode AI-involved action uses AI tier", () => {
  assert.equal(getCrmAgentModeBillingAction({ id: "ai", aiInvolved: true }), CRM_AGENT_MODE_AI_ACTION);
  assert.equal(getCrmAgentModeBillingAction({ id: "rule", kind: "update_status" }), CRM_AGENT_MODE_RULE_ACTION);
});

test("CRM Agent Mode normalizes Basic and Advanced modes", () => {
  assert.equal(normalizeCrmAgentModeSettings({ enabled: true }).mode, "basic");
  assert.equal(normalizeCrmAgentModeSettings({ enabled: true, mode: "advanced" }).mode, "advanced");
  assert.equal(normalizeCrmAgentModeSettings({ enabled: true, mode: "bad" }).mode, "basic");
  assert.equal(normalizeCrmAgentModeSettings({ enabled: true }).maxActions, 5);
  assert.equal(normalizeCrmAgentModeSettings({ enabled: true, maxActions: 50 }).maxActions, 10);
});

test("CRM Agent Mode Advanced charges AI-involved successful actions only once", async () => {
  const charges: any[] = [];
  const result = await runCrmAgentMode("acct_1", {
    now: 200000,
    getState: async () => ({ settings: { enabled: true, mode: "advanced" }, logs: [] }),
    getOverview: async () => ({ leads: [], followUps: [], callLogs: [], assignedUsers: [] }),
    deriveCandidates: () => [{
      leadId: "lead_1",
      leadName: "Ayesha",
      actionKey: "lead_1:ai_plan:1970-01-03",
      action: {
        id: "ai_plan",
        title: "AI planning action",
        kind: "ai_action",
        safe: true,
        priority: "high",
        aiInvolved: true,
      },
    }],
    getUser: async () => ({ wallet_balance: 1 }),
    applyAction: async () => ({ applied: true }),
    chargeAction: async (_accountId: string, action: string, options: any) => {
      charges.push({ action, options });
      return { charged: true };
    },
    recordLog: async (_accountId: string, log: any) => log,
  });

  assert.equal(result.applied, 1);
  assert.deepEqual(charges.map((item) => item.action), [CRM_AGENT_MODE_AI_ACTION]);
  assert.equal(result.logs[0].cost, 0.003);
  assert.equal(result.logs[0].billingAction, CRM_AGENT_MODE_AI_ACTION);
  assert.equal(result.logs[0].charged, true);
});

test("CRM Agent Mode Advanced rule-only actions remain free", async () => {
  const charges: any[] = [];
  const result = await runCrmAgentMode("acct_1", {
    now: 200000,
    getState: async () => ({ settings: { enabled: true, mode: "advanced" }, logs: [] }),
    getOverview: async () => ({ leads: [], followUps: [], callLogs: [], assignedUsers: [] }),
    deriveCandidates: () => [{
      leadId: "lead_1",
      leadName: "Ayesha",
      actionKey: "lead_1:assign_lead:1970-01-03",
      action: {
        id: "assign_lead",
        title: "Assign lead",
        kind: "assign_lead",
        safe: true,
        priority: "high",
      },
    }],
    getUser: async () => ({ wallet_balance: 0 }),
    applyAction: async () => ({ applied: true }),
    chargeAction: async (_accountId: string, action: string) => charges.push(action),
    recordLog: async (_accountId: string, log: any) => log,
  });

  assert.equal(result.applied, 1);
  assert.deepEqual(charges, []);
  assert.equal(result.logs[0].cost, 0);
  assert.equal(result.logs[0].billingAction, CRM_AGENT_MODE_RULE_ACTION);
});

test("CRM Agent Mode Advanced duplicate AI charge marker does not debit twice", async () => {
  const charges: any[] = [];
  const result = await runCrmAgentMode("acct_1", {
    now: 200000,
    getState: async () => ({ settings: { enabled: true, mode: "advanced" }, logs: [] }),
    getOverview: async () => ({ leads: [], followUps: [], callLogs: [], assignedUsers: [] }),
    deriveCandidates: () => [{
      leadId: "lead_1",
      leadName: "Ayesha",
      actionKey: "lead_1:ai_plan:1970-01-03",
      action: {
        id: "ai_plan",
        title: "AI planning action",
        kind: "ai_action",
        safe: true,
        priority: "high",
        aiInvolved: true,
      },
    }],
    getUser: async () => ({ wallet_balance: 1 }),
    applyAction: async () => ({ applied: true }),
    chargeAction: async (_accountId: string, action: string) => {
      charges.push(action);
      return { charged: false, duplicate: true };
    },
    recordLog: async (_accountId: string, log: any) => log,
  });

  assert.equal(result.applied, 1);
  assert.deepEqual(charges, [CRM_AGENT_MODE_AI_ACTION]);
  assert.equal(result.logs[0].charged, false);
  assert.equal(result.logs[0].duplicateCharge, true);
  assert.equal(result.logs[0].cost, 0);
  assert.equal(result.logs[0].reason, "duplicate_charge_marker");
});

test("CRM Agent Mode does not charge skipped, failed, duplicate, unsafe, or wallet-blocked actions", async () => {
  const charges: any[] = [];
  const result = await runCrmAgentMode("acct_1", {
    now: 200000,
    getState: async () => ({ settings: { enabled: true, mode: "advanced" }, logs: [] }),
    getOverview: async () => ({ leads: [], followUps: [], callLogs: [], assignedUsers: [] }),
    deriveCandidates: () => [{
      leadId: "lead_1",
      leadName: "Ayesha",
      actionKey: "lead_1:ai_plan:1970-01-03",
      action: {
        id: "ai_plan",
        title: "AI planning action",
        kind: "ai_action",
        safe: true,
        priority: "high",
        aiInvolved: true,
      },
    }],
    getUser: async () => ({ wallet_balance: 0 }),
    applyAction: async () => { throw new Error("should not apply"); },
    chargeAction: async (_accountId: string, action: string) => charges.push(action),
    recordLog: async (_accountId: string, log: any) => log,
  });

  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(charges, []);
});

test("CRM Agent Mode returns audit summary and respects normalized settings maxActions", async () => {
  const result = await runCrmAgentMode("acct_1", {
    now: 200000,
    getState: async () => ({
      settings: { enabled: true, mode: "advanced", maxActions: 50 },
      logs: [{ status: "skipped", reason: "duplicate", charged: false, cost: 0 }],
    }),
    getOverview: async () => ({ leads: [], followUps: [], callLogs: [], assignedUsers: [] }),
    deriveCandidates: ({ maxActions }: any) => {
      assert.equal(maxActions, 10);
      return [{
        leadId: "lead_1",
        leadName: "Ayesha",
        actionKey: "lead_1:assign_lead:1970-01-03",
        action: {
          id: "assign_lead",
          title: "Assign lead",
          kind: "assign_lead",
          safe: true,
          priority: "high",
        },
      }];
    },
    getUser: async () => ({ wallet_balance: 1 }),
    applyAction: async () => ({ applied: true }),
    chargeAction: async () => ({ charged: false, free: true }),
    recordLog: async (_accountId: string, log: any) => log,
  });

  assert.equal(result.settings.maxActions, 10);
  assert.equal(result.auditSummary.applied, 1);
  assert.equal(result.auditSummary.skipped, 1);
  assert.equal(result.auditSummary.reasonBreakdown.duplicate, 1);
  assert.equal(result.auditSummary.recommendation.includes("Keep limits conservative"), true);
});
