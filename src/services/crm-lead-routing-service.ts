const ROUTING_LIMIT = 50;
const FINAL_LEAD_STATUSES = new Set(["Completed", "Lost", "Invalid"]);
const FINAL_DEAL_STAGES = new Set(["Completed", "Lost", "Cancelled"]);

export type CrmLeadRoutingMode =
  | "manual_selected"
  | "all_unassigned"
  | "hot_unassigned"
  | "stale_no_followup"
  | "needs_human_reply"
  | "overdue_followup_leads";

export type CrmLeadAssignmentStrategy = "selected_staff" | "lowest_workload" | "round_robin_preview";

function cleanString(value: any, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function toSeconds(value: any) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return Math.floor(value > 100000000000 ? value / 1000 : value);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function isActiveLead(lead: any = {}) {
  return !FINAL_LEAD_STATUSES.has(cleanString(lead.status, 80)) && !FINAL_DEAL_STAGES.has(cleanString(lead.dealStage, 80));
}

function leadTemperature(lead: any = {}) {
  return cleanString(lead.intelligence?.temperature || lead.temperature || lead.leadTemperature, 40) || "Unknown";
}

function leadHealth(lead: any = {}) {
  return cleanString(lead.intelligence?.health || lead.health || lead.leadHealth, 80) || "Active";
}

function needsHumanReplyLead(lead: any = {}) {
  const health = leadHealth(lead).toLowerCase();
  return health.includes("human reply") || health.includes("needs reply");
}

function publicRoutingLead(row: any = {}) {
  const id = cleanString(row.leadId || row.id, 100);
  return {
    id,
    leadId: id,
    leadName: cleanString(row.name || row.leadName, 120) || "Unnamed lead",
    phone: cleanString(row.phone || row.leadPhone, 60),
    email: cleanString(row.email || row.leadEmail, 160),
    source: cleanString(row.source || row.leadSource || "CRM", 80),
    status: cleanString(row.status || row.leadStatus || "New", 80),
    dealStage: cleanString(row.dealStage || row.leadDealStage || "Lead", 80),
    currentAssignedTo: cleanString(row.assignedTo || row.leadAssignedTo, 120),
    temperature: leadTemperature(row),
    health: leadHealth(row),
    nextFollowUpAt: toSeconds(row.nextFollowUpAt || row.dueAt),
    latestActivityAt: toSeconds(row.latestActivityAt || row.createdAt || row.updatedAt || row.dueAt),
  };
}

function dedupeLeads(rows: any[] = []) {
  const byId = new Map<string, any>();
  for (const row of rows) {
    const lead = publicRoutingLead(row);
    if (!lead.leadId || byId.has(lead.leadId)) continue;
    byId.set(lead.leadId, lead);
  }
  return Array.from(byId.values());
}

function activeStaffCards(input: { teamWorkflow?: any; staff?: any[] }) {
  const workflowCards = Array.isArray(input.teamWorkflow?.staffCards) ? input.teamWorkflow.staffCards : [];
  const rows = workflowCards.length ? workflowCards : (input.staff || []);
  return rows
    .map((staff: any) => ({
      id: cleanString(staff.id || staff.name, 100),
      name: cleanString(staff.name || staff.email || staff.phone, 120),
      role: cleanString(staff.role || "Sales Agent", 80),
      active: staff.active === false ? false : true,
      assignedLeads: Number(staff.assignedLeads || 0),
      overdueFollowUps: Number(staff.overdueFollowUps || 0),
      dueToday: Number(staff.dueToday || 0),
      pendingFollowUps: Number(staff.pendingFollowUps || 0),
      workloadScore: Number(staff.workloadScore || staff.assignedLeads || 0),
    }))
    .filter((staff: any) => staff.active && staff.name && staff.role !== "Assigned owner")
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}

function queueLeadsForMode(input: {
  mode: CrmLeadRoutingMode;
  teamWorkflow?: any;
  leads?: any[];
  selectedLeadIds?: string[];
}) {
  const queues = input.teamWorkflow?.ownerQueues || {};
  const selectedIds = new Set((input.selectedLeadIds || []).map((id) => cleanString(id, 100)).filter(Boolean));
  const allInputLeads = input.leads || [];

  if (input.mode === "manual_selected") {
    const queueRows = [
      ...(queues.unassignedLeads || []),
      ...(queues.hotUnassignedLeads || []),
      ...(queues.staleLeadsNoFollowUp || []),
      ...(queues.needsHumanReply || []),
      ...(queues.overdueFollowUps || []),
      ...(queues.dueToday || []),
      ...allInputLeads,
    ];
    return dedupeLeads(queueRows).filter((lead) => selectedIds.has(lead.leadId));
  }

  if (input.mode === "hot_unassigned") return dedupeLeads(queues.hotUnassignedLeads || []);
  if (input.mode === "stale_no_followup") return dedupeLeads(queues.staleLeadsNoFollowUp || []);
  if (input.mode === "needs_human_reply") return dedupeLeads(queues.needsHumanReply || []);
  if (input.mode === "overdue_followup_leads") return dedupeLeads(queues.overdueFollowUps || []);

  const queueRows = queues.unassignedLeads || [];
  if (queueRows.length) return dedupeLeads(queueRows);

  return dedupeLeads(allInputLeads.filter((lead) => !cleanString(lead.assignedTo, 120) && isActiveLead(lead)));
}

function pickLowestWorkload(staffRows: any[], virtualScores: Map<string, number>) {
  return staffRows
    .slice()
    .sort((a, b) =>
      Number(virtualScores.get(a.name) || a.workloadScore || 0) - Number(virtualScores.get(b.name) || b.workloadScore || 0) ||
      Number(a.assignedLeads || 0) - Number(b.assignedLeads || 0) ||
      a.name.localeCompare(b.name)
    )[0];
}

function reasonFor(input: { mode: CrmLeadRoutingMode; strategy: CrmLeadAssignmentStrategy; staffName: string }) {
  const queueReason: Record<string, string> = {
    manual_selected: "Manually selected lead",
    all_unassigned: "Unassigned lead queue",
    hot_unassigned: "Hot unassigned queue",
    stale_no_followup: "Stale lead with no next follow-up",
    needs_human_reply: "Needs human reply queue",
    overdue_followup_leads: "Overdue follow-up queue",
  };
  const strategyReason: Record<string, string> = {
    selected_staff: `Assigned to selected staff: ${input.staffName}`,
    lowest_workload: `Lowest current workload: ${input.staffName}`,
    round_robin_preview: `Round-robin preview owner: ${input.staffName}`,
  };
  return `${queueReason[input.mode] || "Routing queue"}. ${strategyReason[input.strategy] || "Manual routing preview."}`;
}

export function buildCrmLeadRoutingPreview(input: {
  mode?: CrmLeadRoutingMode;
  strategy?: CrmLeadAssignmentStrategy;
  selectedStaffName?: string;
  selectedLeadIds?: string[];
  teamWorkflow?: any;
  staff?: any[];
  leads?: any[];
  limit?: number;
} = {}) {
  const mode = input.mode || "all_unassigned";
  const strategy = input.strategy || "selected_staff";
  const limit = Math.max(1, Math.min(ROUTING_LIMIT, Number(input.limit || 20)));
  const staffRows = activeStaffCards({ teamWorkflow: input.teamWorkflow, staff: input.staff });
  const leads = queueLeadsForMode({ mode, teamWorkflow: input.teamWorkflow, leads: input.leads, selectedLeadIds: input.selectedLeadIds });
  const eligible = leads.filter((lead) => lead.leadId && isActiveLead(lead)).slice(0, limit);
  const selectedStaffName = cleanString(input.selectedStaffName, 120);
  const selectedStaff = staffRows.find((staff) => staff.name === selectedStaffName);
  const skippedReasons: Array<{ leadId?: string; reason: string }> = [];

  if (strategy === "selected_staff" && !selectedStaff) {
    return {
      success: true,
      mode,
      strategy,
      limit,
      eligibleCount: leads.length,
      preview: [],
      skippedReasons: [{ reason: "Select an active staff member before previewing." }],
    };
  }

  if (staffRows.length === 0) {
    return {
      success: true,
      mode,
      strategy,
      limit,
      eligibleCount: leads.length,
      preview: [],
      skippedReasons: [{ reason: "No active staff members are available for routing." }],
    };
  }

  const virtualScores: Map<string, number> = new Map(
    staffRows.map((staff) => [staff.name, Number(staff.workloadScore || 0)] as [string, number]),
  );
  const preview = eligible.map((lead, index) => {
    let target = selectedStaff;
    if (strategy === "lowest_workload") target = pickLowestWorkload(staffRows, virtualScores);
    if (strategy === "round_robin_preview") target = staffRows[index % staffRows.length];
    const targetName = target?.name || "";
    if (targetName) virtualScores.set(targetName, Number(virtualScores.get(targetName) || 0) + 1);
    return {
      leadId: lead.leadId,
      leadName: lead.leadName,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      status: lead.status,
      dealStage: lead.dealStage,
      temperature: lead.temperature,
      currentAssignedTo: lead.currentAssignedTo,
      recommendedAssignedTo: targetName,
      reason: reasonFor({ mode, strategy, staffName: targetName }),
    };
  }).filter((item) => {
    if (!item.recommendedAssignedTo) {
      skippedReasons.push({ leadId: item.leadId, reason: "No eligible staff member found." });
      return false;
    }
    if (item.currentAssignedTo === item.recommendedAssignedTo) {
      skippedReasons.push({ leadId: item.leadId, reason: "Lead already has the recommended owner." });
      return false;
    }
    return true;
  });

  return {
    success: true,
    mode,
    strategy,
    limit,
    eligibleCount: leads.length,
    preview,
    skippedReasons,
  };
}
