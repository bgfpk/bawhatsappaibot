import { cleanString, nowSeconds } from "./integration-foundation-store.ts";
import { needsHumanReply } from "./crm-lifecycle-automation-service.ts";

export const CRM_TEMPERATURES = ["Hot", "Warm", "Cold", "Unknown"] as const;
export const CRM_HEALTH_STATES = ["Needs human reply", "Needs reply", "Follow-up overdue", "Follow-up due today", "No follow-up set", "Active", "Won", "Lost"] as const;
export const CRM_NEXT_ACTIONS = ["Call customer", "Send quotation", "Ask for missing details", "Follow up today", "Assign to sales", "Mark won/lost", "Wait / no action"] as const;

export const CRM_PIPELINE_COLUMNS = [
  { id: "new", title: "New" },
  { id: "contacted", title: "AI Replied / Contacted" },
  { id: "quotation", title: "Quotation" },
  { id: "negotiation", title: "Negotiation" },
  { id: "payment", title: "Payment Pending" },
  { id: "won", title: "Won / Completed" },
  { id: "lost", title: "Lost" },
] as const;

function toSeconds(value: any) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function isGenericName(value: any) {
  const name = cleanString(value, 120).toLowerCase();
  return !name || ["customer", "unnamed lead", "lead"].includes(name);
}

function todayEnd(now: number) {
  return now - (now % 86400) + 86400 - 1;
}

export function buildCrmMissingDetails(lead: any = {}) {
  const missing: string[] = [];
  for (const field of Array.isArray(lead.missingCustomFields) ? lead.missingCustomFields : []) {
    const label = cleanString(field, 120);
    if (label && !missing.includes(label)) missing.push(label);
  }
  if (isGenericName(lead.name)) missing.push("name");
  if (!cleanString(lead.phone || lead.email, 160)) missing.push("phone");
  if (!cleanString(lead.city || lead.location, 160)) missing.push("city/location");
  if (!cleanString(lead.productInterest, 240)) missing.push("product/service interest");
  if (!cleanString(lead.quantity, 80)) missing.push("quantity");
  if (!cleanString(lead.budget, 80)) missing.push("budget");
  if (!toSeconds(lead.nextFollowUpAt)) missing.push("next follow-up");
  if (!cleanString(lead.assignedTo, 120)) missing.push("assigned user");
  return missing;
}

export function buildCrmSourceAttribution(lead: any = {}) {
  const source = cleanString(lead.source, 80) || "Manual";
  return {
    firstSource: cleanString(lead.firstSource || lead.originalSource || source, 80) || source,
    latestSource: cleanString(lead.latestSource || source, 80) || source,
    sourceUrl: cleanString(lead.sourceUrl || lead.pageUrl || lead.url, 240),
    sourceCampaign: cleanString(lead.sourceCampaign || lead.campaign, 120),
  };
}

export function buildCrmLeadIntelligence(lead: any = {}, context: { followUps?: any[]; callLogs?: any[]; messages?: any[]; timeline?: any[]; now?: number } = {}) {
  const now = Number(context.now || nowSeconds());
  const leadFollowUps = (context.followUps || []).filter((item) => item.leadId === lead.id);
  const pendingFollowUps = leadFollowUps.filter((item) => item.status === "pending");
  const overdue = pendingFollowUps.some((item) => toSeconds(item.dueAt) > 0 && toSeconds(item.dueAt) < now);
  const dueToday = pendingFollowUps.some((item) => {
    const dueAt = toSeconds(item.dueAt);
    return dueAt >= now && dueAt <= todayEnd(now);
  });
  const nextFollowUpAt = toSeconds(lead.nextFollowUpAt) || Math.min(...pendingFollowUps.map((item) => toSeconds(item.dueAt)).filter(Boolean), Number.MAX_SAFE_INTEGER);
  const hasNextFollowUp = Number.isFinite(nextFollowUpAt) && nextFollowUpAt !== Number.MAX_SAFE_INTEGER;
  const missingDetails = buildCrmMissingDetails({ ...lead, nextFollowUpAt: hasNextFollowUp ? nextFollowUpAt : lead.nextFollowUpAt });
  const status = cleanString(lead.status, 80);
  const dealStage = cleanString(lead.dealStage, 80);
  const isWon = status === "Completed" || dealStage === "Completed" || dealStage === "Order Confirmed" || status === "Order Confirmed";
  const isLost = status === "Lost" || status === "Invalid" || dealStage === "Lost" || dealStage === "Cancelled";

  let health: typeof CRM_HEALTH_STATES[number] = "Active";
  if (isWon) health = "Won";
  else if (isLost) health = "Lost";
  else if (overdue) health = "Follow-up overdue";
  else if (dueToday) health = "Follow-up due today";
  else if (needsHumanReply(lead, context)) health = "Needs human reply";
  else if (!hasNextFollowUp) health = "No follow-up set";
  else if (["New", "AI Replied", "Call Required"].includes(status)) health = "Needs reply";

  let temperature: typeof CRM_TEMPERATURES[number] = "Unknown";
  if (isLost) temperature = "Cold";
  else if (["Interested", "Quotation Needed", "Quotation Sent", "Negotiation", "Payment Pending", "Order Confirmed"].includes(status) || ["Quotation", "Negotiation", "Payment", "Order Confirmed"].includes(dealStage)) temperature = "Hot";
  else if (overdue || dueToday || cleanString(lead.productInterest, 240) || ["AI Replied", "Contacted", "Assigned"].includes(status)) temperature = "Warm";
  else if (status === "New") temperature = "Unknown";
  else temperature = "Cold";

  let suggestedNextAction: typeof CRM_NEXT_ACTIONS[number] = "Wait / no action";
  if (!cleanString(lead.assignedTo, 120) && !isWon && !isLost) suggestedNextAction = "Assign to sales";
  else if (overdue || dueToday) suggestedNextAction = "Follow up today";
  else if (status === "Quotation Needed" || (temperature === "Hot" && dealStage === "Lead")) suggestedNextAction = "Send quotation";
  else if (missingDetails.some((item) => !["budget", "quantity"].includes(item))) suggestedNextAction = "Ask for missing details";
  else if (["Call Required", "Not Answered"].includes(status)) suggestedNextAction = "Call customer";
  else if (["Negotiation", "Payment Pending"].includes(status) || ["Negotiation", "Payment"].includes(dealStage)) suggestedNextAction = "Mark won/lost";

  return {
    temperature,
    health,
    suggestedNextAction,
    missingDetails,
    missingDetailsCount: missingDetails.length,
    nextFollowUpAt: hasNextFollowUp ? nextFollowUpAt : 0,
    sourceAttribution: buildCrmSourceAttribution(lead),
  };
}

export function enrichCrmLeadsWithIntelligence(leads: any[] = [], context: { followUps?: any[]; callLogs?: any[]; now?: number } = {}) {
  return leads.map((lead) => ({
    ...lead,
    intelligence: buildCrmLeadIntelligence(lead, context),
    ...buildCrmSourceAttribution(lead),
  }));
}

export function getCrmPipelineColumnId(lead: any = {}) {
  const status = cleanString(lead.status, 80);
  const dealStage = cleanString(lead.dealStage, 80);
  if (status === "Lost" || status === "Invalid" || dealStage === "Lost" || dealStage === "Cancelled") return "lost";
  if (status === "Completed" || dealStage === "Completed" || status === "Order Confirmed" || dealStage === "Order Confirmed") return "won";
  if (status === "Payment Pending" || dealStage === "Payment") return "payment";
  if (status === "Negotiation" || dealStage === "Negotiation") return "negotiation";
  if (status === "Quotation Needed" || status === "Quotation Sent" || dealStage === "Quotation") return "quotation";
  if (["AI Replied", "Assigned", "Contacted", "Call Required", "Not Answered", "Interested"].includes(status)) return "contacted";
  return "new";
}

export function buildCrmPipelineBoard(leads: any[] = []) {
  const columns = CRM_PIPELINE_COLUMNS.map((column) => ({ ...column, leads: [] as any[] }));
  const byId = new Map(columns.map((column) => [column.id, column]));
  for (const lead of leads) {
    const column = byId.get(getCrmPipelineColumnId(lead)) || byId.get("new");
    column?.leads.push(lead);
  }
  return columns;
}

export function buildCrmIntelligenceReportCounts(leads: any[] = []) {
  const temperatureCounts = { Hot: 0, Warm: 0, Cold: 0, Unknown: 0 } as Record<string, number>;
  const healthCounts: Record<string, number> = {};
  const sourceTemperatureCounts: Record<string, Record<string, number>> = {};
  for (const lead of leads) {
    const intelligence = lead.intelligence || buildCrmLeadIntelligence(lead);
    const source = cleanString(lead.source || "Unknown", 80) || "Unknown";
    temperatureCounts[intelligence.temperature] = (temperatureCounts[intelligence.temperature] || 0) + 1;
    healthCounts[intelligence.health] = (healthCounts[intelligence.health] || 0) + 1;
    sourceTemperatureCounts[source] = sourceTemperatureCounts[source] || { Hot: 0, Warm: 0, Cold: 0, Unknown: 0 };
    sourceTemperatureCounts[source][intelligence.temperature] = (sourceTemperatureCounts[source][intelligence.temperature] || 0) + 1;
  }
  return { temperatureCounts, healthCounts, sourceTemperatureCounts };
}
