import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRM_DEAL_STAGES,
  CRM_LEAD_STATUSES,
  __crmFoundationTestUtils,
} from "./crm-foundation-service.ts";
import {
  buildDashboardToast,
  countActiveDashboardNotifications,
  crmDashboardNotifications,
  filterDashboardNotifications,
  mergeDashboardNotifications,
  systemDashboardNotifications,
  topDashboardNotifications,
} from "./dashboard-notification-ui-service.ts";
import {
  buildCrmPipelineStagePatch,
  crmPipelineColumnId,
} from "./crm-pipeline-stage-service.ts";

describe("CRM foundation helpers", () => {
  it("normalizes CRM phones without throwing on empty or formatted input", () => {
    assert.equal(__crmFoundationTestUtils.normalizeCrmPhone("+92 300 1234567"), "195545134641");
    assert.equal(__crmFoundationTestUtils.normalizeCrmPhone("0300-1234567"), "195545134641");
    assert.equal(__crmFoundationTestUtils.normalizeCrmPhone(""), "");
  });

  it("creates stable account-scoped CRM IDs", () => {
    const first = __crmFoundationTestUtils.crmStableId("lead", "account_1", "195545134641");
    const second = __crmFoundationTestUtils.crmStableId("lead", "account_1", "195545134641");
    const other = __crmFoundationTestUtils.crmStableId("lead", "account_2", "195545134641");

    assert.equal(first, second);
    assert.notEqual(first, other);
    assert.match(first, /^lead_[a-f0-9]{24}$/);
  });

  it("keeps lead and deal statuses inside supported CRM values", () => {
    assert.ok(CRM_LEAD_STATUSES.includes("Quotation Sent"));
    assert.ok(CRM_DEAL_STAGES.includes("Dispatch"));
    assert.equal(__crmFoundationTestUtils.normalizeLeadStatus("Bad"), "New");
    assert.equal(__crmFoundationTestUtils.normalizeDealStage("Bad"), "Lead");
    assert.equal(__crmFoundationTestUtils.normalizeDealStage("Payment"), "Payment");
  });

  it("derives a lead from an existing customer without losing CRM metadata", () => {
    const lead = __crmFoundationTestUtils.leadFromCustomer("account_1", {
      $id: "customer_1",
      bot_id: "bot_owner_key",
      jid: "contact-e4ed32210a80@example.invalid",
      profile: {
        name: "Ayesha",
        leadStatus: "Interested",
        dealStage: "Quotation",
        productInterest: "Plan A",
        city: "Lahore",
      },
    });

    assert.equal(lead.accountId, "account_1");
    assert.equal(lead.botId, "bot_owner_key");
    assert.equal(lead.name, "Ayesha");
    assert.equal(lead.phone, "195545134641");
    assert.equal(lead.source, "WhatsApp");
    assert.equal(lead.status, "Interested");
    assert.equal(lead.dealStage, "Quotation");
  });

  it("uses latest incoming/customer chat timestamp as CRM activity time", () => {
    const lead = __crmFoundationTestUtils.leadFromCustomer("account_1", {
      $id: "customer_activity",
      jid: "contact-e4ed32210a80@example.invalid",
      last_message_at: 300,
      updated_at: 200,
      profile: { name: "Ayesha" },
    });

    assert.equal(lead.latestActivityAt, 300);
  });

  it("uses CRM update timestamp when no message is newer", () => {
    const lead = __crmFoundationTestUtils.publicLead({
      id: "lead_update_activity",
      accountId: "account_1",
      latestActivityAt: 100,
      updatedAt: 250,
      createdAt: 50,
    });

    assert.equal(lead.latestActivityAt, 250);
  });

  it("sorts CRM leads by latest real activity first", () => {
    const rows = __crmFoundationTestUtils.sortCrmLeadsByLatestActivity([
      __crmFoundationTestUtils.publicLead({ id: "old", accountId: "a", latestActivityAt: 10 }),
      __crmFoundationTestUtils.publicLead({ id: "new", accountId: "a", latestActivityAt: 40 }),
      __crmFoundationTestUtils.publicLead({ id: "crm_update", accountId: "a", updatedAt: 25 }),
    ]);

    assert.deepEqual(rows.map((lead: any) => lead.id), ["new", "crm_update", "old"]);
  });

  it("does not create fake current activity time when no timestamp exists", () => {
    const lead = __crmFoundationTestUtils.publicLead({ id: "lead_no_time", accountId: "account_1" });

    assert.equal(lead.latestActivityAt, 0);
    assert.equal(lead.updatedAt, 0);
    assert.equal(lead.createdAt, 0);
  });

  it("merges stored CRM fields over customer-derived leads", () => {
    const merged = __crmFoundationTestUtils.mergeLead(
      { id: "lead_1", accountId: "account_1", name: "Customer", phone: "195545134641", status: "AI Replied", dealStage: "Lead" },
      { id: "lead_1", accountId: "account_1", assignedTo: "Sales", status: "Contacted", notes: "Call tomorrow" },
    );

    assert.equal(merged.name, "Customer");
    assert.equal(merged.assignedTo, "Sales");
    assert.equal(merged.status, "Contacted");
    assert.equal(merged.notes, "Call tomorrow");
  });

  it("preserves original source while updating latest source during safe lead merge", () => {
    const merged = __crmFoundationTestUtils.mergeLead(
      __crmFoundationTestUtils.publicLead({ id: "lead_1", accountId: "account_1", phone: "195545134641", source: "Website", firstSource: "Website", latestSource: "Website" }),
      { id: "lead_1", accountId: "account_1", phone: "195545134641", source: "WhatsApp", firstSource: "Website", latestSource: "WhatsApp" },
    );

    assert.equal(merged.source, "WhatsApp");
    assert.equal(merged.firstSource, "Website");
    assert.equal(merged.latestSource, "WhatsApp");
  });

  it("does not replace rich customer-derived lead fields with sparse stored CRM rows", () => {
    const derived = __crmFoundationTestUtils.publicLead({
      id: "lead_1",
      accountId: "account_1",
      name: "Ayesha",
      phone: "195545134641",
      source: "WhatsApp",
      status: "AI Replied",
      dealStage: "Lead",
      productInterest: "Growth plan",
    });
    const merged = __crmFoundationTestUtils.mergeLead(derived, {
      id: "lead_1",
      accountId: "account_1",
      assignedTo: "Sara",
      status: "Contacted",
    });

    assert.equal(merged.name, "Ayesha");
    assert.equal(merged.phone, "195545134641");
    assert.equal(merged.source, "WhatsApp");
    assert.equal(merged.productInterest, "Growth plan");
    assert.equal(merged.status, "Contacted");
    assert.equal(merged.assignedTo, "Sara");
  });

  it("matches stored CRM edits to customer-derived leads by id, JID, or phone across sources", () => {
    const customerLead = {
      id: "lead_customer",
      customerId: "customer_1",
      accountId: "account_1",
      name: "Original customer",
      phone: "195545134641",
      source: "WhatsApp",
      status: "AI Replied",
    };
    const byId = __crmFoundationTestUtils.findLeadDuplicate([customerLead], { id: "lead_customer", accountId: "account_1", source: "Manual" });
    const byPhoneSource = __crmFoundationTestUtils.findLeadDuplicate([customerLead], { id: "lead_other", accountId: "account_1", phone: "195545134641", source: "WhatsApp" });
    const differentSource = __crmFoundationTestUtils.findLeadDuplicate([customerLead], { id: "lead_other", accountId: "account_1", phone: "195545134641", source: "Manual" });

    assert.equal(byId?.id, "lead_customer");
    assert.equal(byPhoneSource?.id, "lead_customer");
    assert.equal(differentSource?.id, "lead_customer");
  });

  it("normalizes CRM source tracking from public intake names", () => {
    assert.equal(__crmFoundationTestUtils.normalizeCrmSource("wordpress connector"), "WordPress");
    assert.equal(__crmFoundationTestUtils.normalizeCrmSource("Public API form"), "API");
    assert.equal(__crmFoundationTestUtils.normalizeCrmSource("wa chat"), "WhatsApp");
    assert.equal(__crmFoundationTestUtils.publicLead({
      accountId: "account_1",
      source: "Website form",
      pageUrl: "https://shop.example.com/pricing",
      campaign: "summer",
      phone: "15811061380",
    }).sourceUrl, "https://shop.example.com/pricing");
    assert.equal(__crmFoundationTestUtils.publicLead({
      accountId: "account_1",
      source: "Website form",
      campaign: "summer",
    }).sourceCampaign, "summer");
  });

  it("matches CRM search across contact, source, interest, campaign, and notes", () => {
    const lead = __crmFoundationTestUtils.publicLead({
      accountId: "account_1",
      name: "Ayesha",
      phone: "195545134641",
      source: "Website",
      sourceUrl: "https://shop.example.com/pricing",
      sourceCampaign: "summer",
      productInterest: "Premium plan",
      notes: "Needs invoice",
    });

    assert.equal(__crmFoundationTestUtils.leadMatchesCrmSearch(lead, "invoice"), true);
    assert.equal(__crmFoundationTestUtils.leadMatchesCrmSearch(lead, "pricing"), true);
    assert.equal(__crmFoundationTestUtils.leadMatchesCrmSearch(lead, "missing"), false);
  });

  it("keeps updated leads searchable by phone, source, status, deal, assignment, and summary fields", () => {
    const lead = __crmFoundationTestUtils.publicLead({
      accountId: "account_1",
      name: "Ayesha",
      phone: "195545134641",
      source: "WhatsApp",
      firstSource: "WhatsApp",
      latestSource: "Website",
      status: "Quotation Sent",
      dealStage: "Quotation",
      assignedTo: "Sara",
      productInterest: "Premium plan",
      location: "Lahore",
      summary: "Customer wants an annual plan.",
    });

    for (const query of ["Ayesha", "195545134641", "WhatsApp", "Website", "Quotation Sent", "Quotation", "Sara", "annual plan", "Lahore"]) {
      assert.equal(__crmFoundationTestUtils.leadMatchesCrmSearch(lead, query), true, query);
    }
  });

  it("filters CRM leads by assigned user, unassigned, and source", () => {
    const leads = [
      __crmFoundationTestUtils.publicLead({ id: "lead_1", accountId: "a", source: "Manual", assignedTo: "Sara", status: "New" }),
      __crmFoundationTestUtils.publicLead({ id: "lead_2", accountId: "a", source: "Website", assignedTo: "", status: "New" }),
      __crmFoundationTestUtils.publicLead({ id: "lead_3", accountId: "a", source: "API", assignedTo: "", status: "New" }),
      __crmFoundationTestUtils.publicLead({ id: "lead_4", accountId: "a", source: "WooCommerce", assignedTo: "", status: "New" }),
      __crmFoundationTestUtils.publicLead({ id: "lead_5", accountId: "a", source: "WordPress", assignedTo: "", status: "New" }),
    ];

    assert.deepEqual(__crmFoundationTestUtils.filterCrmLeadsForWorkspace(leads, { assignedTo: "Sara" }).map((lead: any) => lead.id), ["lead_1"]);
    assert.deepEqual(__crmFoundationTestUtils.filterCrmLeadsForWorkspace(leads, { assignedTo: "__unassigned" }).map((lead: any) => lead.id), ["lead_2", "lead_3", "lead_4", "lead_5"]);
    assert.deepEqual(__crmFoundationTestUtils.filterCrmLeadsForWorkspace(leads, { source: "Website" }).map((lead: any) => lead.id), ["lead_2"]);
    assert.deepEqual(__crmFoundationTestUtils.filterCrmLeadsForWorkspace(leads, { source: "website_api" }).map((lead: any) => lead.id), ["lead_2", "lead_3"]);
    assert.deepEqual(__crmFoundationTestUtils.filterCrmLeadsForWorkspace(leads, { source: "woo_wordpress" }).map((lead: any) => lead.id), ["lead_4", "lead_5"]);
    assert.deepEqual(__crmFoundationTestUtils.filterCrmLeadsForWorkspace(leads, {}).map((lead: any) => lead.id), ["lead_1", "lead_2", "lead_3", "lead_4", "lead_5"]);
  });

  it("keeps source filters broad enough for website, API, WooCommerce, WordPress, WhatsApp, and manual CRM leads", () => {
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("WhatsApp", "whatsapp"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("Website form", "website_api"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("Public API", "website_api"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("WooCommerce", "woo_wordpress"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("WordPress", "woo_wordpress"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("Manual", "manual_crm"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("CRM", "manual_crm"), true);
    assert.equal(__crmFoundationTestUtils.sourceMatchesCrmFilter("Instagram", "social"), true);
  });

  it("merges duplicate phone or JID only inside the same account and compatible bot scope", () => {
    const base = __crmFoundationTestUtils.publicLead({
      id: "lead_a",
      accountId: "account_1",
      botId: "bot_1",
      phone: "195545134641",
      customerJid: "contact-e4ed32210a80@example.invalid",
      source: "WhatsApp",
    });

    assert.equal(__crmFoundationTestUtils.findLeadDuplicate([base], { accountId: "account_1", botId: "bot_1", phone: "195545134641" })?.id, "lead_a");
    assert.equal(__crmFoundationTestUtils.findLeadDuplicate([base], { accountId: "account_2", botId: "bot_1", phone: "195545134641" }), undefined);
    assert.equal(__crmFoundationTestUtils.findLeadDuplicate([base], { accountId: "account_1", botId: "bot_2", phone: "195545134641" }), undefined);
    assert.equal(__crmFoundationTestUtils.findLeadDuplicate([base], { accountId: "account_1", phone: "195545134641" })?.id, "lead_a");
  });

  it("normalizes CRM staff create/update/deactivate fields", () => {
    const staff = __crmFoundationTestUtils.publicCrmStaff({
      id: "staff_1",
      name: "Sara",
      phone: "15811061380",
      email: "contact-259b65833bba@example.invalid",
      role: "Manager",
      active: false,
      notes: "Handles quotations",
    });

    assert.equal(staff.id, "staff_1");
    assert.equal(staff.name, "Sara");
    assert.equal(staff.role, "Manager");
    assert.equal(staff.active, false);
    assert.equal(__crmFoundationTestUtils.publicCrmStaff({ name: "Ali", role: "Bad" }).role, "Sales Agent");
  });

  it("sorts follow-ups overdue, today, upcoming, then completed", () => {
    const now = 200000;
    const rows = __crmFoundationTestUtils.sortFollowUpsForWorkspace([
      { id: "upcoming", status: "pending", dueAt: now + 90000, createdAt: 1 },
      { id: "done", status: "completed", dueAt: now - 100, createdAt: 4 },
      { id: "overdue", status: "pending", dueAt: now - 100, createdAt: 2 },
      { id: "today", status: "pending", dueAt: now + 100, createdAt: 3 },
    ], now);

    assert.deepEqual(rows.map((item: any) => item.id), ["overdue", "today", "upcoming", "done"]);
  });

  it("buckets follow-ups into overdue, today, due soon, and upcoming", () => {
    const now = 200000;
    assert.equal(__crmFoundationTestUtils.bucketCrmFollowUpDueState({ status: "pending", dueAt: now - 1 }, now), "overdue");
    assert.equal(__crmFoundationTestUtils.bucketCrmFollowUpDueState({ status: "pending", dueAt: now + 100 }, now), "today");
    assert.equal(__crmFoundationTestUtils.bucketCrmFollowUpDueState({ status: "pending", dueAt: now + 70000 }, now), "due_soon");
    assert.equal(__crmFoundationTestUtils.bucketCrmFollowUpDueState({ status: "pending", dueAt: now + 200000 }, now), "upcoming");
  });

  it("enriches follow-up cards with lead context and due state", () => {
    const now = 200000;
    const rows = __crmFoundationTestUtils.enrichCrmFollowUps([
      { id: "fu_1", leadId: "lead_1", status: "pending", dueAt: now - 10, type: "call" },
    ], [
      { id: "lead_1", name: "Ayesha", phone: "195545134641", source: "Manual", status: "New", dealStage: "Lead", assignedTo: "Sara", productInterest: "Plan A" },
    ], now);

    assert.equal(rows[0].leadName, "Ayesha");
    assert.equal(rows[0].leadAssignedTo, "Sara");
    assert.equal(rows[0].dueState, "overdue");
  });

  it("normalizes call logs and deal tracking fields", () => {
    const call = __crmFoundationTestUtils.publicCallLog({
      accountId: "account_1",
      leadId: "lead_1",
      outcome: "Wrong Number",
      nextCallAt: "2026-06-22T10:00:00Z",
      notes: "Bad number",
    });
    const deal = __crmFoundationTestUtils.publicDeal({
      accountId: "account_1",
      leadId: "lead_1",
      stage: "Payment",
      amount: "25000",
      paymentStatus: "Partial",
      dispatchStatus: "Preparing",
    });

    assert.equal(call.status, "Wrong Number");
    assert.ok(call.nextCallAt > 0);
    assert.equal(deal.stage, "Payment");
    assert.equal(deal.amount, "25000");
    assert.equal(deal.paymentStatus, "Partial");
  });

  it("preserves deal stage when updating non-stage deal fields", () => {
    const deal = __crmFoundationTestUtils.mergeCrmDealUpdate(
      "account_1",
      "lead_1",
      { stage: "Negotiation", amount: "1000", paymentStatus: "Pending" },
      { amount: "1500" },
    );

    assert.equal(deal.stage, "Negotiation");
    assert.equal(deal.amount, "1500");
    assert.equal(deal.paymentStatus, "Pending");
  });

  it("builds CRM timeline rows without changing message sending logic", () => {
    const timeline = __crmFoundationTestUtils.buildCrmTimeline([
      { role: "user", text: "Need price", timestamp: 10 },
      { role: "model", text: "Sure, which product?", timestamp: 20 },
    ]);

    assert.deepEqual(timeline.map((item: any) => item.direction), ["inbound", "outbound"]);
    assert.equal(timeline[0].actor, "Customer");
    assert.equal(timeline[1].actor, "Bot/Admin");
  });

  it("builds CRM assignment activity and dashboard notifications with dedupe state", () => {
    const activity = __crmFoundationTestUtils.publicCrmActivity({
      id: "act_1",
      accountId: "account_1",
      leadId: "lead_1",
      type: "assigned_user_changed",
      title: "Assigned user changed",
      previousValue: "",
      newValue: "Sara",
      createdAt: 100,
    });
    const notifications = __crmFoundationTestUtils.buildCrmNotifications({
      leads: [{ id: "lead_1", name: "Ayesha", source: "Manual", assignedTo: "Sara" }],
      followUps: [{ id: "fu_1", leadId: "lead_1", status: "pending", dueAt: 90, assignedTo: "Sara", type: "call" }],
      activities: [activity],
      states: [{ id: "lead_assigned:act_1", completed: true }],
      now: 100,
    });

    assert.equal(notifications.some((item: any) => item.id === "lead_assigned:act_1"), false);
    assert.equal(notifications.some((item: any) => item.type === "follow_up_overdue"), true);
  });

  it("keeps CRM records intact while notification state hides or marks rebuilt alerts", () => {
    const leads = [{ id: "lead_1", name: "Ayesha", source: "Manual", assignedTo: "Sara" }];
    const followUps = [{ id: "fu_1", leadId: "lead_1", status: "pending", dueAt: 90, assignedTo: "Sara", type: "call" }];
    const readNotifications = __crmFoundationTestUtils.buildCrmNotifications({
      leads,
      followUps,
      states: [{ id: "followup_overdue:fu_1", read: true }],
      now: 100,
    });
    const clearedNotifications = __crmFoundationTestUtils.buildCrmNotifications({
      leads,
      followUps,
      states: [{ id: "followup_overdue:fu_1", read: true, completed: true }],
      now: 100,
    });

    assert.equal(readNotifications[0]?.read, true);
    assert.equal(clearedNotifications.some((item: any) => item.id === "followup_overdue:fu_1"), false);
    assert.deepEqual(leads.map((lead) => lead.id), ["lead_1"]);
    assert.deepEqual(followUps.map((followUp) => followUp.id), ["fu_1"]);
  });

  it("calculates lead intelligence temperature, health, action, and missing details", () => {
    const now = 200000;
    const lead = __crmFoundationTestUtils.publicLead({
      id: "lead_hot",
      accountId: "account_1",
      name: "Ayesha",
      phone: "195545134641",
      status: "Quotation Needed",
      dealStage: "Lead",
      assignedTo: "Sara",
      productInterest: "Growth plan",
      source: "Website",
      sourceCampaign: "summer",
    });
    const intelligence = __crmFoundationTestUtils.buildCrmLeadIntelligence(lead, {
      followUps: [{ id: "fu_1", leadId: "lead_hot", status: "pending", dueAt: now - 10 }],
      now,
    });

    assert.equal(intelligence.temperature, "Hot");
    assert.equal(intelligence.health, "Follow-up overdue");
    assert.equal(intelligence.suggestedNextAction, "Follow up today");
    assert.equal(intelligence.missingDetails.includes("city/location"), true);
    assert.equal(intelligence.missingDetails.includes("assigned user"), false);
    assert.equal(intelligence.sourceAttribution.latestSource, "Website");
  });

  it("derives smart CRM actions for assignment rules, follow-up, quotation, overdue, and needs reply", () => {
    const now = 200000;
    const ordinaryUnassigned = __crmFoundationTestUtils.deriveSmartCrmActions(
      __crmFoundationTestUtils.publicLead({ id: "lead_1", accountId: "a", status: "New", dealStage: "Lead", productInterest: "Plan A" }),
      { assignedUsers: ["Sara"], now },
    );
    assert.equal(ordinaryUnassigned.some((action: any) => action.id === "assign_lead"), false);
    assert.equal(ordinaryUnassigned.some((action: any) => action.id === "create_follow_up"), true);
    assert.equal(ordinaryUnassigned.some((action: any) => action.id === "send_quotation"), true);

    const hotUnassigned = __crmFoundationTestUtils.deriveSmartCrmActions(
      __crmFoundationTestUtils.publicLead({ id: "lead_hot_assign", accountId: "a", status: "Quotation Needed", dealStage: "Lead", productInterest: "Plan A" }),
      { assignedUsers: ["Sara"], now },
    );
    assert.equal(hotUnassigned.some((action: any) => action.id === "assign_lead" && action.safe), true);

    const missingDetails = __crmFoundationTestUtils.deriveSmartCrmActions(
      __crmFoundationTestUtils.publicLead({ id: "lead_2", accountId: "a", status: "Contacted", dealStage: "Lead", assignedTo: "Sara" }),
      { now },
    );
    assert.equal(missingDetails.some((action: any) => action.id === "ask_product_service_interest" && !action.safe), true);

    const overdue = __crmFoundationTestUtils.deriveSmartCrmActions(
      __crmFoundationTestUtils.publicLead({ id: "lead_3", accountId: "a", status: "Contacted", dealStage: "Lead", assignedTo: "Sara" }),
      { followUps: [{ id: "fu_1", leadId: "lead_3", status: "pending", dueAt: now - 10, type: "call" }], now },
    );
    assert.equal(overdue.some((action: any) => action.id === "reschedule_overdue_follow_up" && action.priority === "high"), true);

    const needsReply = __crmFoundationTestUtils.deriveSmartCrmActions(
      __crmFoundationTestUtils.publicLead({ id: "lead_4", accountId: "a", status: "Call Required", dealStage: "Lead", assignedTo: "Sara", nextFollowUpAt: now + 5000 }),
      { now },
    );
    assert.equal(needsReply.some((action: any) => action.id === "call_customer"), true);
  });

  it("builds smart CRM action applications for assignment, status update, and duplicate-safe follow-up creation", () => {
    const now = 200000;
    const lead = __crmFoundationTestUtils.publicLead({
      id: "lead_1",
      accountId: "account_1",
      name: "Ayesha",
      phone: "195545134641",
      source: "Manual",
      status: "Quotation Needed",
      dealStage: "Lead",
      productInterest: "Plan A",
    });

    const assigned: any = __crmFoundationTestUtils.buildSmartCrmActionApplication(lead, "assign_lead", { assignedUsers: ["Sara"], now });
    assert.equal(assigned.leadPatch.assignedTo, "Sara");

    const quoted: any = __crmFoundationTestUtils.buildSmartCrmActionApplication({ ...lead, assignedTo: "Sara" }, "send_quotation", { now });
    assert.equal(quoted.leadPatch.status, "Quotation Needed");
    assert.equal(quoted.leadPatch.dealStage, "Quotation");

    const followUpId = __crmFoundationTestUtils.crmStableId("fu_smart", "account_1", "lead_1", "create_follow_up");
    const followUp: any = __crmFoundationTestUtils.buildSmartCrmActionApplication(
      { ...lead, assignedTo: "Sara", status: "Contacted" },
      "create_follow_up",
      { accountId: "account_1", followUpId, now },
    );
    assert.equal(followUp.followUp.id, followUpId);
    assert.equal(followUp.leadPatch.nextFollowUpAt, followUp.followUp.dueAt);

    const duplicate: any = __crmFoundationTestUtils.buildSmartCrmActionApplication(
      { ...lead, assignedTo: "Sara", status: "Contacted", nextFollowUpAt: followUp.followUp.dueAt },
      "create_follow_up",
      { followUps: [followUp.followUp], followUpId, now },
    );
    assert.equal(duplicate.duplicate, true);
  });

  it("derives phase 2 smart actions from timeline and summary without sending messages", () => {
    const now = 200000;
    const lead = __crmFoundationTestUtils.publicLead({
      id: "lead_timeline",
      accountId: "account_1",
      name: "Ayesha",
      phone: "195545134641",
      source: "WhatsApp",
      status: "Interested",
      dealStage: "Lead",
      summary: "Customer asked for price and may confirm order after quotation.",
    });
    const actions = __crmFoundationTestUtils.deriveSmartCrmActions(lead, {
      timeline: [
        { direction: "inbound", text: "Please send price and call me today." },
        { direction: "inbound", text: "If rate is ok I will confirm order." },
      ],
      assignedUsers: ["Sara"],
      now,
    });

    const quotation: any = actions.find((action: any) => action.id === "send_quotation");
    const call: any = actions.find((action: any) => action.id === "call_customer");
    const order: any = actions.find((action: any) => action.id === "confirm_order_stage");
    assert.equal(quotation?.payload.dealStage, "Quotation");
    assert.match(quotation?.draftText || "", /quotation/i);
    assert.equal(call?.priority, "high");
    assert.equal(order?.payload.status, "Order Confirmed");
    assert.equal(actions.some((action: any) => action.draftText && action.kind === "create_follow_up"), true);
  });

  it("filters dismissed smart CRM actions from future suggestions", () => {
    const now = 200000;
    const lead = __crmFoundationTestUtils.publicLead({
      id: "lead_dismissed",
      accountId: "account_1",
      status: "New",
      dealStage: "Lead",
      productInterest: "Plan A",
    });
    const actions = __crmFoundationTestUtils.deriveSmartCrmActions(lead, {
      assignedUsers: ["Sara"],
      dismissedActionIds: ["lead_dismissed:assign_lead", "create_follow_up"],
      now,
    });

    assert.equal(actions.some((action: any) => action.id === "assign_lead"), false);
    assert.equal(actions.some((action: any) => action.id === "create_follow_up"), false);
    assert.equal(actions.some((action: any) => action.id === "send_quotation"), true);
  });

  it("suggests lifecycle stage changes from conversation context", () => {
    const quote = __crmFoundationTestUtils.suggestLifecycleStage(
      __crmFoundationTestUtils.publicLead({ id: "lead_stage_1", accountId: "a", status: "Contacted", dealStage: "Lead" }),
      { timeline: [{ direction: "inbound", text: "What is the price and quotation?" }] },
    );
    assert.equal(quote?.status, "Quotation Needed");
    assert.equal(quote?.dealStage, "Quotation");

    const payment = __crmFoundationTestUtils.suggestLifecycleStage(
      __crmFoundationTestUtils.publicLead({ id: "lead_stage_2", accountId: "a", status: "Negotiation", dealStage: "Negotiation" }),
      { timeline: [{ direction: "inbound", text: "I paid advance by bank transfer." }] },
    );
    assert.equal(payment?.status, "Payment Pending");

    const lost = __crmFoundationTestUtils.suggestLifecycleStage(
      __crmFoundationTestUtils.publicLead({ id: "lead_stage_3", accountId: "a", status: "Contacted", dealStage: "Lead" }),
      { timeline: [{ direction: "inbound", text: "No thanks, not interested." }] },
    );
    assert.equal(lost?.dealStage, "Lost");
  });

  it("detects missing lifecycle fields from recent messages without overwriting existing values", () => {
    const detected = __crmFoundationTestUtils.detectLifecycleFields(
      __crmFoundationTestUtils.publicLead({ id: "lead_fields", accountId: "a", name: "Customer", status: "New", dealStage: "Lead" }),
      { timeline: [{ direction: "inbound", text: "My name is Ayesha. I am in Sahiwal. Need 2 pieces, budget Rs 1000 tomorrow." }] },
    );
    assert.equal(detected.some((item: any) => item.field === "name" && item.value === "Ayesha"), true);
    assert.equal(detected.some((item: any) => item.field === "location" && /Sahiwal/i.test(item.value)), true);
    assert.equal(detected.some((item: any) => item.field === "quantity" && item.value === "2"), true);
    assert.equal(detected.some((item: any) => item.field === "budget" && item.value === "1000"), true);
    assert.equal(detected.some((item: any) => item.field === "preferredFollowUpTime"), true);

    const preserved = __crmFoundationTestUtils.detectLifecycleFields(
      __crmFoundationTestUtils.publicLead({ id: "lead_fields_2", accountId: "a", name: "Ayesha", location: "Lahore", quantity: "4", budget: "2000" }),
      { timeline: [{ direction: "inbound", text: "I am in Sahiwal and need 2 pieces budget Rs 1000." }] },
    );
    assert.equal(preserved.some((item: any) => ["location", "quantity", "budget"].includes(item.field)), false);
  });

  it("recommends lifecycle follow-ups with due date and duplicate prevention context", () => {
    const now = 200000;
    const lead = __crmFoundationTestUtils.publicLead({ id: "lead_follow", accountId: "a", status: "Quotation Sent", dealStage: "Quotation" });
    const recommendation = __crmFoundationTestUtils.recommendLifecycleFollowUp(lead, { now });
    assert.equal(recommendation?.type, "quotation");
    assert.ok(Number(recommendation?.dueAt || 0) > now);
    assert.match(recommendation?.notes || "", /Lifecycle suggestion/);

    const skipped = __crmFoundationTestUtils.recommendLifecycleFollowUp(lead, { followUps: [{ id: "fu_1", leadId: "lead_follow", status: "pending", dueAt: now + 1000 }], now });
    assert.equal(skipped, null);
  });

  it("builds lifecycle smart action applications for detected fields and stage changes", () => {
    const now = 200000;
    const lead = __crmFoundationTestUtils.publicLead({ id: "lead_apply", accountId: "a", status: "Contacted", dealStage: "Lead" });
    const fieldApply: any = __crmFoundationTestUtils.buildSmartCrmActionApplication(lead, "detected_field_location", {
      timeline: [{ direction: "inbound", text: "Location is Sahiwal." }],
      now,
    });
    assert.equal(fieldApply.leadPatch.location, "Sahiwal");
    assert.equal(fieldApply.leadPatch.city, "Sahiwal");

    const stageApply: any = __crmFoundationTestUtils.buildSmartCrmActionApplication(lead, "lifecycle_quotation_needed", {
      timeline: [{ direction: "inbound", text: "Please share price quote." }],
      now,
    });
    assert.equal(stageApply.leadPatch.status, "Quotation Needed");
    assert.equal(stageApply.leadPatch.dealStage, "Quotation");
  });

  it("detects needs human reply and dedupes automation task alerts", () => {
    const lead = __crmFoundationTestUtils.publicLead({ id: "lead_reply", accountId: "a", status: "Contacted", dealStage: "Lead" });
    assert.equal(__crmFoundationTestUtils.needsHumanReply(lead, { timeline: [{ direction: "inbound", text: "What is price?" }] }), false);
    assert.equal(__crmFoundationTestUtils.needsHumanReply(lead, { timeline: [{ direction: "inbound", text: "Please call me, I want an agent." }] }), true);
    assert.equal(__crmFoundationTestUtils.needsHumanReply(lead, { timeline: [{ direction: "inbound", text: "I am angry and want refund." }] }), true);
    assert.equal(__crmFoundationTestUtils.needsHumanReply(
      __crmFoundationTestUtils.publicLead({ id: "lead_ai_guard", accountId: "a", status: "Call Required" }),
      { timeline: [{ direction: "inbound", text: "Still waiting" }] }
    ), true);

    const notifications = __crmFoundationTestUtils.buildCrmNotifications({
      leads: [lead],
      smartActions: [
        { id: "needs_human_reply", title: "Needs human reply", reason: "Question detected.", leadId: "lead_reply", priority: "high", safe: true, actionLabel: "Mark contacted" },
        { id: "needs_human_reply", title: "Needs human reply", reason: "Question detected.", leadId: "lead_reply", priority: "high", safe: true, actionLabel: "Mark contacted" },
      ],
      now: 200000,
    });
    assert.equal(notifications.filter((item: any) => item.id === "smart_action:lead_reply:needs_human_reply").length, 1);
    assert.equal(notifications[0].safe, true);
    assert.equal(notifications[0].actionId, "needs_human_reply");
  });

  it("builds dashboard toasts and notification drawer counts", () => {
    const toast = buildDashboardToast({ id: "toast_1", tone: "error", message: "  Could not save lead. Please try again.  " });
    assert.equal(toast.id, "toast_1");
    assert.equal(toast.tone, "error");
    assert.equal(toast.message, "Could not save lead. Please try again.");

    const rows = [
      { id: "active_old", read: false, completed: false, createdAt: 10 },
      { id: "read_new", read: true, completed: false, createdAt: 20 },
      { id: "done", read: false, completed: true, createdAt: 30 },
    ];
    assert.equal(countActiveDashboardNotifications(rows), 1);
    assert.deepEqual(topDashboardNotifications(rows).map((item: any) => item.id), ["read_new", "active_old"]);
  });

  it("normalizes global dashboard notification sources and filters", () => {
    const crmRows = crmDashboardNotifications([
      { id: "needs_reply", title: "Needs human reply", message: "Question detected.", severity: "warn", leadId: "lead_1", createdAt: 10 },
    ]);
    const systemRows = systemDashboardNotifications({
      selectedBot: { name: "Shop bot", is_active: 0 },
      status: "qr-ready",
      walletBalance: 1.5,
      billing: { usage: 10, limit: 10 },
    });
    const merged = mergeDashboardNotifications(crmRows, systemRows, systemRows);

    assert.equal(crmRows[0].id, "crm:needs_reply");
    assert.equal(filterDashboardNotifications(merged, "crm").length, 1);
    assert.equal(filterDashboardNotifications(merged, "billing").length, 2);
    assert.equal(merged.some((item: any) => item.id === "system:qr-needed"), true);
    assert.equal(countActiveDashboardNotifications(merged), merged.length);
  });

  it("builds compact CRM pipeline quick-stage patches", () => {
    const lead = __crmFoundationTestUtils.publicLead({ id: "lead_stage", accountId: "a", status: "Quotation Sent", dealStage: "Quotation" });
    assert.equal(crmPipelineColumnId(lead), "quotation");
    assert.deepEqual(buildCrmPipelineStagePatch(lead, "next"), { status: "Negotiation", dealStage: "Negotiation" });
    assert.deepEqual(buildCrmPipelineStagePatch(lead, "won"), { status: "Order Confirmed", dealStage: "Order Confirmed" });
    assert.deepEqual(buildCrmPipelineStagePatch(lead, "lost"), { status: "Lost", dealStage: "Lost" });
  });

  it("keeps smart action activity logging free of full private message content", () => {
    const activity = __crmFoundationTestUtils.publicCrmActivity({
      type: "smart_action_applied",
      leadId: "lead_1",
      title: "Smart action applied",
      newValue: "Move lifecycle to Quotation Needed",
    });
    assert.equal(activity.type, "smart_action_applied");
    assert.equal(activity.newValue.includes("My private full message"), false);
  });

  it("groups leads into practical pipeline board columns", () => {
    const board = __crmFoundationTestUtils.buildCrmPipelineBoard([
      __crmFoundationTestUtils.publicLead({ id: "lead_new", accountId: "a", status: "New", dealStage: "Lead" }),
      __crmFoundationTestUtils.publicLead({ id: "lead_quote", accountId: "a", status: "Quotation Sent", dealStage: "Quotation" }),
      __crmFoundationTestUtils.publicLead({ id: "lead_won", accountId: "a", status: "Completed", dealStage: "Completed" }),
    ]);

    assert.equal(board.find((column: any) => column.id === "new")?.leads[0]?.id, "lead_new");
    assert.equal(board.find((column: any) => column.id === "quotation")?.leads[0]?.id, "lead_quote");
    assert.equal(board.find((column: any) => column.id === "won")?.leads[0]?.id, "lead_won");
  });

  it("builds CRM report metrics for sources, assignees, deal stages, and overdue follow-ups", () => {
    const now = 200000;
    const reports = __crmFoundationTestUtils.buildCrmReportMetrics([
      { id: "lead_1", status: "Interested", source: "Manual", assignedTo: "Sara", dealStage: "Lead", productInterest: "Growth plan", createdAt: now - 100 },
      { id: "lead_2", status: "Completed", source: "Website", assignedTo: "", dealStage: "Completed", createdAt: now - 9 * 86400 },
    ], [
      { id: "fu_1", leadId: "lead_1", status: "pending", dueAt: now - 10 },
    ], now);

    assert.equal(reports.totalLeads, 2);
    assert.equal(reports.assigned, 1);
    assert.equal(reports.overdueFollowUps, 1);
    assert.equal(reports.sourceCounts.Manual, 1);
    assert.equal(reports.assignedCounts.Unassigned, 1);
    assert.equal(reports.dealStageCounts.Completed, 1);
    assert.equal(reports.createdThisWeek, 1);
    assert.equal(reports.assignedFollowUpCounts.Unassigned, 1);
    assert.equal(reports.overdueFollowUpsByStaff.Unassigned, 1);
    assert.equal(reports.topSource, "Manual");
    assert.equal(reports.temperatureCounts.Hot, 1);
    assert.equal(reports.healthCounts["Follow-up overdue"], 1);
  });
});
