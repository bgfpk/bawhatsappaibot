import test from "node:test";
import assert from "node:assert/strict";

import { buildCrmTeamWorkflow } from "./crm-team-workflow-service.ts";

const NOW = 1_700_000_000;
const HOUR = 3600;

test("CRM team workflow builds ownership queues and workload metrics", () => {
  const staff = [
    { id: "staff_ali", name: "Ali", role: "Sales Agent", active: true },
    { id: "staff_sara", name: "Sara", role: "Support", active: true },
    { id: "staff_old", name: "Old User", role: "Viewer", active: false },
  ];
  const leads = [
    { id: "lead_hot", name: "Hot Unassigned", phone: "1155814940", source: "Website API", status: "New", dealStage: "Lead", intelligence: { temperature: "Hot", health: "Active" }, latestActivityAt: NOW - HOUR },
    { id: "lead_reply", name: "Reply Needed", assignedTo: "Ali", source: "WhatsApp", status: "AI Replied", dealStage: "Lead", intelligence: { temperature: "Warm", health: "Needs human reply" }, latestActivityAt: NOW - 2 * HOUR },
    { id: "lead_sara", name: "Sara Deal", assignedTo: "Sara", status: "Completed", dealStage: "Completed", intelligence: { temperature: "Warm", health: "Won" }, latestActivityAt: NOW - 3 * HOUR },
    { id: "lead_stale", name: "No Next Step", source: "Manual", status: "Interested", dealStage: "Lead", intelligence: { temperature: "Warm", health: "Active" }, latestActivityAt: NOW - 5 * HOUR },
    { id: "lead_inactive_owner", name: "Inactive Owner Lead", assignedTo: "Old User", status: "Interested", dealStage: "Lead", intelligence: { temperature: "Cold", health: "Active" }, latestActivityAt: NOW - 4 * HOUR },
  ];
  const followUps = [
    { id: "fu_overdue", leadId: "lead_reply", assignedTo: "Ali", status: "pending", type: "call", dueAt: NOW - HOUR },
    { id: "fu_today", leadId: "lead_hot", assignedTo: "", status: "pending", type: "message", dueAt: NOW + HOUR },
    { id: "fu_future", leadId: "lead_inactive_owner", assignedTo: "Old User", status: "pending", type: "message", dueAt: NOW + 3 * 86400 },
    { id: "fu_done", leadId: "lead_reply", assignedTo: "Ali", status: "completed", type: "message", dueAt: NOW - 2 * HOUR, completedAt: NOW - HOUR },
  ];
  const staffBefore = JSON.stringify(staff);
  const leadsBefore = JSON.stringify(leads);
  const followUpsBefore = JSON.stringify(followUps);

  const workflow = buildCrmTeamWorkflow({ staff, leads, followUps, now: NOW });

  assert.equal(workflow.summary.activeStaff, 2);
  assert.equal(workflow.summary.unassignedLeads, 2);
  assert.equal(workflow.summary.hotUnassigned, 1);
  assert.equal(workflow.summary.overdueFollowUps, 1);
  assert.equal(workflow.summary.dueToday, 1);
  assert.equal(workflow.ownerQueues.hotUnassignedLeads[0].id, "lead_hot");
  assert.equal(workflow.ownerQueues.overdueFollowUps[0].assignedTo, "Ali");
  assert.equal(workflow.ownerQueues.dueToday[0].leadId, "lead_hot");
  assert.ok(workflow.ownerQueues.staleLeadsNoFollowUp.some((lead: any) => lead.id === "lead_stale"));

  const ali = workflow.staffCards.find((card: any) => card.name === "Ali");
  assert.equal(ali.assignedLeads, 1);
  assert.equal(ali.overdueFollowUps, 1);
  assert.equal(ali.pendingFollowUps, 1);
  assert.equal(ali.completedFollowUps, 1);
  assert.equal(ali.needsHumanReply, 1);
  assert.equal(ali.riskLabel, "Needs attention");

  const sara = workflow.staffCards.find((card: any) => card.name === "Sara");
  assert.equal(sara.wonCompletedLeads, 1);
  assert.equal(sara.riskLabel, "Healthy");

  const inactive = workflow.staffCards.find((card: any) => card.name === "Old User");
  assert.equal(inactive.active, false);
  assert.equal(inactive.assignedLeads, 1);
  assert.equal(inactive.riskLabel, "Inactive");

  assert.equal(JSON.stringify(staff), staffBefore);
  assert.equal(JSON.stringify(leads), leadsBefore);
  assert.equal(JSON.stringify(followUps), followUpsBefore);
});

test("CRM team workflow handles empty inputs deterministically", () => {
  const workflow = buildCrmTeamWorkflow({ now: NOW });

  assert.deepEqual(workflow.summary, {
    totalStaff: 0,
    activeStaff: 0,
    unassignedLeads: 0,
    hotUnassigned: 0,
    needsHumanReply: 0,
    overdueFollowUps: 0,
    dueToday: 0,
    staleLeadsNoFollowUp: 0,
    topAssignedStaff: "",
  });
  assert.deepEqual(workflow.staffCards, []);
  assert.deepEqual(workflow.ownerQueues.unassignedLeads, []);
});
