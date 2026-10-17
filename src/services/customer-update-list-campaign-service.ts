import crypto from "crypto";
import * as dbService from "./db-service.ts";
import { normalizeWhatsAppJid, normalizePhoneDigits, jidToCustomerId } from "../utils/whatsapp-jid.ts";
import { dispatchWebhookEvent } from "./webhook-foundation-service.ts";
import { getCustomerAutoReplyStopState, isCustomerAiPaused } from "./difficult-customer-mode-service.ts";

export const CUSTOMER_UPDATE_LIST_COLLECTIONS = {
  SAVED_RECIPIENT_LISTS: "saved_recipient_lists",
  SAVED_RECIPIENT_LIST_MEMBERS: "saved_recipient_list_members",
  CUSTOMER_UPDATE_CAMPAIGNS: "customer_update_campaigns",
  SCHEDULED_UPDATE_RUNS: "scheduled_update_runs",
  SCHEDULED_UPDATE_RECIPIENT_JOBS: "scheduled_update_recipient_jobs",
  API_MESSAGE_REQUESTS: "api_message_requests",
  MESSAGE_DELIVERY_EVENTS: "message_delivery_events",
} as const;

const STORE_KEY = "customerUpdateListCampaigns";
export const CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS = {
  MAX_SAVED_LIST_IMPORT_RECIPIENTS: 500,
  MAX_QUICK_SEND_RUN_RECIPIENTS: 100,
  MAX_SCHEDULED_RUN_RECIPIENTS: 100,
  MAX_PUBLIC_API_BULK_RECIPIENTS: 100,
  QUEUED_JOB_WINDOW_SECONDS: 10 * 60,
  MAX_QUEUED_JOBS_PER_ACCOUNT_WINDOW: 200,
  DAILY_SEND_JOB_WINDOW_SECONDS: 24 * 60 * 60,
  MAX_LIST_API_SEND_JOBS_PER_ACCOUNT_DAY: 1000,
} as const;

const MAX_LISTS = 100;
const MAX_MEMBERS = 5000;
const MAX_CAMPAIGNS = 250;
const MAX_RUNS = 500;
const MAX_JOBS = 10000;
const MAX_API_REQUESTS = 1000;
const MAX_EVENTS = 2500;
export const MAX_BULK_API_RECIPIENTS = CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_PUBLIC_API_BULK_RECIPIENTS;
export const MAX_LIST_RECIPIENTS = CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SAVED_LIST_IMPORT_RECIPIENTS;
const STALE_SENDING_JOB_TIMEOUT_SECONDS = 15 * 60;
const MAX_RECIPIENT_JOB_ATTEMPTS = 3;

type Store = {
  lists?: any[];
  members?: any[];
  campaigns?: any[];
  runs?: any[];
  jobs?: any[];
  apiMessageRequests?: any[];
  messageDeliveryEvents?: any[];
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function clean(value: any, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function safeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function hashShort(value: any) {
  return crypto.createHash("sha1").update(clean(value, 2000)).digest("hex").slice(0, 16);
}

function normalizeStore(raw: any): Store {
  return {
    lists: Array.isArray(raw?.lists) ? raw.lists : [],
    members: Array.isArray(raw?.members) ? raw.members : [],
    campaigns: Array.isArray(raw?.campaigns) ? raw.campaigns : [],
    runs: Array.isArray(raw?.runs) ? raw.runs : [],
    jobs: Array.isArray(raw?.jobs) ? raw.jobs : [],
    apiMessageRequests: Array.isArray(raw?.apiMessageRequests) ? raw.apiMessageRequests : [],
    messageDeliveryEvents: Array.isArray(raw?.messageDeliveryEvents) ? raw.messageDeliveryEvents : [],
  };
}

export async function loadCustomerUpdateCampaignStore(accountId: string): Promise<Store> {
  return normalizeStore(await dbService.getUserExtraConfigValue(accountId, STORE_KEY).catch(() => null));
}

async function saveStore(accountId: string, store: Store) {
  const next = {
    lists: (store.lists || []).slice(0, MAX_LISTS),
    members: (store.members || []).slice(0, MAX_MEMBERS),
    campaigns: (store.campaigns || []).slice(0, MAX_CAMPAIGNS),
    runs: (store.runs || []).slice(0, MAX_RUNS),
    jobs: (store.jobs || []).slice(0, MAX_JOBS),
    apiMessageRequests: (store.apiMessageRequests || []).slice(0, MAX_API_REQUESTS),
    messageDeliveryEvents: (store.messageDeliveryEvents || []).slice(0, MAX_EVENTS),
  };
  await dbService.saveUserExtraConfigPatch(accountId, { [STORE_KEY]: next });
  return next;
}

async function updateStore(accountId: string, updater: (store: Store) => Store | Promise<Store>) {
  const current = await loadCustomerUpdateCampaignStore(accountId);
  return saveStore(accountId, await updater(current));
}

function splitRecipientEntries(value: any) {
  return String(value || "")
    .split(/[\n,;\t]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function countRecipientEntries(value: any) {
  return splitRecipientEntries(value).length;
}

export function parseRecipientText(value: any, max: number = MAX_LIST_RECIPIENTS) {
  const seen = new Set<string>();
  return splitRecipientEntries(value)
    .slice(0, max)
    .map((phoneRaw) => {
      const jid = normalizeWhatsAppJid(phoneRaw);
      const normalizedPhone = jid.endsWith("@s.whatsapp.net") ? normalizePhoneDigits(jidToCustomerId(jid)) : "";
      const key = normalizedPhone || jid.toLowerCase() || phoneRaw.toLowerCase();
      const duplicate = Boolean(key && seen.has(key));
      if (key) seen.add(key);
      return {
        phoneRaw,
        normalizedPhone,
        jid,
        status: !jid ? "invalid" : duplicate ? "duplicate" : "valid",
      };
    });
}

function publicList(list: any, members: any[] = []) {
  const activeMembers = members.filter((member) => member.listId === list.id && member.status !== "removed");
  const validCount = activeMembers.filter((member) => member.status === "valid").length;
  const invalidCount = activeMembers.filter((member) => member.status === "invalid").length;
  const duplicateCount = activeMembers.filter((member) => member.status === "duplicate").length;
  return {
    ...list,
    memberCount: activeMembers.length,
    validCount,
    invalidCount,
    duplicateCount,
  };
}

export function calculateRunStats(jobs: any[] = []) {
  const stats: any = {
    totalCount: jobs.length,
    pendingCount: 0,
    queuedCount: 0,
    sendingCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    cancelledCount: 0,
  };
  for (const job of jobs) {
    const key = `${job.status || "pending"}Count`;
    stats[key] = Number(stats[key] || 0) + 1;
  }
  return stats;
}

function repeatNextRunAt(previousRunAt: number, repeatRule: string) {
  const base = Number(previousRunAt || nowSeconds());
  if (repeatRule === "daily") return base + 86400;
  if (repeatRule === "weekly") return base + 7 * 86400;
  if (repeatRule === "monthly") return base + 30 * 86400;
  return 0;
}

function maskRecipient(value: any) {
  const text = clean(value, 80);
  if (text.length <= 6) return text ? "***" : "";
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

async function recordEvent(accountId: string, input: any) {
  const event = {
    id: safeId("evt"),
    accountId,
    runId: input.runId || "",
    jobId: input.jobId || "",
    campaignId: input.campaignId || "",
    messageId: input.messageId || "",
    eventType: input.eventType,
    eventAt: nowSeconds(),
    source: input.source || "system",
    metadata: input.metadata || {},
  };
  await updateStore(accountId, (store) => ({
    ...store,
    messageDeliveryEvents: [event, ...(store.messageDeliveryEvents || [])],
  }));
  await dispatchWebhookEvent(accountId, `message.${input.eventType}`, {
    runId: event.runId,
    jobId: event.jobId,
    campaignId: event.campaignId,
    status: input.status || input.eventType,
    messageId: event.messageId,
    recipient: input.recipient ? maskRecipient(input.recipient) : "",
    error: clean(input.error, 180),
  }).catch(() => {});
  return event;
}

export async function getCustomerUpdateListFoundation(accountId: string) {
  const store = await loadCustomerUpdateCampaignStore(accountId);
  const jobs = store.jobs || [];
  const runs = (store.runs || []).map((run) => ({
    ...run,
    ...calculateRunStats(jobs.filter((job) => job.runId === run.id)),
  }));
  const campaigns = (store.campaigns || []).map((campaign) => {
    const campaignJobs = jobs.filter((job) => job.campaignId === campaign.id);
    const stats = calculateRunStats(campaignJobs);
    return {
      ...campaign,
      sentCount: stats.sentCount,
      failedCount: stats.failedCount,
      skippedCount: stats.skippedCount,
      runCount: runs.filter((run) => run.campaignId === campaign.id).length,
    };
  });
  return {
    collections: CUSTOMER_UPDATE_LIST_COLLECTIONS,
    messageSafetyLimits: CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS,
    lists: (store.lists || []).map((list) => publicList(list, store.members)),
    members: store.members || [],
    campaigns,
    runs: runs.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 100),
    jobs: jobs.slice(0, 500),
    apiMessageRequests: store.apiMessageRequests || [],
    messageDeliveryEvents: (store.messageDeliveryEvents || []).slice(0, 100),
  };
}

export async function createSavedRecipientList(accountId: string, input: any) {
  const rawRecipients = input?.recipients || input?.numbers || "";
  const rawCount = countRecipientEntries(rawRecipients);
  if (rawCount > CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SAVED_LIST_IMPORT_RECIPIENTS) {
    throw new Error(`Saved lists are limited to ${CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SAVED_LIST_IMPORT_RECIPIENTS} recipients per import.`);
  }
  const parsed = parseRecipientText(rawRecipients);
  if (parsed.length === 0) throw new Error("Paste at least one recipient.");
  const timestamp = nowSeconds();
  const list = {
    id: safeId("list"),
    accountId,
    name: clean(input?.name || "Saved list", 100),
    description: clean(input?.description, 300),
    memberCount: parsed.length,
    validCount: parsed.filter((item) => item.status === "valid").length,
    invalidCount: parsed.filter((item) => item.status === "invalid").length,
    createdBy: input?.createdBy || "dashboard",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const members = parsed.map((item) => ({
    id: safeId("member"),
    accountId,
    listId: list.id,
    phoneRaw: item.phoneRaw,
    normalizedPhone: item.normalizedPhone,
    jid: item.jid,
    displayName: "",
    status: item.status,
    source: input?.source || "paste",
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const next = await updateStore(accountId, (store) => ({
    ...store,
    lists: [list, ...(store.lists || [])],
    members: [...members, ...(store.members || [])],
  }));
  return { list: publicList(list, next.members), members };
}

export async function removeSavedListMember(accountId: string, listId: string, memberId: string) {
  await updateStore(accountId, (store) => ({
    ...store,
    members: (store.members || []).map((member) => member.listId === listId && member.id === memberId ? { ...member, status: "removed", updatedAt: nowSeconds() } : member),
  }));
  return { success: true };
}

async function resolveOwnedBot(accountId: string, botId: any) {
  const bots = await dbService.getBotsByUser(accountId).catch(() => []) as any[];
  const selected = clean(botId) || clean(bots[0]?.$id || bots[0]?.id);
  const bot = bots.find((item) => clean(item.$id || item.id) === selected || clean(item.jid) === selected);
  if (!bot) throw new Error("Select a valid account instance.");
  return { bot, botId: clean(bot.$id || bot.id), botJid: clean(bot.jid) };
}

function getValidActiveMemberCount(store: Store, listId: string) {
  return (store.members || []).filter((member) => member.listId === listId && member.status !== "removed" && member.status === "valid" && member.jid).length;
}

function ensureRunRecipientCap(store: Store, listId: string, cap: number) {
  const count = getValidActiveMemberCount(store, listId);
  if (count > cap) throw new Error(`This send is limited to ${cap} valid recipients per run. Split the list into smaller batches.`);
  return count;
}

function ensureQueuedJobCapacity(store: Store, nextJobCount: number, timestamp = nowSeconds()) {
  const recentSince = timestamp - CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.QUEUED_JOB_WINDOW_SECONDS;
  const dailySince = timestamp - CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.DAILY_SEND_JOB_WINDOW_SECONDS;
  const jobs = store.jobs || [];
  const recentQueued = jobs.filter((job) => ["pending", "queued", "sending"].includes(job.status) && Number(job.createdAt || 0) >= recentSince).length;
  if (recentQueued + nextJobCount > CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_QUEUED_JOBS_PER_ACCOUNT_WINDOW) {
    throw new Error(`Too many message jobs are queued right now. Wait a few minutes before queueing more.`);
  }
  const dailyJobs = jobs.filter((job) => ["dashboard", "api"].includes(job.createdBy) && Number(job.createdAt || 0) >= dailySince).length;
  if (dailyJobs + nextJobCount > CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_LIST_API_SEND_JOBS_PER_ACCOUNT_DAY) {
    throw new Error(`Daily list/API send safety cap reached. Try again tomorrow or use smaller batches.`);
  }
}

function profileBlocksListMessage(profile: any) {
  const stopState = getCustomerAutoReplyStopState(profile || {});
  if (stopState.isStopped) {
    if (stopState.kind === "admin_pause_permanent") return "customer_permanently_stopped";
    if (stopState.kind === "manual_review" || stopState.kind === "irrelevant_pause") return "manual_review_required";
    return "customer_auto_reply_stopped";
  }
  if (isCustomerAiPaused(profile || {})) return "manual_review_required";
  if (profile?.blocked === true || profile?.isBlocked === true || profile?.customerBlocked === true || profile?.status === "blocked") return "customer_blocked";
  if (profile?.unsubscribed === true || profile?.optedOut === true || profile?.marketingOptOut === true) return "customer_opted_out";
  return "";
}

async function getRecipientSkipReason(accountId: string, botJid: string, member: any) {
  if (member.status !== "valid" || !member.jid) return member.status === "duplicate" ? "duplicate_recipient_in_run" : "invalid_recipient";
  if (!botJid) return "";
  const profile = await dbService.getCustomerProfile(botJid, member.jid).catch(() => null);
  if (!profile) return "";
  return profileBlocksListMessage(profile);
}

function buildJob(input: any) {
  const timestamp = nowSeconds();
  const idempotencyKey = input.idempotencyKey || `cu-list:${input.runId}:${input.jid || input.phoneRaw}:${hashShort(input.messageText)}`;
  return {
    id: safeId("job"),
    accountId: input.accountId,
    campaignId: input.campaignId,
    runId: input.runId,
    botId: input.botId,
    listId: input.listId || "",
    phoneRaw: input.phoneRaw || "",
    normalizedPhone: input.normalizedPhone || "",
    jid: input.jid || "",
    messageText: clean(input.messageText, 1200),
    status: input.status || "pending",
    attemptCount: 0,
    lastError: input.lastError || "",
    whatsAppMessageId: "",
    outboundReceiptId: "",
    billingDedupeKey: "",
    idempotencyKey,
    createdBy: input.createdBy || "dashboard",
    sentAt: 0,
    failedAt: 0,
    deliveredAt: null,
    readAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function hasJobSendEvidence(job: any) {
  return Boolean(clean(job?.whatsAppMessageId) || clean(job?.messageId) || Number(job?.sentAt || 0) > 0);
}

async function createRunForCampaign(accountId: string, campaign: any, runAt: number, existingStore?: Store) {
  const store = existingStore || await loadCustomerUpdateCampaignStore(accountId);
  const timestamp = nowSeconds();
  const activeMembers = (store.members || []).filter((member) => member.listId === campaign.listId && member.status !== "removed");
  const validSeen = new Set<string>();
  const run = {
    id: safeId("run"),
    accountId,
    campaignId: campaign.id,
    listId: campaign.listId,
    botId: campaign.botId,
    runAt,
    status: runAt <= timestamp ? "queued" : "pending",
    totalCount: activeMembers.length,
    queuedCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    createdAt: timestamp,
    startedAt: 0,
    completedAt: 0,
  };
  const jobs: any[] = [];
  for (const member of activeMembers) {
    const key = member.normalizedPhone || member.jid || member.phoneRaw;
    const duplicateInRun = Boolean(key && validSeen.has(key));
    if (key) validSeen.add(key);
    const safetySkipReason = duplicateInRun ? "duplicate_recipient_in_run" : await getRecipientSkipReason(accountId, campaign.botJid || "", member);
    const valid = member.status === "valid" && member.jid && !safetySkipReason;
    jobs.push(buildJob({
      accountId,
      campaignId: campaign.id,
      runId: run.id,
      botId: campaign.botId,
      listId: campaign.listId,
      phoneRaw: member.phoneRaw,
      normalizedPhone: member.normalizedPhone,
      jid: member.jid,
      messageText: campaign.messageText,
      status: valid ? (runAt <= timestamp ? "queued" : "pending") : "skipped",
      lastError: valid ? "" : safetySkipReason || "invalid_recipient",
      createdBy: campaign.createdBy,
    }));
  }
  const stats = calculateRunStats(jobs);
  return { run: { ...run, ...stats }, jobs };
}

export async function createListCampaign(accountId: string, input: any) {
  const messageText = clean(input?.messageText, 1200);
  if (!messageText) throw new Error("Message text is required.");
  const store = await loadCustomerUpdateCampaignStore(accountId);
  const listId = clean(input?.listId);
  const list = (store.lists || []).find((item) => item.id === listId);
  if (!list) throw new Error("Saved list not found.");
  const { botId, botJid } = await resolveOwnedBot(accountId, input?.botId);
  const timestamp = nowSeconds();
  const repeatRule = clean(input?.repeatRule, 30);
  const runAt = Math.max(timestamp, Number(input?.runAt || timestamp));
  const existing = input?.idempotencyKey
    ? (store.campaigns || []).find((campaign) => campaign.idempotencyKey === clean(input.idempotencyKey, 160))
    : null;
  if (existing) {
    const existingRuns = (store.runs || []).filter((run) => run.campaignId === existing.id);
    return { campaign: existing, run: existingRuns[0] || null, jobs: (store.jobs || []).filter((job) => job.campaignId === existing.id) };
  }
  const campaign = {
    id: safeId("camp"),
    accountId,
    botId,
    botJid,
    listId,
    messageText,
    repeatRule: repeatRule === "daily" || repeatRule === "weekly" || repeatRule === "monthly" ? repeatRule : "",
    nextRunAt: runAt,
    status: runAt <= timestamp ? "running" : "scheduled",
    createdBy: input?.createdBy || "dashboard",
    idempotencyKey: clean(input?.idempotencyKey, 160),
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    runCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const runCap = runAt <= timestamp ? CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_QUICK_SEND_RUN_RECIPIENTS : CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SCHEDULED_RUN_RECIPIENTS;
  const validRecipientCount = ensureRunRecipientCap(store, listId, runCap);
  ensureQueuedJobCapacity(store, validRecipientCount, timestamp);
  const { run, jobs } = await createRunForCampaign(accountId, campaign, runAt, store);
  await saveStore(accountId, {
    ...store,
    campaigns: [campaign, ...(store.campaigns || [])],
    runs: [run, ...(store.runs || [])],
    jobs: [...jobs, ...(store.jobs || [])],
  });
  await recordEvent(accountId, { eventType: "queued", source: campaign.createdBy, runId: run.id, campaignId: campaign.id, status: run.status });
  await dispatchWebhookEvent(accountId, "campaign.run.created", { runId: run.id, campaignId: campaign.id, status: run.status }).catch(() => {});
  return { campaign, run, jobs };
}

export async function createApiMessageRequest(accountId: string, apiKeyId: string, input: any, bulk = false) {
  const recipients = bulk ? (Array.isArray(input?.recipients) ? input.recipients : []) : [input?.to || input?.recipient];
  const timestamp = nowSeconds();
  const idempotencyKey = clean(input?.idempotencyKey || input?.idempotency_key || "");
  if (!idempotencyKey) throw new Error("idempotencyKey is required.");
  const store = await loadCustomerUpdateCampaignStore(accountId);
  const existingRequest = idempotencyKey ? (store.apiMessageRequests || []).find((request) => request.idempotencyKey === idempotencyKey) : null;
  if (existingRequest) {
    return {
      request: existingRequest,
      run: (store.runs || []).find((run) => run.id === existingRequest.runId) || null,
      jobs: (store.jobs || []).filter((job) => job.runId === existingRequest.runId || job.id === existingRequest.jobId),
      duplicate: true,
    };
  }
  if (recipients.length === 0) throw new Error("At least one recipient is required.");
  if (bulk && recipients.length > MAX_BULK_API_RECIPIENTS) throw new Error(`Bulk API requests are limited to ${MAX_BULK_API_RECIPIENTS} recipients.`);
  const parsed = parseRecipientText(recipients.join("\n"), MAX_BULK_API_RECIPIENTS);
  if (!clean(input?.botId || input?.instanceId)) throw new Error("botId or instanceId is required.");
  const list = {
    id: safeId("api_list"),
    accountId,
    name: bulk ? "API bulk message" : "API message",
    description: "Temporary API recipient list",
    memberCount: parsed.length,
    validCount: parsed.filter((item) => item.status === "valid").length,
    invalidCount: parsed.filter((item) => item.status === "invalid").length,
    createdBy: "api",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const members = parsed.map((item) => ({
    id: safeId("member"),
    accountId,
    listId: list.id,
    phoneRaw: item.phoneRaw,
    normalizedPhone: item.normalizedPhone,
    jid: item.jid,
    displayName: "",
    status: item.status,
    source: "api",
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  ensureQueuedJobCapacity(store, parsed.filter((item) => item.status === "valid").length, timestamp);
  await saveStore(accountId, {
    ...store,
    lists: [list, ...(store.lists || [])],
    members: [...members, ...(store.members || [])],
  });
  const campaignResult = await createListCampaign(accountId, {
    listId: list.id,
    botId: input?.botId || input?.instanceId,
    messageText: input?.messageText || input?.text || input?.message,
    runAt: nowSeconds(),
    createdBy: "api",
    idempotencyKey,
  });
  const request = {
    id: safeId("api_req"),
    accountId,
    apiKeyId,
    botId: campaignResult.campaign.botId,
    runId: campaignResult.run.id,
    jobId: bulk ? "" : campaignResult.jobs[0]?.id || "",
    status: "queued",
    idempotencyKey,
    safePayloadSummary: {
      recipientCount: recipients.length,
      validCount: parsed.filter((item) => item.status === "valid").length,
      textHash: hashShort(input?.messageText || input?.text || input?.message),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await updateStore(accountId, (nextStore) => ({ ...nextStore, apiMessageRequests: [request, ...(nextStore.apiMessageRequests || [])] }));
  await recordEvent(accountId, { eventType: "requested", source: "api", runId: request.runId, jobId: request.jobId, status: "queued" });
  return { request, ...campaignResult, duplicate: false };
}

export async function getRunStatus(accountId: string, runId: string) {
  const store = await loadCustomerUpdateCampaignStore(accountId);
  const run = (store.runs || []).find((item) => item.id === runId);
  if (!run) return null;
  const jobs = (store.jobs || []).filter((job) => job.runId === runId);
  return { run: { ...run, ...calculateRunStats(jobs) }, jobs };
}

export async function getMessageJobStatus(accountId: string, jobId: string) {
  const store = await loadCustomerUpdateCampaignStore(accountId);
  return (store.jobs || []).find((job) => job.id === jobId) || null;
}

export async function updateCampaignStatus(accountId: string, campaignId: string, status: "paused" | "cancelled") {
  await updateStore(accountId, (store) => ({
    ...store,
    campaigns: (store.campaigns || []).map((campaign) => campaign.id === campaignId ? { ...campaign, status, updatedAt: nowSeconds() } : campaign),
    runs: status === "cancelled" ? (store.runs || []).map((run) => run.campaignId === campaignId && ["pending", "queued"].includes(run.status) ? { ...run, status: "cancelled", completedAt: nowSeconds() } : run) : store.runs,
    jobs: status === "cancelled" ? (store.jobs || []).map((job) => job.campaignId === campaignId && ["pending", "queued"].includes(job.status) ? { ...job, status: "cancelled", updatedAt: nowSeconds() } : job) : store.jobs,
  }));
  return { success: true };
}

async function materializeDueRecurringRuns(accountId: string, store: Store, timestamp = nowSeconds()) {
  const additions: { run: any; jobs: any[]; campaignId: string; nextRunAt: number }[] = [];
  const advances: { campaignId: string; nextRunAt: number }[] = [];
  for (const campaign of store.campaigns || []) {
    if (!campaign.repeatRule || !["scheduled", "running"].includes(campaign.status)) continue;
    let runAt = Number(campaign.nextRunAt || 0);
    if (!runAt || runAt > timestamp) continue;

    let advanced = false;
    for (let guard = 0; runAt && runAt <= timestamp && guard < 400; guard += 1) {
      const existingDueRun = (store.runs || []).some((run) => run.campaignId === campaign.id && Number(run.runAt) === runAt)
        || additions.some((item) => item.campaignId === campaign.id && Number(item.run.runAt) === runAt);
      const followingRunAt = repeatNextRunAt(runAt, campaign.repeatRule);
      if (!existingDueRun) {
        const validRecipientCount = ensureRunRecipientCap(store, campaign.listId, CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SCHEDULED_RUN_RECIPIENTS);
        ensureQueuedJobCapacity({ ...store, jobs: [...(additions.flatMap((item) => item.jobs)), ...(store.jobs || [])] }, validRecipientCount, timestamp);
        const created = await createRunForCampaign(accountId, campaign, runAt, store);
        additions.push({ ...created, campaignId: campaign.id, nextRunAt: followingRunAt });
        advanced = true;
        break;
      }
      runAt = followingRunAt;
      advanced = true;
    }

    if (advanced && !additions.some((item) => item.campaignId === campaign.id)) {
      advances.push({ campaignId: campaign.id, nextRunAt: runAt });
    }
  }
  if (additions.length === 0 && advances.length === 0) return store;
  return {
    ...store,
    campaigns: (store.campaigns || []).map((campaign) => {
      const addition = additions.find((item) => item.campaignId === campaign.id);
      if (addition) return { ...campaign, nextRunAt: addition.nextRunAt, runCount: Number(campaign.runCount || 0) + 1, updatedAt: timestamp };
      const advance = advances.find((item) => item.campaignId === campaign.id);
      return advance ? { ...campaign, nextRunAt: advance.nextRunAt, updatedAt: timestamp } : campaign;
    }),
    runs: [...additions.map((item) => item.run), ...(store.runs || [])],
    jobs: [...additions.flatMap((item) => item.jobs), ...(store.jobs || [])],
  };
}

function refreshAffectedRunAndCampaignStats(store: Store, affectedRunIds: Set<string>, timestamp = nowSeconds()) {
  if (affectedRunIds.size === 0) return store;
  const affectedCampaignIds = new Set<string>();
  for (const run of store.runs || []) {
    if (affectedRunIds.has(run.id)) affectedCampaignIds.add(run.campaignId);
  }
  for (const job of store.jobs || []) {
    if (affectedRunIds.has(job.runId)) affectedCampaignIds.add(job.campaignId);
  }
  return {
    ...store,
    runs: (store.runs || []).map((run) => {
      if (!affectedRunIds.has(run.id)) return run;
      const jobs = (store.jobs || []).filter((job) => job.runId === run.id);
      const stats = calculateRunStats(jobs);
      const terminal = jobs.every((job) => ["sent", "failed", "skipped", "cancelled"].includes(job.status));
      return { ...run, ...stats, status: terminal ? "completed" : run.status, completedAt: terminal ? (run.completedAt || timestamp) : run.completedAt };
    }),
    campaigns: (store.campaigns || []).map((campaign) => {
      if (!affectedCampaignIds.has(campaign.id)) return campaign;
      const jobs = (store.jobs || []).filter((job) => job.campaignId === campaign.id);
      const stats = calculateRunStats(jobs);
      const terminal = jobs.length > 0 && jobs.every((job) => ["sent", "failed", "skipped", "cancelled"].includes(job.status));
      return {
        ...campaign,
        sentCount: stats.sentCount,
        failedCount: stats.failedCount,
        skippedCount: stats.skippedCount,
        status: campaign.repeatRule ? campaign.status : terminal ? "completed" : campaign.status,
        updatedAt: timestamp,
      };
    }),
  };
}

function recoverStaleSendingJobs(store: Store, timestamp = nowSeconds()) {
  const staleBefore = timestamp - STALE_SENDING_JOB_TIMEOUT_SECONDS;
  const runById = new Map((store.runs || []).map((run) => [run.id, run]));
  const affectedRunIds = new Set<string>();
  const jobs = (store.jobs || []).map((job) => {
    if (job.status !== "sending" || hasJobSendEvidence(job)) return job;
    const updatedAt = Number(job.updatedAt || job.startedAt || job.createdAt || 0);
    if (!updatedAt || updatedAt > staleBefore) return job;
    affectedRunIds.add(job.runId);
    if (Number(job.attemptCount || 0) >= MAX_RECIPIENT_JOB_ATTEMPTS) {
      return {
        ...job,
        status: "failed",
        lastError: "stale_sending_recovery_max_attempts",
        failedAt: job.failedAt || timestamp,
        updatedAt: timestamp,
      };
    }
    const run = runById.get(job.runId);
    return {
      ...job,
      status: Number(run?.runAt || 0) <= timestamp ? "queued" : "pending",
      lastError: "stale_sending_recovered_no_send_evidence",
      updatedAt: timestamp,
    };
  });
  if (affectedRunIds.size === 0) return store;
  return refreshAffectedRunAndCampaignStats({ ...store, jobs }, affectedRunIds, timestamp);
}

export async function claimDueRecipientJobs(accountId: string, botId: string, limit = 3) {
  const timestamp = nowSeconds();
  let claimed: any[] = [];
  await updateStore(accountId, async (store) => {
    const withRecurring = await materializeDueRecurringRuns(accountId, store, timestamp);
    const recovered = recoverStaleSendingJobs(withRecurring, timestamp);
    const dueRunIds = new Set((recovered.runs || [])
      .filter((run) => ["pending", "queued", "running"].includes(run.status) && Number(run.runAt || 0) <= timestamp)
      .map((run) => run.id));
    claimed = (recovered.jobs || [])
      .filter((job) => dueRunIds.has(job.runId) && ["pending", "queued"].includes(job.status) && job.botId === botId)
      .slice(0, limit);
    const claimedIds = new Set(claimed.map((job) => job.id));
    return {
      ...recovered,
      runs: (recovered.runs || []).map((run) => dueRunIds.has(run.id) ? { ...run, status: "running", startedAt: run.startedAt || timestamp } : run),
      jobs: (recovered.jobs || []).map((job) => claimedIds.has(job.id) ? { ...job, status: "sending", attemptCount: Number(job.attemptCount || 0) + 1, updatedAt: timestamp } : job),
    };
  });
  return claimed.map((job) => ({ ...job, status: "sending", attemptCount: Number(job.attemptCount || 0) + 1 }));
}

async function refreshRunAndCampaign(accountId: string, store: Store, runId: string, campaignId: string) {
  const jobs = (store.jobs || []).filter((job) => job.runId === runId);
  const stats = calculateRunStats(jobs);
  const terminal = jobs.every((job) => ["sent", "failed", "skipped", "cancelled"].includes(job.status));
  const timestamp = nowSeconds();
  return {
    ...store,
    runs: (store.runs || []).map((run) => run.id === runId ? {
      ...run,
      ...stats,
      status: terminal ? "completed" : run.status,
      completedAt: terminal ? (run.completedAt || timestamp) : run.completedAt,
    } : run),
    campaigns: (store.campaigns || []).map((campaign) => {
      if (campaign.id !== campaignId) return campaign;
      const campaignJobs = (store.jobs || []).filter((job) => job.campaignId === campaignId);
      const campaignStats = calculateRunStats(campaignJobs);
      return {
        ...campaign,
        sentCount: campaignStats.sentCount,
        failedCount: campaignStats.failedCount,
        skippedCount: campaignStats.skippedCount,
        status: campaign.repeatRule ? campaign.status : terminal ? "completed" : campaign.status,
        updatedAt: timestamp,
      };
    }),
  };
}

export async function markRecipientJobResult(accountId: string, jobId: string, result: {
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  receiptId?: string;
  billingDedupeKey?: string;
  error?: string;
}) {
  let updatedJob: any = null;
  await updateStore(accountId, async (store) => {
    const timestamp = nowSeconds();
    const jobs = (store.jobs || []).map((job) => {
      if (job.id !== jobId) return job;
      updatedJob = {
        ...job,
        status: result.status,
        lastError: clean(result.error, 240),
        whatsAppMessageId: clean(result.messageId),
        outboundReceiptId: clean(result.receiptId),
        billingDedupeKey: clean(result.billingDedupeKey),
        sentAt: result.status === "sent" ? timestamp : job.sentAt,
        failedAt: result.status === "failed" ? timestamp : job.failedAt,
        updatedAt: timestamp,
      };
      return updatedJob;
    });
    return refreshRunAndCampaign(accountId, { ...store, jobs }, updatedJob?.runId, updatedJob?.campaignId);
  });
  if (updatedJob) {
    await recordEvent(accountId, {
      eventType: result.status,
      source: "worker",
      runId: updatedJob.runId,
      jobId: updatedJob.id,
      campaignId: updatedJob.campaignId,
      messageId: result.messageId || "",
      status: result.status,
      recipient: updatedJob.normalizedPhone || updatedJob.jid,
      error: result.error || "",
    });
    if (["sent", "failed", "skipped"].includes(result.status)) {
      const runStatus = await getRunStatus(accountId, updatedJob.runId);
      if (runStatus?.run?.status === "completed") {
        await dispatchWebhookEvent(accountId, "campaign.run.completed", {
          runId: updatedJob.runId,
          campaignId: updatedJob.campaignId,
          status: "completed",
          stats: calculateRunStats(runStatus.jobs),
        }).catch(() => {});
      }
    }
  }
  return updatedJob;
}

export const __customerUpdateListCampaignTestUtils = {
  parseRecipientText,
  countRecipientEntries,
  calculateRunStats,
  repeatNextRunAt,
  maskRecipient,
  materializeDueRecurringRuns,
  recoverStaleSendingJobs,
  STALE_SENDING_JOB_TIMEOUT_SECONDS,
  MAX_RECIPIENT_JOB_ATTEMPTS,
  ensureQueuedJobCapacity,
  profileBlocksListMessage,
};
