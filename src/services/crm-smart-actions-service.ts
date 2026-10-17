import { cleanString, nowSeconds } from "./integration-foundation-store.ts";
import { buildCrmLeadIntelligence } from "./crm-intelligence-service.ts";
import {
  buildLifecycleDraft,
  detectLifecycleFields,
  needsHumanReply,
  recommendLifecycleFollowUp,
  suggestLifecycleStage,
} from "./crm-lifecycle-automation-service.ts";

const ACTIVE_DONE_STATUSES = new Set(["Completed", "Lost", "Invalid"]);
const ACTIVE_DONE_STAGES = new Set(["Completed", "Lost", "Cancelled"]);

function toSeconds(value: any) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function isClosedLead(lead: any = {}) {
  return ACTIVE_DONE_STATUSES.has(cleanString(lead.status, 80)) || ACTIVE_DONE_STAGES.has(cleanString(lead.dealStage, 80));
}

function pendingFollowUpsForLead(leadId: string, followUps: any[] = []) {
  return followUps.filter((item) => item.leadId === leadId && item.status === "pending");
}

function hasPendingFollowUp(lead: any, followUps: any[] = []) {
  return Boolean(toSeconds(lead?.nextFollowUpAt) || pendingFollowUpsForLead(lead?.id, followUps).length);
}

function todayFollowUpAt(now: number) {
  const todayTen = now - (now % 86400) + 10 * 3600;
  return todayTen > now ? todayTen : now + 3600;
}

function compactContextText(lead: any = {}, context: { messages?: any[]; timeline?: any[] } = {}) {
  const messageText = [...(context.timeline || []), ...(context.messages || [])]
    .slice(-8)
    .map((item) => [item.text, item.message, item.body].map((value) => cleanString(value, 400)).find(Boolean))
    .filter(Boolean)
    .join(" ");
  return [
    lead.summary,
    lead.notes,
    lead.productInterest,
    lead.sourceCampaign,
    messageText,
  ].map((value) => cleanString(value, 700).toLowerCase()).filter(Boolean).join(" ");
}

function contextHas(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function missingDetailTitle(field: string) {
  const labels: Record<string, string> = {
    "city/location": "Ask for city/location",
    "product/service interest": "Ask for product/service interest",
    quantity: "Ask quantity",
    budget: "Ask budget",
    "next follow-up": "Schedule next follow-up",
    "assigned user": "Assign lead",
  };
  return labels[field] || `Ask for ${field}`;
}

function missingDetailDraft(field: string, lead: any = {}) {
  if (field === "city/location") return "Please share your city or delivery location so we can guide you correctly.";
  if (field === "product/service interest") return "Which product or service are you interested in?";
  if (field === "quantity") return "How many pieces or what quantity do you need?";
  if (field === "budget") return "Do you have a target budget or preferred price range?";
  if (field === "next follow-up") return `Follow up with ${lead.name || "this lead"} today and confirm the next step.`;
  return "Please confirm the missing lead detail before moving this forward.";
}

function smartAction(input: any) {
  return {
    id: cleanString(input.id, 80),
    title: cleanString(input.title, 120),
    reason: cleanString(input.reason, 240),
    priority: input.priority === "high" ? "high" : input.priority === "medium" ? "medium" : "low",
    safe: input.safe === true,
    actionLabel: cleanString(input.actionLabel, 80),
    kind: cleanString(input.kind, 80) || "suggestion",
    label: cleanString(input.label, 40) || "Smart suggestion",
    draftText: cleanString(input.draftText, 500),
    payload: input.payload || {},
  };
}

export function deriveSmartCrmActions(
  lead: any = {},
  context: { followUps?: any[]; callLogs?: any[]; assignedUsers?: string[]; messages?: any[]; timeline?: any[]; dismissedActionIds?: string[]; now?: number } = {},
) {
  if (!lead?.id || isClosedLead(lead)) return [];
  const now = Number(context.now || nowSeconds());
  const followUps = context.followUps || [];
  const pendingFollowUps = pendingFollowUpsForLead(lead.id, followUps);
  const overdueFollowUp = pendingFollowUps.find((item) => toSeconds(item.dueAt) > 0 && toSeconds(item.dueAt) < now);
  const intelligence = lead.intelligence || buildCrmLeadIntelligence(lead, { ...context, now });
  const assignedUsers = (context.assignedUsers || []).map((item) => cleanString(item, 120)).filter(Boolean);
  const defaultAssignee = assignedUsers[0] || "";
  const status = cleanString(lead.status, 80);
  const dealStage = cleanString(lead.dealStage, 80);
  const productInterest = cleanString(lead.productInterest, 240);
  const contextText = compactContextText(lead, context);
  const wantsPrice = contextHas(contextText, [/price|pricing|quote|quotation|rate|cost|kitna|qeemat|amount/]);
  const wantsOrder = contextHas(contextText, [/order|confirm|book|checkout|buy|purchase|final|done/]);
  const negativeIntent = contextHas(contextText, [/not interested|cancel|too expensive|no thanks|later nahi|stop/]);
  const askedForCall = contextHas(contextText, [/call me|phone call|ring me|call back|callback|number pe call/]);
  const needsReply = needsHumanReply(lead, context);
  const explicitHumanNeed = contextHas(contextText, [/human|agent|person|staff|representative|admin|complaint|angry|refund|dispute|legal|escalat/]);
  const lifecycleStage = suggestLifecycleStage(lead, { ...context, now });
  const lifecycleFollowUp = recommendLifecycleFollowUp(lead, { ...context, now });
  const detectedFields = detectLifecycleFields(lead, context);
  const actions: any[] = [];

  if (needsReply) {
    actions.push(smartAction({
      id: "needs_human_reply",
      title: "Needs human reply",
      reason: "Recent customer context looks unanswered or contains a question about price, quote, call, delivery, or payment.",
      priority: "high",
      safe: true,
      actionLabel: "Mark contacted",
      kind: "update_status",
      label: "Lifecycle suggestion",
      draftText: "Draft only - not sent: Hi, thanks for your message. A team member will review this and get back to you shortly.",
      payload: { status: "Contacted" },
    }));
  }

  if (lifecycleStage) {
    actions.push(smartAction({
      id: lifecycleStage.id,
      title: lifecycleStage.title,
      reason: lifecycleStage.reason,
      priority: lifecycleStage.id.includes("lost") ? "medium" : lifecycleStage.id.includes("payment") || lifecycleStage.id.includes("order") ? "high" : "medium",
      safe: lifecycleStage.followUp !== true,
      actionLabel: lifecycleStage.followUp ? "" : "Apply stage",
      kind: lifecycleStage.followUp ? "suggestion" : "update_status",
      label: "Lifecycle suggestion",
      draftText: buildLifecycleDraft(lifecycleStage.id),
      payload: {
        ...(lifecycleStage.status ? { status: lifecycleStage.status } : {}),
        ...(lifecycleStage.dealStage ? { dealStage: lifecycleStage.dealStage } : {}),
      },
    }));
  }

  for (const detected of detectedFields) {
    if (["preferredFollowUpTime", "dealIntent"].includes(detected.field)) continue;
    actions.push(smartAction({
      id: `detected_field_${detected.field}`,
      title: detected.label,
      reason: "Detected from recent customer context. Apply only if it matches the conversation.",
      priority: "medium",
      safe: true,
      actionLabel: "Apply field",
      kind: "update_fields",
      label: "Detected field",
      payload: detected.field === "location"
        ? { location: detected.value, city: detected.value }
        : { [detected.field]: detected.value },
    }));
  }

  if (lifecycleFollowUp) {
    actions.push(smartAction({
      id: lifecycleFollowUp.id,
      title: "Create recommended follow-up",
      reason: lifecycleFollowUp.reason,
      priority: lifecycleFollowUp.type === "payment" || lifecycleFollowUp.type === "quotation" ? "high" : "medium",
      safe: true,
      actionLabel: "Create follow-up",
      kind: "create_follow_up",
      label: "Follow-up recommendation",
      draftText: `Draft only - not sent: ${buildLifecycleDraft(lifecycleFollowUp.id)}`,
      payload: { type: lifecycleFollowUp.type, dueAt: lifecycleFollowUp.dueAt, notes: lifecycleFollowUp.notes },
    }));
  }

  if (!cleanString(lead.assignedTo, 120) && (needsReply || askedForCall || explicitHumanNeed || intelligence.temperature === "Hot")) {
    actions.push(smartAction({
      id: "assign_lead",
      title: "Assign lead",
      reason: defaultAssignee ? `Assignment rule matched. Assign this lead to ${defaultAssignee}.` : "Assignment rule matched, but no active staff member is available.",
      priority: "high",
      safe: Boolean(defaultAssignee),
      actionLabel: defaultAssignee ? `Assign to ${defaultAssignee}` : "",
      kind: defaultAssignee ? "assign_lead" : "suggestion",
      payload: { assignedTo: defaultAssignee },
    }));
  }

  if (overdueFollowUp) {
    actions.push(smartAction({
      id: "reschedule_overdue_follow_up",
      title: "Follow up today",
      reason: "A pending follow-up is overdue, so this lead needs same-day attention.",
      priority: "high",
      safe: true,
      actionLabel: "Create today follow-up",
      kind: "create_follow_up",
      draftText: "Hi, just following up on our previous conversation. Please let us know how you would like to proceed.",
      payload: { type: overdueFollowUp.type || "message", dueAt: todayFollowUpAt(now), notes: "Smart action: follow up today for overdue CRM follow-up." },
    }));
  } else if (!hasPendingFollowUp(lead, followUps)) {
    actions.push(smartAction({
      id: "create_follow_up",
      title: dealStage === "Quotation" ? "Schedule quotation follow-up" : "Create follow-up",
      reason: dealStage === "Quotation" ? "Quotation leads should have a next follow-up date." : "No next follow-up is scheduled for this active lead.",
      priority: dealStage === "Quotation" ? "high" : "medium",
      safe: true,
      actionLabel: "Create follow-up",
      kind: "create_follow_up",
      draftText: dealStage === "Quotation"
        ? "Hi, checking in on the quotation we shared. Would you like any changes or help with the next step?"
        : "Hi, following up to see if you still need help or want to continue.",
      payload: { type: dealStage === "Quotation" ? "quotation" : "message", dueAt: todayFollowUpAt(now), notes: "Smart action: scheduled CRM follow-up." },
    }));
  }

  for (const field of ["city/location", "product/service interest", "quantity", "budget"] as const) {
    if (!(intelligence.missingDetails || []).includes(field)) continue;
    actions.push(smartAction({
      id: `ask_${field.replace(/[^a-z0-9]+/g, "_")}`,
      title: missingDetailTitle(field),
      reason: `${missingDetailTitle(field).replace("Ask", "Capture")} before moving the lead forward.`,
      priority: "medium",
      safe: false,
      kind: "suggestion",
      draftText: missingDetailDraft(field, lead),
    }));
  }

  if ((productInterest || wantsPrice) && (dealStage === "Lead" || status === "Interested" || status === "Quotation Needed")) {
    actions.push(smartAction({
      id: "send_quotation",
      title: "Send quotation",
      reason: wantsPrice ? "The conversation mentions price or quotation, so move this lead into quotation workflow." : "Interest is captured and the deal has not moved into quotation workflow yet.",
      priority: "medium",
      safe: true,
      actionLabel: "Mark quotation needed",
      kind: "update_status",
      draftText: "Thanks. We can prepare a quotation for you. Please confirm any missing details so we can share the right offer.",
      payload: { status: "Quotation Needed", dealStage: "Quotation" },
    }));
  }

  if (intelligence.health === "Needs reply" || intelligence.health === "Needs human reply" || ["Call Required", "Not Answered"].includes(status) || askedForCall) {
    actions.push(smartAction({
      id: "call_customer",
      title: "Call customer",
      reason: askedForCall ? "The conversation indicates the customer wants a call or callback." : "The lead needs a human reply or call before the conversation cools down.",
      priority: "high",
      safe: true,
      actionLabel: "Mark contacted",
      kind: "update_status",
      payload: { status: "Contacted" },
    }));
  }

  if (wantsOrder && !["Order Confirmed", "Completed"].includes(status) && !["Order Confirmed", "Completed"].includes(dealStage)) {
    actions.push(smartAction({
      id: "confirm_order_stage",
      title: "Review for order confirmation",
      reason: "Conversation context suggests the customer may be ready to order. Confirm details before marking the deal.",
      priority: "medium",
      safe: true,
      actionLabel: "Mark order confirmed",
      kind: "update_status",
      draftText: "Please confirm the product, quantity, delivery details, and payment step before we finalize your order.",
      payload: { status: "Order Confirmed", dealStage: "Order Confirmed" },
    }));
  }

  if (negativeIntent && status !== "Lost" && dealStage !== "Lost") {
    actions.push(smartAction({
      id: "review_lost_stage",
      title: "Review lost outcome",
      reason: "Conversation context may show cancellation or low interest. Confirm before marking this lead lost.",
      priority: "low",
      safe: false,
      kind: "suggestion",
      draftText: "No message is sent automatically. Review the conversation and mark lost only if the customer clearly opted out.",
    }));
  }

  if (["Negotiation", "Payment Pending"].includes(status) || ["Negotiation", "Payment"].includes(dealStage)) {
    actions.push(smartAction({
      id: "mark_won_lost",
      title: "Mark won/lost",
      reason: "This deal is late-stage. Confirm the final outcome before closing it.",
      priority: "low",
      safe: false,
      kind: "suggestion",
    }));
  }

  const dismissed = new Set((context.dismissedActionIds || []).map((item) => cleanString(item, 120)));
  return actions
    .filter((action) => !dismissed.has(action.id) && !dismissed.has(`${lead.id}:${action.id}`))
    .slice(0, 12);
}

export function deriveHighPrioritySmartCrmActions(
  leads: any[] = [],
  context: { followUps?: any[]; callLogs?: any[]; assignedUsers?: string[]; dismissedActionIds?: string[]; now?: number } = {},
) {
  return leads.flatMap((lead) => deriveSmartCrmActions(lead, context)
    .filter((action) => action.priority === "high")
    .map((action) => ({ ...action, leadId: lead.id, leadName: lead.name, assignedTo: lead.assignedTo })));
}

export function buildSmartCrmActionApplication(
  lead: any = {},
  actionId: string,
  context: { followUps?: any[]; callLogs?: any[]; assignedUsers?: string[]; messages?: any[]; timeline?: any[]; dismissedActionIds?: string[]; accountId?: string; followUpId?: string; now?: number } = {},
) {
  const id = cleanString(actionId, 80);
  const followUpId = cleanString(context.followUpId, 100);
  const existingFollowUp = followUpId ? (context.followUps || []).find((item) => item.id === followUpId) : null;
  const action = deriveSmartCrmActions(lead, context).find((item) => item.id === id);
  if (!action && existingFollowUp && ["create_follow_up", "reschedule_overdue_follow_up"].includes(id)) {
    return { applied: false, duplicate: true, action: { id, title: "Create follow-up" }, followUp: existingFollowUp };
  }
  if (!action) return { applied: false, unavailable: true };
  if (!action.safe) return { applied: false, manualReview: true, action };

  if (action.kind === "assign_lead") {
    return { applied: true, action, leadPatch: { assignedTo: action.payload.assignedTo } };
  }

  if (action.kind === "update_status") {
    return {
      applied: true,
      action,
      leadPatch: {
        ...(action.payload.status ? { status: action.payload.status } : {}),
        ...(action.payload.dealStage ? { dealStage: action.payload.dealStage } : {}),
      },
    };
  }

  if (action.kind === "update_fields") {
    return { applied: true, action, leadPatch: action.payload || {} };
  }

  if (action.kind === "create_follow_up") {
    const now = Number(context.now || nowSeconds());
    const followUp = {
      id: followUpId || `smart_${lead.id}_${action.id}`,
      accountId: cleanString(context.accountId, 80),
      leadId: lead.id,
      type: action.payload.type || "message",
      status: "pending",
      dueAt: toSeconds(action.payload.dueAt) || now + 3600,
      assignedTo: cleanString(lead.assignedTo, 120),
      notes: cleanString(action.payload.notes || `Smart action: ${action.title}`, 1000),
      createdAt: now,
      updatedAt: now,
    };
    return { applied: true, action, followUp, leadPatch: { nextFollowUpAt: followUp.dueAt } };
  }

  return { applied: false, unsupported: true, action };
}
