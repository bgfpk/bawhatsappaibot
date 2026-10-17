import * as dbService from "./db-service.ts";
import { cleanString, nowSeconds } from "./integration-foundation-store.ts";
import { getUsageBillingDefinition, type BillableUsageAction } from "../config/pricing.ts";
import {
  applyCrmSmartAction,
  getCrmAgentModeState,
  getCrmOverview,
  recordCrmAgentModeLog,
} from "./crm-foundation-service.ts";
import { summarizeCrmAgentModeAudit } from "./crm-agent-mode-audit-service.ts";
import { deriveSmartCrmActions } from "./crm-smart-actions-service.ts";
export { normalizeCrmAgentModeSettings } from "./crm-agent-mode-settings-service.ts";
import { normalizeCrmAgentModeSettings } from "./crm-agent-mode-settings-service.ts";

export const CRM_AGENT_MODE_RULE_ACTION = "agent_mode_rule_action" satisfies BillableUsageAction;
export const CRM_AGENT_MODE_AI_ACTION = "agent_mode_ai_action" satisfies BillableUsageAction;
export const CRM_AGENT_MODE_ACTION = CRM_AGENT_MODE_AI_ACTION;
export const CRM_AGENT_MODE_RULE_PRICE_USD = getUsageBillingDefinition(CRM_AGENT_MODE_RULE_ACTION).priceUsd;
export const CRM_AGENT_MODE_AI_PRICE_USD = getUsageBillingDefinition(CRM_AGENT_MODE_AI_ACTION).priceUsd;
export const CRM_AGENT_MODE_PRICE_USD = CRM_AGENT_MODE_AI_PRICE_USD;

export function getCrmAgentActionCategory(action: any = {}) {
  if (action.kind === "assign_lead") return "assignLeads";
  if (action.kind === "update_fields") return "fillMissingFields";
  if (action.kind === "create_follow_up") return "createFollowUps";
  if (action.kind === "update_status") return "updateStageStatus";
  return "";
}

export function isCrmAgentActionSafe(action: any = {}, settings: any = normalizeCrmAgentModeSettings()) {
  if (action.safe !== true) return false;
  const category = getCrmAgentActionCategory(action);
  if (!category || settings.categories?.[category] === false) return false;
  const blockedId = /won|lost|confirm_order|mark_won_lost|review_lost/i.test(cleanString(action.id, 80));
  const payloadText = [action.payload?.status, action.payload?.dealStage].map((value) => cleanString(value, 80).toLowerCase()).join(" ");
  const blockedOutcome = /\b(completed|lost|cancelled|order confirmed)\b/.test(payloadText);
  return !blockedId && !blockedOutcome;
}

export function buildCrmAgentActionKey(lead: any, action: any, dayKey: string) {
  return [cleanString(lead?.id, 80), cleanString(action?.id, 80), cleanString(dayKey, 20)].filter(Boolean).join(":");
}

export function getCrmAgentModeBillingAction(action: any = {}): BillableUsageAction {
  return action.aiInvolved === true || action.usesAi === true || action.kind === "ai_action"
    ? CRM_AGENT_MODE_AI_ACTION
    : CRM_AGENT_MODE_RULE_ACTION;
}

export function deriveCrmAgentModeCandidates(input: {
  leads?: any[];
  followUps?: any[];
  callLogs?: any[];
  assignedUsers?: string[];
  settings?: any;
  existingActionKeys?: string[];
  now?: number;
  maxActions?: number;
} = {}) {
  const settings = normalizeCrmAgentModeSettings(input.settings);
  const existing = new Set(input.existingActionKeys || []);
  const now = Number(input.now || nowSeconds());
  const dayKey = new Date(now * 1000).toISOString().slice(0, 10);
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const leads = (input.leads || []).slice().sort((a, b) => Number(b.latestActivityAt || 0) - Number(a.latestActivityAt || 0));
  const candidates: any[] = [];
  for (const lead of leads) {
    const actions = deriveSmartCrmActions(lead, {
      followUps: input.followUps || [],
      callLogs: input.callLogs || [],
      assignedUsers: input.assignedUsers || [],
      now,
    });
    for (const action of actions) {
      const actionKey = buildCrmAgentActionKey(lead, action, dayKey);
      if (existing.has(actionKey)) continue;
      if (settings.mode !== "advanced" && getCrmAgentModeBillingAction(action) === CRM_AGENT_MODE_AI_ACTION) continue;
      if (!isCrmAgentActionSafe(action, settings)) continue;
      candidates.push({ leadId: lead.id, leadName: lead.name, action, actionKey });
      break;
    }
  }
  return candidates
    .sort((a, b) => (priorityRank[a.action.priority] ?? 9) - (priorityRank[b.action.priority] ?? 9))
    .slice(0, Math.max(1, Math.min(10, Number(input.maxActions || 5))));
}

export async function runCrmAgentMode(accountId: string, input: any = {}) {
  const deps = {
    getOverview: input.getOverview || getCrmOverview,
    getState: input.getState || getCrmAgentModeState,
    getUser: input.getUser || dbService.getUser,
    applyAction: input.applyAction || applyCrmSmartAction,
    chargeAction: input.chargeAction || dbService.chargeUsageAction,
    recordLog: input.recordLog || recordCrmAgentModeLog,
    deriveCandidates: input.deriveCandidates || deriveCrmAgentModeCandidates,
  };
  const state = await deps.getState(accountId);
  const settings = normalizeCrmAgentModeSettings(input.settings || state.settings);
  if (!settings.enabled) {
    const log = await deps.recordLog(accountId, {
      status: "skipped",
      reason: "agent_mode_disabled",
      title: "Agent Mode skipped: disabled.",
      charged: false,
      cost: 0,
      agentModeSkippedDisabled: true,
    }).catch(() => ({
      status: "skipped",
      reason: "agent_mode_disabled",
      title: "Agent Mode skipped: disabled.",
      charged: false,
      cost: 0,
      agentModeSkippedDisabled: true,
    }));
    console.info("[CRM Agent Mode] agent_mode_skipped_disabled=true");
    return {
      success: true,
      enabled: false,
      applied: 0,
      skipped: 1,
      failed: 0,
      logs: [log],
      auditSummary: summarizeCrmAgentModeAudit([log, ...(state.logs || [])]),
      settings,
      agentModeSkippedDisabled: true,
    };
  }

  const overview = await deps.getOverview(accountId);
  const existingActionKeys = (state.logs || []).filter((log: any) => log.status === "success").map((log: any) => log.actionKey).filter(Boolean);
  const candidates = deps.deriveCandidates({
    leads: overview.leads || [],
    followUps: overview.followUps || [],
    callLogs: overview.callLogs || [],
    assignedUsers: overview.assignedUsers || [],
    settings,
    existingActionKeys,
    now: input.now,
    maxActions: input.maxActions ?? settings.maxActions,
  });

  const logs: any[] = [];
  for (const candidate of candidates) {
    const billingAction = getCrmAgentModeBillingAction(candidate.action);
    const priceUsd = getUsageBillingDefinition(billingAction).priceUsd;
    const user = await deps.getUser(accountId);
    if (priceUsd > 0 && Number(user?.wallet_balance || 0) < priceUsd) {
      const log = await deps.recordLog(accountId, { ...candidate, actionId: candidate.action.id, status: "skipped", reason: "insufficient_wallet", title: "Agent action skipped: wallet blocked." });
      logs.push(log);
      break;
    }
    try {
      const applied = await deps.applyAction(accountId, candidate.leadId, candidate.action.id, { agentMode: true });
      if (!applied?.applied) {
        const log = await deps.recordLog(accountId, { ...candidate, actionId: candidate.action.id, status: "skipped", reason: applied?.duplicate ? "duplicate" : "no_op", title: `Agent skipped: ${candidate.action.title}` });
        logs.push(log);
        continue;
      }
      const charge = priceUsd > 0
        ? await deps.chargeAction(accountId, billingAction, {
            dedupeKey: `crm_agent:${candidate.actionKey}`,
            description: `CRM Agent Mode: ${candidate.action.title}`,
          })
        : { charged: false, free: true, reason: "free_rule_action" };
      const charged = charge?.charged === true;
      const duplicateCharge = charge?.duplicate === true;
      const freeApplied = priceUsd <= 0;
      const log = await deps.recordLog(accountId, {
        ...candidate,
        actionId: candidate.action.id,
        status: charged || duplicateCharge || freeApplied ? "success" : "failed",
        reason: charged ? "charged" : duplicateCharge ? "duplicate_charge_marker" : freeApplied ? "free_rule_action" : charge?.reason || "charge_failed",
        title: `Agent applied: ${candidate.action.title}`,
        charged,
        cost: charged ? priceUsd : 0,
        billingAction,
        duplicateCharge,
      });
      logs.push(log);
    } catch (e: any) {
      const log = await deps.recordLog(accountId, { ...candidate, actionId: candidate.action.id, status: "failed", reason: e?.message || "apply_failed", title: `Agent action failed: ${candidate.action.title}` });
      logs.push(log);
    }
  }

  const auditSummary = summarizeCrmAgentModeAudit([...logs, ...(state.logs || [])]);
  return {
    success: true,
    enabled: settings.enabled,
    settings,
    applied: logs.filter((log) => log.status === "success").length,
    skipped: logs.filter((log) => log.status === "skipped").length,
    failed: logs.filter((log) => log.status === "failed").length,
    auditSummary,
    logs,
  };
}
