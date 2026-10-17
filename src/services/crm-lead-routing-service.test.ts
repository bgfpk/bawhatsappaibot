import test from "node:test";
import assert from "node:assert/strict";

import { buildCrmLeadRoutingPreview } from "./crm-lead-routing-service.ts";

const baseTeamWorkflow = {
  staffCards: [
    { id: "staff_ali", name: "Ali", role: "Sales Agent", active: true, assignedLeads: 6, workloadScore: 10 },
    { id: "staff_sara", name: "Sara", role: "Support", active: true, assignedLeads: 1, workloadScore: 2 },
    { id: "staff_old", name: "Old User", role: "Viewer", active: false, assignedLeads: 0, workloadScore: 0 },
  ],
  ownerQueues: {
    unassignedLeads: [
      { id: "lead_1", name: "Lead One", source: "Website", status: "New", dealStage: "Lead", temperature: "Warm" },
      { id: "lead_2", name: "Lead Two", source: "Manual", status: "Interested", dealStage: "Lead", temperature: "Cold" },
      { id: "lead_done", name: "Done Lead", source: "Manual", status: "Completed", dealStage: "Completed", temperature: "Warm" },
    ],
    hotUnassignedLeads: [
      { id: "lead_hot", name: "Hot Lead", source: "API", status: "New", dealStage: "Lead", temperature: "Hot" },
    ],
    staleLeadsNoFollowUp: [
      { id: "lead_stale", name: "Stale Lead", source: "Inbox", status: "Interested", dealStage: "Lead", temperature: "Warm" },
    ],
    needsHumanReply: [
      { id: "lead_reply", name: "Reply Lead", source: "Inbox", status: "AI Replied", dealStage: "Lead", health: "Needs human reply", temperature: "Warm" },
    ],
    overdueFollowUps: [
      { id: "fu_1", followUpId: "fu_1", leadId: "lead_overdue", leadName: "Overdue Lead", leadSource: "CRM", leadStatus: "Interested", leadDealStage: "Lead", leadTemperature: "Warm", assignedTo: "Ali" },
      { id: "fu_2", followUpId: "fu_2", leadId: "lead_overdue", leadName: "Overdue Lead", leadSource: "CRM", leadStatus: "Interested", leadDealStage: "Lead", leadTemperature: "Warm", assignedTo: "Ali" },
    ],
  },
};

test("routing preview selects all unassigned eligible leads", () => {
  const result = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "all_unassigned", strategy: "selected_staff", selectedStaffName: "Ali" });

  assert.equal(result.preview.length, 2);
  assert.deepEqual(result.preview.map((item: any) => item.leadId), ["lead_1", "lead_2"]);
  assert.ok(result.preview.every((item: any) => item.recommendedAssignedTo === "Ali"));
});

test("routing preview selects hot unassigned and stale leads", () => {
  const hot = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "hot_unassigned", strategy: "selected_staff", selectedStaffName: "Sara" });
  const stale = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "stale_no_followup", strategy: "selected_staff", selectedStaffName: "Sara" });

  assert.equal(hot.preview[0].leadId, "lead_hot");
  assert.equal(hot.preview[0].temperature, "Hot");
  assert.equal(stale.preview[0].leadId, "lead_stale");
});

test("lowest workload strategy excludes inactive staff", () => {
  const result = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "all_unassigned", strategy: "lowest_workload" });

  assert.equal(result.preview[0].recommendedAssignedTo, "Sara");
  assert.ok(result.preview.every((item: any) => item.recommendedAssignedTo !== "Old User"));
});

test("round robin preview is deterministic", () => {
  const result = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "all_unassigned", strategy: "round_robin_preview" });

  assert.deepEqual(result.preview.map((item: any) => item.recommendedAssignedTo), ["Ali", "Sara"]);
});

test("routing preview handles reply and overdue queues", () => {
  const reply = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "needs_human_reply", strategy: "selected_staff", selectedStaffName: "Sara" });
  const overdue = buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "overdue_followup_leads", strategy: "selected_staff", selectedStaffName: "Sara" });

  assert.equal(reply.preview[0].leadId, "lead_reply");
  assert.equal(overdue.preview.length, 1);
  assert.equal(overdue.preview[0].leadId, "lead_overdue");
});

test("routing preview respects max limit", () => {
  const manyLeads = Array.from({ length: 60 }, (_, index) => ({ id: `lead_${index}`, name: `Lead ${index}`, status: "New", dealStage: "Lead" }));
  const result = buildCrmLeadRoutingPreview({ teamWorkflow: { ...baseTeamWorkflow, ownerQueues: { unassignedLeads: manyLeads } }, mode: "all_unassigned", strategy: "selected_staff", selectedStaffName: "Ali", limit: 80 });

  assert.equal(result.preview.length, 50);
});

test("routing preview does not mutate inputs", () => {
  const before = JSON.stringify(baseTeamWorkflow);
  buildCrmLeadRoutingPreview({ teamWorkflow: baseTeamWorkflow, mode: "all_unassigned", strategy: "lowest_workload" });

  assert.equal(JSON.stringify(baseTeamWorkflow), before);
});
