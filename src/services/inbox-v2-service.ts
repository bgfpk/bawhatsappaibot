import { buildCustomer360Profile } from "./customer-360-service";
import { groupCustomerRecordsByCanonicalIdentity, type ResolvedCustomerIdentity } from "./customer-identity-resolver-service.ts";
import { getCustomerContactIdentity } from "../utils/contact-identity";
import { containsSensitiveText, redactSensitiveText } from "../utils/privacy-redaction";

export type InboxV2QueueFlag =
  | "needs_human"
  | "unassigned"
  | "ai_replied"
  | "no_summary"
  | "crm_linked"
  | "overdue_followup"
  | "due_today"
  | "has_orders"
  | "new_or_unknown";

export type InboxV2Row = {
  id: string;
  customerId: string;
  displayName: string;
  phone: string;
  rawPhoneDigits: string;
  contactLabel: string;
  contactId: string;
  email: string;
  source: string;
  assignedTo: string;
  latestContextPreview: string;
  latestContextAt: number;
  aiSummaryPreview: string;
  leadStatus: string;
  dealStage: string;
  nextFollowUpAt: number | null;
  overdueFollowUpCount: number;
  tags: string[];
  queueFlags: InboxV2QueueFlag[];
  priorityScore: number;
  redactionApplied: boolean;
  linkedAliasCount?: number;
};

type BuildInboxV2RowsInput = { customers?: any[]; orders?: any[]; crmOverview?: any; nowMs?: number; };
type InboxV2FilterInput = { query?: string; queue?: string; };
type InboxV2PaginationInput = { page?: number; pageSize?: number; };

export const INBOX_V2_QUEUE_LABELS: Record<InboxV2QueueFlag, string> = {
  needs_human: "Needs human",
  unassigned: "Unassigned",
  ai_replied: "AI replied",
  no_summary: "No summary",
  crm_linked: "CRM linked",
  overdue_followup: "Overdue follow-up",
  due_today: "Due today",
  has_orders: "Has orders",
  new_or_unknown: "New or unknown",
};

function safeString(value: any) { return String(value ?? "").trim(); }
function parseObject(value: any) { if (!value) return {}; if (typeof value === "object" && !Array.isArray(value)) return value; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function firstValue(...values: any[]) { return values.map(safeString).find(Boolean) || ""; }
function normalizeTimeMs(value: any) { if (value === null || value === undefined || value === "") return 0; if (value instanceof Date) return value.getTime(); const numeric = Number(value); if (Number.isFinite(numeric) && numeric > 0) return numeric > 100000000000 ? numeric : numeric * 1000; const parsed = Date.parse(String(value)); return Number.isFinite(parsed) ? parsed : 0; }
function customerIdOf(customer: any, fallback: number) { return firstValue(customer?.$id, customer?.id, customer?.customer_id, customer?.jid, `customer-${fallback}`); }
function getProfile(customer: any) { return parseObject(customer?.profile); }

function hasNeedsHumanSignal(customer: any, profile: any, activeLead: any) {
  const values = [profile.aiPaused, profile.ai_paused, profile.manualReviewRequired, profile.manual_review, profile.botReplyControl === "paused_permanent", profile.botReplyControl === "paused_temp", profile.customerStatus === "manual_review", profile.lastAiRetryBlockedReason, profile.manualReviewReason, activeLead?.needsHuman, activeLead?.needsHumanReply, activeLead?.status === "needs_human", activeLead?.status === "manual_review"];
  return values.some(Boolean);
}
function hasAiReply(profile: any) { return Boolean(firstValue(profile.lastBotReply, profile.lastAiReply, profile.lastAIReply, profile.latestBotReply)); }
function isDueToday(timestamp: number | null, nowMs: number) { if (!timestamp) return false; const now = new Date(nowMs); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const end = start + 24 * 60 * 60 * 1000 - 1; return timestamp >= start && timestamp <= end; }
function latestContextRaw(customer: any, profile: any, profile360: ReturnType<typeof buildCustomer360Profile>) { const fromTimeline = profile360.timelineItems[0]?.description || ""; return firstValue(profile.lastCustomerMessagePreview, profile.lastInteractionPreview, profile.lastMessagePreview, profile.lastCustomerMessage, profile.lastMessage, customer?.last_message, fromTimeline, profile.lastBotReply); }
function latestContextTime(customer: any, profile: any, profile360: ReturnType<typeof buildCustomer360Profile>) { return normalizeTimeMs(profile.lastMessageAt || profile.lastCustomerMessageAt || customer?.last_message_at || profile360.timelineItems[0]?.timestamp || customer?.$updatedAt || customer?.updated_at || customer?.$createdAt || customer?.created_at); }
function pushFlag(flags: InboxV2QueueFlag[], flag: InboxV2QueueFlag, condition: boolean) { if (condition && !flags.includes(flag)) flags.push(flag); }
function scoreRow(flags: InboxV2QueueFlag[], latestContextAt: number) { let score = 0; if (flags.includes("needs_human")) score += 1000000; if (flags.includes("overdue_followup")) score += 800000; if (flags.includes("unassigned")) score += 600000; if (flags.includes("due_today")) score += 400000; if (flags.includes("no_summary")) score += 200000; score += Math.min(Math.floor(Math.max(0, latestContextAt) / 1000000), 199999); return score; }

function isUsableDisplayName(value: any) {
  const text = safeString(value);
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (["unknown", "unknown customer", "whatsapp contact", "alias contact", "unknown alias", "no phone linked"].includes(lowered)) return false;
  if (/@(?:s\.whatsapp\.net|lid|hosted\.lid|g\.us|broadcast)$/i.test(text)) return false;
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  return true;
}

function displayNameScore(value: any) {
  const text = safeString(value);
  if (!isUsableDisplayName(text)) return 0;
  let score = Math.min(text.length, 80);
  if (/\s/.test(text)) score += 80;
  if (text.length <= 3) score -= 40;
  if (/^[A-Z]{1,4}$/i.test(text)) score -= 30;
  return score;
}

function bestDisplayName(...values: any[]) {
  return values
    .map((value) => safeString(value))
    .filter(isUsableDisplayName)
    .sort((a, b) => displayNameScore(b) - displayNameScore(a))[0] || "";
}

function customerNameCandidates(record: any) {
  const profile = getProfile(record);
  return [record?.name, record?.customerName, record?.leadName, profile.savedName, profile.customerName, profile.name, profile.fullName, profile.verifiedName, profile.businessName, profile.pushName, profile.notify, profile.displayName];
}

export function normalizeInboxSearchQuery(value: unknown) {
  const text = safeString(value).toLowerCase().replace(/\s+/g, " ").trim();
  return { text, digits: text.replace(/\D/g, "") };
}

export function buildInboxSearchText(row: InboxV2Row) {
  const textParts = [row.id, row.customerId, row.contactId, row.displayName, row.phone, row.rawPhoneDigits, row.contactLabel, row.email, row.source, row.assignedTo, row.latestContextPreview, row.aiSummaryPreview, row.leadStatus, row.dealStage, row.nextFollowUpAt ? "next follow-up scheduled" : "no next follow-up", row.overdueFollowUpCount ? `${row.overdueFollowUpCount} overdue follow-up` : "", row.linkedAliasCount ? `linked aliases ${row.linkedAliasCount}` : "", ...row.tags, ...row.queueFlags, ...row.queueFlags.map((flag) => INBOX_V2_QUEUE_LABELS[flag])];
  const text = textParts.map(safeString).filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  const digits = textParts.join(" ").replace(/\D/g, "");
  return { text, digits };
}

function phoneDigitsMatch(queryDigits: string, rowPhone: string, rawPhoneDigits = "") {
  const rowDigits = `${rowPhone} ${rawPhoneDigits}`.replace(/\D/g, "");
  if (!queryDigits || !rowDigits) return false;
  return rowDigits.includes(queryDigits) || queryDigits.includes(rowDigits) || queryDigits.endsWith(rowDigits) || rowDigits.endsWith(queryDigits);
}

export function filterInboxV2Rows(rows: InboxV2Row[], input: InboxV2FilterInput = {}) {
  const query = normalizeInboxSearchQuery(input.query || "");
  const queue = safeString(input.queue || "all");
  return rows.filter((row) => {
    const matchesQueue = queue === "all" || row.queueFlags.includes(queue as InboxV2QueueFlag);
    if (!matchesQueue) return false;
    if (!query.text) return true;
    const searchText = buildInboxSearchText(row);
    return searchText.text.includes(query.text) || Boolean(query.digits && (searchText.digits.includes(query.digits) || phoneDigitsMatch(query.digits, row.phone, row.rawPhoneDigits)));
  });
}

export function paginateInboxV2Rows(rows: InboxV2Row[], input: InboxV2PaginationInput = {}) {
  const pageSize = [25, 50, 100].includes(Number(input.pageSize)) ? Number(input.pageSize) : 25;
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.max(1, Math.floor(Number(input.page || 1) || 1));
  const page = Math.min(requestedPage, pageCount);
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = Math.min(total, startIndex + pageSize);
  return { rows: rows.slice(startIndex, endIndex), page, pageSize, total, pageCount, start: total === 0 ? 0 : startIndex + 1, end: endIndex, hasPrevious: page > 1, hasNext: page < pageCount };
}

export function getInboxV2PriorityLabel(row: InboxV2Row) {
  if (row.queueFlags.includes("needs_human")) return "Needs human review";
  if (row.queueFlags.includes("overdue_followup")) return "Overdue follow-up";
  if (row.queueFlags.includes("unassigned")) return "Assign owner";
  if (row.queueFlags.includes("due_today")) return "Due today";
  if (row.queueFlags.includes("no_summary")) return "Needs context";
  return "Review when available";
}

function pickPrimaryCustomer(records: any[], identity: ResolvedCustomerIdentity) {
  return records.find((record) => safeString(record?.phone || record?.customerPhone || record?.customer_phone || parseObject(record?.profile).customerPhone) === identity.canonicalPhone)
    || records.find((record) => !safeString(record?.customer_id || record?.jid).toLowerCase().endsWith("@lid"))
    || records[0]
    || {};
}

function buildGroupedCustomer(records: any[], identity: ResolvedCustomerIdentity, index: number) {
  const primary = pickPrimaryCustomer(records, identity);
  const mergedProfile = records.reduce((acc, record) => ({ ...acc, ...getProfile(record) }), {} as any);
  return {
    ...primary,
    id: identity.canonicalCustomerKey || customerIdOf(primary, index),
    customer_id: identity.activeSendJid || primary.customer_id,
    phone: identity.canonicalPhone || "",
    customerPhone: identity.canonicalPhone || "",
    profile: {
      ...mergedProfile,
      customerPhone: identity.canonicalPhone || "",
      phone: identity.canonicalPhone || "",
      linkedAliasCount: identity.linkedAliasCount,
      canonicalCustomerKey: identity.canonicalCustomerKey,
      linkedJids: identity.aliases,
    },
    __linkedCustomerRecords: records,
    __identity: identity,
  };
}

export function buildInboxV2Rows(input: BuildInboxV2RowsInput): InboxV2Row[] {
  const customers = [...(input.customers || [])];
  const orders = [...(input.orders || [])];
  const crmOverview = input.crmOverview || {};
  const leads = Array.isArray(crmOverview?.leads) ? crmOverview.leads : [];
  const followUps = Array.isArray(crmOverview?.followUps) ? crmOverview.followUps : [];
  const activities = Array.isArray(crmOverview?.activities) ? crmOverview.activities : [];
  const nowMs = input.nowMs || Date.now();
  const groups = groupCustomerRecordsByCanonicalIdentity(customers);

  return groups.map((group, index) => {
    const customer = buildGroupedCustomer(group.records, group.identity, index);
    const profile = getProfile(customer);
    const profile360 = buildCustomer360Profile({ customer, customers: group.records, orders, leads, followUps, activities, nowMs });
    const contactIdentity = getCustomerContactIdentity(customer);
    const rawLatestContext = latestContextRaw(customer, profile, profile360);
    const rawSummary = profile360.aiSummary;
    const latestContextPreview = redactSensitiveText(rawLatestContext, { maxLength: 180 });
    const aiSummaryPreview = redactSensitiveText(rawSummary, { maxLength: 180 });
    const latestContextAt = latestContextTime(customer, profile, profile360);
    const activeLead = profile360.activeLead;
    const assignedTo = firstValue(profile360.assignedTo, activeLead?.assignedTo);
    const hasSummary = Boolean(rawSummary);
    const needsHuman = hasNeedsHumanSignal(customer, profile, activeLead);
    const dueToday = isDueToday(profile360.nextFollowUpAt, nowMs);
    const trustedPhone = group.identity.displayIdentity.phoneIsTrusted ? group.identity.displayIdentity.displayPhone : "";
    const rowName = bestDisplayName(
      ...group.records.flatMap(customerNameCandidates),
      group.identity.displayIdentity.displayName,
      profile360.name,
      contactIdentity.displayName,
    ) || "WhatsApp contact";

    const flags: InboxV2QueueFlag[] = [];
    pushFlag(flags, "needs_human", needsHuman);
    pushFlag(flags, "unassigned", Boolean(activeLead && !assignedTo));
    pushFlag(flags, "ai_replied", hasAiReply(profile));
    pushFlag(flags, "no_summary", !hasSummary);
    pushFlag(flags, "crm_linked", Boolean(activeLead));
    pushFlag(flags, "overdue_followup", profile360.overdueFollowUps.length > 0);
    pushFlag(flags, "due_today", dueToday);
    pushFlag(flags, "has_orders", profile360.orderCount > 0);
    pushFlag(flags, "new_or_unknown", !hasSummary && !activeLead && profile360.orderCount === 0);

    return {
      id: `inbox-${customerIdOf(customer, index)}`,
      customerId: customerIdOf(customer, index),
      displayName: rowName,
      phone: trustedPhone,
      rawPhoneDigits: group.identity.canonicalPhone || "",
      contactLabel: trustedPhone ? "" : firstValue(group.identity.displayIdentity.aliasLabel, profile360.contactLabel, contactIdentity.contactLabel),
      contactId: contactIdentity.contactId,
      email: firstValue(profile360.email, profile.email, customer?.email),
      source: firstValue(profile360.source, profile.source, customer?.source, activeLead?.source),
      assignedTo,
      latestContextPreview,
      latestContextAt,
      aiSummaryPreview,
      leadStatus: firstValue(profile360.leadStatus, activeLead?.status),
      dealStage: firstValue(profile360.dealStage, activeLead?.dealStage),
      nextFollowUpAt: profile360.nextFollowUpAt,
      overdueFollowUpCount: profile360.overdueFollowUps.length,
      tags: [...profile360.tags],
      queueFlags: flags,
      priorityScore: scoreRow(flags, latestContextAt),
      redactionApplied: containsSensitiveText(rawLatestContext) || containsSensitiveText(rawSummary),
      linkedAliasCount: group.identity.linkedAliasCount,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || b.latestContextAt - a.latestContextAt || a.displayName.localeCompare(b.displayName));
}

export function summarizeInboxV2Rows(rows: InboxV2Row[]) {
  const count = (flag: InboxV2QueueFlag) => rows.filter((row) => row.queueFlags.includes(flag)).length;
  return { total: rows.length, needsHuman: count("needs_human"), unassigned: count("unassigned"), aiReplied: count("ai_replied"), crmLinked: count("crm_linked"), overdue: count("overdue_followup"), noSummary: count("no_summary") };
}
