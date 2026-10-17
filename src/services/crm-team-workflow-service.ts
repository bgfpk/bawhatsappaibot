const FINAL_LEAD_STATUSES = new Set(["Completed", "Lost", "Invalid"]);
const FINAL_DEAL_STAGES = new Set(["Completed", "Lost", "Cancelled"]);
const QUEUE_LIMIT = 20;

function cleanString(value: any, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toSeconds(value: any) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return Math.floor(value > 100000000000 ? value / 1000 : value);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function todayBounds(now: number) {
  const start = now - (now % 86400);
  return { start, end: start + 86400 - 1 };
}

function staffDisplayName(staff: any = {}) {
  return cleanString(staff.name || staff.email || staff.phone || staff.assignedTo, 120);
}

function assignedName(value: any) {
  return cleanString(value, 120);
}

function leadTemperature(lead: any = {}) {
  return cleanString(lead.intelligence?.temperature || lead.temperature, 40) || "Unknown";
}

function leadHealth(lead: any = {}) {
  return cleanString(lead.intelligence?.health || lead.health, 80) || "Active";
}

function isHotLead(lead: any = {}) {
  return leadTemperature(lead) === "Hot";
}

function needsHumanReplyLead(lead: any = {}) {
  const health = leadHealth(lead).toLowerCase();
  return health.includes("human reply") || health.includes("needs reply");
}

function isActiveLead(lead: any = {}) {
  return !FINAL_LEAD_STATUSES.has(cleanString(lead.status, 80)) && !FINAL_DEAL_STAGES.has(cleanString(lead.dealStage, 80));
}

function isPendingFollowUp(row: any = {}) {
  return cleanString(row.status, 40) === "pending";
}

export function bucketCrmTeamFollowUpDueState(row: any = {}, now = nowSeconds()) {
  const dueAt = toSeconds(row.dueAt);
  if (cleanString(row.status, 40) === "completed") return "completed";
  if (!dueAt) return "upcoming";
  const { end } = todayBounds(now);
  if (dueAt < now) return "overdue";
  if (dueAt <= end) return "today";
  if (dueAt <= now + 24 * 3600) return "due_soon";
  return "upcoming";
}

function queueLead(lead: any = {}) {
  return {
    id: cleanString(lead.id, 100),
    name: cleanString(lead.name, 120) || "Unnamed lead",
    phone: cleanString(lead.phone, 60),
    email: cleanString(lead.email, 160),
    source: cleanString(lead.latestSource || lead.source || "Manual", 80),
    status: cleanString(lead.status || "New", 80),
    dealStage: cleanString(lead.dealStage || "Lead", 80),
    assignedTo: assignedName(lead.assignedTo),
    nextFollowUpAt: toSeconds(lead.nextFollowUpAt),
    latestActivityAt: toSeconds(lead.latestActivityAt || lead.updatedAt || lead.createdAt),
    createdAt: toSeconds(lead.createdAt),
    temperature: leadTemperature(lead),
    health: leadHealth(lead),
    productInterest: cleanString(lead.productInterest, 180),
  };
}

function queueFollowUp(followUp: any = {}, leadById: Map<string, any>, now: number) {
  const lead = leadById.get(cleanString(followUp.leadId, 100)) || {};
  const leadRow = queueLead(lead);
  return {
    id: cleanString(followUp.id, 100),
    followUpId: cleanString(followUp.id, 100),
    leadId: cleanString(followUp.leadId, 100),
    type: cleanString(followUp.type || "message", 60),
    status: cleanString(followUp.status || "pending", 60),
    dueAt: toSeconds(followUp.dueAt),
    dueState: bucketCrmTeamFollowUpDueState(followUp, now),
    assignedTo: assignedName(followUp.assignedTo || followUp.leadAssignedTo || leadRow.assignedTo),
    notes: cleanString(followUp.notes, 240),
    leadName: leadRow.name,
    leadPhone: leadRow.phone,
    leadEmail: leadRow.email,
    leadSource: leadRow.source,
    leadStatus: leadRow.status,
    leadDealStage: leadRow.dealStage,
    leadTemperature: leadRow.temperature,
    leadHealth: leadRow.health,
  };
}

function sortLeadsForQueue(rows: any[] = []) {
  return rows.slice().sort((a, b) => {
    const aHot = a.temperature === "Hot" ? 1 : 0;
    const bHot = b.temperature === "Hot" ? 1 : 0;
    return bHot - aHot || Number(a.nextFollowUpAt || 0) - Number(b.nextFollowUpAt || 0) || Number(b.latestActivityAt || 0) - Number(a.latestActivityAt || 0);
  });
}

function sortFollowUpsForQueue(rows: any[] = []) {
  return rows.slice().sort((a, b) => Number(a.dueAt || Number.MAX_SAFE_INTEGER) - Number(b.dueAt || Number.MAX_SAFE_INTEGER));
}

function riskLabel(metrics: any, active: boolean) {
  if (!active) return "Inactive";
  if (metrics.overdueFollowUps > 0 || metrics.needsHumanReply > 2 || metrics.workloadScore >= 18) return "Needs attention";
  if (metrics.workloadScore >= 9 || metrics.assignedLeads >= 12 || metrics.dueToday >= 4) return "Busy";
  return "Healthy";
}

function publicStaffCard(staff: any, metrics: any) {
  const name = staffDisplayName(staff) || assignedName(staff.assignedTo) || "Unassigned";
  const active = staff.active === false ? false : true;
  const nextMetrics = {
    assignedLeads: Number(metrics.assignedLeads || 0),
    hotLeads: Number(metrics.hotLeads || 0),
    overdueFollowUps: Number(metrics.overdueFollowUps || 0),
    dueToday: Number(metrics.dueToday || 0),
    pendingFollowUps: Number(metrics.pendingFollowUps || 0),
    completedFollowUps: Number(metrics.completedFollowUps || 0),
    wonCompletedLeads: Number(metrics.wonCompletedLeads || 0),
    lostLeads: Number(metrics.lostLeads || 0),
    needsHumanReply: Number(metrics.needsHumanReply || 0),
    workloadScore: Number(metrics.workloadScore || 0),
  };
  return {
    id: cleanString(staff.id, 100) || `assigned:${name}`,
    name,
    role: cleanString(staff.role || "Assigned owner", 80),
    phone: cleanString(staff.phone, 60),
    email: cleanString(staff.email, 160),
    active,
    notes: cleanString(staff.notes, 240),
    ...nextMetrics,
    riskLabel: riskLabel(nextMetrics, active),
  };
}

export function buildCrmTeamWorkflow(input: {
  staff?: any[];
  leads?: any[];
  followUps?: any[];
  reports?: any;
  now?: number;
} = {}) {
  const now = Number(input.now || nowSeconds());
  const staffRows = (input.staff || []).map((item) => ({ ...item }));
  const leadRows = (input.leads || []).map((item) => ({ ...item }));
  const followUpRows = (input.followUps || []).map((item) => ({ ...item }));
  const reportRows = input.reports && typeof input.reports === "object" ? { ...input.reports } : {};
  const leadById = new Map(leadRows.map((lead) => [cleanString(lead.id, 100), lead]));
  const pendingFollowUps = followUpRows.filter(isPendingFollowUp);
  const queueLeads = leadRows.map(queueLead);
  const unassignedLeads = sortLeadsForQueue(queueLeads.filter((lead) => !lead.assignedTo && isActiveLead(lead))).slice(0, QUEUE_LIMIT);
  const hotUnassignedLeads = sortLeadsForQueue(unassignedLeads.filter((lead) => lead.temperature === "Hot")).slice(0, QUEUE_LIMIT);
  const needsHumanReply = sortLeadsForQueue(queueLeads.filter((lead) => needsHumanReplyLead(lead) && isActiveLead(lead))).slice(0, QUEUE_LIMIT);
  const overdueFollowUps = sortFollowUpsForQueue(pendingFollowUps
    .filter((followUp) => bucketCrmTeamFollowUpDueState(followUp, now) === "overdue")
    .map((followUp) => queueFollowUp(followUp, leadById, now)))
    .slice(0, QUEUE_LIMIT);
  const dueToday = sortFollowUpsForQueue(pendingFollowUps
    .filter((followUp) => bucketCrmTeamFollowUpDueState(followUp, now) === "today")
    .map((followUp) => queueFollowUp(followUp, leadById, now)))
    .slice(0, QUEUE_LIMIT);
  const pendingFollowUpsByLead = new Map<string, number>();
  for (const followUp of pendingFollowUps) {
    const leadId = cleanString(followUp.leadId, 100);
    if (!leadId) continue;
    pendingFollowUpsByLead.set(leadId, (pendingFollowUpsByLead.get(leadId) || 0) + 1);
  }
  const staleLeadsNoFollowUp = sortLeadsForQueue(queueLeads.filter((lead) => isActiveLead(lead) && !lead.nextFollowUpAt && !pendingFollowUpsByLead.get(lead.id))).slice(0, QUEUE_LIMIT);

  const staffByName = new Map<string, any>();
  for (const staff of staffRows) {
    const name = staffDisplayName(staff);
    if (name) staffByName.set(name, staff);
  }
  for (const lead of queueLeads) {
    if (lead.assignedTo && !staffByName.has(lead.assignedTo)) staffByName.set(lead.assignedTo, { id: `assigned:${lead.assignedTo}`, name: lead.assignedTo, role: "Assigned owner", active: true });
  }
  for (const followUp of followUpRows) {
    const name = assignedName(followUp.assignedTo || followUp.leadAssignedTo);
    if (name && !staffByName.has(name)) staffByName.set(name, { id: `assigned:${name}`, name, role: "Assigned owner", active: true });
  }

  const staffCards = Array.from(staffByName.values()).map((staff) => {
    const name = staffDisplayName(staff);
    const assignedLeads = queueLeads.filter((lead) => lead.assignedTo === name);
    const ownerFollowUps = followUpRows.filter((followUp) => assignedName(followUp.assignedTo || followUp.leadAssignedTo || leadById.get(cleanString(followUp.leadId, 100))?.assignedTo) === name);
    const ownerPending = ownerFollowUps.filter(isPendingFollowUp);
    const metrics = {
      assignedLeads: assignedLeads.length,
      hotLeads: assignedLeads.filter((lead) => lead.temperature === "Hot").length,
      overdueFollowUps: ownerPending.filter((followUp) => bucketCrmTeamFollowUpDueState(followUp, now) === "overdue").length,
      dueToday: ownerPending.filter((followUp) => bucketCrmTeamFollowUpDueState(followUp, now) === "today").length,
      pendingFollowUps: ownerPending.length,
      completedFollowUps: ownerFollowUps.filter((followUp) => cleanString(followUp.status, 40) === "completed").length,
      wonCompletedLeads: assignedLeads.filter((lead) => lead.status === "Completed" || lead.dealStage === "Completed").length,
      lostLeads: assignedLeads.filter((lead) => lead.status === "Lost" || lead.dealStage === "Lost").length,
      needsHumanReply: assignedLeads.filter(needsHumanReplyLead).length,
      workloadScore: 0,
    };
    metrics.workloadScore = metrics.assignedLeads + metrics.hotLeads * 2 + metrics.overdueFollowUps * 4 + metrics.dueToday * 2 + metrics.pendingFollowUps + metrics.needsHumanReply * 3;
    return publicStaffCard(staff, metrics);
  }).sort((a, b) => Number(b.active) - Number(a.active) || Number(b.workloadScore) - Number(a.workloadScore) || a.name.localeCompare(b.name));

  const activeStaff = staffCards.filter((staff) => staff.active).length;
  const summary = {
    totalStaff: staffCards.length,
    activeStaff,
    unassignedLeads: queueLeads.filter((lead) => !lead.assignedTo && isActiveLead(lead)).length,
    hotUnassigned: queueLeads.filter((lead) => !lead.assignedTo && lead.temperature === "Hot" && isActiveLead(lead)).length,
    needsHumanReply: queueLeads.filter((lead) => needsHumanReplyLead(lead) && isActiveLead(lead)).length,
    overdueFollowUps: pendingFollowUps.filter((followUp) => bucketCrmTeamFollowUpDueState(followUp, now) === "overdue").length,
    dueToday: pendingFollowUps.filter((followUp) => bucketCrmTeamFollowUpDueState(followUp, now) === "today").length,
    staleLeadsNoFollowUp: staleLeadsNoFollowUp.length,
    topAssignedStaff: cleanString(reportRows.topAssignedStaff, 120),
  };

  return {
    summary,
    staffCards,
    workloadByStaff: staffCards,
    ownerQueues: {
      unassignedLeads,
      hotUnassignedLeads,
      needsHumanReply,
      overdueFollowUps,
      dueToday,
      staleLeadsNoFollowUp,
    },
  };
}
