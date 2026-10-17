import { getCustomerContactIdentity, normalizeTrustedPhoneDigits, type WhatsAppContactProfile } from "../utils/contact-identity";
import { groupCustomerRecordsByCanonicalIdentity, maskCustomerAliasForAdmin, resolveCustomerIdentity, type ResolvedCustomerIdentity } from "./customer-identity-resolver-service.ts";
import {
  parseCustomer360FromProfile,
  type Customer360BusinessContext,
  type Customer360SalesContext,
  type Customer360OrderSupportContext,
  type Customer360ConversationIntelligence,
  type Customer360FactProvenance,
} from "./customer-360-extraction-service.ts";

export type Customer360TimelineType = "customer" | "order" | "lead" | "followup" | "activity" | "system";
export type Customer360TimelineItem = { id: string; type: Customer360TimelineType; title: string; description: string; timestamp: number; meta?: string };
export type Customer360SuggestedAction = { id: string; label: string; reason: string; priority: "high" | "medium" | "low" };
export type Customer360Profile = {
  id: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  source: string;
  assignedTo: string;
  tags: string[];
  lifetimeValue: number;
  orderCount: number;
  latestOrder: any | null;
  activeLead: any | null;
  leadStatus: string;
  dealStage: string;
  nextFollowUpAt: number | null;
  overdueFollowUps: any[];
  aiSummary: string;
  timelineItems: Customer360TimelineItem[];
  suggestedActions: Customer360SuggestedAction[];
  linkedOrders: any[];
  linkedLeads: any[];
  linkedFollowUps: any[];
  conversationAvailable: boolean;
  contactLabel: string;
  whatsappProfile?: WhatsAppContactProfile;
  linkedAliasCount?: number;
  linkedAliases?: string[];
  canonicalCustomerKey?: string;
  businessContext?: Customer360BusinessContext;
  salesContext?: Customer360SalesContext;
  orderSupportContext?: Customer360OrderSupportContext;
  conversationIntelligence?: Customer360ConversationIntelligence;
  provenance?: Record<string, Customer360FactProvenance>;
};
type BuildCustomer360Input = { customer?: any; customers?: any[]; orders?: any[]; leads?: any[]; followUps?: any[]; activities?: any[]; nowMs?: number };

function safeString(value: any) { return String(value ?? "").trim(); }
function parseObject(value: any) { if (!value) return {}; if (typeof value === "object" && !Array.isArray(value)) return value; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
export function normalizeCustomer360Phone(value: any) { const trustedDigits = normalizeTrustedPhoneDigits(value, { trusted: true }); const digits = trustedDigits || safeString(value).replace(/\D/g, ""); if (!digits) return ""; const withoutLocalZero = digits.length > 10 && digits.startsWith("0") ? digits.slice(1) : digits; return withoutLocalZero.length > 10 ? withoutLocalZero.slice(-10) : withoutLocalZero; }
export function normalizeCustomer360Email(value: any) { return safeString(value).toLowerCase(); }
function normalizeTimeMs(value: any): number { if (value === null || value === undefined || value === "") return 0; if (value instanceof Date) return value.getTime(); const numberValue = Number(value); if (Number.isFinite(numberValue) && numberValue > 0) return numberValue > 100000000000 ? numberValue : numberValue * 1000; const parsed = Date.parse(String(value)); return Number.isFinite(parsed) ? parsed : 0; }
function firstValue(...values: any[]) { return values.map(safeString).find(Boolean) || ""; }
function profileOf(customer: any) { return parseObject(customer?.profile); }
function orderDataOf(order: any) { return parseObject(order?.order_data || order?.data || order?.details); }
function phoneJidOnly(value: any) { const text = safeString(value); return /^\d{8,15}@s\.whatsapp\.net$/i.test(text) ? text : ""; }

function trustedPhoneValues(row: any) {
  const profile = profileOf(row); const orderData = orderDataOf(row);
  return [[row?.phone, "customer.phone"], [row?.customerPhone, "lead.phone"], [row?.customer_phone, "lead.phone"], [row?.whatsapp_number, "customer.whatsapp_number"], [phoneJidOnly(row?.jid), "contact-d26ce7788f39@example.invalid"], [phoneJidOnly(row?.customer_jid), "contact-d26ce7788f39@example.invalid"], [phoneJidOnly(row?.chat_jid), "contact-d26ce7788f39@example.invalid"], [phoneJidOnly(row?.customer_id), "contact-d26ce7788f39@example.invalid"], [profile.whatsapp_number, "profile.whatsapp_number"], [profile.whatsappNumber, "profile.whatsappNumber"], [profile.phoneNumber, "profile.phoneNumber"], [profile.shippingPhone, "profile.shippingPhone"], [profile.customerPhone, "profile.customerPhone"], [profile.phone, "profile.phone"], [orderData.phone, "order.phone"], [orderData.customerPhone, "order.customerPhone"], [orderData.customer_phone, "order.customerPhone"], [orderData.whatsappNumber, "order.phone"]] as Array<[any, string]>;
}
function extractPhone(row: any) { for (const [value, source] of trustedPhoneValues(row)) { const digits = normalizeTrustedPhoneDigits(value, { source }); if (digits) return normalizeCustomer360Phone(digits); } return ""; }
function extractEmail(row: any) { const profile = profileOf(row); const orderData = orderDataOf(row); return normalizeCustomer360Email(firstValue(row?.email, row?.customerEmail, profile.email, orderData.email, orderData.customerEmail)); }
function rowIds(row: any) { const profile = profileOf(row); const orderData = orderDataOf(row); return [row?.$id, row?.id, row?.customer_id, row?.customerId, row?.leadId, row?.lead_id, row?.order_id, profile.customerId, profile.customer_id, profile.customerJid, profile.jid, profile.phoneJid, ...(Array.isArray(profile.linkedJids) ? profile.linkedJids : []), profile.leadId, profile.lead_id, orderData.customerId, orderData.customer_id, orderData.leadId, orderData.lead_id].map(safeString).filter(Boolean); }
function matchesTarget(row: any, target: { phones: Set<string>; emails: Set<string>; ids: Set<string> }) { const phone = extractPhone(row); if (phone && target.phones.has(phone)) return true; const email = extractEmail(row); if (email && target.emails.has(email)) return true; return rowIds(row).some((id) => target.ids.has(id)); }
function uniqueBy<T>(items: T[], getId: (item: T, index: number) => string) { const seen = new Set<string>(); return items.filter((item, index) => { const id = getId(item, index); if (seen.has(id)) return false; seen.add(id); return true; }); }
function numericAmount(...values: any[]) { for (const value of values) { const parsed = Number(safeString(value).replace(/[^0-9.-]/g, "")); if (Number.isFinite(parsed) && parsed > 0) return parsed; } return 0; }
function orderAmount(order: any) { const data = orderDataOf(order); return numericAmount(data.totalPrice, data.codAmount, data.invoicePayment, data.total, order?.total, order?.amount); }
function orderTimestamp(order: any) { return normalizeTimeMs(order?.updated_at || order?.$updatedAt || order?.created_at || order?.$createdAt || orderDataOf(order).createdAt); }
function leadTimestamp(lead: any) { return normalizeTimeMs(lead?.latestActivityAt || lead?.updatedAt || lead?.createdAt || lead?.created_at || lead?.$createdAt); }
function followUpTimestamp(followUp: any) { return normalizeTimeMs(followUp?.dueAt || followUp?.scheduledAt || followUp?.nextFollowUpAt || followUp?.createdAt || followUp?.created_at); }
function activityTimestamp(activity: any) { return normalizeTimeMs(activity?.timestamp || activity?.createdAt || activity?.created_at || activity?.$createdAt); }
function buildTags(customer: any, activeLead: any) { const profile = profileOf(customer); const raw = [profile.tags, customer?.tags, activeLead?.tags].flatMap((value) => { if (Array.isArray(value)) return value; if (typeof value === "string") return value.split(/[;,]/); return []; }); return uniqueBy(raw.map(safeString).filter(Boolean), (item) => item.toLowerCase()).slice(0, 12); }

function isUsableDisplayName(value: any) { const text = safeString(value); if (!text) return false; const lowered = text.toLowerCase(); if (["unknown", "unknown customer", "whatsapp contact", "alias contact", "unknown alias", "no phone linked"].includes(lowered)) return false; if (/@(?:s\.whatsapp\.net|lid|hosted\.lid|g\.us|broadcast)$/i.test(text)) return false; if (/^\+?[\d\s().-]{7,}$/.test(text)) return false; return /[\p{L}]/u.test(text); }
function displayNameScore(value: any) { const text = safeString(value); if (!isUsableDisplayName(text)) return 0; let score = Math.min(text.length, 80); if (/\s/.test(text)) score += 80; if (text.length <= 3) score -= 40; if (/^[A-Z]{1,4}$/i.test(text)) score -= 30; return score; }
function bestDisplayName(...values: any[]) { return values.map(safeString).filter(isUsableDisplayName).sort((a, b) => displayNameScore(b) - displayNameScore(a))[0] || ""; }
function nameCandidates(row: any) { const profile = profileOf(row); const data = orderDataOf(row); return [row?.name, row?.customerName, row?.leadName, profile.savedName, profile.customerName, profile.name, profile.fullName, profile.verifiedName, profile.businessName, profile.pushName, profile.notify, profile.displayName, data.customerName, data.name, data.fullName]; }

function buildTimeline(customer: any, orders: any[], leads: any[], followUps: any[], activities: any[]) {
  const profile = profileOf(customer); const items: Customer360TimelineItem[] = []; const lastMessageAt = normalizeTimeMs(profile.lastMessageAt || profile.lastCustomerMessageAt || customer?.last_message_at || customer?.$updatedAt); const lastMessage = firstValue(profile.lastCustomerMessagePreview, profile.lastInteractionPreview, profile.lastMessage, customer?.last_message);
  if (lastMessage) items.push({ id: `customer-${lastMessageAt || "latest"}`, type: "customer", title: "Latest customer context", description: lastMessage, timestamp: lastMessageAt, meta: "Conversation preview" });
  orders.forEach((order, index) => { const data = orderDataOf(order); items.push({ id: `order-${order?.$id || order?.id || order?.order_id || index}`, type: "order", title: firstValue(data.orderReferenceNumber, data.trackingNumber, order?.order_id, "Order / lead recorded"), description: firstValue(data.productName, data.serviceName, data.transactionNotes, data.orderDetail, data.recordStatus, "Linked order activity"), timestamp: orderTimestamp(order), meta: firstValue(data.recordType, data.orderStatus, data.transactionStatus) }); });
  leads.forEach((lead, index) => items.push({ id: `lead-${lead?.id || lead?.$id || index}`, type: "lead", title: firstValue(lead?.dealStage, lead?.status, "CRM lead"), description: firstValue(lead?.summary, lead?.notes, lead?.productInterest, lead?.source, "CRM lead activity"), timestamp: leadTimestamp(lead), meta: firstValue(lead?.assignedTo, lead?.source) }));
  followUps.forEach((followUp, index) => items.push({ id: `followup-${followUp?.id || followUp?.$id || index}`, type: "followup", title: firstValue(followUp?.status, followUp?.type, "Follow-up"), description: firstValue(followUp?.note, followUp?.notes, followUp?.reason, followUp?.title, "Follow-up scheduled"), timestamp: followUpTimestamp(followUp), meta: followUpTimestamp(followUp) ? "Due" : "Follow-up" }));
  activities.forEach((activity, index) => items.push({ id: `activity-${activity?.id || activity?.$id || index}`, type: "activity", title: firstValue(activity?.type, activity?.title, "CRM activity"), description: firstValue(activity?.message, activity?.description, activity?.note, "Activity logged"), timestamp: activityTimestamp(activity), meta: firstValue(activity?.actor, activity?.source) }));
  return uniqueBy(items, (item) => item.id).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, 30);
}
function buildSuggestedActions(profile: Customer360Profile, nowMs: number): Customer360SuggestedAction[] { const actions: Customer360SuggestedAction[] = []; if (profile.overdueFollowUps.length > 0) actions.push({ id: "review-overdue-followup", label: "Review overdue follow-up", reason: `${profile.overdueFollowUps.length} follow-up item(s) are overdue.`, priority: "high" }); if (!profile.assignedTo && profile.activeLead) actions.push({ id: "assign-owner", label: "Assign an owner", reason: "This customer has CRM lead context but no visible owner.", priority: "medium" }); if (profile.activeLead && !profile.dealStage) actions.push({ id: "set-deal-stage", label: "Set deal stage", reason: "Lead exists but deal stage is missing.", priority: "medium" }); if (!profile.aiSummary) actions.push({ id: "review-conversation", label: "Review conversation context", reason: "No AI summary is saved for this profile yet.", priority: "low" }); if (profile.orderCount === 0) actions.push({ id: "check-order-fit", label: "Check if an order should be created", reason: "No linked orders found yet.", priority: "low" }); if (profile.nextFollowUpAt && profile.nextFollowUpAt > nowMs) actions.push({ id: "prepare-next-followup", label: "Prepare next follow-up", reason: "A future follow-up is scheduled.", priority: "low" }); return actions.slice(0, 6); }

function mergeProfileRecords(records: any[]) { const latest = [...records].sort((a, b) => normalizeTimeMs(b?.last_message_at || b?.updated_at || b?.$updatedAt || profileOf(b).lastMessageAt) - normalizeTimeMs(a?.last_message_at || a?.updated_at || a?.$updatedAt || profileOf(a).lastMessageAt))[0] || records[0] || {}; const profile = records.reduce((acc, record) => ({ ...acc, ...profileOf(record) }), {} as any); return { ...latest, profile }; }

function resolveCustomerGroup(customer: any, customers: any[] = []) { const sourceCustomers = customers.length ? customers : [customer]; const targetIdentity = resolveCustomerIdentity({ jid: customer?.customer_id || customer?.jid || profileOf(customer).customerJid || profileOf(customer).lidJid, phone: customer?.phone || customer?.customerPhone, profile: profileOf(customer), record: customer }); const groups = groupCustomerRecordsByCanonicalIdentity(sourceCustomers); const targetAliases = new Set([targetIdentity.canonicalCustomerKey, targetIdentity.activeSendJid, targetIdentity.canonicalPhone, ...targetIdentity.aliases].map((value) => safeString(value).toLowerCase()).filter(Boolean)); const match = groups.find((group) => group.identity.canonicalCustomerKey === targetIdentity.canonicalCustomerKey || group.identity.aliases.some((alias) => targetAliases.has(alias.toLowerCase()))); return match || { identity: targetIdentity, records: [customer] } as { identity: ResolvedCustomerIdentity; records: any[] }; }

function buildTarget(records: any[], identity: ResolvedCustomerIdentity) { const phones = new Set<string>(records.map(extractPhone).filter(Boolean)); const emails = new Set<string>(records.map(extractEmail).filter(Boolean)); const ids = new Set<string>(records.flatMap(rowIds)); if (identity.canonicalPhone) phones.add(normalizeCustomer360Phone(identity.canonicalPhone)); if (identity.activeSendJid) ids.add(identity.activeSendJid); identity.aliases.forEach((alias) => ids.add(alias)); return { phones, emails, ids }; }

export function buildCustomer360Profile(input: BuildCustomer360Input): Customer360Profile {
  const nowMs = input.nowMs || Date.now();
  const group = resolveCustomerGroup(input.customer || {}, input.customers || []);
  const customerRecords = group.records.length ? group.records : [input.customer || {}];
  const customer = mergeProfileRecords(customerRecords);
  const target = buildTarget(customerRecords, group.identity);
  const linkedOrders = uniqueBy((input.orders || []).filter((order) => matchesTarget(order, target)), (order, index) => safeString(order?.$id || order?.id || order?.order_id || index));
  const linkedLeads = uniqueBy((input.leads || []).filter((lead) => matchesTarget(lead, target)), (lead, index) => safeString(lead?.id || lead?.$id || lead?.leadId || index));
  const linkedFollowUps = uniqueBy((input.followUps || []).filter((followUp) => matchesTarget(followUp, target)), (followUp, index) => safeString(followUp?.id || followUp?.$id || index));
  const linkedActivities = uniqueBy((input.activities || []).filter((activity) => matchesTarget(activity, target)), (activity, index) => safeString(activity?.id || activity?.$id || index));
  const sortedOrders = [...linkedOrders].sort((a, b) => orderTimestamp(b) - orderTimestamp(a));
  const sortedLeads = [...linkedLeads].sort((a, b) => leadTimestamp(b) - leadTimestamp(a));
  const sortedFollowUps = [...linkedFollowUps].sort((a, b) => followUpTimestamp(a) - followUpTimestamp(b));
  const activeLead = sortedLeads[0] || null;
  const latestOrder = sortedOrders[0] || null;
  const trustedPhone = group.identity.displayIdentity.phoneIsTrusted ? group.identity.displayIdentity.displayPhone : "";
  const contactRow = { ...customer, phone: group.identity.canonicalPhone || "", customerPhone: group.identity.canonicalPhone || "", profile: { ...profileOf(customer), customerPhone: group.identity.canonicalPhone || "", phone: group.identity.canonicalPhone || "", linkedJids: group.identity.aliases } };
  const identity = getCustomerContactIdentity(contactRow, activeLead, latestOrder);
  const nextFollowUp = sortedFollowUps.find((item) => followUpTimestamp(item) >= nowMs) || null;
  const overdueFollowUps = sortedFollowUps.filter((item) => {
    const due = followUpTimestamp(item);
    const status = safeString(item?.status).toLowerCase();
    return due > 0 && due < nowMs && !["done", "completed", "cancelled", "canceled"].includes(status);
  });
  const profile = profileOf(customer);
  const aiSummary = firstValue(profile.aiSummary, profile.customerSummary, profile.summary, profile.smartSummary, customer?.summary, activeLead?.summary);
  const adminAliases = group.identity.aliases.filter((alias) => alias && alias !== group.identity.activeSendJid && alias !== `${group.identity.canonicalPhone}@s.whatsapp.net`).map(maskCustomerAliasForAdmin).filter(Boolean).slice(0, 10);
  const displayName = bestDisplayName(...customerRecords.flatMap(nameCandidates), ...[activeLead, latestOrder].flatMap(nameCandidates), group.identity.displayIdentity.displayName, identity.displayName) || "WhatsApp contact";
  const extracted360 = parseCustomer360FromProfile(profile);

  const result: Customer360Profile = {
    id: firstValue(group.identity.canonicalCustomerKey, customer?.$id, customer?.id, customer?.customer_id, activeLead?.id, latestOrder?.$id, "customer-360"),
    name: displayName,
    phone: trustedPhone,
    email: firstValue(extractEmail(customer), extractEmail(activeLead), extractEmail(latestOrder)),
    location: firstValue(profile.location, profile.city, extracted360.businessContext.businessName, activeLead?.location, activeLead?.city, orderDataOf(latestOrder).city, orderDataOf(latestOrder).address),
    source: firstValue(profile.source, profile.leadSource, customer?.source, activeLead?.latestSource, activeLead?.source, orderDataOf(latestOrder).source),
    assignedTo: firstValue(profile.assignedTo, customer?.assignedTo, activeLead?.assignedTo),
    tags: buildTags(customer, activeLead),
    lifetimeValue: sortedOrders.reduce((total, order) => total + orderAmount(order), 0),
    orderCount: sortedOrders.length,
    latestOrder,
    activeLead,
    leadStatus: firstValue(activeLead?.status, profile.leadStatus, profile.status),
    dealStage: firstValue(activeLead?.dealStage, profile.dealStage),
    nextFollowUpAt: nextFollowUp ? followUpTimestamp(nextFollowUp) : null,
    overdueFollowUps,
    aiSummary,
    timelineItems: buildTimeline(customer, sortedOrders, sortedLeads, sortedFollowUps, linkedActivities),
    suggestedActions: [],
    linkedOrders: sortedOrders,
    linkedLeads: sortedLeads,
    linkedFollowUps: sortedFollowUps,
    conversationAvailable: Boolean(firstValue(profile.lastCustomerMessagePreview, profile.lastInteractionPreview, profile.lastMessage, customer?.last_message)),
    contactLabel: trustedPhone ? "" : firstValue(group.identity.displayIdentity.aliasLabel, identity.contactLabel),
    whatsappProfile: identity.whatsappProfile,
    linkedAliasCount: Math.max(0, Number(group.identity.linkedAliasCount || 0)),
    linkedAliases: adminAliases,
    canonicalCustomerKey: group.identity.canonicalCustomerKey,
    businessContext: extracted360.businessContext,
    salesContext: extracted360.salesContext,
    orderSupportContext: extracted360.orderSupportContext,
    conversationIntelligence: extracted360.conversationIntelligence,
    provenance: extracted360.provenance,
  };
  result.suggestedActions = buildSuggestedActions(result, nowMs);
  return result;
}
