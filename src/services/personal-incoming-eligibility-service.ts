/**
 * Incoming Personal Assistant Reply Eligibility Service
 * 
 * Provides a single canonical deterministic evaluation function to determine
 * whether a message received on a Personal WhatsApp instance is eligible for an auto-reply.
 */

import { isPersonalAssistantFeatureEnabled } from "./personal-assistant-config-service.ts";
import { isPersonalInstance, getControlBusinessInstanceId } from "./instance-purpose-service.ts";
import { getIncomingPersonalAssistantSettings } from "./personal-incoming-settings-service.ts";
import {
  acquireAtomicClaim,
  releaseAtomicClaim,
  getAtomicClaimStatus,
} from "./canonical-claim-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type {
  PersonalIncomingAssistantSettings,
  PersonalReplyEligibilityResult,
  PersonalReplyBlockReason,
} from "./personal-incoming-types.ts";

// ---------------------------------------------------------------------------
// 1. MANUAL TAKEOVER TRACKING
// ---------------------------------------------------------------------------

// Key: `${tenantId}::${instanceId}::${contactId}` -> expiryTimestamp
const manualTakeoverMap = new Map<string, number>();

export function getManualTakeoverKey(tenantId: string, instanceId: string, contactId: string): string {
  return `${tenantId}::${instanceId}::${contactId}`;
}

export function recordManualTakeover(
  tenantId: string,
  instanceId: string,
  contactId: string,
  durationMinutes = 60,
  now = Date.now()
): number {
  const durationMs = Math.max(1, durationMinutes) * 60 * 1000;
  const takeoverUntil = now + durationMs;
  const key = getManualTakeoverKey(tenantId, instanceId, contactId);
  manualTakeoverMap.set(key, takeoverUntil);
  const claimKey = `ptakeover:${tenantId}:${instanceId}:${contactId}`;
  acquireAtomicClaim(claimKey, "manual_takeover", durationMs, now).catch(() => {});
  return takeoverUntil;
}

export async function clearManualTakeover(tenantId: string, instanceId?: string, contactId?: string): Promise<void> {
  if (instanceId && contactId) {
    const key = getManualTakeoverKey(tenantId, instanceId, contactId);
    manualTakeoverMap.delete(key);
  }
  if (contactId) {
    const prefix = `${tenantId}::`;
    const suffix = `::${contactId}`;
    for (const key of manualTakeoverMap.keys()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        manualTakeoverMap.delete(key);
      }
    }
  }
  if (instanceId && contactId) {
    await releaseAtomicClaim(`ptakeover:${tenantId}:${instanceId}:${contactId}`, "manual_takeover").catch(() => {});
  }
}

export function isManualTakeoverActive(
  tenantId: string,
  instanceId: string,
  contactId: string,
  now = Date.now()
): { active: boolean; until?: number } {
  const key = getManualTakeoverKey(tenantId, instanceId, contactId);
  const until = manualTakeoverMap.get(key);
  if (!until) return { active: false };
  if (now > until) {
    manualTakeoverMap.delete(key);
    return { active: false };
  }
  return { active: true, until };
}

export async function isManualTakeoverActiveDurable(
  tenantId: string,
  instanceId: string,
  contactId: string,
  now = Date.now()
): Promise<{ active: boolean; until?: number }> {
  const fast = isManualTakeoverActive(tenantId, instanceId, contactId, now);
  if (fast.active) return fast;

  const claimKey = `ptakeover:${tenantId}:${instanceId}:${contactId}`;
  const claim = await getAtomicClaimStatus(claimKey).catch(() => null);
  if (claim && claim.expiresAt && claim.expiresAt > now) {
    manualTakeoverMap.set(getManualTakeoverKey(tenantId, instanceId, contactId), claim.expiresAt);
    return { active: true, until: claim.expiresAt };
  }
  return { active: false };
}

export function __resetManualTakeoversForTest(): void {
  manualTakeoverMap.clear();
}

// ---------------------------------------------------------------------------
// 2. RATE LIMITING & DEDUPLICATION TRACKING
// ---------------------------------------------------------------------------

// Deduplication: processed message IDs
const processedMessageIds = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isMessageAlreadyProcessed(messageId?: string, now = Date.now()): boolean {
  if (!messageId) return false;
  const seenAt = processedMessageIds.get(messageId);
  if (seenAt && now - seenAt < DEDUP_TTL_MS) {
    return true;
  }
  return false;
}

export function markMessageProcessed(messageId?: string, now = Date.now()): void {
  if (!messageId) return;
  processedMessageIds.set(messageId, now);
  // Periodic cleanup if map grows
  if (processedMessageIds.size > 2000) {
    for (const [id, time] of processedMessageIds.entries()) {
      if (now - time > DEDUP_TTL_MS) processedMessageIds.delete(id);
    }
  }
}

// Anti-loop rate limiting: max 5 replies per minute per contact
const contactReplyTimestamps = new Map<string, number[]>();

export function checkAndRecordRateLimit(
  tenantId: string,
  contactId: string,
  maxPerMinute = 5,
  now = Date.now()
): boolean {
  const key = `${tenantId}::${contactId}`;
  const timestamps = contactReplyTimestamps.get(key) || [];
  const oneMinuteAgo = now - 60 * 1000;
  const recent = timestamps.filter((t) => t > oneMinuteAgo);

  if (recent.length >= maxPerMinute) {
    return false; // Rate limited
  }

  recent.push(now);
  contactReplyTimestamps.set(key, recent);
  return true;
}

export function __resetEligibilityTrackingForTest(): void {
  for (const key of manualTakeoverMap.keys()) {
    const parts = key.split("::");
    if (parts.length === 3) {
      releaseAtomicClaim(`ptakeover:${parts[0]}:${parts[1]}:${parts[2]}`, "manual_takeover").catch(() => {});
    }
  }
  manualTakeoverMap.clear();
  processedMessageIds.clear();
  contactReplyTimestamps.clear();
}

// ---------------------------------------------------------------------------
// 3. CANONICAL ELIGIBILITY EVALUATOR
// ---------------------------------------------------------------------------

export interface EvaluateIncomingPersonalReplyInput {
  tenantId: string;
  botConfig: any;
  remoteJid: string;
  messageId?: string;
  isFromMe?: boolean;
  contact?: PersonalContact | null;
  isNewContact?: boolean;
  now?: number;
  injectedSettings?: PersonalIncomingAssistantSettings;
}

/**
 * Single deterministic eligibility decision for incoming Personal Assistant replies.
 */
export async function evaluateIncomingPersonalReply(
  input: EvaluateIncomingPersonalReplyInput
): Promise<PersonalReplyEligibilityResult> {
  const now = input.now || Date.now();
  const instanceId = String(input.botConfig?.$id || input.botConfig?.id || "default_instance");
  const tenantId = input.tenantId;

  // 1. Feature flag gate
  if (!isPersonalAssistantFeatureEnabled()) {
    const settings = input.injectedSettings || await getIncomingPersonalAssistantSettings(tenantId, instanceId);
    return { allowed: false, reason: "feature_disabled", contact: input.contact, settings };
  }

  // 2. Instance purpose gate
  if (!isPersonalInstance(input.botConfig)) {
    const settings = input.injectedSettings || await getIncomingPersonalAssistantSettings(tenantId, instanceId);
    return { allowed: false, reason: "instance_not_personal", contact: input.contact, settings };
  }

  // Load authoritative settings
  const settings = input.injectedSettings || await getIncomingPersonalAssistantSettings(tenantId, instanceId);

  // 3. Settings enabled gate
  if (!settings.enabled || settings.incomingReplyMode === "off") {
    return { allowed: false, reason: "incoming_assistant_disabled", contact: input.contact, settings };
  }

  // 4. Controlling Business Instance health & link check
  const controlBusinessInstanceId = getControlBusinessInstanceId(input.botConfig);
  if (!controlBusinessInstanceId) {
    return { allowed: false, reason: "control_business_unavailable", contact: input.contact, settings };
  }

  // 5. Chat type gate: ONLY direct 1-to-1 private chats allowed
  const jid = String(input.remoteJid || "").trim().toLowerCase();
  const isGroup = jid.endsWith("@g.us");
  const isBroadcast = jid.endsWith("@broadcast") || jid === "status@broadcast";
  const isNewsletter = jid.endsWith("@newsletter");
  if (!jid || isGroup || isBroadcast || isNewsletter) {
    return { allowed: false, reason: "unsupported_chat_type", contact: input.contact, settings };
  }

  // 6. Self chat gate
  const botPhone = String(input.botConfig?.phone || "").replace(/\D/g, "");
  const remoteDigits = jid.split("@")[0].replace(/\D/g, "");
  if (botPhone && remoteDigits && botPhone === remoteDigits) {
    return { allowed: false, reason: "self_chat", contact: input.contact, settings };
  }

  const contactId = input.contact?.contactId || (remoteDigits ? `pc_auto_${remoteDigits}` : `pc_jid_${jid}`);

  // 7. fromMe manual owner takeover gate
  if (input.isFromMe) {
    const takeoverUntil = recordManualTakeover(
      tenantId,
      instanceId,
      contactId,
      settings.manualTakeoverDurationMinutes,
      now
    );
    return {
      allowed: false,
      reason: "from_me_manual_takeover",
      contact: input.contact,
      settings,
      takeoverActive: true,
      takeoverUntil,
    };
  }

  // 8. Contact communication controls
  if (input.contact) {
    const prefs = input.contact.communicationPreferences;
    if (prefs?.doNotContact || prefs?.contactCommunicationStatus === "do_not_contact" || input.contact.status === "archived") {
      return { allowed: false, reason: "contact_do_not_contact", contact: input.contact, settings };
    }
    if (prefs?.contactCommunicationStatus === "blocked_by_owner") {
      return { allowed: false, reason: "contact_blocked", contact: input.contact, settings };
    }
    if (prefs?.contactCommunicationStatus === "paused_by_owner") {
      return { allowed: false, reason: "contact_paused", contact: input.contact, settings };
    }
  }

  // 9. Manual takeover active gate
  const takeover = await isManualTakeoverActiveDurable(tenantId, instanceId, contactId, now);
  if (takeover.active) {
    return {
      allowed: false,
      reason: "manual_takeover_active",
      contact: input.contact,
      settings,
      takeoverActive: true,
      takeoverUntil: takeover.until,
    };
  }

  // 10. Unknown contact policy
  const isUnknownContact = Boolean(input.isNewContact) || !input.contact;
  if (isUnknownContact) {
    if (settings.incomingReplyMode === "known_contacts_only" || settings.unknownContactPolicy === "ignore") {
      return { allowed: false, reason: "unknown_contact_not_allowed", contact: input.contact, settings };
    }
  }

  // 11. Quiet hours / operating hours gate
  if (settings.quietHours?.enabled) {
    try {
      const tz = settings.quietHours.timezone || "UTC";
      const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz });
      const currentHour = parseInt(formatter.format(new Date(now)), 10);
      const { startHour, endHour } = settings.quietHours;
      const isQuiet = startHour > endHour
        ? currentHour >= startHour || currentHour < endHour
        : currentHour >= startHour && currentHour < endHour;

      if (isQuiet) {
        return { allowed: false, reason: "outside_allowed_hours", contact: input.contact, settings };
      }
    } catch {}
  }

  // 12. Duplicate message idempotency gate
  if (input.messageId) {
    if (isMessageAlreadyProcessed(input.messageId, now)) {
      return { allowed: false, reason: "duplicate_message", contact: input.contact, settings };
    }
    const claimKey = `personal_inbound:${tenantId}:${instanceId}:${input.messageId}`;
    const claim = await getAtomicClaimStatus(claimKey).catch(() => null);
    if (claim && (claim.finalized || (claim.expiresAt && claim.expiresAt > now))) {
      return { allowed: false, reason: "duplicate_message", contact: input.contact, settings };
    }
  }

  // 13. Rate limit anti-loop gate
  if (!checkAndRecordRateLimit(tenantId, contactId, 5, now)) {
    return { allowed: false, reason: "rate_limited", contact: input.contact, settings };
  }

  // All gates passed!
  return {
    allowed: true,
    reason: "allowed",
    contact: input.contact,
    settings,
  };
}
