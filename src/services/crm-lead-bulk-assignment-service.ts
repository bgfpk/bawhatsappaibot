import { cleanString } from "./integration-foundation-store.ts";
import { listCrmLeads, listCrmStaff, patchCrmLead } from "./crm-foundation-service.ts";

const MAX_BULK_ASSIGN = 50;

type CrmBulkAssignDeps = {
  listCrmLeads: (accountId: string) => Promise<any[]>;
  listCrmStaff: (accountId: string) => Promise<any[]>;
  patchCrmLead: (accountId: string, leadId: string, input: any) => Promise<any>;
};

const defaultDeps: CrmBulkAssignDeps = {
  listCrmLeads,
  listCrmStaff,
  patchCrmLead,
};

function publicAssignedLeadSummary(lead: any = {}) {
  return {
    id: cleanString(lead.id, 100),
    name: cleanString(lead.name, 120) || "Unnamed lead",
    phone: cleanString(lead.phone, 60),
    email: cleanString(lead.email, 160),
    source: cleanString(lead.latestSource || lead.source || "CRM", 80),
    status: cleanString(lead.status || "New", 80),
    dealStage: cleanString(lead.dealStage || "Lead", 80),
    assignedTo: cleanString(lead.assignedTo, 120),
  };
}

function normalizeLeadIds(input: any = {}) {
  const rawIds = Array.isArray(input.leadIds) ? input.leadIds : [];
  const seen = new Set<string>();
  const leadIds: string[] = [];
  const skippedReasons: Array<{ leadId?: string; reason: string }> = [];

  for (const rawId of rawIds) {
    const leadId = cleanString(rawId, 100);
    if (!leadId) {
      skippedReasons.push({ reason: "invalid_empty_id" });
      continue;
    }
    if (seen.has(leadId)) {
      skippedReasons.push({ leadId, reason: "duplicate_id" });
      continue;
    }
    seen.add(leadId);
    if (leadIds.length >= MAX_BULK_ASSIGN) {
      skippedReasons.push({ leadId, reason: "max_50_limit" });
      continue;
    }
    leadIds.push(leadId);
  }

  return { leadIds, skippedReasons };
}

export async function bulkAssignCrmLeadsWithDeps(accountId: string, input: any = {}, deps: CrmBulkAssignDeps = defaultDeps) {
  const assignedTo = cleanString(input.assignedTo, 120);
  if (!assignedTo) throw new Error("assignedTo is required.");

  const { leadIds, skippedReasons } = normalizeLeadIds(input);
  const [leads, staff] = await Promise.all([
    deps.listCrmLeads(accountId),
    deps.listCrmStaff(accountId),
  ]);
  const activeStaffNames = new Set(
    staff
      .filter((member: any) => member?.active !== false && cleanString(member.name, 120))
      .map((member: any) => cleanString(member.name, 120)),
  );
  const existingAssignedNames = new Set(
    leads
      .map((lead: any) => cleanString(lead.assignedTo, 120))
      .filter(Boolean),
  );

  if (!activeStaffNames.has(assignedTo) && !existingAssignedNames.has(assignedTo)) {
    throw new Error("assignedTo must be an active staff member or an existing assigned owner.");
  }

  const leadsById = new Map(leads.map((lead: any) => [cleanString(lead.id, 100), lead]));
  const updatedLeads: any[] = [];

  for (const leadId of leadIds) {
    const lead = leadsById.get(leadId);
    if (!lead) {
      skippedReasons.push({ leadId, reason: "lead_not_found" });
      continue;
    }
    if (cleanString((lead as any).assignedTo, 120) === assignedTo) {
      skippedReasons.push({ leadId, reason: "already_assigned" });
      continue;
    }
    const updated = await deps.patchCrmLead(accountId, leadId, { assignedTo });
    updatedLeads.push(publicAssignedLeadSummary(updated));
  }

  return {
    success: true,
    assigned: updatedLeads.length,
    assignedCount: updatedLeads.length,
    skipped: skippedReasons.length,
    skippedCount: skippedReasons.length,
    skippedReasons,
    updatedLeads,
  };
}

export async function bulkAssignCrmLeads(accountId: string, input: any = {}) {
  return bulkAssignCrmLeadsWithDeps(accountId, input, defaultDeps);
}
