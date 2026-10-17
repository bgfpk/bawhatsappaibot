import { cleanString, nowSeconds, safeId } from "./integration-foundation-store.ts";

export const CRM_STAFF_ROLES = ["Owner", "Manager", "Sales Agent", "Support", "Viewer"] as const;
const ACTIVITY_TYPES = [
  "lead_created",
  "status_changed",
  "deal_stage_changed",
  "assigned_user_changed",
  "follow_up_created",
  "follow_up_completed",
  "call_log_added",
  "deal_fields_updated",
  "smart_action_applied",
  "crm_agent_action",
  "crm_agent_skipped",
] as const;

function toSeconds(value: any) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export function normalizeStaffRole(value: any) {
  const role = cleanString(value, 40);
  return (CRM_STAFF_ROLES as readonly string[]).includes(role) ? role : "Sales Agent";
}

export function publicCrmStaff(row: any = {}) {
  const name = cleanString(row.name || row.label || row.assignedTo, 120);
  const createdAt = Number(row.createdAt || nowSeconds());
  return {
    id: cleanString(row.id, 80) || safeId("staff"),
    name,
    phone: cleanString(row.phone, 40),
    email: cleanString(row.email, 160),
    role: normalizeStaffRole(row.role),
    active: row.active === false ? false : true,
    notes: cleanString(row.notes, 700),
    createdAt,
    updatedAt: Number(row.updatedAt || createdAt),
  };
}

export function publicCrmActivity(row: any = {}) {
  const type = cleanString(row.type, 60);
  return {
    id: cleanString(row.id, 100) || safeId("act"),
    accountId: cleanString(row.accountId, 80),
    leadId: cleanString(row.leadId, 80),
    type: (ACTIVITY_TYPES as readonly string[]).includes(type) ? type : "lead_created",
    title: cleanString(row.title, 160),
    previousValue: cleanString(row.previousValue, 160),
    newValue: cleanString(row.newValue, 160),
    actor: cleanString(row.actor, 120) || "System/User",
    createdAt: Number(row.createdAt || nowSeconds()),
  };
}

export function buildCrmActivity(input: any = {}) {
  return publicCrmActivity({
    id: safeId("act"),
    actor: "System/User",
    createdAt: nowSeconds(),
    ...input,
  });
}

function notificationStateMap(states: any[] = []) {
  return new Map(states.map((state) => [cleanString(state.id, 160), {
    read: state.read === true,
    completed: state.completed === true,
    updatedAt: Number(state.updatedAt || 0),
  }]));
}

function relatedLead(leads: any[] = [], leadId: string) {
  return leads.find((lead) => lead.id === leadId) || {};
}

function pushNotification(rows: any[], states: Map<string, any>, input: any) {
  const id = cleanString(input.id, 160);
  if (!id || rows.some((row) => row.id === id)) return;
  const state = states.get(id) || {};
  if (state.completed) return;
  rows.push({
    id,
    type: cleanString(input.type, 60),
    title: cleanString(input.title, 120),
    message: cleanString(input.message, 240),
    leadId: cleanString(input.leadId, 80),
    leadName: cleanString(input.leadName, 120),
    assignedTo: cleanString(input.assignedTo, 120),
    actionId: cleanString(input.actionId, 80),
    actionLabel: cleanString(input.actionLabel, 80),
    safe: input.safe === true,
    severity: cleanString(input.severity, 20) || "info",
    createdAt: Number(input.createdAt || nowSeconds()),
    read: state.read === true,
    completed: false,
  });
}

export function buildCrmNotifications(input: {
  leads?: any[];
  followUps?: any[];
  activities?: any[];
  states?: any[];
  smartActions?: any[];
  now?: number;
}) {
  const now = Number(input.now || nowSeconds());
  const dueSoonEnd = now + 24 * 3600;
  const states = notificationStateMap(input.states || []);
  const rows: any[] = [];

  for (const followUp of input.followUps || []) {
    if (followUp.status !== "pending" || !followUp.dueAt) continue;
    const lead = relatedLead(input.leads, followUp.leadId);
    if (followUp.dueAt < now) {
      pushNotification(rows, states, {
        id: `followup_overdue:${followUp.id}`,
        type: "follow_up_overdue",
        title: "Follow-up overdue",
        message: `${lead.name || "Lead"} has an overdue ${String(followUp.type || "follow-up").replace(/_/g, " ")}.`,
        leadId: followUp.leadId,
        leadName: lead.name,
        assignedTo: followUp.assignedTo || lead.assignedTo,
        severity: "danger",
        createdAt: followUp.dueAt,
      });
    } else if (followUp.dueAt <= dueSoonEnd) {
      pushNotification(rows, states, {
        id: `followup_due:${followUp.id}`,
        type: "follow_up_due_soon",
        title: "Follow-up due soon",
        message: `${lead.name || "Lead"} has a follow-up due soon.`,
        leadId: followUp.leadId,
        leadName: lead.name,
        assignedTo: followUp.assignedTo || lead.assignedTo,
        severity: "warn",
        createdAt: followUp.dueAt,
      });
    }
  }

  for (const lead of (input.leads || []).slice(0, 120)) {
    if (lead?.intelligence?.temperature === "Hot") {
      pushNotification(rows, states, {
        id: `hot_lead:${lead.id}`,
        type: "hot_lead",
        title: "Hot lead",
        message: `${lead.name || "Lead"} is showing high-intent signals.`,
        leadId: lead.id,
        leadName: lead.name,
        assignedTo: lead.assignedTo,
        severity: "warn",
        createdAt: lead.latestActivityAt || lead.updatedAt || now,
      });
    }
    if (lead?.intelligence?.health === "Needs human reply") {
      pushNotification(rows, states, {
        id: `needs_human_reply:${lead.id}`,
        type: "needs_human_reply",
        title: "Needs human reply",
        message: `${lead.name || "Lead"} needs a staff reply before the conversation cools down.`,
        leadId: lead.id,
        leadName: lead.name,
        assignedTo: lead.assignedTo,
        severity: "danger",
        createdAt: lead.latestActivityAt || lead.updatedAt || now,
      });
    }
  }

  for (const activity of (input.activities || []).slice(0, 80)) {
    const lead = relatedLead(input.leads, activity.leadId);
    if (activity.type === "assigned_user_changed" && activity.newValue) {
      pushNotification(rows, states, {
        id: `lead_assigned:${activity.id}`,
        type: "lead_assigned",
        title: "Lead assigned",
        message: `${lead.name || "Lead"} assigned to ${activity.newValue}.`,
        leadId: activity.leadId,
        leadName: lead.name,
        assignedTo: activity.newValue,
        severity: "info",
        createdAt: activity.createdAt,
      });
    }
    if (activity.type === "deal_stage_changed") {
      pushNotification(rows, states, {
        id: `deal_stage_changed:${activity.id}`,
        type: "deal_stage_changed",
        title: "Deal stage changed",
        message: `${lead.name || "Lead"} moved to ${activity.newValue || "a new stage"}.`,
        leadId: activity.leadId,
        leadName: lead.name,
        assignedTo: lead.assignedTo,
        severity: "info",
        createdAt: activity.createdAt,
      });
    }
    if (activity.type === "lead_created") {
      pushNotification(rows, states, {
        id: `lead_created:${activity.id}`,
        type: "lead_created",
        title: "New CRM lead",
        message: `${lead.name || "A lead"} was created from ${lead.source || "CRM"}.`,
        leadId: activity.leadId,
        leadName: lead.name,
        assignedTo: lead.assignedTo,
        severity: "success",
        createdAt: activity.createdAt,
      });
    }
    if (activity.type === "crm_agent_action") {
      pushNotification(rows, states, {
        id: `crm_agent_action:${activity.id}`,
        type: "crm_agent_action",
        title: "CRM Agent action",
        message: activity.newValue || "Agent Mode applied a safe CRM action.",
        leadId: activity.leadId,
        leadName: lead.name,
        assignedTo: lead.assignedTo,
        severity: "success",
        createdAt: activity.createdAt,
      });
    }
  }

  for (const action of (input.smartActions || []).slice(0, 20)) {
    const actionId = cleanString(action.id, 80);
    pushNotification(rows, states, {
      id: `smart_action:${action.leadId}:${action.id}`,
      type: actionId === "needs_human_reply" ? "needs_human_reply" : actionId.startsWith("lifecycle_") ? "lifecycle_suggestion" : "smart_crm_action",
      title: action.title,
      message: action.reason,
      leadId: action.leadId,
      leadName: action.leadName,
      assignedTo: action.assignedTo,
      actionId,
      actionLabel: action.actionLabel,
      safe: action.safe,
      severity: action.priority === "high" ? "warn" : "info",
      createdAt: now,
    });
  }

  return rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 50);
}

export function bucketCrmFollowUpDueState(row: any, now = nowSeconds()) {
  const dueAt = toSeconds(row?.dueAt);
  const todayEnd = now - (now % 86400) + 86400 - 1;
  if (row?.status === "completed") return "completed";
  if (!dueAt) return "upcoming";
  if (dueAt < now) return "overdue";
  if (dueAt <= todayEnd) return "today";
  if (dueAt <= now + 24 * 3600) return "due_soon";
  return "upcoming";
}

export function summarizeTopCount(rows: Record<string, number> = {}) {
  return Object.entries(rows).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || "";
}
