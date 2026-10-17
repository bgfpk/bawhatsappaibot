import { cleanString } from "./integration-foundation-store.ts";

export type CrmAgentModeAuditLog = {
  status?: string;
  reason?: string;
  charged?: boolean;
  cost?: number;
  billingAction?: string;
  actionId?: string;
  actionKey?: string;
  leadId?: string;
  title?: string;
  createdAt?: number;
  timestamp?: number;
};

const REASON_BUCKETS: Array<[string, RegExp]> = [
  ["disabled", /disabled/i],
  ["wallet_blocked", /wallet|insufficient/i],
  ["duplicate", /duplicate|idempot/i],
  ["unsafe", /unsafe|blocked|dangerous|won|lost|confirm/i],
  ["no_op", /no[_ -]?op|no action|already/i],
  ["charge_failed", /charge|billing/i],
  ["apply_failed", /failed|error|exception/i],
];

export function normalizeCrmAgentModeAuditStatus(value: any) {
  const status = cleanString(value, 40).toLowerCase();
  if (status === "success" || status === "applied") return "success";
  if (status === "skipped" || status === "skip") return "skipped";
  if (status === "failed" || status === "error") return "failed";
  return "unknown";
}

export function getCrmAgentModeReasonBucket(reason: any) {
  const value = cleanString(reason || "unknown", 120).toLowerCase() || "unknown";
  const found = REASON_BUCKETS.find(([, pattern]) => pattern.test(value));
  return found?.[0] || value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";
}

export function summarizeCrmAgentModeAudit(logs: CrmAgentModeAuditLog[] = []) {
  const summary = {
    total: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    unknown: 0,
    charged: 0,
    duplicateCharges: 0,
    totalChargedCost: 0,
    reasonBreakdown: {} as Record<string, number>,
    statusBreakdown: {} as Record<string, number>,
    lastActionAt: 0,
    riskFlags: [] as string[],
    recommendation: "Agent Mode has no recent audit data yet.",
  };

  for (const log of logs || []) {
    summary.total += 1;
    const status = normalizeCrmAgentModeAuditStatus(log?.status);
    summary.statusBreakdown[status] = Number(summary.statusBreakdown[status] || 0) + 1;
    if (status === "success") summary.applied += 1;
    else if (status === "skipped") summary.skipped += 1;
    else if (status === "failed") summary.failed += 1;
    else summary.unknown += 1;

    const bucket = getCrmAgentModeReasonBucket(log?.reason);
    summary.reasonBreakdown[bucket] = Number(summary.reasonBreakdown[bucket] || 0) + 1;

    if (log?.charged === true) summary.charged += 1;
    if (log?.reason === "duplicate_charge_marker" || (log as any)?.duplicateCharge === true) summary.duplicateCharges += 1;
    summary.totalChargedCost = Number((summary.totalChargedCost + Math.max(0, Number(log?.cost || 0))).toFixed(6));
    const actionAt = Number(log?.createdAt || log?.timestamp || 0);
    if (actionAt > summary.lastActionAt) summary.lastActionAt = actionAt;
  }

  if (summary.failed > 0) summary.riskFlags.push("failed_actions_present");
  if ((summary.reasonBreakdown.wallet_blocked || 0) > 0) summary.riskFlags.push("wallet_blocks_present");
  if ((summary.reasonBreakdown.unsafe || 0) > 0) summary.riskFlags.push("unsafe_actions_blocked");
  if (summary.duplicateCharges > 0) summary.riskFlags.push("duplicate_charge_markers_present");

  if (summary.total === 0) {
    summary.recommendation = "No Agent Mode runs found yet. Keep disabled until initial audit coverage is visible.";
  } else if (summary.failed > 0) {
    summary.recommendation = "Review failed Agent Mode actions before increasing limits or enabling wider automation.";
  } else if ((summary.reasonBreakdown.unsafe || 0) > 0) {
    summary.recommendation = "Unsafe actions were blocked correctly. Keep current safety gates and review suggested action types.";
  } else if (summary.applied > 0) {
    summary.recommendation = "Agent Mode applied safe CRM actions. Keep limits conservative and monitor audit history.";
  } else {
    summary.recommendation = "Agent Mode ran without applied actions. Review skipped reasons before changing settings.";
  }

  return summary;
}
