import crypto from "crypto";
import * as dbService from "./db-service.ts";
import { cleanString, nowSeconds, safeId } from "./integration-foundation-store.ts";
import {
  CRM_STAFF_ROLES,
  bucketCrmFollowUpDueState,
  buildCrmActivity,
  buildCrmNotifications,
  publicCrmActivity,
  publicCrmStaff,
  summarizeTopCount,
} from "./crm-workflow-service.ts";
import {
  CRM_HEALTH_STATES,
  CRM_NEXT_ACTIONS,
  CRM_TEMPERATURES,
  buildCrmIntelligenceReportCounts,
  buildCrmLeadIntelligence,
  buildCrmPipelineBoard,
  enrichCrmLeadsWithIntelligence,
  getCrmPipelineColumnId,
} from "./crm-intelligence-service.ts";
import { buildSmartCrmActionApplication, deriveHighPrioritySmartCrmActions, deriveSmartCrmActions } from "./crm-smart-actions-service.ts";
import { summarizeCrmAgentModeAudit } from "./crm-agent-mode-audit-service.ts";
import { detectLifecycleFields, needsHumanReply, recommendLifecycleFollowUp, suggestLifecycleStage } from "./crm-lifecycle-automation-service.ts";
import { getCustomerLastInteractionInfo, normalizeCustomerTimestamp } from "./customer-display-state-service.ts";
import { getCustomerDisplayContact, getCustomerDisplayName, resolveCustomerChatJid } from "../utils/whatsapp-jid.ts";
import { normalizeCrmSource, sourceMatchesCrmFilter, summarizeCrmSources } from "./crm-source-service.ts";

const STORE_KEY = "crmFoundation";
const MAX_ROWS = 500;

export const CRM_LEAD_STATUSES = [
  "New",
  "AI Replied",
  "Assigned",
  "Contacted",
  "Call Required",
  "Not Answered",
  "Interested",
  "Quotation Needed",
  "Quotation Sent",
  "Negotiation",
  "Payment Pending",
  "Order Confirmed",
  "Completed",
  "Lost",
  "Invalid",
] as const;

export const CRM_DEAL_STAGES = [
  "Lead",
  "Quotation",
  "Negotiation",
  "Order Confirmed",
  "Payment",
  "Dispatch",
  "Completed",
  "Lost",
  "Cancelled",
] as const;

const FOLLOW_UP_STATUSES = ["pending", "completed", "missed", "cancelled"] as const;
const FOLLOW_UP_TYPES = ["call", "message", "quotation", "payment", "delivery", "admin_review"] as const;
export const CRM_CALL_STATUSES = [
  "Answered",
  "Not Answered",
  "Interested",
  "Not Interested",
  "Call Back Later",
  "Wrong Number",
  "Busy",
  "Quotation Requested",
  "Deal Discussed",
] as const;

type CrmStore = {
  leads?: any[];
  followUps?: any[];
  callLogs?: any[];
  deals?: any[];
  staff?: any[];
  activities?: any[];
  notificationStates?: any[];
  smartActionStates?: any[];
  wooCommerceMappings?: any[];
  agentMode?: any;
  agentLogs?: any[];
};

export function normalizeCrmPhone(value: any) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  if (digits.length === 11 && digits.startsWith("03")) return `92${digits.slice(1)}`;
  return digits.slice(0, 18);
}

export function crmStableId(prefix: string, ...parts: any[]) {
  const hash = crypto.createHash("sha1").update(parts.map((part) => String(part || "")).join("|")).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`;
}

function parseProfile(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeLeadStatus(value: any) {
  const text = cleanString(value, 40);
  return (CRM_LEAD_STATUSES as readonly string[]).includes(text) ? text : "New";
}

function normalizeDealStage(value: any) {
  const text = cleanString(value, 40);
  return (CRM_DEAL_STAGES as readonly string[]).includes(text) ? text : "Lead";
}

function normalizeCallStatus(value: any) {
  const text = cleanString(value, 80);
  return (CRM_CALL_STATUSES as readonly string[]).includes(text) ? text : "Answered";
}

function toSeconds(value: any) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return Math.floor(value > 100000000000 ? value / 1000 : value);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric > 100000000000 ? numeric / 1000 : numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function latestTimestamp(...values: any[]) {
  return Math.max(0, ...values.map(toSeconds).filter((value) => value > 0));
}

function resolveLeadLatestActivity(row: any = {}) {
  return latestTimestamp(
    row.latestActivityAt,
    row.lastIncomingMessageAt,
    row.lastCustomerMessageAt,
    row.lastMessageAt,
    row.lastContactedAt,
    row.crmActivityAt,
    row.updatedAt,
    row.createdAt,
  );
}

function publicLead(row: any) {
  const latestActivityAt = resolveLeadLatestActivity(row);
  return {
    id: row.id,
    accountId: row.accountId,
    botId: cleanString(row.botId, 120),
    customerId: row.customerId || "",
    customerJid: row.customerJid || "",
    name: cleanString(row.name, 120),
    phone: normalizeCrmPhone(row.phone),
    email: cleanString(row.email, 160),
    city: cleanString(row.city, 120),
    source: normalizeCrmSource(row.source || "Manual"),
    firstSource: normalizeCrmSource(row.firstSource || row.originalSource || row.source || "Manual"),
    latestSource: normalizeCrmSource(row.latestSource || row.source || "Manual"),
    sourceCampaign: cleanString(row.sourceCampaign || row.campaign, 120),
    sourceUrl: cleanString(row.sourceUrl || row.pageUrl || row.url, 240),
    status: normalizeLeadStatus(row.status),
    dealStage: normalizeDealStage(row.dealStage),
    assignedTo: cleanString(row.assignedTo, 120),
    productInterest: cleanString(row.productInterest, 240),
    budget: cleanString(row.budget, 80),
    quantity: cleanString(row.quantity, 80),
    location: cleanString(row.location || row.city, 120),
    summary: cleanString(row.summary, 700),
    notes: cleanString(row.notes, 1200),
    customFields: row.customFields && typeof row.customFields === "object" ? row.customFields : {},
    missingCustomFields: Array.isArray(row.missingCustomFields || row.missingFields) ? (row.missingCustomFields || row.missingFields).map((item: any) => cleanString(item, 120)).filter(Boolean).slice(0, 20) : [],
    lastContactedAt: Number(row.lastContactedAt || 0),
    latestActivityAt,
    nextFollowUpAt: toSeconds(row.nextFollowUpAt),
    createdAt: toSeconds(row.createdAt),
    updatedAt: toSeconds(row.updatedAt),
  };
}

function leadFromCustomer(accountId: string, customer: any) {
  const profile = parseProfile(customer.profile);
  const customerId = String(customer.$id || customer.id || customer.customer_id || "");
  const customerJid = resolveCustomerChatJid(customer) || customer.jid || "";
  const phone = normalizeCrmPhone(getCustomerDisplayContact(customer) || customerJid);
  const id = crmStableId("lead", accountId, customerId || customerJid || phone);
  const activityInfo = getCustomerLastInteractionInfo(customer);
  const lastInteractionAt = activityInfo.fallback ? 0 : activityInfo.timestamp;
  return publicLead({
    id,
    accountId,
    botId: customer.bot_id || "",
    customerId,
    customerJid,
    name: getCustomerDisplayName(customer) || profile.name || phone || "Customer",
    phone,
    city: profile.city || profile.City || "",
    source: profile.leadSource || profile.source || "WhatsApp",
    sourceCampaign: profile.sourceCampaign || "",
    status: profile.leadStatus || profile.status || (customer.last_message ? "AI Replied" : "New"),
    dealStage: profile.dealStage || profile.deal_status || "Lead",
    assignedTo: profile.assignedTo || profile.assigned_user || "",
    productInterest: profile.productInterest || profile.product || profile.service || "",
    budget: profile.budget || "",
    quantity: profile.quantity || "",
    location: profile.location || profile.city || profile.City || "",
    summary: profile.summary || customer.summary || customer.last_summary || "",
    notes: profile.customerInstructions || profile.notes || "",
    customFields: profile.customFields || {},
    missingCustomFields: profile.missingCustomFields || profile.requiredFieldsMissing || [],
    lastContactedAt: lastInteractionAt,
    lastMessageAt: lastInteractionAt,
    latestActivityAt: lastInteractionAt,
    createdAt: normalizeCustomerTimestamp(customer.created_at || customer.timestamp || customer.$createdAt),
    updatedAt: normalizeCustomerTimestamp(customer.updated_at || customer.$updatedAt),
  });
}

function mergeLead(base: any, override: any) {
  const merged = { ...base, ...Object.fromEntries(Object.entries(override || {}).filter(([, value]) => value !== "" && value !== undefined && value !== null)) };
  return publicLead(merged);
}

function findLeadDuplicate(leads: any[], lead: any) {
  const incomingAccount = cleanString(lead.accountId, 80);
  const incomingBot = cleanString(lead.botId, 120);
  return leads.find((item) => (
    (!incomingAccount || !item.accountId || item.accountId === incomingAccount) &&
    (!incomingBot || !item.botId || item.botId === incomingBot) &&
    (
      item.id === lead.id ||
      (lead.customerId && item.customerId === lead.customerId) ||
      (lead.phone && item.phone === lead.phone) ||
      (lead.customerJid && item.customerJid === lead.customerJid)
    )
  ));
}

function normalizeAssignedUser(value: any) {
  return cleanString(value, 120);
}

function staffDisplayName(staff: any) {
  return cleanString(staff?.name || staff?.email || staff?.phone, 120);
}

function listActiveStaffNames(staff: any[] = []) {
  return staff.map(publicCrmStaff).filter((member) => member.active && staffDisplayName(member)).map(staffDisplayName).sort();
}

function leadMatchesCrmSearch(lead: any, query: any) {
  const q = cleanString(query, 120).toLowerCase();
  if (!q) return true;
  return [
    lead.name,
    lead.phone,
    lead.email,
    lead.source,
    lead.firstSource,
    lead.latestSource,
    lead.sourceUrl,
    lead.sourceCampaign,
    lead.productInterest,
    lead.location,
    lead.city,
    lead.assignedTo,
    lead.status,
    lead.dealStage,
    lead.notes,
    lead.summary,
  ].filter(Boolean).join(" ").toLowerCase().includes(q);
}

function filterCrmLeadsForWorkspace(leads: any[] = [], filters: any = {}) {
  const status = cleanString(filters.status, 40);
  const source = cleanString(filters.source, 80);
  const assignedTo = cleanString(filters.assignedTo || filters.assigned, 120);
  return leads.filter((lead) => {
    if (status && status !== "all" && lead.status !== status) return false;
    if (source && source !== "all" && !sourceMatchesCrmFilter(lead.latestSource || lead.source, source)) return false;
    if (assignedTo && assignedTo !== "all") {
      const current = normalizeAssignedUser(lead.assignedTo);
      if (assignedTo === "__unassigned") {
        if (current) return false;
      } else if (current !== assignedTo) {
        return false;
      }
    }
    return leadMatchesCrmSearch(lead, filters.q);
  });
}

async function loadCrmStore(accountId: string): Promise<CrmStore> {
  const store = await dbService.getUserExtraConfigValue(accountId, STORE_KEY).catch(() => null);
  if (!store || typeof store !== "object") return {};
  return {
    leads: Array.isArray(store.leads) ? store.leads : [],
    followUps: Array.isArray(store.followUps) ? store.followUps : [],
    callLogs: Array.isArray(store.callLogs) ? store.callLogs : [],
    deals: Array.isArray(store.deals) ? store.deals : [],
    staff: Array.isArray(store.staff) ? store.staff : [],
    activities: Array.isArray(store.activities) ? store.activities : [],
    notificationStates: Array.isArray(store.notificationStates) ? store.notificationStates : [],
    smartActionStates: Array.isArray(store.smartActionStates) ? store.smartActionStates : [],
    wooCommerceMappings: Array.isArray(store.wooCommerceMappings) ? store.wooCommerceMappings : [],
    agentMode: store.agentMode && typeof store.agentMode === "object" ? store.agentMode : {},
    agentLogs: Array.isArray(store.agentLogs) ? store.agentLogs : [],
  };
}

async function saveCrmStore(accountId: string, store: CrmStore) {
  await dbService.saveUserExtraConfigPatch(accountId, { [STORE_KEY]: store });
  return store;
}

async function updateCrmStore(accountId: string, updater: (store: CrmStore) => CrmStore | Promise<CrmStore>) {
  const current = await loadCrmStore(accountId);
  const next = await updater(current);
  return saveCrmStore(accountId, next);
}

function withCrmActivity(store: CrmStore, activity: any) {
  const row = publicCrmActivity(activity);
  return {
    ...store,
    activities: [row, ...(store.activities || [])].slice(0, MAX_ROWS),
  };
}

function changedActivity(leadId: string, type: string, title: string, previousValue: any, newValue: any) {
  const previous = cleanString(previousValue, 160);
  const next = cleanString(newValue, 160);
  if (previous === next) return null;
  return buildCrmActivity({ leadId, type, title, previousValue: previous, newValue: next });
}

function dismissedSmartActionIds(states: any[] = [], leadId?: string) {
  return states
    .filter((state) => state?.dismissed === true && (!leadId || state.leadId === leadId))
    .map((state) => leadId ? cleanString(state.actionId, 80) : `${cleanString(state.leadId, 80)}:${cleanString(state.actionId, 80)}`)
    .filter(Boolean);
}

function publicCrmAgentMode(input: any = {}) {
  const categories = input.categories || {};
  return {
    enabled: input.enabled === true,
    mode: input.mode === "advanced" ? "advanced" : "basic",
    maxActions: Math.max(1, Math.min(10, Number(input.maxActions || 5))),
    categories: {
      updateStageStatus: categories.updateStageStatus !== false,
      fillMissingFields: categories.fillMissingFields !== false,
      createFollowUps: categories.createFollowUps !== false,
      assignLeads: categories.assignLeads !== false,
    },
    updatedAt: toSeconds(input.updatedAt),
  };
}

function publicCrmAgentLog(row: any = {}) {
  return {
    id: cleanString(row.id, 120) || safeId("agent"),
    accountId: cleanString(row.accountId, 80),
    leadId: cleanString(row.leadId, 80),
    actionId: cleanString(row.actionId, 80),
    actionKey: cleanString(row.actionKey, 180),
    billingAction: cleanString(row.billingAction, 80),
    status: ["success", "skipped", "failed"].includes(row.status) ? row.status : "skipped",
    reason: cleanString(row.reason, 160),
    title: cleanString(row.title, 160),
    charged: row.charged === true,
    duplicateCharge: row.duplicateCharge === true,
    cost: Number(row.cost || 0),
    agentModeSkippedDisabled: row.agentModeSkippedDisabled === true,
    createdAt: toSeconds(row.createdAt) || nowSeconds(),
  };
}

function leadCrmActivityTimestamp(store: CrmStore, leadId: string) {
  const followUps = (store.followUps || []).filter((item) => item.leadId === leadId);
  const callLogs = (store.callLogs || []).filter((item) => item.leadId === leadId);
  const deals = (store.deals || []).filter((item) => item.leadId === leadId);
  const activities = (store.activities || []).filter((item) => item.leadId === leadId);
  return latestTimestamp(
    ...followUps.flatMap((item) => [item.updatedAt, item.createdAt, item.completedAt]),
    ...callLogs.flatMap((item) => [item.calledAt, item.createdAt]),
    ...deals.flatMap((item) => [item.updatedAt, item.createdAt]),
    ...activities.map((item) => item.createdAt),
  );
}

function sortCrmLeadsByLatestActivity(rows: any[] = []) {
  return rows.slice().sort((a, b) => (
    Number(b.latestActivityAt || 0) - Number(a.latestActivityAt || 0) ||
    Number(b.updatedAt || 0) - Number(a.updatedAt || 0) ||
    Number(b.createdAt || 0) - Number(a.createdAt || 0)
  ));
}

export async function getCrmAgentModeState(accountId: string) {
  const store = await loadCrmStore(accountId);
  const logs = (store.agentLogs || []).map(publicCrmAgentLog).slice(0, 50);
  return {
    settings: publicCrmAgentMode(store.agentMode),
    logs,
    auditSummary: summarizeCrmAgentModeAudit(logs),
  };
}

export async function updateCrmAgentModeSettings(accountId: string, input: any = {}) {
  const settings = publicCrmAgentMode({ ...input, updatedAt: nowSeconds() });
  await updateCrmStore(accountId, (store) => ({ ...store, agentMode: settings }));
  return settings;
}

export async function recordCrmAgentModeLog(accountId: string, input: any = {}) {
  const log = publicCrmAgentLog({ ...input, accountId, createdAt: input.createdAt || nowSeconds() });
  await updateCrmStore(accountId, (store) => {
    const nextStore = {
      ...store,
      agentLogs: [log, ...(store.agentLogs || [])].slice(0, 100),
    };
    if (!log.leadId) return nextStore;
    return withCrmActivity(nextStore, buildCrmActivity({
      accountId,
      leadId: log.leadId,
      type: log.status === "success" ? "crm_agent_action" : "crm_agent_skipped",
      title: log.status === "success" ? "CRM Agent action" : "CRM Agent skipped",
      newValue: log.title || log.reason,
      actor: "CRM Agent Mode",
    }));
  });
  return log;
}

export async function listCrmLeads(accountId: string, filters: any = {}) {
  const [store, customers] = await Promise.all([
    loadCrmStore(accountId),
    dbService.listCustomers(accountId).catch(() => []),
  ]);
  const byId = new Map<string, any>();
  for (const customer of customers as any[]) {
    const lead = leadFromCustomer(accountId, customer);
    byId.set(lead.id, lead);
  }
  for (const stored of store.leads || []) {
    const lead = publicLead({ ...stored, accountId });
    const duplicate = findLeadDuplicate([...byId.values()], lead);
    byId.set(duplicate?.id || lead.id, mergeLead(duplicate || {}, { ...stored, accountId }));
  }
  const activityRows = [...byId.values()].map((lead) => publicLead({
    ...lead,
    crmActivityAt: leadCrmActivityTimestamp(store, lead.id),
  }));
  let rows = filterCrmLeadsForWorkspace(activityRows, filters);
  return sortCrmLeadsByLatestActivity(rows).slice(0, MAX_ROWS);
}

function buildCrmCompletenessDiagnostics(input: {
  customers?: any[];
  storedLeads?: any[];
  mergedLeads?: any[];
  visibleLeads?: any[];
  filters?: any;
}) {
  const customers = input.customers || [];
  const storedLeads = input.storedLeads || [];
  const mergedLeads = input.mergedLeads || [];
  const visibleLeads = input.visibleLeads || mergedLeads;
  const filterApplied = Boolean(
    cleanString(input.filters?.q, 120) ||
    (cleanString(input.filters?.status, 40) && cleanString(input.filters?.status, 40) !== "all") ||
    (cleanString(input.filters?.source, 80) && cleanString(input.filters?.source, 80) !== "all") ||
    (cleanString(input.filters?.assignedTo || input.filters?.assigned, 120) && cleanString(input.filters?.assignedTo || input.filters?.assigned, 120) !== "all")
  );
  return {
    totalCustomersFound: customers.length,
    totalVisibleAfterFilters: visibleLeads.length,
    totalCrmLeads: storedLeads.length,
    totalMergedLeads: mergedLeads.length,
    hiddenByFilters: Math.max(0, mergedLeads.length - visibleLeads.length),
    filtersApplied: filterApplied,
    sourcesRepresented: summarizeCrmSources(mergedLeads),
    visibleSourcesRepresented: summarizeCrmSources(visibleLeads),
    returnedRows: Math.min(visibleLeads.length, MAX_ROWS),
    rowLimit: MAX_ROWS,
    capped: visibleLeads.length > MAX_ROWS,
  };
}

export async function getCrmLeadListResult(accountId: string, filters: any = {}) {
  const [store, customers] = await Promise.all([
    loadCrmStore(accountId),
    dbService.listCustomers(accountId).catch(() => []),
  ]);
  const byId = new Map<string, any>();
  for (const customer of customers as any[]) {
    const lead = leadFromCustomer(accountId, customer);
    byId.set(lead.id, lead);
  }
  for (const stored of store.leads || []) {
    const lead = publicLead({ ...stored, accountId });
    const duplicate = findLeadDuplicate([...byId.values()], lead);
    byId.set(duplicate?.id || lead.id, mergeLead(duplicate || {}, { ...stored, accountId }));
  }
  const mergedLeads = sortCrmLeadsByLatestActivity([...byId.values()].map((lead) => publicLead({
    ...lead,
    crmActivityAt: leadCrmActivityTimestamp(store, lead.id),
  })));
  const visibleLeads = sortCrmLeadsByLatestActivity(filterCrmLeadsForWorkspace(mergedLeads, filters));
  return {
    success: true,
    leads: visibleLeads.slice(0, MAX_ROWS),
    diagnostics: buildCrmCompletenessDiagnostics({
      customers: customers as any[],
      storedLeads: store.leads || [],
      mergedLeads,
      visibleLeads,
      filters,
    }),
  };
}

function sortFollowUpsForWorkspace(rows: any[] = [], now = nowSeconds()) {
  const todayStart = now - (now % 86400);
  const todayEnd = todayStart + 86400 - 1;
  const bucketRank = (row: any) => {
    if (row.status !== "pending") return 3;
    const dueAt = Number(row.dueAt || 0);
    if (!dueAt) return 2;
    if (dueAt < now) return 0;
    if (dueAt <= todayEnd) return 1;
    return 2;
  };
  return rows.slice().sort((a, b) => bucketRank(a) - bucketRank(b) || Number(a.dueAt || 0) - Number(b.dueAt || 0) || Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function publicFollowUp(row: any) {
  return {
    id: row.id,
    accountId: row.accountId,
    leadId: cleanString(row.leadId, 80),
    type: (FOLLOW_UP_TYPES as readonly string[]).includes(row.type) ? row.type : "message",
    status: (FOLLOW_UP_STATUSES as readonly string[]).includes(row.status) ? row.status : "pending",
    dueAt: toSeconds(row.dueAt),
    assignedTo: cleanString(row.assignedTo, 120),
    notes: cleanString(row.notes, 1000),
    completedAt: Number(row.completedAt || 0),
    createdAt: Number(row.createdAt || nowSeconds()),
    updatedAt: Number(row.updatedAt || nowSeconds()),
  };
}

function enrichCrmFollowUps(followUps: any[] = [], leads: any[] = [], now = nowSeconds()) {
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  return sortFollowUpsForWorkspace(followUps.map(publicFollowUp), now).map((followUp) => {
    const lead = leadById.get(followUp.leadId) || {};
    const dueState = bucketCrmFollowUpDueState(followUp, now);
    return {
      ...followUp,
      dueState,
      leadName: lead.name || "",
      leadPhone: lead.phone || "",
      leadSource: lead.source || "",
      leadStatus: lead.status || "",
      leadDealStage: lead.dealStage || "",
      leadAssignedTo: lead.assignedTo || "",
      leadProductInterest: lead.productInterest || "",
      leadTemperature: lead.intelligence?.temperature || "",
      leadHealth: lead.intelligence?.health || "",
      suggestedNextAction: lead.intelligence?.suggestedNextAction || "",
    };
  });
}

function publicCallLog(row: any) {
  return {
    id: row.id,
    accountId: row.accountId,
    leadId: cleanString(row.leadId, 80),
    status: normalizeCallStatus(row.status || row.outcome),
    outcome: normalizeCallStatus(row.status || row.outcome),
    notes: cleanString(row.notes, 1000),
    nextCallAt: toSeconds(row.nextCallAt),
    calledAt: toSeconds(row.calledAt) || nowSeconds(),
    createdAt: Number(row.createdAt || nowSeconds()),
  };
}

function publicDeal(row: any) {
  return {
    id: row.id,
    accountId: row.accountId,
    leadId: cleanString(row.leadId, 80),
    stage: normalizeDealStage(row.stage || row.dealStage),
    amount: cleanString(row.amount || row.value, 80),
    paymentStatus: cleanString(row.paymentStatus, 80),
    dispatchStatus: cleanString(row.dispatchStatus, 80),
    expectedDeliveryAt: toSeconds(row.expectedDeliveryAt),
    notes: cleanString(row.notes, 1000),
    createdAt: Number(row.createdAt || nowSeconds()),
    updatedAt: Number(row.updatedAt || nowSeconds()),
  };
}

function mergeCrmDealUpdate(accountId: string, leadId: string, existingDeal: any = {}, input: any = {}) {
  const stage = normalizeDealStage(input.stage || input.dealStage || existingDeal.stage || existingDeal.dealStage);
  return {
    id: crmStableId("deal", accountId, leadId),
    accountId,
    leadId,
    stage,
    amount: input.amount === undefined && input.value === undefined ? cleanString(existingDeal.amount || existingDeal.value, 80) : cleanString(input.amount || input.value, 80),
    value: input.amount === undefined && input.value === undefined ? cleanString(existingDeal.amount || existingDeal.value, 80) : cleanString(input.amount || input.value, 80),
    paymentStatus: input.paymentStatus === undefined ? cleanString(existingDeal.paymentStatus, 80) : cleanString(input.paymentStatus, 80),
    dispatchStatus: input.dispatchStatus === undefined ? cleanString(existingDeal.dispatchStatus, 80) : cleanString(input.dispatchStatus, 80),
    expectedDeliveryAt: input.expectedDeliveryAt === undefined ? toSeconds(existingDeal.expectedDeliveryAt) : toSeconds(input.expectedDeliveryAt),
    notes: input.notes === undefined ? cleanString(existingDeal.notes, 1000) : cleanString(input.notes, 1000),
    updatedAt: nowSeconds(),
  };
}

function buildCrmTimeline(messages: any[] = []) {
  return messages.slice(-20).map((message: any) => {
    const role = cleanString(message.role || message.type, 30);
    const direction = role === "model" || role === "assistant" || message.fromMe === true ? "outbound" : "inbound";
    return {
      id: cleanString(message.id || message.message_id || `${message.timestamp || 0}-${direction}`, 120),
      type: "message",
      source: "WhatsApp",
      title: direction === "inbound" ? "Customer message" : "AI/admin reply",
      direction,
      actor: direction === "inbound" ? "Customer" : "Bot/Admin",
      text: cleanString(message.text || message.message || message.body, 500),
      timestamp: toSeconds(message.timestamp || message.createdAt || message.created_at || message.$createdAt),
    };
  }).filter((row) => row.text || row.timestamp);
}

function timelineEvent(input: any = {}) {
  const type = cleanString(input.type, 60) || "system";
  const timestamp = toSeconds(input.timestamp || input.createdAt || input.updatedAt || input.dueAt || input.calledAt);
  return {
    id: cleanString(input.id, 140) || crmStableId("tl", type, timestamp, input.title, input.text),
    type,
    source: normalizeCrmSource(input.source || "CRM"),
    title: cleanString(input.title, 140) || type.replace(/_/g, " "),
    actor: cleanString(input.actor, 80) || "System",
    text: cleanString(input.text || input.message || input.notes || input.newValue, 500),
    timestamp,
    status: cleanString(input.status, 80),
    relatedId: cleanString(input.relatedId, 120),
  };
}

function buildCrmDetailTimeline(input: {
  lead?: any;
  messages?: any[];
  followUps?: any[];
  callLogs?: any[];
  deals?: any[];
  activities?: any[];
  agentLogs?: any[];
}) {
  const lead = input.lead || {};
  const rows = [...(input.messages || [])];
  if (lead.source || lead.firstSource || lead.latestSource) {
    rows.push(timelineEvent({
      id: `source:${lead.id}`,
      type: "source",
      source: lead.firstSource || lead.source,
      title: "Lead source captured",
      text: [lead.firstSource || lead.source, lead.sourceCampaign, lead.sourceUrl].filter(Boolean).join(" / "),
      timestamp: lead.createdAt || lead.latestActivityAt,
    }));
  }
  for (const activity of input.activities || []) {
    rows.push(timelineEvent({
      id: `activity:${activity.id}`,
      type: activity.type === "crm_agent_action" || activity.type === "crm_agent_skipped" ? "agent_action" : "crm",
      source: "CRM",
      title: activity.title,
      actor: activity.actor,
      text: activity.newValue || activity.previousValue,
      timestamp: activity.createdAt,
      relatedId: activity.id,
    }));
  }
  for (const followUp of input.followUps || []) {
    rows.push(timelineEvent({
      id: `followup:${followUp.id}`,
      type: "follow_up",
      source: "CRM",
      title: followUp.status === "completed" ? "Follow-up completed" : "Follow-up scheduled",
      actor: followUp.assignedTo || "CRM",
      text: followUp.notes || followUp.type,
      timestamp: followUp.completedAt || followUp.dueAt || followUp.createdAt,
      status: followUp.status,
      relatedId: followUp.id,
    }));
  }
  for (const call of input.callLogs || []) {
    rows.push(timelineEvent({
      id: `call:${call.id}`,
      type: "call",
      source: "Calls",
      title: `Call ${call.status || "logged"}`,
      text: call.notes,
      timestamp: call.calledAt,
      status: call.status,
      relatedId: call.id,
    }));
  }
  for (const deal of input.deals || []) {
    rows.push(timelineEvent({
      id: `deal:${deal.id}`,
      type: "order",
      source: lead.latestSource || lead.source || "CRM",
      title: `Deal stage: ${deal.stage || "Lead"}`,
      text: [deal.amount, deal.paymentStatus, deal.dispatchStatus, deal.notes].filter(Boolean).join(" / "),
      timestamp: deal.updatedAt || deal.createdAt,
      status: deal.stage,
      relatedId: deal.id,
    }));
  }
  for (const log of input.agentLogs || []) {
    if (log.leadId && log.leadId !== lead.id) continue;
    rows.push(timelineEvent({
      id: `agent:${log.id}`,
      type: "agent_action",
      source: "CRM",
      title: log.title || "Agent Mode action",
      text: log.reason,
      timestamp: log.createdAt,
      status: log.status,
      relatedId: log.id,
    }));
  }
  return rows
    .filter((row) => row.timestamp || row.text || row.title)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 80);
}

function countBy(rows: any[] = [], getter: (row: any) => any) {
  return rows.reduce((acc, row) => {
    const key = cleanString(getter(row) || "Unassigned", 120) || "Unassigned";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function buildCrmReportMetrics(leads: any[] = [], followUps: any[] = [], now = nowSeconds()) {
  const weekAgo = now - 7 * 86400;
  const monthAgo = now - 30 * 86400;
  const intelligenceLeads = enrichCrmLeadsWithIntelligence(leads, { followUps, now });
  const pendingFollowUps = followUps.filter((item) => item.status === "pending");
  const completedFollowUps = followUps.filter((item) => item.status === "completed");
  const activeLeads = intelligenceLeads.filter((lead) => !["Completed", "Lost", "Invalid"].includes(lead.status) && !["Completed", "Lost", "Cancelled"].includes(lead.dealStage));
  const sourceCounts = countBy(leads, (lead) => lead.source || "Unknown");
  const assignedCounts = countBy(leads, (lead) => lead.assignedTo || "Unassigned");
  const dealStageCounts = countBy(leads, (lead) => lead.dealStage || "Lead");
  const assignedFollowUpCounts = countBy(followUps, (item) => item.assignedTo || item.leadAssignedTo || "Unassigned");
  const overdueFollowUpsByStaff = countBy(
    pendingFollowUps.filter((item) => Number(item.dueAt || 0) > 0 && Number(item.dueAt || 0) < now),
    (item) => item.assignedTo || item.leadAssignedTo || "Unassigned",
  );
  const followUpCompletionRate = followUps.length ? Math.round((completedFollowUps.length / followUps.length) * 100) : 0;
  const intelligenceCounts = buildCrmIntelligenceReportCounts(intelligenceLeads);
  const smartActions = intelligenceLeads.flatMap((lead) => deriveSmartCrmActions(lead, { followUps, now }).map((action) => ({ ...action, leadId: lead.id })));
  return {
    totalLeads: leads.length,
    newLeads: leads.filter((lead) => lead.status === "New").length,
    contactedOrAi: leads.filter((lead) => ["Contacted", "AI Replied", "Interested"].includes(lead.status)).length,
    assigned: leads.filter((lead) => Boolean(lead.assignedTo)).length,
    quotationSent: leads.filter((lead) => lead.status === "Quotation Sent" || lead.dealStage === "Quotation").length,
    pendingFollowUps: pendingFollowUps.length,
    overdueFollowUps: pendingFollowUps.filter((item) => Number(item.dueAt || 0) > 0 && Number(item.dueAt || 0) < now).length,
    won: leads.filter((lead) => lead.status === "Completed" || lead.dealStage === "Completed").length,
    lost: leads.filter((lead) => lead.status === "Lost" || lead.dealStage === "Lost").length,
    createdThisWeek: leads.filter((lead) => Number(lead.createdAt || 0) >= weekAgo).length,
    createdThisMonth: leads.filter((lead) => Number(lead.createdAt || 0) >= monthAgo).length,
    dueSoonFollowUps: pendingFollowUps.filter((item) => bucketCrmFollowUpDueState(item, now) === "due_soon").length,
    todayFollowUps: pendingFollowUps.filter((item) => bucketCrmFollowUpDueState(item, now) === "today").length,
    completedFollowUps: completedFollowUps.length,
    followUpCompletionRate,
    sourceCounts,
    assignedCounts,
    assignedFollowUpCounts,
    overdueFollowUpsByStaff,
    dealStageCounts,
    topSource: summarizeTopCount(sourceCounts),
    topAssignedStaff: summarizeTopCount(countBy(activeLeads, (lead) => lead.assignedTo || "Unassigned")),
    temperatureCounts: intelligenceCounts.temperatureCounts,
    healthCounts: intelligenceCounts.healthCounts,
    sourceTemperatureCounts: intelligenceCounts.sourceTemperatureCounts,
    smartActionSuggestions: smartActions.length,
    highPrioritySmartActions: smartActions.filter((action) => action.priority === "high").length,
    smartActionTypeCounts: countBy(smartActions, (action) => action.title),
    needsHumanReply: intelligenceLeads.filter((lead) => lead.intelligence?.health === "Needs human reply").length,
    hotLeads: intelligenceLeads.filter((lead) => lead.intelligence?.temperature === "Hot").length,
    suggestedFollowUps: smartActions.filter((action) => action.kind === "create_follow_up").length,
    missingDetailSuggestions: smartActions.filter((action) => action.label === "Detected field" || String(action.id || "").startsWith("ask_")).length,
    lifecycleStageSuggestions: smartActions.filter((action) => String(action.id || "").startsWith("lifecycle_")).length,
  };
}

export async function getCrmOverview(accountId: string) {
  const [leadResult, store] = await Promise.all([getCrmLeadListResult(accountId), loadCrmStore(accountId)]);
  const baseLeads = leadResult.leads || [];
  const rawFollowUps = (store.followUps || []).map(publicFollowUp);
  const leads = enrichCrmLeadsWithIntelligence(baseLeads, { followUps: rawFollowUps, callLogs: store.callLogs || [] });
  const followUps = enrichCrmFollowUps(rawFollowUps, leads);
  const staff = (store.staff || []).map(publicCrmStaff).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const assignedUsers = Array.from(new Set([
    ...listActiveStaffNames(staff),
    ...leads.map((lead) => normalizeAssignedUser(lead.assignedTo)).filter(Boolean),
  ])).sort();
  const activities = (store.activities || []).map(publicCrmActivity);
  const smartActions = deriveHighPrioritySmartCrmActions(leads, {
    followUps,
    callLogs: store.callLogs || [],
    assignedUsers,
    dismissedActionIds: dismissedSmartActionIds(store.smartActionStates || []),
  });
  const notifications = buildCrmNotifications({ leads, followUps, activities, states: store.notificationStates || [], smartActions });
  const pendingFollowUps = followUps.filter((item) => item.status === "pending").length;
  const overdueFollowUps = followUps.filter((item) => item.status === "pending" && item.dueState === "overdue").length;
  const counts = {
    totalLeads: leads.length,
    newLeads: leads.filter((lead) => lead.status === "New").length,
    quotationNeeded: leads.filter((lead) => lead.status === "Quotation Needed" || lead.status === "Quotation Sent").length,
    won: leads.filter((lead) => lead.status === "Completed" || lead.dealStage === "Completed").length,
    lost: leads.filter((lead) => lead.status === "Lost" || lead.dealStage === "Lost").length,
    pendingFollowUps,
    overdueFollowUps,
    unreadNotifications: notifications.filter((item) => !item.read).length,
  };
  return {
    counts,
    statuses: CRM_LEAD_STATUSES,
    dealStages: CRM_DEAL_STAGES,
    callStatuses: CRM_CALL_STATUSES,
    followUpStatuses: FOLLOW_UP_STATUSES,
    followUpTypes: FOLLOW_UP_TYPES,
    staffRoles: CRM_STAFF_ROLES,
    agentMode: publicCrmAgentMode(store.agentMode),
    agentLogs: (store.agentLogs || []).map(publicCrmAgentLog).slice(0, 20),
    agentAuditSummary: summarizeCrmAgentModeAudit((store.agentLogs || []).map(publicCrmAgentLog).slice(0, 20)),
    temperatures: CRM_TEMPERATURES,
    healthStates: CRM_HEALTH_STATES,
    nextActions: CRM_NEXT_ACTIONS,
    staff,
    assignedUsers,
    notifications,
    diagnostics: leadResult.diagnostics,
    reports: buildCrmReportMetrics(leads, followUps),
    pipeline: buildCrmPipelineBoard(leads),
    leads: leads.slice(0, MAX_ROWS),
    followUps: followUps.slice(0, 80),
    callLogs: (store.callLogs || []).map(publicCallLog).sort((a, b) => Number(b.calledAt || 0) - Number(a.calledAt || 0)).slice(0, 80),
    deals: (store.deals || []).map(publicDeal).slice(0, 80),
    wooCommerceMappings: (store.wooCommerceMappings || []).slice(0, 80),
  };
}

export async function getCrmLeadDetail(accountId: string, leadId: string) {
  const baseLeads = await listCrmLeads(accountId);
  const baseLead = baseLeads.find((item) => item.id === leadId);
  if (!baseLead) return null;
  const messages = baseLead.customerJid ? await dbService.getChatHistory(baseLead.botId || accountId, baseLead.customerJid, 20).catch(() => []) : [];
  const messageTimeline = buildCrmTimeline(messages);
  const store = await loadCrmStore(accountId);
  const leads = enrichCrmLeadsWithIntelligence(baseLeads, { followUps: (store.followUps || []).map(publicFollowUp), callLogs: store.callLogs || [] });
  const leadBase = leads.find((item) => item.id === leadId) || {
    ...baseLead,
    intelligence: buildCrmLeadIntelligence(baseLead, { followUps: store.followUps || [], callLogs: store.callLogs || [] }),
  };
  const timelineActivityAt = latestTimestamp(...messageTimeline.map((item) => item.timestamp), leadCrmActivityTimestamp(store, leadId));
  const publicLeadBase = publicLead({
    ...leadBase,
    latestActivityAt: latestTimestamp(leadBase.latestActivityAt, timelineActivityAt),
    crmActivityAt: timelineActivityAt,
  });
  const lead = {
    ...publicLeadBase,
    intelligence: buildCrmLeadIntelligence(publicLeadBase, { followUps: (store.followUps || []).map(publicFollowUp), callLogs: store.callLogs || [], messages, timeline: messageTimeline }),
  };
  const followUps = enrichCrmFollowUps((store.followUps || []).filter((item) => item.leadId === leadId), leads);
  const callLogs = (store.callLogs || []).map(publicCallLog).filter((item) => item.leadId === leadId).sort((a, b) => Number(b.calledAt || 0) - Number(a.calledAt || 0));
  const deals = (store.deals || []).map(publicDeal).filter((item) => item.leadId === leadId);
  const activities = (store.activities || []).map(publicCrmActivity).filter((item) => item.leadId === leadId).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const timeline = buildCrmDetailTimeline({
    lead,
    messages: messageTimeline,
    followUps,
    callLogs,
    deals,
    activities,
    agentLogs: (store.agentLogs || []).map(publicCrmAgentLog),
  });
  return {
    lead,
    smartActions: deriveSmartCrmActions(lead, {
      followUps: (store.followUps || []).map(publicFollowUp),
      callLogs: store.callLogs || [],
      assignedUsers: listActiveStaffNames(store.staff || []),
      timeline: messageTimeline,
      messages,
      dismissedActionIds: dismissedSmartActionIds(store.smartActionStates || [], leadId),
    }),
    messages: messageTimeline,
    timeline,
    followUps,
    callLogs,
    deal: deals[0] || publicDeal({ id: crmStableId("deal", accountId, leadId), accountId, leadId, stage: lead.dealStage }),
    deals,
    activities,
  };
}

export async function listCrmStaff(accountId: string) {
  const store = await loadCrmStore(accountId);
  return (store.staff || []).map(publicCrmStaff).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function upsertCrmStaff(accountId: string, input: any = {}) {
  const row = publicCrmStaff({
    ...input,
    id: cleanString(input.id, 80) || safeId("staff"),
    createdAt: input.createdAt || nowSeconds(),
    updatedAt: nowSeconds(),
  });
  if (!row.name) throw new Error("Staff name is required.");
  await updateCrmStore(accountId, (store) => {
    const staff = [...(store.staff || [])];
    const index = staff.findIndex((item) => item.id === row.id);
    if (index >= 0) staff[index] = { ...publicCrmStaff(staff[index]), ...row, updatedAt: nowSeconds() };
    else staff.unshift(row);
    return { ...store, staff: staff.slice(0, 100) };
  });
  return row;
}

export async function patchCrmStaff(accountId: string, staffId: string, input: any = {}) {
  let patched: any = null;
  await updateCrmStore(accountId, (store) => {
    const staff = [...(store.staff || [])];
    const index = staff.findIndex((item) => item.id === staffId);
    if (index < 0) throw new Error("Staff member not found.");
    patched = publicCrmStaff({ ...staff[index], ...input, id: staffId, updatedAt: nowSeconds() });
    if (!patched.name) throw new Error("Staff name is required.");
    staff[index] = patched;
    return { ...store, staff };
  });
  return patched;
}

export async function getCrmNotifications(accountId: string) {
  const [leads, store] = await Promise.all([listCrmLeads(accountId), loadCrmStore(accountId)]);
  const rawFollowUps = (store.followUps || []).map(publicFollowUp);
  const enrichedLeads = enrichCrmLeadsWithIntelligence(leads, { followUps: rawFollowUps, callLogs: store.callLogs || [] });
  const followUps = enrichCrmFollowUps(rawFollowUps, enrichedLeads);
  const activities = (store.activities || []).map(publicCrmActivity);
  const assignedUsers = Array.from(new Set([
    ...listActiveStaffNames(store.staff || []),
    ...enrichedLeads.map((lead) => normalizeAssignedUser(lead.assignedTo)).filter(Boolean),
  ])).sort();
  const smartActions = deriveHighPrioritySmartCrmActions(enrichedLeads, {
    followUps,
    callLogs: store.callLogs || [],
    assignedUsers,
    dismissedActionIds: dismissedSmartActionIds(store.smartActionStates || []),
  });
  return buildCrmNotifications({ leads: enrichedLeads, followUps, activities, states: store.notificationStates || [], smartActions });
}

export async function updateCrmNotificationState(accountId: string, notificationId: string, input: any = {}) {
  const id = cleanString(notificationId, 160);
  if (!id) throw new Error("Notification id is required.");
  let state: any = null;
  await updateCrmStore(accountId, (store) => {
    const states = [...(store.notificationStates || [])];
    const index = states.findIndex((item) => item.id === id);
    state = {
      id,
      read: input.read === undefined ? (states[index]?.read === true) : input.read === true,
      completed: input.completed === undefined ? (states[index]?.completed === true) : input.completed === true,
      updatedAt: nowSeconds(),
    };
    if (index >= 0) states[index] = state;
    else states.unshift(state);
    return { ...store, notificationStates: states.slice(0, MAX_ROWS) };
  });
  return state;
}

export async function updateCrmNotificationStatesBulk(accountId: string, input: any = {}) {
  const action = cleanString(input.action, 40);
  if (!["mark_all_read", "clear_all", "clear_read"].includes(action)) throw new Error("Unsupported notification bulk action.");
  const currentNotifications = await getCrmNotifications(accountId);
  const ids = currentNotifications
    .filter((item: any) => action !== "clear_read" || item.read === true)
    .map((item: any) => cleanString(item.id, 160))
    .filter(Boolean);
  const now = nowSeconds();
  await updateCrmStore(accountId, (store) => {
    const byId = new Map((store.notificationStates || []).map((state: any) => [state.id, state]));
    for (const id of ids) {
      const previous: any = byId.get(id) || {};
      byId.set(id, {
        id,
        read: true,
        completed: action === "mark_all_read" ? previous.completed === true : true,
        updatedAt: now,
      });
    }
    return { ...store, notificationStates: Array.from(byId.values()).slice(0, MAX_ROWS) };
  });
  return {
    success: true,
    action,
    updated: ids.length,
    notifications: await getCrmNotifications(accountId),
  };
}

export async function getCrmReports(accountId: string) {
  const baseLeads = await listCrmLeads(accountId);
  const store = await loadCrmStore(accountId);
  const leads = enrichCrmLeadsWithIntelligence(baseLeads, { followUps: (store.followUps || []).map(publicFollowUp), callLogs: store.callLogs || [] });
  const followUps = enrichCrmFollowUps(store.followUps || [], leads);
  return buildCrmReportMetrics(leads, followUps);
}

export async function upsertCrmLead(accountId: string, input: any = {}) {
  const phone = normalizeCrmPhone(input.phone || input.contact || input.whatsapp);
  const source = normalizeCrmSource(input.source || "Manual");
  const leadId = cleanString(input.id, 80) || crmStableId("lead", accountId, phone || input.email || input.sourceUrl || source, source);
  const row = publicLead({
    id: leadId,
    accountId,
    ...input,
    phone,
    source,
    status: input.status || "New",
    dealStage: input.dealStage || "Lead",
    createdAt: input.createdAt || nowSeconds(),
    updatedAt: nowSeconds(),
  });
  await updateCrmStore(accountId, (store) => {
    const leads = [...(store.leads || [])];
    const existingIndex = leads.findIndex((item) => item.id === row.id || (row.phone && normalizeCrmPhone(item.phone) === row.phone));
    if (existingIndex >= 0) {
      const existing = publicLead({ ...leads[existingIndex], accountId });
      leads[existingIndex] = mergeLead(existing, {
        ...row,
        firstSource: existing.firstSource || existing.source || row.firstSource,
        latestSource: row.source,
      });
    }
    else leads.unshift(row);
    const nextStore = { ...store, leads: leads.slice(0, MAX_ROWS) };
    if (existingIndex < 0) {
      return withCrmActivity(nextStore, buildCrmActivity({
        accountId,
        leadId: row.id,
        type: "lead_created",
        title: "Lead created",
        newValue: row.source,
      }));
    }
    return nextStore;
  });
  return row;
}

export async function patchCrmLead(accountId: string, leadId: string, input: any = {}) {
  const existingLead = (await listCrmLeads(accountId)).find((item) => item.id === leadId) || null;
  let patched: any = null;
  const activities: any[] = [];
  await updateCrmStore(accountId, (store) => {
    const leads = [...(store.leads || [])];
    const existingIndex = leads.findIndex((item) => item.id === leadId);
    const base = existingIndex >= 0 ? mergeLead(existingLead || {}, leads[existingIndex]) : (existingLead || { id: leadId, accountId, createdAt: nowSeconds() });
    patched = publicLead({ ...base, ...input, id: leadId, accountId, updatedAt: nowSeconds() });
    [
      ["status", "status_changed", "Status changed"],
      ["dealStage", "deal_stage_changed", "Deal stage changed"],
      ["assignedTo", "assigned_user_changed", "Assigned user changed"],
    ].forEach(([field, type, title]) => {
      const activity = changedActivity(leadId, type, title, (base as any)[field], patched[field]);
      if (activity) activities.push({ ...activity, accountId });
    });
    if (existingIndex >= 0) leads[existingIndex] = patched;
    else leads.unshift(patched);
    let nextStore: CrmStore = { ...store, leads: leads.slice(0, MAX_ROWS) };
    for (const activity of activities) nextStore = withCrmActivity(nextStore, activity);
    return nextStore;
  });
  return patched;
}

export async function createCrmFollowUp(accountId: string, input: any = {}) {
  const row = {
    id: safeId("fu"),
    accountId,
    leadId: cleanString(input.leadId, 80),
    type: (FOLLOW_UP_TYPES as readonly string[]).includes(input.type) ? input.type : "message",
    status: "pending",
    dueAt: Number(input.dueAt || 0),
    assignedTo: cleanString(input.assignedTo, 120),
    notes: cleanString(input.notes, 1000),
    createdAt: nowSeconds(),
    updatedAt: nowSeconds(),
  };
  const followUp = publicFollowUp(row);
  await updateCrmStore(accountId, (store) => withCrmActivity({
    ...store,
    followUps: [followUp, ...(store.followUps || [])].slice(0, MAX_ROWS),
  }, buildCrmActivity({
    accountId,
    leadId: followUp.leadId,
    type: "follow_up_created",
    title: "Follow-up created",
    newValue: followUp.type,
  })));
  if (followUp.leadId && followUp.dueAt) {
    await patchCrmLead(accountId, followUp.leadId, { nextFollowUpAt: followUp.dueAt, ...(followUp.assignedTo ? { assignedTo: followUp.assignedTo } : {}) });
  }
  return followUp;
}

export async function updateCrmFollowUp(accountId: string, followUpId: string, input: any = {}) {
  let updated: any = null;
  let activity: any = null;
  await updateCrmStore(accountId, (store) => {
    const followUps = (store.followUps || []).map((row) => {
      if (row.id !== followUpId) return row;
      const previousStatus = row.status;
      updated = {
        ...row,
        status: (FOLLOW_UP_STATUSES as readonly string[]).includes(input.status) ? input.status : row.status,
        notes: input.notes === undefined ? row.notes : cleanString(input.notes, 1000),
        dueAt: input.dueAt === undefined ? row.dueAt : toSeconds(input.dueAt),
        completedAt: input.status === "completed" ? nowSeconds() : Number(row.completedAt || 0),
        updatedAt: nowSeconds(),
      };
      if (previousStatus !== "completed" && updated.status === "completed") {
        activity = buildCrmActivity({
          accountId,
          leadId: updated.leadId,
          type: "follow_up_completed",
          title: "Follow-up completed",
          previousValue: previousStatus,
          newValue: "completed",
        });
      }
      return updated;
    });
    const nextStore = { ...store, followUps };
    return activity ? withCrmActivity(nextStore, activity) : nextStore;
  });
  if (!updated) throw new Error("Follow-up not found.");
  return updated;
}

export async function createCrmCallLog(accountId: string, input: any = {}) {
  const row = {
    id: safeId("call"),
    accountId,
    leadId: cleanString(input.leadId, 80),
    status: normalizeCallStatus(input.status || input.outcome),
    outcome: normalizeCallStatus(input.status || input.outcome),
    notes: cleanString(input.notes, 1000),
    nextCallAt: toSeconds(input.nextCallAt),
    calledAt: toSeconds(input.calledAt) || nowSeconds(),
    createdAt: nowSeconds(),
  };
  const callLog = publicCallLog(row);
  await updateCrmStore(accountId, (store) => withCrmActivity({
    ...store,
    callLogs: [callLog, ...(store.callLogs || [])].slice(0, MAX_ROWS),
  }, buildCrmActivity({
    accountId,
    leadId: callLog.leadId,
    type: "call_log_added",
    title: "Call log added",
    newValue: callLog.status,
  })));
  await patchCrmLead(accountId, callLog.leadId, { lastContactedAt: callLog.calledAt, latestActivityAt: callLog.calledAt, nextFollowUpAt: callLog.nextCallAt });
  return callLog;
}

export async function updateCrmDealStage(accountId: string, leadId: string, input: any = {}) {
  const store = await loadCrmStore(accountId);
  const existingDeal = (store.deals || []).find((row) => row.leadId === leadId || row.id === crmStableId("deal", accountId, leadId)) || {};
  const deal = mergeCrmDealUpdate(accountId, leadId, existingDeal, input);
  await patchCrmLead(accountId, leadId, { dealStage: deal.stage });
  await updateCrmStore(accountId, (store) => {
    const deals = [...(store.deals || [])];
    const index = deals.findIndex((row) => row.id === deal.id);
    if (index >= 0) deals[index] = { ...deals[index], ...deal };
    else deals.unshift({ ...deal, createdAt: nowSeconds() });
    const activity = buildCrmActivity({ accountId, leadId, type: "deal_fields_updated", title: "Deal fields updated", newValue: deal.stage });
    return withCrmActivity({ ...store, deals: deals.slice(0, MAX_ROWS) }, { ...activity, accountId });
  });
  return publicDeal(deal);
}

async function recordCrmSmartActionActivity(accountId: string, leadId: string, action: any) {
  await updateCrmStore(accountId, (store) => withCrmActivity(store, buildCrmActivity({
    accountId,
    leadId,
    type: "smart_action_applied",
    title: "Smart action applied",
    newValue: action.title,
  })));
}

async function dismissCrmSmartAction(accountId: string, leadId: string, actionId: string) {
  const cleanActionId = cleanString(actionId, 80);
  if (!cleanActionId) throw new Error("Smart action id is required.");
  await updateCrmStore(accountId, (store) => {
    const states = [...(store.smartActionStates || [])];
    const id = `${leadId}:${cleanActionId}`;
    const state = { id, leadId, actionId: cleanActionId, dismissed: true, updatedAt: nowSeconds() };
    const index = states.findIndex((item) => item.id === id);
    if (index >= 0) states[index] = state;
    else states.unshift(state);
    return { ...store, smartActionStates: states.slice(0, MAX_ROWS) };
  });
  return { id: `${leadId}:${cleanActionId}`, leadId, actionId: cleanActionId, dismissed: true };
}

export async function applyCrmSmartAction(accountId: string, leadId: string, actionId: string, input: any = {}) {
  if (input?.dismiss === true) {
    const state = await dismissCrmSmartAction(accountId, leadId, actionId);
    await recordCrmSmartActionActivity(accountId, leadId, { title: `Dismissed ${actionId}` });
    return { applied: false, dismissed: true, state };
  }
  const baseLeads = await listCrmLeads(accountId);
  const store = await loadCrmStore(accountId);
  const rawFollowUps = (store.followUps || []).map(publicFollowUp);
  const leads = enrichCrmLeadsWithIntelligence(baseLeads, { followUps: rawFollowUps, callLogs: store.callLogs || [] });
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) throw new Error("CRM lead not found.");
  const assignedUsers = Array.from(new Set([
    ...listActiveStaffNames(store.staff || []),
    ...leads.map((item) => normalizeAssignedUser(item.assignedTo)).filter(Boolean),
  ])).sort();
  const action = deriveSmartCrmActions(lead, {
    followUps: rawFollowUps,
    callLogs: store.callLogs || [],
    assignedUsers,
    dismissedActionIds: dismissedSmartActionIds(store.smartActionStates || [], leadId),
  })
    .find((item) => item.id === cleanString(actionId, 80));
  if (!action && (["create_follow_up", "reschedule_overdue_follow_up"].includes(cleanString(actionId, 80)) || cleanString(actionId, 80).startsWith("followup_"))) {
    const existing = rawFollowUps.find((item) => item.id === crmStableId("fu_smart", accountId, leadId, actionId));
    if (existing) return { applied: false, duplicate: true, action: { id: actionId, title: "Create follow-up" }, followUp: existing };
  }
  if (!action) throw new Error("Smart action is no longer available for this lead.");
  if (!action.safe) throw new Error("This smart action needs manual review.");

  if (action.kind === "assign_lead") {
    const assignedTo = cleanString(input.assignedTo || action.payload?.assignedTo, 120);
    if (!assignedTo) throw new Error("No active staff member is available for assignment.");
    const leadResult = await patchCrmLead(accountId, leadId, { assignedTo });
    await recordCrmSmartActionActivity(accountId, leadId, action);
    return { applied: true, action, lead: leadResult };
  }

  if (action.kind === "update_status") {
    const patch = {
      ...(action.payload?.status ? { status: action.payload.status } : {}),
      ...(action.payload?.dealStage ? { dealStage: action.payload.dealStage } : {}),
    };
    const leadResult = await patchCrmLead(accountId, leadId, patch);
    await recordCrmSmartActionActivity(accountId, leadId, action);
    return { applied: true, action, lead: leadResult };
  }

  if (action.kind === "update_fields") {
    const leadResult = await patchCrmLead(accountId, leadId, action.payload || {});
    await recordCrmSmartActionActivity(accountId, leadId, { ...action, title: `Field detected/applied: ${action.title}` });
    return { applied: true, action, lead: leadResult };
  }

  if (action.kind === "create_follow_up") {
    const followUpId = crmStableId("fu_smart", accountId, leadId, action.id);
    const existing = rawFollowUps.find((item) => item.id === followUpId);
    if (existing) return { applied: false, duplicate: true, action, followUp: existing };
    const followUp = publicFollowUp({
      id: followUpId,
      accountId,
      leadId,
      type: action.payload?.type || "message",
      status: "pending",
      dueAt: action.payload?.dueAt || nowSeconds() + 3600,
      assignedTo: lead.assignedTo || "",
      notes: action.payload?.notes || `Smart action: ${action.title}`,
      createdAt: nowSeconds(),
      updatedAt: nowSeconds(),
    });
    await updateCrmStore(accountId, (current) => withCrmActivity({
      ...current,
      followUps: [followUp, ...(current.followUps || [])].slice(0, MAX_ROWS),
    }, buildCrmActivity({
      accountId,
      leadId,
      type: "follow_up_created",
      title: "Follow-up created",
      newValue: followUp.type,
    })));
    await patchCrmLead(accountId, leadId, { nextFollowUpAt: followUp.dueAt });
    await recordCrmSmartActionActivity(accountId, leadId, action);
    return { applied: true, action, followUp };
  }

  throw new Error("Unsupported smart action.");
}

export async function recordPublicLead(accountId: string, input: any = {}) {
  return upsertCrmLead(accountId, {
    name: input.name || input.fullName || "",
    phone: input.phone || input.whatsapp || "",
    email: input.email || "",
    city: input.city || "",
    source: input.source || "Website",
    sourceCampaign: input.campaign || input.sourceCampaign || "",
    sourceUrl: input.pageUrl || input.sourceUrl || "",
    productInterest: input.productInterest || input.product || input.service || "",
    budget: input.budget || "",
    quantity: input.quantity || "",
    notes: input.notes || input.message || "",
    status: "New",
  });
}

export async function recordWooCommerceCrmProductMapping(accountId: string, job: any, products: any[] = []) {
  const row = {
    id: crmStableId("woo_map", accountId, job?.id || Date.now()),
    accountId,
    provider: "woocommerce",
    objectType: "product",
    syncJobId: cleanString(job?.id, 80),
    productCount: products.length,
    productNames: products.map((item) => cleanString(item.name, 80)).filter(Boolean).slice(0, 12),
    overwrite: job?.overwrite === true,
    createdAt: nowSeconds(),
  };
  await updateCrmStore(accountId, (store) => ({ ...store, wooCommerceMappings: [row, ...(store.wooCommerceMappings || [])].slice(0, 80) }));
  return row;
}

export const __crmFoundationTestUtils = {
  normalizeCrmPhone,
  crmStableId,
  publicLead,
  leadFromCustomer,
  mergeLead,
  findLeadDuplicate,
  normalizeLeadStatus,
  normalizeDealStage,
  normalizeCrmSource,
  sourceMatchesCrmFilter,
  normalizeCallStatus,
  normalizeAssignedUser,
  leadMatchesCrmSearch,
  filterCrmLeadsForWorkspace,
  publicFollowUp,
  sortFollowUpsForWorkspace,
  enrichCrmFollowUps,
  publicCallLog,
  publicDeal,
  mergeCrmDealUpdate,
  buildCrmTimeline,
  buildCrmDetailTimeline,
  buildCrmReportMetrics,
  resolveLeadLatestActivity,
  sortCrmLeadsByLatestActivity,
  publicCrmAgentMode,
  publicCrmAgentLog,
  bucketCrmFollowUpDueState,
  buildCrmNotifications,
  publicCrmStaff,
  publicCrmActivity,
  buildCrmLeadIntelligence,
  buildCrmPipelineBoard,
  getCrmPipelineColumnId,
  buildCrmIntelligenceReportCounts,
  deriveSmartCrmActions,
  deriveHighPrioritySmartCrmActions,
  buildSmartCrmActionApplication,
  suggestLifecycleStage,
  detectLifecycleFields,
  recommendLifecycleFollowUp,
  needsHumanReply,
};
