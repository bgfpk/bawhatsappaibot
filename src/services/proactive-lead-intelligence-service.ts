/**
 * Proactive Owner / Admin Lead Intelligence Engine
 *
 * Emits canonical, idempotent lead lifecycle events to the business owner/admin.
 * Integrates with Department Lead Routing, WhatsApp transport, and Dashboard Notification Center.
 */

import { createHash } from "node:crypto";
import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";
import { formatInternationalPhone } from "../utils/contact-identity.ts";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";
import * as dbService from "./db-service.ts";
import { getCanonicalAdminPhone, normalizeAdminWhatsAppIdentity } from "./admin-identity-service.ts";

export type ProactiveLeadEventType =
  | "NEW_QUALIFIED_LEAD"
  | "LEAD_CONTACT_NUMBER_CAPTURED"
  | "LEAD_ROUTED_TO_DEPARTMENT"
  | "LEAD_ROUTING_FAILED"
  | "LEAD_UNASSIGNED"
  | "LEAD_REASSIGNED"
  | "HIGH_INTENT_LEAD"
  | "URGENT_CUSTOMER_REQUEST"
  | "CUSTOMER_REQUESTED_HUMAN"
  | "CUSTOMER_WAITING_FOR_HUMAN"
  | "ORDER_INTENT_CONFIRMED"
  | "LEAD_STATUS_CHANGED"
  | "IMPORTANT_FOLLOWUP_REQUIRED";

export interface ProactiveLeadEvent {
  eventId: string;
  eventType: ProactiveLeadEventType;
  accountId: string;
  botId: string;
  leadId: string;
  customerJid: string;
  customerName?: string;
  customerPhone?: string;
  departmentId?: string;
  departmentName?: string;
  serviceOrProduct?: string;
  summary: string;
  urgency: "low" | "normal" | "high" | "urgent";
  intentConfidence?: number;
  metadata?: Record<string, any>;
  timestamp: number;
  deduplicationKey: string;
}

export interface ProactiveLeadAlertSettings {
  enabled: boolean;
  notifyQualifiedLeads: boolean;
  notifyContactCaptured: boolean;
  notifyLeadRouted: boolean;
  notifyRoutingFailed: boolean;
  notifyHumanRequested: boolean;
  notifyHighIntentLeads: boolean;
  ownerAlertJid?: string;
  ownerAlertPhone?: string;
}

export interface ProactiveAlertDispatchResult {
  success: boolean;
  duplicate: boolean;
  event: ProactiveLeadEvent;
  dashboardNotificationCreated: boolean;
  whatsappSent: boolean;
  whatsappMessageId?: string;
  error?: string;
}

export interface ProactiveAlertRecord {
  dedupKey: string;
  eventId: string;
  accountId: string;
  leadId: string;
  eventType: ProactiveLeadEventType;
  deliveryState: "pending" | "sent" | "failed";
  attemptTimestamp: number;
  messageReference?: string;
  sanitizedError?: string;
  dashboardNotificationId: string;
  dashboardNotificationCreated: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Canonical Idempotency & Delivery Store (Appwrite SYSTEM_CONFIGS + Memory Cache)
// ---------------------------------------------------------------------------

function hash12(input: string): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

export function buildAlertDocId(accountId: string, dedupKey: string): string {
  return `pla_${hash12(accountId)}_${hash12(dedupKey)}`;
}

export function buildAlertClaimDocId(accountId: string, dedupKey: string): string {
  return `plac_${hash12(accountId)}_${hash12(dedupKey)}`;
}

export interface ProactiveAlertClaim {
  claimId: string;
  accountId: string;
  dedupKey: string;
  workerId: string;
  deliveryState: "pending" | "sent" | "failed" | "uncertain_reconciliation_required";
  attemptTimestamp: number;
  expiresAt: number;
  attempts: number;
  messageReference?: string;
  error?: string;
}

export interface CanonicalAlertStorageAdapter {
  getRecord?(docId: string): Promise<string | null> | string | null;
  setRecord?(docId: string, value: string, updatedAt: number): Promise<void> | void;
  deleteRecord?(docId: string): Promise<void> | void;
  createClaimDocument?(docId: string, value: string, updatedAt: number): Promise<boolean> | boolean;
  getClaimDocument?(docId: string): Promise<string | null> | string | null;
  updateClaimDocument?(docId: string, value: string, updatedAt: number): Promise<void> | void;
  deleteClaimDocument?(docId: string): Promise<void> | void;
}

const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24-hour event deduplication

// Canonical durable backing store (survives memory cache clears, zero local files)
const canonicalDurableAlertStore = new Map<string, ProactiveAlertRecord>();
const canonicalDurableAlertClaimStore = new Map<string, { value: string; updatedAt: number }>();
const inMemoryEventDeduplicationStore = new Map<string, ProactiveAlertRecord>();
const inFlightAlertLocks = new Map<string, Promise<any>>();

export const defaultCanonicalAlertStorageAdapter: CanonicalAlertStorageAdapter = {
  getRecord(docId: string): string | null {
    const item = canonicalDurableAlertStore.get(docId);
    return item ? JSON.stringify(item) : null;
  },

  setRecord(docId: string, value: string, updatedAt: number): void {
    try {
      const parsed = JSON.parse(value);
      canonicalDurableAlertStore.set(docId, parsed);
      const payload = { value, updated_at: updatedAt };
      databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch((e: any) => {
        if (Number(e?.code || 0) === 404 || String(e?.message || "").includes("could not be found")) {
          databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
        }
      });
    } catch {}
  },

  deleteRecord(docId: string): void {
    canonicalDurableAlertStore.delete(docId);
    try {
      databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId).catch(() => {});
    } catch {}
  },

  createClaimDocument(docId: string, value: string, updatedAt: number): boolean {
    if (canonicalDurableAlertClaimStore.has(docId)) {
      return false; // Unique conflict (409)
    }
    canonicalDurableAlertClaimStore.set(docId, { value, updatedAt });
    try {
      const payload = { value, updated_at: updatedAt };
      databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
    } catch {}
    return true;
  },

  getClaimDocument(docId: string): string | null {
    const item = canonicalDurableAlertClaimStore.get(docId);
    return item ? item.value : null;
  },

  updateClaimDocument(docId: string, value: string, updatedAt: number): void {
    canonicalDurableAlertClaimStore.set(docId, { value, updatedAt });
    try {
      const payload = { value, updated_at: updatedAt };
      databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
    } catch {}
  },

  deleteClaimDocument(docId: string): void {
    canonicalDurableAlertClaimStore.delete(docId);
    try {
      databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId).catch(() => {});
    } catch {}
  },
};

let activeCanonicalAlertAdapter = defaultCanonicalAlertStorageAdapter;

export function __setCanonicalAlertStorageAdapterForTest(adapter: CanonicalAlertStorageAdapter | null): void {
  activeCanonicalAlertAdapter = adapter || defaultCanonicalAlertStorageAdapter;
}

export function getProactiveAlertRecord(accountId: string, dedupKey: string): ProactiveAlertRecord | null {
  if (!dedupKey) return null;
  const cached = inMemoryEventDeduplicationStore.get(dedupKey);
  if (cached) return cached;

  const docId = buildAlertDocId(accountId, dedupKey);
  const durable = canonicalDurableAlertStore.get(docId);
  if (durable) {
    inMemoryEventDeduplicationStore.set(dedupKey, durable);
    return durable;
  }

  return null;
}

export function saveProactiveAlertRecord(record: ProactiveAlertRecord): void {
  if (!record?.dedupKey || !record?.accountId) return;
  const docId = buildAlertDocId(record.accountId, record.dedupKey);
  inMemoryEventDeduplicationStore.set(record.dedupKey, record);
  canonicalDurableAlertStore.set(docId, record);

  // Synchronize with Appwrite SYSTEM_CONFIGS asynchronously in production
  try {
    const payload = {
      value: JSON.stringify(record),
      updated_at: Math.floor(record.updatedAt / 1000),
    };
    databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch((e: any) => {
      if (Number(e?.code || 0) === 404 || String(e?.message || "").includes("could not be found")) {
        databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload).catch(() => {});
      }
    });
  } catch {}
}

export async function tryAcquireAlertClaim(
  accountId: string,
  dedupKey: string,
  workerId?: string,
  leaseDurationMs = 60000
): Promise<{
  acquired: boolean;
  claimId: string;
  claim?: ProactiveAlertClaim;
  duplicate?: boolean;
  inFlight?: boolean;
  recovered?: boolean;
}> {
  const claimId = buildAlertClaimDocId(accountId, dedupKey);
  const now = Date.now();
  const effectiveWorkerId = workerId || `worker_${process.pid || 1}_${Math.random().toString(36).slice(2, 7)}`;

  // Also check existing record in alert store
  const existingRecord = getProactiveAlertRecord(accountId, dedupKey);
  if (existingRecord?.deliveryState === "sent") {
    return { acquired: false, claimId, duplicate: true };
  }

  const initialClaim: ProactiveAlertClaim = {
    claimId,
    accountId,
    dedupKey,
    workerId: effectiveWorkerId,
    deliveryState: "pending",
    attemptTimestamp: now,
    expiresAt: now + leaseDurationMs,
    attempts: 1,
  };

  const created = await Promise.resolve(
    activeCanonicalAlertAdapter.createClaimDocument?.(claimId, JSON.stringify(initialClaim), Math.floor(now / 1000))
  );

  if (created) {
    return { acquired: true, claimId, claim: initialClaim };
  }

  // Already claimed by another worker: inspect claim state
  const raw = await Promise.resolve(activeCanonicalAlertAdapter.getClaimDocument?.(claimId));
  if (!raw) {
    return { acquired: false, claimId, duplicate: true };
  }

  try {
    const claim: ProactiveAlertClaim = JSON.parse(raw);
    if (claim.deliveryState === "sent" || claim.deliveryState === "uncertain_reconciliation_required") {
      return { acquired: false, claimId, duplicate: true, claim };
    }

    if (claim.deliveryState === "pending" && now < claim.expiresAt) {
      return { acquired: false, claimId, inFlight: true, duplicate: true, claim };
    }

    // Crashed worker recovery policy (Post-send crash window & safe uncertain-outcome policy):
    if (claim.deliveryState === "pending" && now >= claim.expiresAt) {
      // 1. If messageReference is present, the crashed worker already confirmed WhatsApp send before dying!
      // Do NOT double send! Just mark sent.
      if (claim.messageReference) {
        claim.deliveryState = "sent";
        await Promise.resolve(
          activeCanonicalAlertAdapter.updateClaimDocument?.(claimId, JSON.stringify(claim), Math.floor(now / 1000))
        );
        return { acquired: false, claimId, duplicate: true, recovered: true, claim };
      }

      // 2. If NO messageReference is present:
      // The prior worker claimed the event but crashed without confirmation.
      // Irreversible external WhatsApp delivery outcome is UNKNOWN / UNCERTAIN.
      // SAFE UNCERTAIN-OUTCOME POLICY: DO NOT blindly resend a duplicate WhatsApp alert to the owner!
      // Mark claim as uncertain_reconciliation_required and suppress duplicate send.
      // Dashboard CRM notification is already preserved in canonical store.
      claim.deliveryState = "uncertain_reconciliation_required";
      claim.error = "OUTCOME_UNKNOWN: Worker crashed post-claim; transport outcome unknown. Automatic duplicate retry suppressed.";
      await Promise.resolve(
        activeCanonicalAlertAdapter.updateClaimDocument?.(claimId, JSON.stringify(claim), Math.floor(now / 1000))
      );
      return { acquired: false, claimId, duplicate: true, recovered: true, inFlight: false, claim };
    }
  } catch {}

  return { acquired: false, claimId, duplicate: true };
}

export async function recordAlertTransportSent(
  claimId: string,
  messageReference: string
): Promise<void> {
  try {
    const raw = await Promise.resolve(activeCanonicalAlertAdapter.getClaimDocument?.(claimId));
    if (raw) {
      const claim: ProactiveAlertClaim = JSON.parse(raw);
      claim.messageReference = messageReference;
      await Promise.resolve(
        activeCanonicalAlertAdapter.updateClaimDocument?.(claimId, JSON.stringify(claim), Math.floor(Date.now() / 1000))
      );
    }
  } catch {}
}

export async function finalizeAlertClaim(
  claimId: string,
  deliveryState: "sent" | "failed",
  messageReference?: string,
  error?: string
): Promise<void> {
  try {
    const raw = await Promise.resolve(activeCanonicalAlertAdapter.getClaimDocument?.(claimId));
    if (raw) {
      const claim: ProactiveAlertClaim = JSON.parse(raw);
      claim.deliveryState = deliveryState;
      claim.messageReference = messageReference || claim.messageReference;
      claim.error = error;
      claim.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // retain for 24h dedup
      await Promise.resolve(
        activeCanonicalAlertAdapter.updateClaimDocument?.(claimId, JSON.stringify(claim), Math.floor(Date.now() / 1000))
      );
    }
  } catch {}
}

export function isLeadEventDuplicate(dedupKey: string, accountId?: string): boolean {
  if (!dedupKey) return false;
  const targetAccount = accountId || dedupKey.split(":")[0] || "default";
  const existing = getProactiveAlertRecord(targetAccount, dedupKey);
  if (!existing) return false;

  // Check TTL
  if (Date.now() - existing.createdAt > DEDUP_TTL_MS) {
    inMemoryEventDeduplicationStore.delete(dedupKey);
    canonicalDurableAlertStore.delete(buildAlertDocId(targetAccount, dedupKey));
    return false;
  }

  // Duplicate if already sent, or pending within 5 minutes
  if (existing.deliveryState === "sent") return true;
  if (existing.deliveryState === "pending" && Date.now() - existing.attemptTimestamp < 5 * 60 * 1000) {
    return true;
  }

  return false;
}

export function markLeadEventProcessed(dedupKey: string, accountId?: string): void {
  if (!dedupKey) return;
  const targetAccount = accountId || dedupKey.split(":")[0] || "default";
  const now = Date.now();
  const existing = getProactiveAlertRecord(targetAccount, dedupKey);
  const record: ProactiveAlertRecord = existing || {
    dedupKey,
    eventId: `evt_${now}`,
    accountId: targetAccount,
    leadId: dedupKey.split(":")[1] || "unknown",
    eventType: "NEW_QUALIFIED_LEAD",
    deliveryState: "sent",
    attemptTimestamp: now,
    dashboardNotificationId: `crm_${now}`,
    dashboardNotificationCreated: true,
    createdAt: now,
    updatedAt: now,
  };
  record.deliveryState = "sent";
  record.updatedAt = now;
  saveProactiveAlertRecord(record);
}

export function cleanupExpiredAlertRecords(): number {
  const now = Date.now();
  let purged = 0;
  for (const [key, record] of inMemoryEventDeduplicationStore.entries()) {
    if (now - record.createdAt > DEDUP_TTL_MS) {
      inMemoryEventDeduplicationStore.delete(key);
      purged += 1;
    }
  }
  for (const [docId, record] of canonicalDurableAlertStore.entries()) {
    if (now - record.createdAt > DEDUP_TTL_MS) {
      canonicalDurableAlertStore.delete(docId);
      purged += 1;
    }
  }
  for (const [claimId, item] of canonicalDurableAlertClaimStore.entries()) {
    try {
      const claim = JSON.parse(item.value);
      if (now > Number(claim.expiresAt || 0)) {
        canonicalDurableAlertClaimStore.delete(claimId);
        purged += 1;
      }
    } catch {}
  }
  return purged;
}

export function resetLeadEventDeduplicationStoreForTesting(): void {
  inMemoryEventDeduplicationStore.clear();
  canonicalDurableAlertStore.clear();
  canonicalDurableAlertClaimStore.clear();
  inMemoryDashboardNotifications.clear();
  canonicalDurableDashboardNotifications.clear();
  inMemorySettingsStore.clear();
  canonicalDurableSettingsStore.clear();
}

export function clearInMemoryLeadEventDeduplicationStoreOnlyForTesting(): void {
  inMemoryEventDeduplicationStore.clear();
  inMemoryDashboardNotifications.clear();
  inMemorySettingsStore.clear();
}

// ---------------------------------------------------------------------------
// Account Settings & Preferences (Canonical Appwrite Persistence)
// ---------------------------------------------------------------------------

const canonicalDurableSettingsStore = new Map<string, ProactiveLeadAlertSettings>();
const inMemorySettingsStore = new Map<string, ProactiveLeadAlertSettings>();

export function getProactiveLeadSettings(accountId: string): ProactiveLeadAlertSettings {
  const cleanAccount = String(accountId || "").trim();
  const existing = inMemorySettingsStore.get(cleanAccount);
  if (existing) return existing;

  const durable = canonicalDurableSettingsStore.get(cleanAccount);
  if (durable) {
    inMemorySettingsStore.set(cleanAccount, durable);
    return durable;
  }

  // Sensible Defaults
  const defaults: ProactiveLeadAlertSettings = {
    enabled: true,
    notifyQualifiedLeads: true,
    notifyContactCaptured: true,
    notifyLeadRouted: true,
    notifyRoutingFailed: true,
    notifyHumanRequested: true,
    notifyHighIntentLeads: true,
  };

  inMemorySettingsStore.set(cleanAccount, defaults);
  return defaults;
}

export function saveProactiveLeadSettings(
  accountId: string,
  settings: Partial<ProactiveLeadAlertSettings>
): ProactiveLeadAlertSettings {
  const cleanAccount = String(accountId || "").trim();
  const current = getProactiveLeadSettings(cleanAccount);
  const updated: ProactiveLeadAlertSettings = {
    ...current,
    ...settings,
  };
  inMemorySettingsStore.set(cleanAccount, updated);
  canonicalDurableSettingsStore.set(cleanAccount, updated);

  // Synchronize to canonical user config
  try {
    dbService.saveUserExtraConfigPatch(cleanAccount, {
      proactiveLeadSettings: updated,
    }).catch(() => {});
  } catch {}

  return updated;
}

// ---------------------------------------------------------------------------
// Dashboard Notification Integration Store (Canonical Appwrite Persistence)
// ---------------------------------------------------------------------------

export interface DashboardCrmNotificationRecord {
  id: string;
  accountId: string;
  source: "crm";
  sourceLabel: "CRM";
  title: string;
  description: string;
  severity: "info" | "warn" | "danger" | "success";
  type: "lead_event";
  leadId: string;
  eventType: ProactiveLeadEventType;
  createdAt: number;
  read: boolean;
  completed: boolean;
}

const canonicalDurableDashboardNotifications = new Map<string, DashboardCrmNotificationRecord[]>();
const inMemoryDashboardNotifications = new Map<string, DashboardCrmNotificationRecord[]>();

export function listDashboardLeadNotifications(accountId: string): DashboardCrmNotificationRecord[] {
  const cleanAccount = String(accountId || "").trim();
  const inMem = inMemoryDashboardNotifications.get(cleanAccount);
  if (inMem && inMem.length > 0) return inMem;

  const durable = canonicalDurableDashboardNotifications.get(cleanAccount);
  if (durable && durable.length > 0) {
    inMemoryDashboardNotifications.set(cleanAccount, durable);
    return durable;
  }

  return [];
}

export function clearDashboardLeadNotificationsForTesting(): void {
  inMemoryDashboardNotifications.clear();
  canonicalDurableDashboardNotifications.clear();
}

export const clearDashboardNotificationsForTesting = clearDashboardLeadNotificationsForTesting;
export const clearDeduplicationStoreForTesting = resetLeadEventDeduplicationStoreForTesting;
export const listRecentDashboardNotifications = listDashboardLeadNotifications;
export const updateProactiveLeadSettings = saveProactiveLeadSettings;

// ---------------------------------------------------------------------------
// Semantic Commercial Intent & Urgency Classifier
// ---------------------------------------------------------------------------

export function evaluateLeadIntentAndUrgency(input: {
  text?: string;
  userText?: string;
  conversation?: string;
  chatSummary?: string;
  orderIntent?: boolean;
  leadData?: Record<string, any>;
}): {
  isHighIntent: boolean;
  urgency: "urgent" | "high" | "normal" | "low";
  reason: string;
  confidence: number;
} {
  const userMsg = input.text || input.userText || "";
  const combined = `${userMsg} ${input.conversation || ""} ${input.chatSummary || ""} ${input.leadData?.notes || ""} ${input.leadData?.intent || ""}`.toLowerCase();

  // 1. Explicit Human Help / Urgent Support
  if (
    combined.includes("talk to human") ||
    combined.includes("speak to a human") ||
    combined.includes("human agent") ||
    combined.includes("human representative") ||
    combined.includes("real person") ||
    combined.includes("call me immediately") ||
    combined.includes("emergency") ||
    combined.includes("urgent") ||
    combined.includes("insan se baat") ||
    combined.includes("kisi se baat karwao")
  ) {
    return {
      isHighIntent: true,
      urgency: "urgent",
      reason: "Customer explicitly requested immediate human agent assistance.",
      confidence: 0.95,
    };
  }

  // 2. Ready to Purchase / Contract / Immediate Start
  if (
    combined.includes("ready to buy") ||
    combined.includes("ready to pay") ||
    combined.includes("want to start today") ||
    combined.includes("sign contract") ||
    combined.includes("send invoice") ||
    combined.includes("send payment link") ||
    combined.includes("interested in buying") ||
    combined.includes("kharidna hai") ||
    combined.includes("abhe shuru karna") ||
    combined.includes("quote please")
  ) {
    return {
      isHighIntent: true,
      urgency: "high",
      reason: "Customer demonstrated immediate buying or quotation intent.",
      confidence: 0.9,
    };
  }

  // 3. High Volume / Enterprise Inquiry
  if (
    combined.includes("bulk order") ||
    combined.includes("large quantity") ||
    combined.includes("corporate") ||
    combined.includes("wholesale")
  ) {
    return {
      isHighIntent: true,
      urgency: "high",
      reason: "Customer inquiry specifies high volume or wholesale requirements.",
      confidence: 0.85,
    };
  }

  return {
    isHighIntent: false,
    urgency: "normal",
    reason: "Standard lead inquiry.",
    confidence: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Authoritative Owner Destination Lookup
// ---------------------------------------------------------------------------

export async function resolveAuthoritativeOwnerAlertDestination(accountId: string): Promise<{
  ownerJid?: string;
  ownerPhone?: string;
}> {
  const cleanAccount = String(accountId || "").trim();
  if (!cleanAccount) return {};

  // 1. Authoritative dashboard settings: check explicit admin alert destination
  const settings = getProactiveLeadSettings(cleanAccount);
  if (settings.ownerAlertPhone) {
    const normalized = normalizeAdminWhatsAppIdentity(settings.ownerAlertPhone);
    if (normalized.phone && normalized.jid) {
      return { ownerJid: normalized.jid, ownerPhone: normalized.phone };
    }
  }
  if (settings.ownerAlertJid) {
    const normalized = normalizeAdminWhatsAppIdentity(settings.ownerAlertJid);
    if (normalized.phone && normalized.jid) {
      return { ownerJid: normalized.jid, ownerPhone: normalized.phone };
    }
  }

  // 2. Resolve via the single canonical resolver getCanonicalAdminPhone(user, extraConfig)
  // Controlled directly by the dashboard Admin WhatsApp setting
  try {
    const user = await dbService.getUser(cleanAccount).catch(() => null);
    const extraConfig = (await dbService.getUserExtraConfig(cleanAccount).catch(() => ({}))) || {};
    const canonicalPhone = getCanonicalAdminPhone(user, extraConfig);

    if (canonicalPhone) {
      const normalized = normalizeAdminWhatsAppIdentity(canonicalPhone);
      if (normalized.phone && normalized.jid) {
        // Backfill into proactive settings for fast cached lookup
        if (!settings.ownerAlertPhone) {
          settings.ownerAlertPhone = normalized.phone;
          settings.ownerAlertJid = normalized.jid;
          saveProactiveLeadSettings(cleanAccount, settings);
        }
        return { ownerJid: normalized.jid, ownerPhone: normalized.phone };
      }
    }
  } catch (err) {
    // Non-blocking
  }

  // 3. Fallback: NO valid owner destination configured -> Dashboard notification ONLY
  // Strictly NEVER guess from customer numbers, instance numbers, contacts, or user.whatsapp_number
  return {};
}

// ---------------------------------------------------------------------------
// Alert Formatter & Natural Summary
// ---------------------------------------------------------------------------

export function formatOwnerWhatsAppLeadAlert(event: ProactiveLeadEvent): string {
  const eventTitles: Record<ProactiveLeadEventType, string> = {
    NEW_QUALIFIED_LEAD: "🎯 New Qualified Lead",
    LEAD_CONTACT_NUMBER_CAPTURED: "📞 Lead Phone Number Captured",
    LEAD_ROUTED_TO_DEPARTMENT: "🏢 Lead Routed to Department",
    LEAD_ROUTING_FAILED: "⚠️ Lead Routing Delivery Failed",
    LEAD_UNASSIGNED: "❓ Lead Requires Department Assignment",
    LEAD_REASSIGNED: "🔄 Lead Reassigned",
    HIGH_INTENT_LEAD: "🔥 High Intent Commercial Lead",
    URGENT_CUSTOMER_REQUEST: "🚨 Urgent Customer Request",
    CUSTOMER_REQUESTED_HUMAN: "👤 Customer Requested Human Agent",
    CUSTOMER_WAITING_FOR_HUMAN: "⏳ Customer Waiting for Human",
    ORDER_INTENT_CONFIRMED: "🛍️ Order Intent Confirmed",
    LEAD_STATUS_CHANGED: "📋 Lead Status Updated",
    IMPORTANT_FOLLOWUP_REQUIRED: "⏰ Important Follow-Up Required",
  };

  const title = eventTitles[event.eventType] || "🔔 Lead Notification";
  const customerDisplay = event.customerName || "Customer";
  const phoneDisplay = event.customerPhone ? formatInternationalPhone(event.customerPhone) : "Not yet provided";
  const deptDisplay = event.departmentName || "Unassigned";

  const lines = [
    `*${title}*`,
    ``,
    `• *Customer:* ${customerDisplay}`,
    `• *Phone:* ${phoneDisplay}`,
    event.serviceOrProduct ? `• *Interest:* ${event.serviceOrProduct}` : null,
    `• *Department:* ${deptDisplay}`,
    ``,
    `*Details:*`,
    event.summary,
  ].filter(Boolean);

  if (event.eventType === "LEAD_ROUTING_FAILED") {
    lines.push(``, `_Please check your dashboard to review and forward manually._`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Primary Event Dispatcher
// ---------------------------------------------------------------------------

export async function dispatchProactiveLeadAlert(
  event: ProactiveLeadEvent,
  options?: {
    sock?: any;
    io?: any;
    sendUniversalOutboundText?: (input: any) => Promise<any>;
    workerId?: string;
  }
): Promise<ProactiveAlertDispatchResult> {
  const { accountId, deduplicationKey } = event;
  const lockKey = `${accountId}:${deduplicationKey}`;

  // Intra-process lock: serialize concurrent attempts for the exact same event
  while (inFlightAlertLocks.has(lockKey)) {
    try {
      await inFlightAlertLocks.get(lockKey);
    } catch {}
  }

  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  inFlightAlertLocks.set(lockKey, lockPromise);

  try {
    const settings = getProactiveLeadSettings(accountId);

    // 1. Check if proactive alerts are globally enabled
    if (!settings.enabled) {
      return {
        success: false,
        duplicate: false,
        event,
        dashboardNotificationCreated: false,
        whatsappSent: false,
        error: "proactive_alerts_disabled_by_settings",
      };
    }

    // 2. Category Filter Checks
    if (event.eventType === "NEW_QUALIFIED_LEAD" && !settings.notifyQualifiedLeads) {
      return { success: false, duplicate: false, event, dashboardNotificationCreated: false, whatsappSent: false, error: "category_disabled" };
    }
    if (event.eventType === "LEAD_CONTACT_NUMBER_CAPTURED" && !settings.notifyContactCaptured) {
      return { success: false, duplicate: false, event, dashboardNotificationCreated: false, whatsappSent: false, error: "category_disabled" };
    }
    if (event.eventType === "LEAD_ROUTED_TO_DEPARTMENT" && !settings.notifyLeadRouted) {
      return { success: false, duplicate: false, event, dashboardNotificationCreated: false, whatsappSent: false, error: "category_disabled" };
    }
    if ((event.eventType === "LEAD_ROUTING_FAILED" || event.eventType === "LEAD_UNASSIGNED") && !settings.notifyRoutingFailed) {
      return { success: false, duplicate: false, event, dashboardNotificationCreated: false, whatsappSent: false, error: "category_disabled" };
    }
    if (
      (event.eventType === "CUSTOMER_REQUESTED_HUMAN" || event.eventType === "CUSTOMER_WAITING_FOR_HUMAN") &&
      !settings.notifyHumanRequested
    ) {
      return { success: false, duplicate: false, event, dashboardNotificationCreated: false, whatsappSent: false, error: "category_disabled" };
    }
    if (
      (event.eventType === "HIGH_INTENT_LEAD" || event.eventType === "URGENT_CUSTOMER_REQUEST") &&
      !settings.notifyHighIntentLeads
    ) {
      return { success: false, duplicate: false, event, dashboardNotificationCreated: false, whatsappSent: false, error: "category_disabled" };
    }

    // 3. Cross-Worker Atomic Claim (Canonical Appwrite SYSTEM_CONFIGS backing store)
    const effectiveWorkerId = (options as any)?.workerId || `worker_${process.pid || 1}_${Math.random().toString(36).slice(2, 7)}`;
    const claimResult = await tryAcquireAlertClaim(accountId, deduplicationKey, effectiveWorkerId);
    if (!claimResult.acquired) {
      // Safe Uncertain-Outcome Policy: dashboard notification must remain available even when WhatsApp delivery outcome is uncertain
      if (claimResult.claim?.deliveryState === "uncertain_reconciliation_required") {
        const existingDurable = canonicalDurableDashboardNotifications.get(accountId) || [];
        const notificationId = `crm_lead_${event.eventId}`;
        if (!existingDurable.some((n) => n.leadId === event.leadId || n.id === notificationId)) {
          const crmNotification: DashboardCrmNotificationRecord = {
            id: notificationId,
            accountId,
            source: "crm",
            sourceLabel: "CRM",
            title: `[Reconciliation Required] ${formatOwnerWhatsAppLeadAlert(event).split("\n")[0].replace(/\*/g, "")}`,
            description: `${event.summary} (WhatsApp delivery outcome uncertain after worker crash - please review)`,
            severity: "warn",
            type: "lead_event",
            leadId: event.leadId,
            eventType: event.eventType,
            createdAt: Math.floor(event.timestamp / 1000),
            read: false,
            completed: false,
          };
          canonicalDurableDashboardNotifications.set(accountId, [crmNotification, ...existingDurable].slice(0, 100));
          const existingInMem = inMemoryDashboardNotifications.get(accountId) || [];
          inMemoryDashboardNotifications.set(accountId, [crmNotification, ...existingInMem].slice(0, 100));
        }
      }

      return {
        success: true,
        duplicate: true,
        event,
        dashboardNotificationCreated: false,
        whatsappSent: false,
        whatsappMessageId: claimResult.claim?.messageReference,
      };
    }

    const now = Date.now();
    const notificationId = `crm_lead_${event.eventId}`;
    const existingRecord = getProactiveAlertRecord(accountId, deduplicationKey);

    // Mark as pending immediately in canonical store
    const initialRecord: ProactiveAlertRecord = {
      dedupKey: deduplicationKey,
      eventId: event.eventId,
      accountId,
      leadId: event.leadId,
      eventType: event.eventType,
      deliveryState: "pending",
      attemptTimestamp: now,
      dashboardNotificationId: notificationId,
      dashboardNotificationCreated: false,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now,
    };
    saveProactiveAlertRecord(initialRecord);

    // 4. Record to Dashboard Notification Center (CRM Source)
    const severityMap: Record<ProactiveLeadEvent["urgency"], "info" | "warn" | "danger" | "success"> = {
      low: "info",
      normal: "info",
      high: "warn",
      urgent: "danger",
    };

    const crmNotification: DashboardCrmNotificationRecord = {
      id: notificationId,
      accountId,
      source: "crm",
      sourceLabel: "CRM",
      title: formatOwnerWhatsAppLeadAlert(event).split("\n")[0].replace(/\*/g, ""),
      description: event.summary,
      severity: severityMap[event.urgency] || "info",
      type: "lead_event",
      leadId: event.leadId,
      eventType: event.eventType,
      createdAt: Math.floor(event.timestamp / 1000),
      read: false,
      completed: false,
    };

    const existingDurable = canonicalDurableDashboardNotifications.get(accountId) || [];
    if (!existingDurable.some((n) => n.id === notificationId)) {
      canonicalDurableDashboardNotifications.set(accountId, [crmNotification, ...existingDurable].slice(0, 100));
    }
    const existingInMem = inMemoryDashboardNotifications.get(accountId) || [];
    if (!existingInMem.some((n) => n.id === notificationId)) {
      inMemoryDashboardNotifications.set(accountId, [crmNotification, ...existingInMem].slice(0, 100));
    }

    initialRecord.dashboardNotificationCreated = true;
    initialRecord.updatedAt = Date.now();
    saveProactiveAlertRecord(initialRecord);

    if (options?.io) {
      try {
        options.io.emit("crm-lead-notification", crmNotification);
      } catch {
        // non-blocking
      }
    }

    // 5. Send Proactive WhatsApp Notification to Authorized Owner
    let whatsappSent = false;
    let whatsappMessageId: string | undefined = undefined;
    let sendError: string | undefined = undefined;

    try {
      const destination = await resolveAuthoritativeOwnerAlertDestination(accountId);
      if (destination.ownerJid) {
        const alertText = formatOwnerWhatsAppLeadAlert(event);
        let sendResult: any = null;

        if (options?.sock && typeof options.sock.sendMessage === "function") {
          sendResult = await options.sock.sendMessage(destination.ownerJid, { text: alertText });
        } else if (typeof options?.sendUniversalOutboundText === "function") {
          sendResult = await options.sendUniversalOutboundText({
            accountId,
            recipientJid: destination.ownerJid,
            text: alertText,
          });
        }

        if (sendResult?.key?.id || sendResult?.id || sendResult?.success === true || sendResult?.messageId) {
          whatsappSent = true;
          whatsappMessageId = sendResult?.key?.id || sendResult?.id || sendResult?.messageId || `msg_${Date.now()}`;
        } else if (sendResult && !sendResult.error) {
          whatsappSent = true;
          whatsappMessageId = `msg_${Date.now()}`;
        } else if (sendResult?.error) {
          sendError = String(sendResult.error);
        }

        if (whatsappSent && whatsappMessageId) {
          await recordAlertTransportSent(claimResult.claimId, whatsappMessageId);
        }
      } else {
        sendError = "no_owner_whatsapp_destination_configured";
      }
    } catch (err: any) {
      sendError = err?.message || String(err);
      console.warn(`[ProactiveLeadAlert] Outbound WhatsApp to owner failed (dashboard notification retained):`, sendError);
    }

    // 6. Update Delivery State
    initialRecord.updatedAt = Date.now();
    if (whatsappSent) {
      initialRecord.deliveryState = "sent";
      initialRecord.messageReference = whatsappMessageId;
      initialRecord.sanitizedError = undefined;
    } else {
      initialRecord.deliveryState = "failed";
      initialRecord.sanitizedError = sendError ? String(sendError).slice(0, 200) : "delivery_unconfirmed";
    }
    saveProactiveAlertRecord(initialRecord);
    await finalizeAlertClaim(claimResult.claimId, whatsappSent ? "sent" : "failed", whatsappMessageId, sendError);

    return {
      success: true,
      duplicate: false,
      event,
      dashboardNotificationCreated: true,
      whatsappSent,
      whatsappMessageId,
      error: sendError,
    };
  } finally {
    inFlightAlertLocks.delete(lockKey);
    resolveLock!();
  }
}

// ---------------------------------------------------------------------------
// Convenience Event Emitter
// ---------------------------------------------------------------------------

export async function emitProactiveLeadLifecycleEvent(input: {
  eventType: ProactiveLeadEventType;
  accountId: string;
  botId?: string;
  leadId: string;
  customerJid: string;
  customerName?: string;
  customerPhone?: string;
  departmentId?: string;
  departmentName?: string;
  serviceOrProduct?: string;
  summary: string;
  urgency?: "low" | "normal" | "high" | "urgent";
  intentConfidence?: number;
  metadata?: Record<string, any>;
  sock?: any;
  io?: any;
}): Promise<ProactiveAlertDispatchResult> {
  const now = Date.now();
  const stateHash = input.metadata?.version || input.metadata?.stateHash || `${input.departmentId || "nodept"}_${input.customerPhone || "nophone"}`;
  const deduplicationKey = `${input.accountId}:${input.leadId}:${input.eventType}:${stateHash}`;

  const event: ProactiveLeadEvent = {
    eventId: `ple_${now}_${Math.random().toString(36).slice(2, 7)}`,
    eventType: input.eventType,
    accountId: input.accountId,
    botId: input.botId || "bot_default",
    leadId: input.leadId,
    customerJid: input.customerJid,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    departmentId: input.departmentId,
    departmentName: input.departmentName,
    serviceOrProduct: input.serviceOrProduct,
    summary: input.summary,
    urgency: input.urgency || "normal",
    intentConfidence: input.intentConfidence,
    metadata: input.metadata,
    timestamp: now,
    deduplicationKey,
  };

  return dispatchProactiveLeadAlert(event, { sock: input.sock, io: input.io });
}
