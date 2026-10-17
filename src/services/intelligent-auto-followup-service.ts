import crypto from "crypto";
import { formatInternationalPhone, getCustomerContactIdentity } from "../utils/contact-identity.ts";
import { resolveCustomerChatJid } from "../utils/whatsapp-jid.ts";
import { compactAiText } from "./ai-cost-control-service.ts";
import { previewBillableOutboundText } from "./outbound-message-billing-service.ts";
import { CONCISE_WHATSAPP_REPLY_RULES } from "./reply-style-service.ts";
import { composeImplicitCacheInstruction } from "./gemini-cache-service.ts";
import { generateBackendText, type AiTextProviderInput, type AiTextProviderResult } from "./ai-text-provider-service.ts";
import { buildCustomer360PromptSection } from "./customer-bot-prompt-service.ts";
import { checkFollowupStaleByLastMessage } from "./followup-stale-guard-service.ts";
import { resolveCustomerIdentity, resolveCanonicalCustomerIdForAlias } from "./customer-identity-resolver-service.ts";
import { acquireAtomicClaim, releaseAtomicClaim, __clearMemoryClaimsForTest } from "./canonical-claim-service.ts";
import {
  recordSuccessfulCustomerTurnAiCall,
  recordSuccessfulCustomerTurnAiCallAsync,
  getTurnExtraAiCallsCount,
  getTurnExtraAiCallsCountAsync,
  calculateCustomerTurnBilling,
  calculateCustomerTurnBillingAsync,
  getSuccessfulCustomerTurnAiCallsCount,
  getSuccessfulCustomerTurnAiCallsCountAsync,
  clearCustomerTurnAiCalls,
} from "./customer-turn-ai-call-ledger-service.ts";

function clean(value: any): string {
  return String(value || "").trim();
}

export type AutoFollowupState =
  | "SCHEDULED"
  | "CLAIMED"
  | "EVALUATING"
  | "NOT_REQUIRED"
  | "SENT"
  | "CANCELLED"
  | "CANCELLED_BY_CUSTOMER_REPLY"
  | "COMPLETED"
  | "STOPPED";

export interface PersistedAutoFollowupSchedule {
  id: string;
  accountId: string;
  botId: string;
  canonicalCustomerId: string;
  conversationId: string;
  attemptIndex: number;
  logicalFollowupTurnId: string;
  scheduledAt: number;
  state: AutoFollowupState;
  deliveryIdentity: string;
  revision: number;

  createdAt: number;
  lastFollowupAt: number;
  nextFollowupAt: number;
  followupState: AutoFollowupState;
  currentObjective: string;
  decisionReason: string;
  lockedByWorker?: string;
  lockExpiresAt?: number;
  customerJid: string;
  lastCustomerMessageText?: string;
  lastCustomerMessageAt?: number;
  lastBotReplyText?: string;
  lastBotReplyAt?: number;
  isCommunicationOptOut?: boolean;
  isProductDisinterest?: boolean;
  draftFollowupText?: string;
}

// ---------------------------------------------------------------------------
// Canonical Durable Persistence (Appwrite SYSTEM_CONFIGS Backed)
// ---------------------------------------------------------------------------

type FollowupPersistenceDeps = {
  getSystemConfig: (key: string) => Promise<string | null>;
  setSystemConfig: (key: string, value: string) => Promise<void>;
};

let followupDeps: Partial<FollowupPersistenceDeps> | null = null;
const volatileFollowupStore = new Map<string, string>();
const scheduleStore = new Map<string, PersistedAutoFollowupSchedule>();

export function __setAutoFollowupPersistenceDeps(overrides: Partial<FollowupPersistenceDeps> | null) {
  followupDeps = overrides;
  if (!overrides) {
    volatileFollowupStore.clear();
  }
}

export function __resetAutoFollowupPersistenceDeps(inMemory = true) {
  if (inMemory) {
    followupDeps = {
      getSystemConfig: async (key: string) => volatileFollowupStore.get(key) || null,
      setSystemConfig: async (key: string, value: string) => {
        volatileFollowupStore.set(key, value);
      },
    };
  } else {
    followupDeps = null;
  }
  volatileFollowupStore.clear();
}

async function resolveFollowupPersistenceDeps(): Promise<FollowupPersistenceDeps> {
  if (followupDeps?.getSystemConfig && followupDeps?.setSystemConfig) {
    return followupDeps as FollowupPersistenceDeps;
  }
  try {
    const dbService = await import("./db-service.ts");
    const getFn = (dbService as any).getSystemConfig || (dbService as any).getGlobalSetting;
    const setFn = (dbService as any).setSystemConfig || (dbService as any).setGlobalSetting;
    return {
      getSystemConfig: getFn ? getFn.bind(dbService) : (async (k: string) => volatileFollowupStore.get(k) || null),
      setSystemConfig: setFn ? setFn.bind(dbService) : (async (k: string, v: string) => { volatileFollowupStore.set(k, v); }),
    };
  } catch {
    return {
      getSystemConfig: async (key: string) => volatileFollowupStore.get(key) || null,
      setSystemConfig: async (key: string, value: string) => {
        volatileFollowupStore.set(key, value);
      },
    };
  }
}

export type AutoFollowupLogState =
  | "SCHEDULED"
  | "CLAIMED"
  | "EVALUATING"
  | "NOT_REQUIRED"
  | "CANCELLED_BY_CUSTOMER_REPLY"
  | "GOAL_COMPLETED"
  | "BILLING_BLOCKED"
  | "ACCESS_BLOCKED"
  | "MISSING_DELIVERY_IDENTITY"
  | "PERSISTENCE_FAILED"
  | "DELIVERED"
  | "FAILED"
  | "STOPPED"
  | "COMPLETED"
  | "SENT"
  | "CANCELLED"
  | "LOG";

export interface AutoFollowupLogEntry {
  id: string;
  botId: string;
  accountId?: string;
  customerJid: string;
  canonicalCustomerId?: string;
  scheduleId: string;
  state: AutoFollowupLogState;
  action: string;
  reason?: string;
  timestamp: number;
  attemptIndex?: number;
  messageText?: string;
}

export function buildAutoFollowupLogsKey(botId?: string): string {
  return `auto_followup_logs:${getSafeBotKey(botId)}`;
}

export function buildScheduleIndexKey(botId?: string): string {
  return `fup_idx:${getSafeBotKey(botId)}`;
}

export async function recordAutoFollowupLog(entry: Omit<AutoFollowupLogEntry, "id">): Promise<void> {
  const deps = await resolveFollowupPersistenceDeps();
  const key = buildAutoFollowupLogsKey(entry.botId);
  const logId = `afl_${entry.scheduleId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const record: AutoFollowupLogEntry = { ...entry, id: logId };

  try {
    // 1. Store individual granular log document in SYSTEM_CONFIGS
    await deps.setSystemConfig(logId, JSON.stringify(record));
    volatileFollowupStore.set(logId, JSON.stringify(record));

    // 2. Append to rolling log list for retrieval
    const raw = volatileFollowupStore.get(key) || await deps.getSystemConfig(key);
    let logs: AutoFollowupLogEntry[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) logs = parsed;
      } catch {}
    }
    logs.unshift(record);
    if (logs.length > 200) logs = logs.slice(0, 200);
    const json = JSON.stringify(logs);
    volatileFollowupStore.set(key, json);
    await deps.setSystemConfig(key, json);
  } catch (err) {
    console.error("[AutoFollowup] Failed to record log:", err);
  }
}

export async function listAutoFollowupLogs(botId: string, limit = 100): Promise<AutoFollowupLogEntry[]> {
  const deps = await resolveFollowupPersistenceDeps();
  const key = buildAutoFollowupLogsKey(botId);
  try {
    const raw = volatileFollowupStore.get(key) || await deps.getSystemConfig(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(0, limit);
    return [];
  } catch (err) {
    console.error("[AutoFollowup] Failed to list logs:", err);
    return [];
  }
}

function getSafeBotKey(botId?: string): string {
  const safeBot = String(botId || "global").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return safeBot;
}

function buildStorageKey(botId?: string): string {
  return `auto_followup_schedules:${getSafeBotKey(botId)}`;
}

export function buildGranularFollowupScheduleDocId(
  botId: string,
  canonicalCustomerId: string,
  objectiveOrConvId: string = "default"
): string {
  const normBot = String(botId || "").trim();
  const normCust = String(canonicalCustomerId || "").trim();
  const normObj = String(objectiveOrConvId || "default").trim();
  const hash = crypto.createHash("sha256").update(`${normBot}:${normCust}:${normObj}`).digest("hex").slice(0, 26);
  return `fup_${hash}`;
}

export async function saveGranularFollowupSchedule(schedule: PersistedAutoFollowupSchedule): Promise<void> {
  const deps = await resolveFollowupPersistenceDeps();
  const docId = buildGranularFollowupScheduleDocId(
    schedule.botId,
    schedule.canonicalCustomerId || schedule.customerJid,
    schedule.currentObjective || "default"
  );
  const json = JSON.stringify(schedule);
  volatileFollowupStore.set(docId, json);
  await deps.setSystemConfig(docId, json);

  // Maintain granular index of schedule IDs
  const indexKey = buildScheduleIndexKey(schedule.botId);
  try {
    const rawIdx = volatileFollowupStore.get(indexKey) || await deps.getSystemConfig(indexKey);
    let ids: string[] = [];
    if (rawIdx) {
      try {
        const parsed = JSON.parse(rawIdx);
        if (Array.isArray(parsed)) ids = parsed;
      } catch {}
    }
    if (!ids.includes(docId)) {
      ids.push(docId);
      const idxJson = JSON.stringify(ids);
      volatileFollowupStore.set(indexKey, idxJson);
      await deps.setSystemConfig(indexKey, idxJson);
    }
  } catch (err) {
    console.error("[AutoFollowup] Failed to update schedule index:", err);
  }
}

export async function loadGranularFollowupSchedule(
  botId: string,
  customerJidOrCanonicalId: string,
  objectiveOrConvId: string = "default"
): Promise<PersistedAutoFollowupSchedule | null> {
  const deps = await resolveFollowupPersistenceDeps();
  const canonicalId = resolveCanonicalIdForFollowup(botId, customerJidOrCanonicalId);
  const docId = buildGranularFollowupScheduleDocId(botId, canonicalId, objectiveOrConvId);
  const raw = volatileFollowupStore.get(docId) || await deps.getSystemConfig(docId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadPersistedAutoFollowupSchedules(botId?: string, force = false): void {
  // Check index key
  const indexKey = buildScheduleIndexKey(botId);
  const rawIdx = volatileFollowupStore.get(indexKey);
  if (rawIdx) {
    try {
      const ids = JSON.parse(rawIdx);
      if (Array.isArray(ids)) {
        for (const docId of ids) {
          const rawDoc = volatileFollowupStore.get(docId);
          if (rawDoc) {
            const item = JSON.parse(rawDoc);
            if (item?.id && (force || !scheduleStore.has(item.id))) {
              scheduleStore.set(item.id, item);
            }
          }
        }
      }
    } catch {}
  }

  // Also check legacy storageKey
  const storageKey = buildStorageKey(botId);
  const raw = volatileFollowupStore.get(storageKey);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.id && (force || !scheduleStore.has(item.id))) {
            scheduleStore.set(item.id, item);
          }
        }
      }
    } catch {}
  }
}

export async function loadPersistedAutoFollowupSchedulesAsync(botId?: string, force = false): Promise<void> {
  const deps = await resolveFollowupPersistenceDeps();
  const indexKey = buildScheduleIndexKey(botId);
  try {
    const rawIdx = volatileFollowupStore.get(indexKey) || await deps.getSystemConfig(indexKey);
    if (rawIdx) {
      const ids = JSON.parse(rawIdx);
      if (Array.isArray(ids)) {
        for (const docId of ids) {
          try {
            const rawDoc = volatileFollowupStore.get(docId) || await deps.getSystemConfig(docId);
            if (rawDoc) {
              const item = JSON.parse(rawDoc);
              if (item?.id && (force || !scheduleStore.has(item.id))) {
                scheduleStore.set(item.id, item);
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error("[AutoFollowup] Failed to load granular schedules from index:", err);
  }

  // Backward-compatibility check for legacy array
  const storageKey = buildStorageKey(botId);
  try {
    const raw = volatileFollowupStore.get(storageKey) || await deps.getSystemConfig(storageKey);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.id && (force || !scheduleStore.has(item.id))) {
            scheduleStore.set(item.id, item);
            await saveGranularFollowupSchedule(item).catch(() => {});
          }
        }
      }
    }
  } catch {}
}

export function savePersistedAutoFollowupSchedules(botId?: string): void {
  const all = Array.from(scheduleStore.values());
  const filtered = botId ? all.filter((s) => s.botId === botId) : all;
  const storageKey = buildStorageKey(botId);
  volatileFollowupStore.set(storageKey, JSON.stringify(filtered, null, 2));
  for (const sched of filtered) {
    saveGranularFollowupSchedule(sched).catch((err) => {
      console.error("[AutoFollowup] saveGranularFollowupSchedule async error:", err);
    });
  }
}

export async function savePersistedAutoFollowupSchedulesAsync(botId?: string): Promise<void> {
  const all = Array.from(scheduleStore.values());
  const filtered = botId ? all.filter((s) => s.botId === botId) : all;
  const storageKey = buildStorageKey(botId);
  volatileFollowupStore.set(storageKey, JSON.stringify(filtered, null, 2));
  for (const sched of filtered) {
    await saveGranularFollowupSchedule(sched);
  }
}

/**
 * Retention Cleanup: Prunes completed or cancelled follow-up schedules older than cutoff (default 7 days).
 */
export async function cleanupCompletedFollowupSchedules(
  nowMs: number = Date.now(),
  cutoffAgeMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<number> {
  let cleaned = 0;
  const threshold = nowMs - cutoffAgeMs;
  for (const [id, sched] of Array.from(scheduleStore.entries())) {
    const isTerminal = ["COMPLETED", "STOPPED", "CANCELLED"].includes(sched.followupState);
    const terminalTime = sched.lastFollowupAt || sched.createdAt;
    if (isTerminal && terminalTime <= threshold) {
      scheduleStore.delete(id);
      const docId = buildGranularFollowupScheduleDocId(sched.botId, sched.canonicalCustomerId || sched.customerJid, sched.currentObjective || "default");
      volatileFollowupStore.delete(docId);
      cleaned++;
    }
  }
  return cleaned;
}

export function resolveCanonicalIdForFollowup(botId: string, customerJidOrId: string, explicitCanonicalId?: string): string {
  if (explicitCanonicalId) return explicitCanonicalId;
  const cleanBot = String(botId || "").trim();
  const raw = String(customerJidOrId || "").trim().toLowerCase();
  if (raw.includes("@")) {
    const fromAlias = resolveCanonicalCustomerIdForAlias({ accountId: cleanBot, alias: raw });
    if (fromAlias) return fromAlias;
    const resolved = resolveCustomerIdentity({ jid: raw });
    return resolved.canonicalCustomerId || resolved.canonicalCustomerKey || raw;
  }
  return raw;
}

export function buildAutoFollowupScheduleId(botId: string, customerJidOrCanonicalId: string): string {
  const cleanBot = String(botId || "").trim();
  const canonicalId = resolveCanonicalIdForFollowup(cleanBot, customerJidOrCanonicalId);
  const hash = crypto.createHash("sha1").update(`${cleanBot}:${canonicalId}`).digest("hex").slice(0, 20);
  return `af_${hash}`;
}

export function buildDefaultFollowupDelayMs(attemptIndex: number): number {
  const safeIndex = Math.max(0, Number(attemptIndex) || 0);
  // Default progression: 1h -> 2h -> 4h -> 8h -> 16h -> 32h -> 64h doubling backoff
  return 3600 * 1000 * Math.pow(2, safeIndex);
}

export function detectNaturalLanguageFollowupDelayMs(customerMessageText: string): number | null {
  const text = String(customerMessageText || "").toLowerCase().trim();
  if (!text) return null;

  if (/\b(?:next\s+week|aglay\s+hafte|agle\s+hafte|after\s+a\s+week)\b/i.test(text)) {
    return 7 * 24 * 3600 * 1000; // 7 days
  }
  if (/\b(?:tomorrow|kal|subah|kal\s+baat|tomorrow\s+morning|kal\s+subah)\b/i.test(text)) {
    return 24 * 3600 * 1000; // 24 hours
  }
  if (/\b(?:in\s+a\s+few\s+days|kuch\s+din\s+baad|after\s+2\s+days|do\s+din\s+baad)\b/i.test(text)) {
    return 2 * 24 * 3600 * 1000; // 48 hours
  }
  if (/\b(?:later|baad\s+mein|bad\s+me|after\s+some\s+time|kuch\s+der\s+baad)\b/i.test(text)) {
    return 4 * 3600 * 1000; // 4 hours
  }
  const hoursMatch = text.match(/\b(?:after|in)\s+(\d{1,2})\s+(?:hours?|ghante?)\b/i);
  if (hoursMatch && hoursMatch[1]) {
    const hrs = Math.max(1, Math.min(72, Number(hoursMatch[1])));
    return hrs * 3600 * 1000;
  }

  return null;
}

export function isCustomerOptedOutFromFollowups(text: string): boolean {
  const clean = String(text || "").toLowerCase().trim();
  if (!clean) return false;
  // Strict explicit communication opt-out only:
  // customer clearly requests no more contact / unsubscribe / block / stop messaging
  return /\b(stop|unsubscribe|don't\s+message|dont\s+message|do\s+not\s+contact|stop\s+messaging|kabhi\s+msg\s+mat\s+karna|tang\s+mat\s+karo|block\s+karo|no\s+more\s+messages|never\s+contact)\b/i.test(clean);
}

export function isCustomerDisinterested(text: string): boolean {
  const clean = String(text || "").toLowerCase().trim();
  if (!clean) return false;
  // Conversational / product disinterest:
  // customer is not interested in a particular service/product/offer
  // Ends the current sales pursuit, but DOES NOT globally mark customer do-not-contact
  return /\b(not\s+interested|no\s+interest|nahi\s+chahiye|nahi\s+lena|don't\s+need|dont\s+need|not\s+looking\s+for\s+this|too\s+expensive|budget\s+nahi\s+hai)\b/i.test(clean);
}

export function getAutoFollowupSchedule(botId: string, customerJid: string): PersistedAutoFollowupSchedule | null {
  const id = buildAutoFollowupScheduleId(botId, customerJid);
  if (!scheduleStore.has(id)) {
    loadPersistedAutoFollowupSchedules(botId);
  }
  const existing = scheduleStore.get(id);
  return existing ? { ...existing } : null;
}

export function listActiveAutoFollowupSchedules(botId?: string): PersistedAutoFollowupSchedule[] {
  if (botId && scheduleStore.size === 0) {
    loadPersistedAutoFollowupSchedules(botId);
  }
  const all = Array.from(scheduleStore.values());
  if (!botId) return all;
  return all.filter((s) => s.botId === botId);
}

export async function listActiveAutoFollowupSchedulesAsync(botId?: string): Promise<PersistedAutoFollowupSchedule[]> {
  if (botId) {
    await loadPersistedAutoFollowupSchedulesAsync(botId).catch(() => {});
  }
  return listActiveAutoFollowupSchedules(botId);
}

export function scheduleNextAutoFollowup(input: {
  botId: string;
  customerJid: string;
  canonicalCustomerId?: string;
  conversationId?: string;
  lastCustomerMessageText?: string;
  lastCustomerMessageAt?: number;
  lastBotReplyText?: string;
  lastBotReplyAt?: number;
  currentObjective?: string;
  isCompleted?: boolean;
  isOptedOut?: boolean;
}): PersistedAutoFollowupSchedule | null {
  const { botId, customerJid, lastCustomerMessageText, isCompleted, isOptedOut } = input;
  const id = buildAutoFollowupScheduleId(botId, customerJid);
  if (!scheduleStore.has(id)) {
    loadPersistedAutoFollowupSchedules(botId);
  }
  const existing = scheduleStore.get(id);

  if (isOptedOut || (lastCustomerMessageText && isCustomerOptedOutFromFollowups(lastCustomerMessageText))) {
    const stopped: PersistedAutoFollowupSchedule = {
      id,
      accountId: (input as any).accountId || (existing ? existing.accountId : ""),
      botId,
      customerJid,
      canonicalCustomerId: input.canonicalCustomerId || customerJid,
      conversationId: input.conversationId || customerJid,
      attemptIndex: 0,
      logicalFollowupTurnId: `followup_${id}_attempt_0`,
      scheduledAt: 0,
      state: "STOPPED",
      deliveryIdentity: customerJid,
      revision: 1,
      createdAt: Date.now(),
      lastFollowupAt: 0,
      nextFollowupAt: 0,
      followupState: "STOPPED",
      currentObjective: "communication_opt_out",
      decisionReason: "Customer explicitly requested no further contact (communication opt-out).",
      isCommunicationOptOut: true,
      isProductDisinterest: false,
    };
    scheduleStore.set(id, stopped);
    savePersistedAutoFollowupSchedules(botId);
    recordAutoFollowupLog({
      botId,
      customerJid,
      canonicalCustomerId: input.canonicalCustomerId || customerJid,
      scheduleId: id,
      state: "STOPPED",
      action: "opted_out",
      reason: stopped.decisionReason,
      timestamp: Date.now(),
    }).catch(() => {});
    return stopped;
  }

  // Requirement #10: Do NOT permanently opt out on "not interested" (product/conversational disinterest)
  if (lastCustomerMessageText && isCustomerDisinterested(lastCustomerMessageText)) {
    const completed: PersistedAutoFollowupSchedule = {
      id,
      accountId: (input as any).accountId || (existing ? existing.accountId : ""),
      botId,
      customerJid,
      canonicalCustomerId: input.canonicalCustomerId || customerJid,
      conversationId: input.conversationId || customerJid,
      attemptIndex: 0,
      logicalFollowupTurnId: `followup_${id}_attempt_0`,
      scheduledAt: 0,
      state: "COMPLETED",
      deliveryIdentity: customerJid,
      revision: 1,
      createdAt: Date.now(),
      lastFollowupAt: 0,
      nextFollowupAt: 0,
      followupState: "COMPLETED",
      currentObjective: "product_disinterest",
      decisionReason: "Customer expressed disinterest in this specific product/offer; closed sales pursuit without global contact suppression.",
      isCommunicationOptOut: false,
      isProductDisinterest: true,
    };
    scheduleStore.set(id, completed);
    savePersistedAutoFollowupSchedules(botId);
    recordAutoFollowupLog({
      botId,
      customerJid,
      canonicalCustomerId: input.canonicalCustomerId || customerJid,
      scheduleId: id,
      state: "COMPLETED",
      action: "product_disinterest_closed",
      reason: completed.decisionReason,
      timestamp: Date.now(),
    }).catch(() => {});
    return completed;
  }

  if (isCompleted) {
    const completed: PersistedAutoFollowupSchedule = {
      id,
      accountId: (input as any).accountId || (existing ? existing.accountId : ""),
      botId,
      customerJid,
      canonicalCustomerId: input.canonicalCustomerId || customerJid,
      conversationId: input.conversationId || customerJid,
      attemptIndex: 0,
      logicalFollowupTurnId: `followup_${id}_attempt_0`,
      scheduledAt: 0,
      state: "COMPLETED",
      deliveryIdentity: customerJid,
      revision: 1,
      createdAt: Date.now(),
      lastFollowupAt: 0,
      nextFollowupAt: 0,
      followupState: "COMPLETED",
      currentObjective: "goal_completed",
      decisionReason: "Conversation goal completed or order placed.",
      isCommunicationOptOut: false,
      isProductDisinterest: false,
    };
    scheduleStore.set(id, completed);
    savePersistedAutoFollowupSchedules(botId);
    recordAutoFollowupLog({
      botId,
      customerJid,
      canonicalCustomerId: input.canonicalCustomerId || customerJid,
      scheduleId: id,
      state: "COMPLETED",
      action: "goal_completed",
      reason: completed.decisionReason,
      timestamp: Date.now(),
    }).catch(() => {});
    return completed;
  }

  const attemptIndex = existing && existing.followupState === "SENT" ? existing.attemptIndex + 1 : 0;
  const now = Date.now();

  const customDelayMs = lastCustomerMessageText ? detectNaturalLanguageFollowupDelayMs(lastCustomerMessageText) : null;
  const delayMs = customDelayMs !== null ? customDelayMs : buildDefaultFollowupDelayMs(attemptIndex);
  const nextAttemptAt = now + delayMs;

  const scheduled: PersistedAutoFollowupSchedule = {
    id,
    accountId: (input as any).accountId || (existing ? existing.accountId : ""),
    botId,
    customerJid,
    canonicalCustomerId: input.canonicalCustomerId || customerJid,
    conversationId: input.conversationId || customerJid,
    attemptIndex,
    logicalFollowupTurnId: `followup_${id}_attempt_${attemptIndex}`,
    scheduledAt: nextAttemptAt,
    state: "SCHEDULED",
    deliveryIdentity: customerJid,
    revision: (existing?.revision || 0) + 1,
    createdAt: existing ? existing.createdAt : now,
    lastFollowupAt: existing ? existing.lastFollowupAt : 0,
    nextFollowupAt: nextAttemptAt,
    followupState: "SCHEDULED",
    currentObjective: input.currentObjective || (existing ? existing.currentObjective : "continue_unresolved_inquiry"),
    decisionReason: customDelayMs !== null ? "Custom customer requested follow-up schedule" : `Standard doubling progression attempt ${attemptIndex + 1}`,
    lastCustomerMessageText: input.lastCustomerMessageText || existing?.lastCustomerMessageText,
    lastCustomerMessageAt: input.lastCustomerMessageAt || existing?.lastCustomerMessageAt,
    lastBotReplyText: input.lastBotReplyText || existing?.lastBotReplyText,
    lastBotReplyAt: input.lastBotReplyAt || existing?.lastBotReplyAt,
    isCommunicationOptOut: false,
    isProductDisinterest: false,
  };

  scheduleStore.set(id, scheduled);
  savePersistedAutoFollowupSchedules(botId);
  recordAutoFollowupLog({
    botId,
    customerJid,
    canonicalCustomerId: input.canonicalCustomerId || customerJid,
    scheduleId: id,
    state: "SCHEDULED",
    action: "schedule_created",
    reason: scheduled.decisionReason,
    timestamp: now,
    attemptIndex,
  }).catch(() => {});
  return scheduled;
}

export function cancelAutoFollowupOnCustomerReply(botId: string, customerJid: string, replyMessageId?: string): boolean {
  const id = buildAutoFollowupScheduleId(botId, customerJid);
  if (!scheduleStore.has(id)) {
    loadPersistedAutoFollowupSchedules(botId);
  }
  const existing = scheduleStore.get(id);
  if (!existing || existing.followupState === "CANCELLED" || existing.followupState === "COMPLETED" || existing.followupState === "STOPPED") {
    return false;
  }

  existing.state = "CANCELLED_BY_CUSTOMER_REPLY";
  existing.followupState = "CANCELLED";
  existing.decisionReason = `New customer message arrived (${replyMessageId || "inbound"}), superseding pending follow-up.`;
  existing.revision += 1;
  existing.lockedByWorker = undefined;
  existing.lockExpiresAt = undefined;
  scheduleStore.set(id, existing);
  savePersistedAutoFollowupSchedules(botId);
  recordAutoFollowupLog({
    botId,
    customerJid,
    scheduleId: id,
    state: "CANCELLED_BY_CUSTOMER_REPLY",
    action: "cancelled_by_customer_reply",
    reason: existing.decisionReason,
    timestamp: Date.now(),
  }).catch(() => {});
  return true;
}

export function claimAutoFollowupForWorker(scheduleId: string, workerId: string, lockDurationMs = 60000): boolean {
  const existing = scheduleStore.get(scheduleId);
  if (!existing) return false;
  if (existing.followupState !== "SCHEDULED" && existing.state !== "SCHEDULED") return false;

  const now = Date.now();
  if (existing.lockedByWorker && existing.lockExpiresAt && existing.lockExpiresAt > now && existing.lockedByWorker !== workerId) {
    return false;
  }

  // Durable atomic claim primitive
  acquireAtomicClaim(`followup_claim:${scheduleId}`, workerId, lockDurationMs, now).catch(() => {});

  existing.lockedByWorker = workerId;
  existing.lockExpiresAt = now + lockDurationMs;
  existing.state = "CLAIMED";
  existing.followupState = "EVALUATING";
  existing.revision += 1;
  scheduleStore.set(scheduleId, existing);
  savePersistedAutoFollowupSchedules(existing.botId);
  return true;
}

export async function claimAutoFollowupForWorkerAsync(scheduleId: string, workerId: string, lockDurationMs = 60000): Promise<{ acquired: boolean; claimedRevision: number }> {
  const existing = scheduleStore.get(scheduleId);
  if (!existing || (existing.followupState !== "SCHEDULED" && existing.state !== "SCHEDULED")) {
    return { acquired: false, claimedRevision: 0 };
  }

  const claimRes = await acquireAtomicClaim(`followup_claim:${scheduleId}`, workerId, lockDurationMs);
  if (!claimRes.acquired) {
    return { acquired: false, claimedRevision: 0 };
  }

  const now = Date.now();
  existing.lockedByWorker = workerId;
  existing.lockExpiresAt = now + lockDurationMs;
  existing.state = "CLAIMED";
  existing.followupState = "EVALUATING";
  existing.revision += 1;
  const claimedRevision = existing.revision;
  scheduleStore.set(scheduleId, existing);
  await saveGranularFollowupSchedule(existing).catch((err) => {
    console.error("[AutoFollowup] saveGranularFollowupSchedule claim error:", err);
  });
  return { acquired: true, claimedRevision };
}

export function releaseAutoFollowupWorkerClaim(scheduleId: string, workerId: string, newState: AutoFollowupState = "SCHEDULED", reason = ""): void {
  const existing = scheduleStore.get(scheduleId);
  if (!existing || existing.lockedByWorker !== workerId) return;

  releaseAtomicClaim(`followup_claim:${scheduleId}`, workerId).catch((err) => {
    console.error("[AutoFollowup] releaseAtomicClaim error:", err);
  });

  existing.lockedByWorker = undefined;
  existing.lockExpiresAt = undefined;
  existing.state = newState;
  existing.followupState = newState;
  if (reason) existing.decisionReason = reason;
  existing.revision += 1;
  scheduleStore.set(scheduleId, existing);
  savePersistedAutoFollowupSchedules(existing.botId);
}

export interface SemanticFollowupEvaluationInput {
  chatHistory: Array<{ role: string; text: string }>;
  customerProfile: any;
  botConfig?: any;
  textProviderGenerate?: (input: AiTextProviderInput) => Promise<AiTextProviderResult>;
  customerTurnId?: string;
  providerCallId?: string;
}

export interface SemanticFollowupEvaluationResult {
  shouldFollowup: boolean;
  unresolvedObjective: string;
  reason: string;
  recommendedMessage?: string;
  aiCallsCount?: number;
}

export async function evaluateSemanticFollowup(input: SemanticFollowupEvaluationInput): Promise<SemanticFollowupEvaluationResult> {
  const { chatHistory, customerProfile, botConfig, textProviderGenerate } = input;
  const recentTurns = chatHistory.slice(-8);

  const lastTurn = recentTurns[recentTurns.length - 1];
  if (lastTurn && lastTurn.role === "user") {
    return {
      shouldFollowup: false,
      unresolvedObjective: "customer_already_replied",
      reason: "Customer already replied recently; regular AI reply should handle this, not follow-up.",
      aiCallsCount: 0,
    };
  }

  const c360Text = buildCustomer360PromptSection(customerProfile);
  const conversationText = recentTurns.map((m) => `${m.role === "user" ? "Customer" : "Bot"}: ${m.text}`).join("\n");

  const prompt = `You are evaluating whether a business sales assistant should follow up with a WhatsApp customer who stopped responding.

Customer Context:
${c360Text || "No structured customer facts."}

Recent Conversation:
${conversationText || "No chat history."}

Analyze:
1. Is there an active, unresolved business topic or inquiry that was left pending?
2. Has the customer already made a purchase or explicitly ended the chat?
3. Did the customer ask not to be contacted?
4. Would a gentle conversational follow-up help move the conversation forward?

Output a JSON object with:
{
  "shouldFollowup": boolean,
  "unresolvedObjective": string (e.g. "pending_pricing_confirmation", "missing_delivery_address", "custom_plan_qualification"),
  "reason": string,
  "suggestedMessage": string (one natural, helpful WhatsApp message, concise and polite, without placeholders)
}`;

  const generator = textProviderGenerate || generateBackendText;
  try {
    const turnId = clean(input.customerTurnId);
    const callId = input.providerCallId || (turnId ? `call_eval_${turnId}` : "");
    const result = await generator({
      purpose: "ai_smart_followup_evaluation",
      stablePrompt: "You are an objective conversation evaluator. Respond in valid JSON only.",
      latestCustomerMessage: prompt,
      jsonMode: true,
      maxTokens: 300,
      customerTurnId: turnId || undefined,
      providerCallId: callId || undefined,
      botId: botConfig?.botId || botConfig?.id,
      accountId: botConfig?.accountId || botConfig?.userId,
    });

    if (turnId && callId) {
      recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turnId,
        providerCallId: callId,
        botId: botConfig?.botId || botConfig?.id,
        accountId: botConfig?.accountId || botConfig?.userId,
        purpose: "ai_smart_followup_evaluation",
        provider: "deepinfra",
        model: result?.model,
      });
    }

    const parsed = JSON.parse(result.text.replace(/```(?:json)?/gi, "").trim());
    return {
      shouldFollowup: Boolean(parsed.shouldFollowup),
      unresolvedObjective: String(parsed.unresolvedObjective || "followup_check"),
      reason: String(parsed.reason || "Evaluated by AI"),
      recommendedMessage: parsed.suggestedMessage ? String(parsed.suggestedMessage).trim() : undefined,
      aiCallsCount: 1,
    };
  } catch (e: any) {
    return {
      shouldFollowup: true,
      unresolvedObjective: "inquiry_continuation",
      reason: `Deterministic fallback: ${e?.message || "LLM evaluation unavailable"}`,
      aiCallsCount: 0,
    };
  }
}

export interface FollowupResponseGenerationInput {
  chatHistory: Array<{ role: string; text: string }>;
  customerProfile: any;
  unresolvedObjective: string;
  botConfig?: any;
  textProviderGenerate?: (input: AiTextProviderInput) => Promise<AiTextProviderResult>;
  customerTurnId?: string;
  providerCallId?: string;
  suggestedFallback?: string;
}

export async function generateFollowupResponse(input: FollowupResponseGenerationInput): Promise<{
  messageText: string;
  success: boolean;
}> {
  const { chatHistory, customerProfile, unresolvedObjective, botConfig, textProviderGenerate, suggestedFallback } = input;
  const c360Text = buildCustomer360PromptSection(customerProfile);
  const conversationText = chatHistory.slice(-6).map((m) => `${m.role === "user" ? "Customer" : "Bot"}: ${m.text}`).join("\n");

  const prompt = `You are a helpful, polite business sales assistant following up with a customer on WhatsApp.
Unresolved topic/objective: ${unresolvedObjective}

Customer Context:
${c360Text || "No extra context."}

Recent Conversation:
${conversationText || "No chat history."}

Write one concise, friendly follow-up message (under 35 words) addressing the unresolved topic. Do not include placeholders.`;

  const generator = textProviderGenerate || generateBackendText;
  const turnId = clean(input.customerTurnId);
  const callId = input.providerCallId || (turnId ? `call_gen_${turnId}` : "");

  try {
    const result = await generator({
      purpose: "ai_smart_followup_generation",
      stablePrompt: "You are a concise, helpful sales assistant on WhatsApp.",
      latestCustomerMessage: prompt,
      maxTokens: 250,
      customerTurnId: turnId || undefined,
      providerCallId: callId || undefined,
      botId: botConfig?.botId || botConfig?.id,
      accountId: botConfig?.accountId || botConfig?.userId,
    });

    let text = clean(result.text).replace(/^["']|["']$/g, "").trim();
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.suggestedMessage) text = parsed.suggestedMessage;
        else if (parsed.message) text = parsed.message;
      } catch {}
    }

    if (turnId && callId) {
      recordSuccessfulCustomerTurnAiCall({
        customerTurnId: turnId,
        providerCallId: callId,
        botId: botConfig?.botId || botConfig?.id,
        accountId: botConfig?.accountId || botConfig?.userId,
        purpose: "ai_smart_followup_generation",
        provider: "deepinfra",
        model: result?.model,
      });
    }

    return {
      messageText: text || suggestedFallback || "Hi, just checking in to see if you had any questions regarding our earlier conversation?",
      success: true,
    };
  } catch (err: any) {
    return {
      messageText: suggestedFallback || "Hi, just checking in to see if you had any questions regarding our earlier conversation?",
      success: false,
    };
  }
}

export interface ProcessDueAutoFollowupsInput {
  botId: string;
  workerId: string;
  botConfig?: any;
  nowMs?: number;
  checkBillingEligibility: () => Promise<{ eligible: boolean; reason?: string }>;
  getChatHistory: (customerJid: string) => Promise<Array<{ role: string; text: string }>>;
  getCustomerProfile: (customerJid: string) => Promise<any>;
  isCustomerAiPaused?: (customerJid: string, profile?: any) => boolean;
  textProviderGenerate?: (input: AiTextProviderInput) => Promise<AiTextProviderResult>;
  sendFollowupText: (
    customerJid: string,
    messageText: string,
    options?: {
      customerTurnId?: string;
      extraAiCallsCount?: number;
      billingBreakdown?: {
        successfulCallsCount: number;
        baseAmount: number;
        extraCallsCount: number;
        extraAmount: number;
        totalAmount: number;
      };
    }
  ) => Promise<{ success: boolean; messageId?: string; error?: string; billedAmountUsd?: number; chargeAmount?: number }>;
};

export interface ProcessDueAutoFollowupsResult {
  processed: number;
  sent: number;
  stopped: number;
  cancelled: number;
  skipped: number;
}

export async function processDueAutoFollowups(input: ProcessDueAutoFollowupsInput): Promise<ProcessDueAutoFollowupsResult> {
  const nowMs = input.nowMs || Date.now();
  const allSchedules = listActiveAutoFollowupSchedules(input.botId);
  const due = allSchedules.filter(
    (s) => s.followupState === "SCHEDULED" && s.nextFollowupAt <= nowMs
  );

  const result: ProcessDueAutoFollowupsResult = {
    processed: 0,
    sent: 0,
    stopped: 0,
    cancelled: 0,
    skipped: 0,
  };

  if (due.length === 0) return result;

  // Guard: If botConfig is provided, intelligent auto follow-up must be explicitly enabled
  if (input.botConfig && !Boolean(input.botConfig.auto_followup_enabled)) {
    result.skipped = due.length;
    return result;
  }

  // Verify billing/access before attempting follow-ups
  const eligibility = await input.checkBillingEligibility().catch(() => ({ eligible: false, reason: "check_failed" }));
  if (!eligibility.eligible) {
    result.skipped = due.length;
    return result;
  }

  for (const schedule of due) {
    const claimRes = await claimAutoFollowupForWorkerAsync(schedule.id, input.workerId, 60000);
    if (!claimRes.acquired) {
      result.skipped++;
      continue;
    }
    const activeRevision = claimRes.claimedRevision;
    result.processed++;

    try {
      const profile = await input.getCustomerProfile(schedule.customerJid).catch(() => null);

      if (input.isCustomerAiPaused && input.isCustomerAiPaused(schedule.customerJid, profile)) {
        releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, "STOPPED", "Customer AI is paused or under manual takeover.");
        result.stopped++;
        continue;
      }

      const history = await input.getChatHistory(schedule.customerJid).catch(() => []);
      const lastMsg = history[history.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, "CANCELLED_BY_CUSTOMER_REPLY", "Customer replied; pending follow-up superseded.");
        result.cancelled++;
        continue;
      }

      const lastUserMsg = history.filter((m) => m.role === "user").slice(-1)[0];
      if (lastUserMsg && isCustomerOptedOutFromFollowups(lastUserMsg.text)) {
        releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, "STOPPED", "Customer opted out of follow-ups.");
        result.stopped++;
        continue;
      }

      const followupTurnId = schedule.logicalFollowupTurnId || `followup_${schedule.id}_attempt_${schedule.attemptIndex}`;
      schedule.logicalFollowupTurnId = followupTurnId;

      // 1 & 2: Evaluation and Generation
      // If draft already exists (e.g. from previous attempt before transport failure), reuse it without extra AI calls (Test E)
      let messageToSend = schedule.draftFollowupText;
      let unresolvedObjective = schedule.currentObjective;

      if (!messageToSend) {
        const evalResult = await evaluateSemanticFollowup({
          chatHistory: history,
          customerProfile: profile,
          botConfig: input.botConfig,
          textProviderGenerate: input.textProviderGenerate,
          customerTurnId: followupTurnId,
          providerCallId: `call_eval_${followupTurnId}`,
        });

        if (!evalResult.shouldFollowup) {
          releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, "COMPLETED", evalResult.reason);
          result.stopped++;
          recordAutoFollowupLog({
            botId: schedule.botId,
            customerJid: schedule.customerJid,
            canonicalCustomerId: schedule.canonicalCustomerId,
            scheduleId: schedule.id,
            state: "NOT_REQUIRED",
            action: "evaluated_not_required",
            reason: evalResult.reason,
            timestamp: nowMs,
            attemptIndex: schedule.attemptIndex,
          }).catch((err) => {
            console.error("[AutoFollowup] Log record error:", err);
          });
          continue;
        }

        unresolvedObjective = evalResult.unresolvedObjective;

        // Requirement #13: Pre-send durable state & revision freshness check
        // Validates claim/revision is still current and not superseded by customer reply
        const preSendFresh = getAutoFollowupSchedule(schedule.botId, schedule.canonicalCustomerId || schedule.customerJid);
        if (
          !preSendFresh ||
          preSendFresh.revision !== activeRevision ||
          (preSendFresh.followupState !== "EVALUATING" && preSendFresh.state !== "CLAIMED") ||
          preSendFresh.lockedByWorker !== input.workerId
        ) {
          releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, preSendFresh?.followupState || "CANCELLED", "Aborted send: revision mismatch or superseded");
          result.cancelled++;
          continue;
        }

        const genResult = await generateFollowupResponse({
          chatHistory: history,
          customerProfile: profile,
          unresolvedObjective: evalResult.unresolvedObjective,
          botConfig: input.botConfig,
          textProviderGenerate: input.textProviderGenerate,
          customerTurnId: followupTurnId,
          providerCallId: `call_gen_${followupTurnId}`,
          suggestedFallback: evalResult.recommendedMessage,
        });
        messageToSend = genResult.messageText || evalResult.recommendedMessage || "Hi, just checking in to see if you needed any more details or had questions?";
        schedule.draftFollowupText = messageToSend;
        savePersistedAutoFollowupSchedules(schedule.botId);
      } else {
        // Pre-send freshness check for transport retries
        const preSendFresh = getAutoFollowupSchedule(schedule.botId, schedule.canonicalCustomerId || schedule.customerJid);
        if (
          !preSendFresh ||
          preSendFresh.revision !== activeRevision ||
          (preSendFresh.followupState !== "EVALUATING" && preSendFresh.state !== "CLAIMED") ||
          preSendFresh.lockedByWorker !== input.workerId
        ) {
          releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, preSendFresh?.followupState || "CANCELLED", "Aborted send: revision mismatch or superseded");
          result.cancelled++;
          continue;
        }
      }

      // 3. Query canonical provider ledger for this logical turn
      const turnBilling = await calculateCustomerTurnBillingAsync(followupTurnId);
      const recordedExtraCalls = turnBilling.extraCallsCount;

      const sendOutcome = await input.sendFollowupText(schedule.customerJid, messageToSend, {
        customerTurnId: followupTurnId,
        extraAiCallsCount: recordedExtraCalls,
        billingBreakdown: turnBilling,
      });

      if (sendOutcome.success) {
        // Clear draft on successful delivery
        schedule.draftFollowupText = undefined;
        const nextAttemptIndex = schedule.attemptIndex + 1;
        const nextDelayMs = buildDefaultFollowupDelayMs(nextAttemptIndex);
        const nextAttemptAt = nowMs + nextDelayMs;
        schedule.attemptIndex = nextAttemptIndex;
        schedule.lastFollowupAt = nowMs;
        schedule.nextFollowupAt = nextAttemptAt;
        schedule.scheduledAt = nextAttemptAt;
        schedule.state = "SCHEDULED";
        schedule.followupState = "SCHEDULED";
        schedule.currentObjective = unresolvedObjective;
        schedule.decisionReason = `Follow-up sent (${sendOutcome.messageId || "delivered"}). Next attempt in ${Math.round(nextDelayMs / 3600000)}h`;
        schedule.lastBotReplyText = messageToSend;
        schedule.lastBotReplyAt = nowMs;
        schedule.lockedByWorker = undefined;
        schedule.lockExpiresAt = undefined;
        schedule.revision += 1;
        schedule.logicalFollowupTurnId = `followup_${schedule.id}_attempt_${nextAttemptIndex}`;
        scheduleStore.set(schedule.id, schedule);
        savePersistedAutoFollowupSchedules(schedule.botId);
        result.sent++;
        recordAutoFollowupLog({
          botId: schedule.botId,
          customerJid: schedule.customerJid,
          canonicalCustomerId: schedule.canonicalCustomerId,
          scheduleId: schedule.id,
          state: "DELIVERED",
          action: "followup_delivered",
          reason: `Follow-up sent (${sendOutcome.messageId || "delivered"})`,
          timestamp: nowMs,
          attemptIndex: schedule.attemptIndex,
          messageText: messageToSend,
        }).catch((err) => {
          console.error("[AutoFollowup] Log record error:", err);
        });
      } else {
        // Send failed: transport failure does NOT charge, keeps draft for retry
        releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, "SCHEDULED", `Send failed: ${sendOutcome.error || "transport_error"}`);
        recordAutoFollowupLog({
          botId: schedule.botId,
          customerJid: schedule.customerJid,
          canonicalCustomerId: schedule.canonicalCustomerId,
          scheduleId: schedule.id,
          state: "FAILED",
          action: "send_failed",
          reason: sendOutcome.error || "delivery_failure",
          timestamp: nowMs,
          attemptIndex: schedule.attemptIndex,
        }).catch((err) => {
          console.error("[AutoFollowup] Log record error:", err);
        });
      }
    } catch (err: any) {
      releaseAutoFollowupWorkerClaim(schedule.id, input.workerId, "SCHEDULED", `Error during evaluation: ${err?.message || err}`);
      recordAutoFollowupLog({
        botId: schedule.botId,
        customerJid: schedule.customerJid,
        canonicalCustomerId: schedule.canonicalCustomerId,
        scheduleId: schedule.id,
        state: "FAILED",
        action: "eval_error",
        reason: err?.message || String(err),
        timestamp: nowMs,
      }).catch((logErr) => {
        console.error("[AutoFollowup] Log record error:", logErr);
      });
    }
  }

  return result;
}

export function clearScheduleStoreMemoryOnlyForTest(): void {
  scheduleStore.clear();
}

export function clearAutoFollowupSchedulesForTest(): void {
  scheduleStore.clear();
  volatileFollowupStore.clear();
  __clearMemoryClaimsForTest();
}
