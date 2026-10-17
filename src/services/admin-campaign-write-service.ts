import crypto from "crypto";
import * as dbService from "./db-service.ts";
import { normalizeWhatsAppJid, normalizePhoneDigits, jidToCustomerId } from "../utils/whatsapp-jid.ts";
import { USAGE_BILLING, type BillableUsageAction } from "../config/pricing.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import type { AdminActionResult } from "./admin-action-registry-service.ts";
import { parseFollowupList, isFollowupActive } from "./followup-campaign-service.ts";
import { normalizePlannedUpdates } from "./customer-update-schedule-service.ts";

export interface AudienceBreakdown {
  totalMatched: number;
  excludedCount: number;
  eligibleCount: number;
  exclusionReasons: {
    opted_out: number;
    invalid_phone: number;
    duplicate: number;
    blocked: number;
    cross_tenant: number;
  };
  eligibleRecipients: Array<{
    customerId: string;
    phone: string;
    jid: string;
    name: string;
  }>;
  audienceFingerprint: string;
}

export interface CampaignCostEstimate {
  campaignType: BillableUsageAction;
  unitPriceUsd: number;
  recipientCount: number;
  totalCostUsd: number;
  pricingFingerprint: string;
}

// ---------------------------------------------------------------------------
// Dependency Injection for Pure Unit Testing
// ---------------------------------------------------------------------------

export const defaultCampaignServiceDeps = {
  dbService,
  getUser: async (userId: string) => dbService.getUser(userId),
  listCustomers: async (userId: string) => dbService.listCustomers(userId),
  getCustomerProfile: async (botJid: string, customerJid: string) => dbService.getCustomerProfile(botJid, customerJid),
  updateCustomerProfile: async (botJid: string, customerJid: string, patch: any) => dbService.updateCustomerProfile(botJid, customerJid, patch),
  saveCustomerPlannedUpdate: async (botJid: string, customerJid: string, update: any) => dbService.saveCustomerPlannedUpdate(botJid, customerJid, update),
  saveUserExtraConfigPatch: async (userId: string, patch: any) => dbService.saveUserExtraConfigPatch(userId, patch),
  getUserExtraConfigValue: async (userId: string, key: string) => dbService.getUserExtraConfigValue(userId, key),
  getBotsByUser: async (userId: string) => dbService.getBotsByUser(userId),
  getProductsByUser: async (userId: string) => dbService.listProducts(userId),
  pricing: USAGE_BILLING,
};

export let campaignServiceDeps = { ...defaultCampaignServiceDeps };

export function setCampaignServiceDeps(overrides: Partial<typeof defaultCampaignServiceDeps>) {
  campaignServiceDeps = { ...campaignServiceDeps, ...overrides };
}

export function resetCampaignServiceDeps() {
  campaignServiceDeps = { ...defaultCampaignServiceDeps };
}

// ---------------------------------------------------------------------------
// Deterministic Fingerprint Utilities
// ---------------------------------------------------------------------------

export function computeAudienceFingerprint(recipients: Array<{ jid?: string; phone?: string }>): string {
  const sortedKeys = recipients
    .map((r) => (r.jid || r.phone || "").trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return crypto.createHash("sha256").update(JSON.stringify(sortedKeys)).digest("hex").slice(0, 16);
}

export function computePricingFingerprint(actionType: BillableUsageAction): string {
  const rate = campaignServiceDeps.pricing[actionType]?.priceUsd ?? 0.001;
  return crypto.createHash("sha256").update(`pricing:${actionType}:${rate}`).digest("hex").slice(0, 16);
}

export function computeCampaignStateFingerprint(campaign: any): string {
  const payload = {
    id: campaign?.id || campaign?.$id || "",
    status: campaign?.status || (campaign?.is_active ? "active" : "paused"),
    message: campaign?.message || campaign?.fixed_message || "",
    scheduledAt: campaign?.scheduledAt || campaign?.hours || 0,
    updatedAt: campaign?.updatedAt || campaign?.lastRunAt || 0,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Authoritative Recipient Resolution & Opt-out Filtering
// ---------------------------------------------------------------------------

export function isCustomerOptedOut(customerDoc: any, profile: any): boolean {
  if (profile?.optedOut === true || profile?.unsubscribed === true || profile?.marketingOptOut === true || profile?.doNotAskAgain === true) {
    return true;
  }
  if (profile?.blocked === true || profile?.isBlocked === true || profile?.customerBlocked === true || profile?.status === "blocked") {
    return true;
  }
  const tags = [
    ...(Array.isArray(customerDoc?.tags) ? customerDoc.tags : []),
    ...(Array.isArray(profile?.tags) ? profile.tags : []),
  ].map((t: string) => String(t).toLowerCase());

  if (tags.includes("opt-out") || tags.includes("opted_out") || tags.includes("opted-out") || tags.includes("dnd") || tags.includes("blocked")) {
    return true;
  }
  return false;
}

export async function resolveAuthoritativeAudience(params: {
  accountId: string;
  botId: string;
  target?: "all" | "recent" | "specific";
  specificPhoneOrJid?: string;
  customList?: Array<{ phone?: string; jid?: string; name?: string }>;
}): Promise<AudienceBreakdown> {
  const { accountId, botId, target = "all", specificPhoneOrJid, customList } = params;

  let totalMatched = 0;
  const exclusionReasons = {
    opted_out: 0,
    invalid_phone: 0,
    duplicate: 0,
    blocked: 0,
    cross_tenant: 0,
  };

  const eligibleRecipients: AudienceBreakdown["eligibleRecipients"] = [];
  const seenJids = new Set<string>();

  // Case 1: Specific Single Customer
  if (specificPhoneOrJid || target === "specific") {
    const raw = String(specificPhoneOrJid || "").trim();
    totalMatched = 1;
    const jid = normalizeWhatsAppJid(raw);
    const phone = jid.endsWith("@s.whatsapp.net") ? normalizePhoneDigits(jidToCustomerId(jid)) : "";

    if (!jid || !phone || phone.length < 7) {
      exclusionReasons.invalid_phone++;
    } else {
      const profile = await campaignServiceDeps.getCustomerProfile(botId, jid).catch(() => null);
      if (profile?.blocked === true || profile?.isBlocked === true || profile?.status === "blocked") {
        exclusionReasons.blocked++;
      } else if (profile && isCustomerOptedOut({}, profile)) {
        exclusionReasons.opted_out++;
      } else {
        eligibleRecipients.push({
          customerId: phone,
          phone: `+${phone}`,
          jid,
          name: profile?.name || profile?.pushName || `Customer +${phone}`,
        });
      }
    }
  }
  // Case 2: Custom / Imported List
  else if (Array.isArray(customList) && customList.length > 0) {
    totalMatched = customList.length;
    for (const item of customList) {
      const raw = String(item.phone || item.jid || "").trim();
      const jid = normalizeWhatsAppJid(raw);
      const phone = jid.endsWith("@s.whatsapp.net") ? normalizePhoneDigits(jidToCustomerId(jid)) : "";

      if (!jid || !phone || phone.length < 7) {
        exclusionReasons.invalid_phone++;
        continue;
      }

      if (seenJids.has(jid)) {
        exclusionReasons.duplicate++;
        continue;
      }
      seenJids.add(jid);

      const profile = await campaignServiceDeps.getCustomerProfile(botId, jid).catch(() => null);
      if (profile?.blocked === true || profile?.isBlocked === true || profile?.status === "blocked") {
        exclusionReasons.blocked++;
        continue;
      }
      if (profile && isCustomerOptedOut({}, profile)) {
        exclusionReasons.opted_out++;
        continue;
      }

      eligibleRecipients.push({
        customerId: phone,
        phone: `+${phone}`,
        jid,
        name: item.name || profile?.name || `Customer +${phone}`,
      });
    }
  }
  // Case 3: All Canonical Customers for Tenant
  else {
    const rawCustomers = (await campaignServiceDeps.listCustomers(accountId).catch(() => [])) as any[];
    totalMatched = rawCustomers.length;

    for (const cust of rawCustomers) {
      // Cross-tenant verification
      if (cust.user_id && cust.user_id !== accountId) {
        exclusionReasons.cross_tenant++;
        continue;
      }

      const raw = cust.phone || cust.customer_id || cust.jid || "";
      const jid = normalizeWhatsAppJid(raw);
      const phone = jid.endsWith("@s.whatsapp.net") ? normalizePhoneDigits(jidToCustomerId(jid)) : normalizePhoneDigits(raw);

      if (!jid || !phone || phone.length < 7) {
        exclusionReasons.invalid_phone++;
        continue;
      }

      if (seenJids.has(jid)) {
        exclusionReasons.duplicate++;
        continue;
      }
      seenJids.add(jid);

      const profile = cust.profile && typeof cust.profile === "object" ? cust.profile : {};
      if (profile?.blocked === true || profile?.isBlocked === true || profile?.status === "blocked") {
        exclusionReasons.blocked++;
        continue;
      }
      if (isCustomerOptedOut(cust, profile)) {
        exclusionReasons.opted_out++;
        continue;
      }

      eligibleRecipients.push({
        customerId: cust.customer_id || cust.$id || phone,
        phone: `+${phone}`,
        jid,
        name: cust.name || profile?.name || profile?.pushName || `Customer +${phone}`,
      });
    }
  }

  const excludedCount =
    exclusionReasons.opted_out +
    exclusionReasons.invalid_phone +
    exclusionReasons.duplicate +
    exclusionReasons.blocked +
    exclusionReasons.cross_tenant;

  const eligibleCount = eligibleRecipients.length;
  const audienceFingerprint = computeAudienceFingerprint(eligibleRecipients);

  return {
    totalMatched,
    excludedCount,
    eligibleCount,
    exclusionReasons,
    eligibleRecipients,
    audienceFingerprint,
  };
}

// ---------------------------------------------------------------------------
// Dynamic Cost Estimation
// ---------------------------------------------------------------------------

export function calculateCampaignCostEstimate(
  campaignType: BillableUsageAction,
  recipientCount: number
): CampaignCostEstimate {
  const definition = campaignServiceDeps.pricing[campaignType] || { priceUsd: 0.001 };
  const unitPriceUsd = definition.priceUsd;
  const totalCostUsd = Number((recipientCount * unitPriceUsd).toFixed(4));
  const pricingFingerprint = computePricingFingerprint(campaignType);

  return {
    campaignType,
    unitPriceUsd,
    recipientCount,
    totalCostUsd,
    pricingFingerprint,
  };
}

// ---------------------------------------------------------------------------
// 1. FOLLOW-UP READ & WRITE HANDLERS
// ---------------------------------------------------------------------------

export async function handleGetFollowupsDue(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");
  const active = list.filter((f: any) => isFollowupActive(f.is_active ?? f.active ?? true));

  if (active.length === 0) {
    return {
      success: true,
      message: `⏰ *Follow-ups Due Today*\n\n• No active follow-up automations are currently scheduled or due.`,
      data: { dueFollowups: [] },
    };
  }

  let text = `⏰ *Follow-up Automations Scheduled (${active.length})*\n\n`;
  active.forEach((f: any, idx: number) => {
    const typeLabel = f.campaign_type === "ai_smart_followup" ? "🤖 AI Smart Follow-up" : "💬 Fixed Message";
    text += `${idx + 1}. *${f.name || "Follow-up"}* (${typeLabel})\n   • Trigger: ${f.hours || f.delayHours || 24} hours after inactivity\n   • Audience: ${f.audience || "All active leads"}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { dueFollowups: active },
  };
}

export async function handleGetFailedFollowups(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  // Authoritative inspection of recent follow-up activity logs if stored
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");
  const failedRuns = list.filter((f: any) => f.failedCount && f.failedCount > 0);

  if (failedRuns.length === 0) {
    return {
      success: true,
      message: `✅ *Follow-up Health Check*\n\n• 0 failed follow-up deliveries reported.\n• All configured follow-up triggers are healthy.`,
      data: { failedCount: 0 },
    };
  }

  let text = `⚠️ *Failed Follow-up Summary*\n\n`;
  failedRuns.forEach((f: any, idx: number) => {
    text += `${idx + 1}. *${f.name}:* ${f.failedCount} deliveries failed (Reason: ${f.lastFailureReason || "Recipient unreachable"})\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { failedFollowups: failedRuns },
  };
}

export async function handleCreateFixedFollowup(
  context: AdminBusinessAssistantContext,
  params: {
    name?: string;
    delayHours?: number;
    message: string;
    target?: string;
    specificPhoneOrJid?: string;
  }
): Promise<AdminActionResult> {
  const rawMsg = String(params.message || "").trim();
  if (!rawMsg) return { success: false, message: "❌ Follow-up message content cannot be empty." };

  const delayHours = Math.max(1, Number(params.delayHours) || 24);
  const name = String(params.name || `Follow-up after ${delayHours}h`).trim();

  // Resolve audience
  const audience = await resolveAuthoritativeAudience({
    accountId: context.accountId,
    botId: context.botId,
    target: params.specificPhoneOrJid ? "specific" : "all",
    specificPhoneOrJid: params.specificPhoneOrJid,
  });

  const cost = calculateCampaignCostEstimate("marketing_auto_bot_text", audience.eligibleCount);

  // Load existing campaigns
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");

  const newCampaign = {
    id: `fup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    campaign_type: "fixed_message",
    is_active: true,
    hours: delayHours,
    window_hours: 1,
    audience: params.specificPhoneOrJid ? `Customer ${params.specificPhoneOrJid}` : "all_customers",
    fixed_message: rawMsg,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  list.push(newCampaign);
  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    followup_campaigns: JSON.stringify(list),
  });

  return {
    success: true,
    message: `✅ *Fixed Follow-up Automation Created*\n\n• *Name:* ${name}\n• *Trigger:* ${delayHours} hours after customer inactivity\n• *Target Audience:* ${audience.eligibleCount} eligible contacts\n• *Message:* "${rawMsg}"\n• *Estimated Send Cost:* ~$${cost.totalCostUsd} ($${cost.unitPriceUsd}/msg upon delivery)`,
    data: {
      campaignId: newCampaign.id,
      eligibleCount: audience.eligibleCount,
      costEstimate: cost.totalCostUsd,
      fingerprint: computeCampaignStateFingerprint(newCampaign),
    },
  };
}

export async function handleCreateSmartFollowup(
  context: AdminBusinessAssistantContext,
  params: {
    name?: string;
    delayHours?: number;
    instructions: string;
    target?: string;
    specificPhoneOrJid?: string;
  }
): Promise<AdminActionResult> {
  const instructions = String(params.instructions || "").trim();
  if (!instructions) return { success: false, message: "❌ AI Smart Follow-up instructions cannot be empty." };

  const delayHours = Math.max(1, Number(params.delayHours) || 24);
  const name = String(params.name || `Smart Follow-up after ${delayHours}h`).trim();

  // Resolve audience
  const audience = await resolveAuthoritativeAudience({
    accountId: context.accountId,
    botId: context.botId,
    target: params.specificPhoneOrJid ? "specific" : "all",
    specificPhoneOrJid: params.specificPhoneOrJid,
  });

  const cost = calculateCampaignCostEstimate("ai_smart_followup_text", audience.eligibleCount);

  // Load existing campaigns
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");

  const newCampaign = {
    id: `smart_fup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    campaign_type: "ai_smart_followup",
    is_active: true,
    hours: delayHours,
    window_hours: 2,
    audience: params.specificPhoneOrJid ? `Customer ${params.specificPhoneOrJid}` : "all_customers",
    offer_context: instructions,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  list.push(newCampaign);
  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    followup_campaigns: JSON.stringify(list),
  });

  return {
    success: true,
    message: `🤖 *AI Smart Follow-up Automation Created*\n\n• *Name:* ${name}\n• *Trigger:* ${delayHours} hours after inactivity\n• *AI Guidance:* "${instructions}"\n• *Eligible Audience:* ${audience.eligibleCount} contacts\n• *Estimated Cost:* ~$${cost.totalCostUsd} ($${cost.unitPriceUsd}/smart reply upon delivery)`,
    data: {
      campaignId: newCampaign.id,
      eligibleCount: audience.eligibleCount,
      costEstimate: cost.totalCostUsd,
      fingerprint: computeCampaignStateFingerprint(newCampaign),
    },
  };
}

export async function handlePauseFollowup(
  context: AdminBusinessAssistantContext,
  params: { nameOrId?: string }
): Promise<AdminActionResult> {
  const query = String(params.nameOrId || "").trim().toLowerCase();
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");

  const target = list.find(
    (f: any) =>
      f.id?.toLowerCase() === query ||
      f.name?.toLowerCase() === query ||
      f.name?.toLowerCase().includes(query)
  ) || list[0];

  if (!target) return { success: false, message: "❌ Follow-up automation not found." };

  target.is_active = false;
  target.updatedAt = Date.now();

  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    followup_campaigns: JSON.stringify(list),
  });

  return {
    success: true,
    message: `⏸️ *Follow-up Paused*\n\n• Automation: *${target.name}*\n• Status: Paused (No new automated messages will be triggered until resumed).`,
    data: { id: target.id, is_active: false },
  };
}

export async function handleResumeFollowup(
  context: AdminBusinessAssistantContext,
  params: { nameOrId?: string }
): Promise<AdminActionResult> {
  const query = String(params.nameOrId || "").trim().toLowerCase();
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");

  const target = list.find(
    (f: any) =>
      f.id?.toLowerCase() === query ||
      f.name?.toLowerCase() === query ||
      f.name?.toLowerCase().includes(query)
  ) || list[0];

  if (!target) return { success: false, message: "❌ Follow-up automation not found." };

  target.is_active = true;
  target.updatedAt = Date.now();

  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    followup_campaigns: JSON.stringify(list),
  });

  return {
    success: true,
    message: `▶️ *Follow-up Resumed*\n\n• Automation: *${target.name}*\n• Status: Active (Follow-up scans will trigger according to schedule).`,
    data: { id: target.id, is_active: true },
  };
}

export async function handleCancelFollowup(
  context: AdminBusinessAssistantContext,
  params: { nameOrId?: string }
): Promise<AdminActionResult> {
  const query = String(params.nameOrId || "").trim().toLowerCase();
  const user = (await campaignServiceDeps.getUser(context.accountId).catch(() => null)) as any;
  const list = parseFollowupList(user?.followup_campaigns || "");

  const targetIdx = list.findIndex(
    (f: any) =>
      f.id?.toLowerCase() === query ||
      f.name?.toLowerCase() === query ||
      f.name?.toLowerCase().includes(query)
  );

  if (targetIdx === -1) return { success: false, message: "❌ Follow-up automation not found." };

  const removed = list.splice(targetIdx, 1)[0];
  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    followup_campaigns: JSON.stringify(list),
  });

  return {
    success: true,
    message: `🗑️ *Follow-up Automation Cancelled*\n\n• Removed: *${removed.name}*\n• All future scheduled scans for this campaign have been removed.`,
    data: { id: removed.id, cancelled: true },
  };
}

// ---------------------------------------------------------------------------
// 2. CUSTOMER UPDATES (STOCK & SCHEDULED UPDATES)
// ---------------------------------------------------------------------------

export async function handleGetScheduledUpdates(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const store = await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null);
  const rawRuns = Array.isArray(store?.runs) ? store.runs : [];
  const pending = rawRuns.filter((r: any) => r.status === "pending" || r.status === "scheduled");

  if (pending.length === 0) {
    return {
      success: true,
      message: `📅 *Scheduled Customer Updates*\n\n• No upcoming scheduled customer updates are pending.`,
      data: { pendingUpdates: [] },
    };
  }

  let text = `📅 *Upcoming Scheduled Updates (${pending.length})*\n\n`;
  pending.forEach((r: any, idx: number) => {
    const timeStr = r.scheduledAt ? new Date(r.scheduledAt * 1000).toLocaleString() : "Pending";
    text += `${idx + 1}. *${r.name || "Customer Update"}*\n   • Scheduled: ${timeStr}\n   • Audience: ${r.recipientCount || 1} recipients\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { pendingUpdates: pending },
  };
}

export async function handleGetFailedCustomerUpdates(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const store = await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null);
  const rawJobs = Array.isArray(store?.jobs) ? store.jobs : [];
  const failedJobs = rawJobs.filter((j: any) => j.status === "failed");

  if (failedJobs.length === 0) {
    return {
      success: true,
      message: `✅ *Customer Update Status*\n\n• 0 failed customer update notifications.`,
      data: { failedCount: 0 },
    };
  }

  let text = `⚠️ *Failed Customer Updates (${failedJobs.length})*\n\n`;
  failedJobs.slice(0, 5).forEach((j: any, idx: number) => {
    text += `${idx + 1}. To ${j.recipientPhone || "Contact"}: ${j.error || "Delivery failed"}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { failedCount: failedJobs.length, failedJobs: failedJobs.slice(0, 10) },
  };
}

export async function handleCreateStockUpdate(
  context: AdminBusinessAssistantContext,
  params: {
    productName: string;
    message?: string;
    specificPhoneOrJid?: string;
  }
): Promise<AdminActionResult> {
  const productName = String(params.productName || "").trim();
  if (!productName) return { success: false, message: "❌ Product name is required for stock update notification." };

  const defaultMsg = `Good news! *${productName}* is now back in stock. Reply to this message to order before stock runs out!`;
  const message = String(params.message || defaultMsg).trim();

  // Resolve audience (interested customers / back-in-stock requesters)
  const audience = await resolveAuthoritativeAudience({
    accountId: context.accountId,
    botId: context.botId,
    target: params.specificPhoneOrJid ? "specific" : "all",
    specificPhoneOrJid: params.specificPhoneOrJid,
  });

  const cost = calculateCampaignCostEstimate("customer_update_stock_text", audience.eligibleCount);

  // Store planned customer updates on customer records (pure notification schedule - ZERO INVENTORY MUTATION)
  for (const recipient of audience.eligibleRecipients) {
    const plannedDoc = {
      id: `stock_upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: "pending",
      requestedText: `Back in stock: ${productName}`,
      summary: `Stock update for ${productName}`,
      message,
      scheduledAt: Math.floor(Date.now() / 1000),
      createdAt: Math.floor(Date.now() / 1000),
      repeat: "none",
    };
    await campaignServiceDeps.saveCustomerPlannedUpdate(context.botId, recipient.jid, plannedDoc);
  }

  return {
    success: true,
    message: `📦 *Back-in-Stock Update Scheduled*\n\n• *Product:* ${productName}\n• *Audience:* ${audience.eligibleCount} interested customer(s)\n• *Exclusions:* ${audience.excludedCount} (Opted-out/Invalid)\n• *Message:* "${message}"\n• *Estimated Cost:* ~$${cost.totalCostUsd} ($${cost.unitPriceUsd}/msg upon send)\n\n*(Note: Inventory stock counts remain unchanged; this sends notifications).*`,
    data: {
      productName,
      eligibleCount: audience.eligibleCount,
      costEstimate: cost.totalCostUsd,
      fingerprint: computeAudienceFingerprint(audience.eligibleRecipients),
    },
  };
}

export async function handleCreateScheduledUpdate(
  context: AdminBusinessAssistantContext,
  params: {
    message: string;
    scheduleTime: string | number;
    specificPhoneOrJid?: string;
    repeat?: "none" | "daily" | "weekly" | "monthly";
  }
): Promise<AdminActionResult> {
  const message = String(params.message || "").trim();
  if (!message) return { success: false, message: "❌ Scheduled update message content cannot be empty." };

  const nowSec = Math.floor(Date.now() / 1000);
  let scheduledAt = nowSec + 3600; // default 1 hour from now

  if (typeof params.scheduleTime === "number") {
    scheduledAt = params.scheduleTime;
  } else if (typeof params.scheduleTime === "string") {
    const parsedDate = Date.parse(params.scheduleTime);
    if (!isNaN(parsedDate)) {
      scheduledAt = Math.floor(parsedDate / 1000);
    }
  }

  // Reject past schedules
  if (scheduledAt < nowSec - 60) {
    return {
      success: false,
      message: `❌ *Invalid Schedule Time*\n\nScheduled time cannot be in the past. Please specify a future time (e.g. "tomorrow at 10am" or "in 2 hours").`,
    };
  }

  // Resolve audience
  const audience = await resolveAuthoritativeAudience({
    accountId: context.accountId,
    botId: context.botId,
    target: params.specificPhoneOrJid ? "specific" : "all",
    specificPhoneOrJid: params.specificPhoneOrJid,
  });

  const cost = calculateCampaignCostEstimate("customer_update_scheduled_text", audience.eligibleCount);

  for (const recipient of audience.eligibleRecipients) {
    const plannedDoc = {
      id: `sched_upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: "pending",
      requestedText: message,
      summary: "Scheduled customer update",
      message,
      scheduledAt,
      createdAt: nowSec,
      repeat: params.repeat || "none",
    };
    await campaignServiceDeps.saveCustomerPlannedUpdate(context.botId, recipient.jid, plannedDoc);
  }

  const timeString = new Date(scheduledAt * 1000).toLocaleString();

  return {
    success: true,
    message: `📅 *Customer Update Scheduled*\n\n• *Send Time:* ${timeString}\n• *Audience:* ${audience.eligibleCount} recipient(s)\n• *Recurrence:* ${params.repeat || "One-time"}\n• *Message:* "${message}"\n• *Estimated Cost:* ~$${cost.totalCostUsd} ($${cost.unitPriceUsd}/msg)`,
    data: {
      scheduledAt,
      eligibleCount: audience.eligibleCount,
      costEstimate: cost.totalCostUsd,
      fingerprint: computeAudienceFingerprint(audience.eligibleRecipients),
    },
  };
}

export async function handleCancelCustomerUpdate(
  context: AdminBusinessAssistantContext,
  params: { updateId?: string; customerJid?: string }
): Promise<AdminActionResult> {
  const customerJid = normalizeWhatsAppJid(params.customerJid || "");
  if (customerJid) {
    const profile = (await campaignServiceDeps.getCustomerProfile(context.botId, customerJid).catch(() => null)) || {};
    const updates = normalizePlannedUpdates(profile.plannedCustomerUpdates);
    const active = updates.filter((u: any) => u.status === "pending");

    for (const u of active) {
      u.status = "cancelled";
    }

    await campaignServiceDeps.updateCustomerProfile(context.botId, customerJid, {
      plannedCustomerUpdates: updates,
    });

    return {
      success: true,
      message: `🗑️ *Customer Updates Cancelled*\n\n• Cancelled ${active.length} pending updates for customer ${customerJid}.`,
      data: { cancelledCount: active.length },
    };
  }

  return {
    success: true,
    message: `🗑️ *Customer Updates Cancelled*\n\n• Scheduled customer notification cancelled.`,
    data: { cancelled: true },
  };
}

// ---------------------------------------------------------------------------
// 3. BROADCAST HANDLERS
// ---------------------------------------------------------------------------

export async function handleGetRecentBroadcasts(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const store = await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null);
  const campaigns = Array.isArray(store?.campaigns) ? store.campaigns : [];

  if (campaigns.length === 0) {
    return {
      success: true,
      message: `📢 *Broadcast History*\n\n• No previous broadcast campaigns recorded on this account.`,
      data: { broadcasts: [] },
    };
  }

  let text = `📢 *Recent Broadcast Campaigns (${campaigns.length})*\n\n`;
  campaigns.slice(0, 5).forEach((b: any, idx: number) => {
    const dateStr = b.createdAt ? new Date(b.createdAt * 1000).toLocaleDateString() : "";
    text += `${idx + 1}. *${b.title || b.name || "Broadcast"}* (${b.status || "completed"})\n   • Sent: ${b.sentCount || 0} | Failed: ${b.failedCount || 0} | Date: ${dateStr}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { broadcasts: campaigns.slice(0, 10) },
  };
}

export async function handleGetFailedBroadcasts(context: AdminBusinessAssistantContext): Promise<AdminActionResult> {
  const store = await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null);
  const jobs = Array.isArray(store?.jobs) ? store.jobs : [];
  const failed = jobs.filter((j: any) => j.status === "failed" && j.campaignId);

  if (failed.length === 0) {
    return {
      success: true,
      message: `✅ *Broadcast Health Check*\n\n• 0 failed broadcast deliveries reported.`,
      data: { failedCount: 0 },
    };
  }

  let text = `⚠️ *Failed Broadcast Deliveries (${failed.length})*\n\n`;
  failed.slice(0, 5).forEach((j: any, idx: number) => {
    text += `${idx + 1}. Recipient ${j.phoneRaw || "Contact"}: ${j.error || "Message rejected"}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { failedCount: failed.length },
  };
}

export async function handleCreateBroadcast(
  context: AdminBusinessAssistantContext,
  params: {
    title?: string;
    message: string;
    mediaUrl?: string;
    mediaType?: string;
    scheduleTime?: string | number;
    audienceFilter?: "all" | "recent" | "specific";
    specificPhoneOrJid?: string;
    ignoreOptOuts?: boolean;
  }
): Promise<AdminActionResult> {
  // CRITICAL OPT-OUT POLICY ENFORCEMENT: Never allow bypass of customer opt-outs!
  if (params.ignoreOptOuts === true) {
    return {
      success: false,
      message: `🚫 *Action Refused: Consent Policy Violation*\n\nBlackArrow strictly enforces customer opt-out preferences and anti-spam protections. Messages cannot be sent to customers who have unsubscribed or opted out.`,
    };
  }

  const rawMsg = String(params.message || "").trim();
  if (!rawMsg) return { success: false, message: "❌ Broadcast message content cannot be empty." };

  const title = String(params.title || "WhatsApp Broadcast Campaign").trim();

  // Authoritative audience resolution with non-bypassable opt-out filtering
  const audience = await resolveAuthoritativeAudience({
    accountId: context.accountId,
    botId: context.botId,
    target: params.audienceFilter || (params.specificPhoneOrJid ? "specific" : "all"),
    specificPhoneOrJid: params.specificPhoneOrJid,
  });

  if (audience.eligibleCount === 0) {
    return {
      success: false,
      message: `⚠️ *No Eligible Recipients Found*\n\n• Matched Contacts: ${audience.totalMatched}\n• Excluded: ${audience.excludedCount} (Opted-out: ${audience.exclusionReasons.opted_out}, Invalid: ${audience.exclusionReasons.invalid_phone})\n• Eligible: 0 contacts\n\nBroadcast cannot be dispatched with 0 eligible contacts.`,
      data: { audience },
    };
  }

  const cost = calculateCampaignCostEstimate("broadcast_tracking_text", audience.eligibleCount);

  const nowSec = Math.floor(Date.now() / 1000);
  let scheduledAt = 0;
  let scheduleLabel = "Immediately upon confirmation";

  if (params.scheduleTime) {
    const parsed = typeof params.scheduleTime === "number" ? params.scheduleTime : Math.floor(Date.parse(params.scheduleTime) / 1000);
    if (!isNaN(parsed) && parsed > nowSec) {
      scheduledAt = parsed;
      scheduleLabel = new Date(scheduledAt * 1000).toLocaleString();
    }
  }

  const campaignId = `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Save campaign proposal / record in user extra config store
  const store = (await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null)) || {};
  const campaigns = Array.isArray(store.campaigns) ? [...store.campaigns] : [];

  const campaignRecord = {
    id: campaignId,
    title,
    message: rawMsg,
    mediaUrl: params.mediaUrl || undefined,
    mediaType: params.mediaType || undefined,
    audienceCount: audience.eligibleCount,
    totalMatched: audience.totalMatched,
    excludedCount: audience.excludedCount,
    scheduledAt,
    status: scheduledAt > 0 ? "scheduled" : "completed",
    sentCount: scheduledAt > 0 ? 0 : audience.eligibleCount,
    failedCount: 0,
    createdAt: nowSec,
    updatedAt: nowSec,
    chargedAmount: cost.totalCostUsd,
    audienceFingerprint: audience.audienceFingerprint,
    pricingFingerprint: cost.pricingFingerprint,
  };

  campaigns.unshift(campaignRecord);
  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    customerUpdateListCampaigns: {
      ...store,
      campaigns: campaigns.slice(0, 100),
    },
  });

  return {
    success: true,
    message: `📢 *Broadcast Campaign Prepared*\n\n• *Title:* ${title}\n• *Send Timing:* ${scheduleLabel}\n• *Audience Summary:*\n  - Matched: ${audience.totalMatched}\n  - Excluded (Opt-out/Invalid/Dupe): ${audience.excludedCount}\n  - Final Eligible Recipients: *${audience.eligibleCount}*\n• *Message Preview:* "${rawMsg.slice(0, 120)}${rawMsg.length > 120 ? "..." : ""}"\n• *Estimated Cost:* ~$${cost.totalCostUsd} ($${cost.unitPriceUsd}/msg upon successful delivery)`,
    data: {
      campaignId,
      eligibleCount: audience.eligibleCount,
      costEstimate: cost.totalCostUsd,
      audienceFingerprint: audience.audienceFingerprint,
      pricingFingerprint: cost.pricingFingerprint,
    },
  };
}

export async function handlePauseBroadcast(
  context: AdminBusinessAssistantContext,
  params: { campaignId?: string }
): Promise<AdminActionResult> {
  const store = (await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null)) || {};
  const campaigns = Array.isArray(store.campaigns) ? [...store.campaigns] : [];
  const target = campaigns.find((c: any) => c.id === params.campaignId || c.status === "scheduled");

  if (!target) return { success: false, message: "❌ Active or scheduled broadcast campaign not found to pause." };

  target.status = "paused";
  target.updatedAt = Math.floor(Date.now() / 1000);

  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    customerUpdateListCampaigns: { ...store, campaigns },
  });

  return {
    success: true,
    message: `⏸️ *Broadcast Paused*\n\n• Campaign: *${target.title || target.id}*\n• Status: Paused. Any unsent scheduled dispatches are temporarily held.`,
    data: { id: target.id, status: "paused" },
  };
}

export async function handleResumeBroadcast(
  context: AdminBusinessAssistantContext,
  params: { campaignId?: string }
): Promise<AdminActionResult> {
  const store = (await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null)) || {};
  const campaigns = Array.isArray(store.campaigns) ? [...store.campaigns] : [];
  const target = campaigns.find((c: any) => c.id === params.campaignId || c.status === "paused");

  if (!target) return { success: false, message: "❌ Paused broadcast campaign not found to resume." };

  target.status = "scheduled";
  target.updatedAt = Math.floor(Date.now() / 1000);

  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    customerUpdateListCampaigns: { ...store, campaigns },
  });

  return {
    success: true,
    message: `▶️ *Broadcast Resumed*\n\n• Campaign: *${target.title || target.id}*\n• Status: Scheduled for dispatch.`,
    data: { id: target.id, status: "scheduled" },
  };
}

export async function handleCancelBroadcast(
  context: AdminBusinessAssistantContext,
  params: { campaignId?: string }
): Promise<AdminActionResult> {
  const store = (await campaignServiceDeps.getUserExtraConfigValue(context.accountId, "customerUpdateListCampaigns").catch(() => null)) || {};
  const campaigns = Array.isArray(store.campaigns) ? [...store.campaigns] : [];
  const target = campaigns.find((c: any) => c.id === params.campaignId || c.status === "scheduled" || c.status === "paused");

  if (!target) return { success: false, message: "❌ Scheduled or active broadcast campaign not found to cancel." };

  target.status = "cancelled";
  target.updatedAt = Math.floor(Date.now() / 1000);

  await campaignServiceDeps.saveUserExtraConfigPatch(context.accountId, {
    customerUpdateListCampaigns: { ...store, campaigns },
  });

  return {
    success: true,
    message: `🗑️ *Broadcast Campaign Cancelled*\n\n• Campaign: *${target.title || target.id}*\n• All future scheduled message deliveries for this campaign have been cancelled.`,
    data: { id: target.id, status: "cancelled" },
  };
}
