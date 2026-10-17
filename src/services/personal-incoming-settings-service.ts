/**
 * Incoming Personal Assistant Settings Service
 * 
 * Provides server-authoritative configuration management for Personal Instances.
 * Enforces "Default Off", full authored instruction preservation, and tenant/instance isolation.
 */

import { createHash } from "node:crypto";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";
import type {
  PersonalIncomingAssistantSettings,
  PersonalIncomingReplyMode,
  PersonalUnknownContactPolicy,
  PersonalAssistantDisclosureMode,
} from "./personal-incoming-types.ts";

function hashKey(val: string, len = 12): string {
  return createHash("sha256").update(val).digest("hex").slice(0, len);
}

export function buildIncomingSettingsDocId(tenantId: string, instanceId: string): string {
  const tHash = hashKey(String(tenantId || "default_tenant"));
  const iHash = hashKey(String(instanceId || "default_instance"));
  return `pias_${tHash}_${iHash}`; // 5 + 12 + 1 + 12 = 30 chars (<= 36 limit)
}

export function getDefaultIncomingPersonalAssistantSettings(): PersonalIncomingAssistantSettings {
  return {
    enabled: false, // Invariant: Default must be OFF
    incomingReplyMode: "off",
    globalInstructions: "",
    assistantDisplayName: "Personal Assistant",
    disclosureMode: "first_contact",
    unknownContactPolicy: "ignore",
    manualTakeoverDurationMinutes: 60,
    ownerEscalationEnabled: true,
    memoryEnabled: true,
    updatedAt: Date.now(),
  };
}

// In-memory cache for fast lookup with 3-minute TTL
interface CachedSettings {
  settings: PersonalIncomingAssistantSettings;
  cachedAt: number;
}
const settingsCache = new Map<string, CachedSettings>();
const SETTINGS_CACHE_TTL_MS = 3 * 60 * 1000;

export function __clearIncomingSettingsCache(): void {
  settingsCache.clear();
}

/**
 * Normalizes input settings with safe conservative defaults (fail-closed).
 */
export function normalizeIncomingSettings(
  input: any,
  fallback = getDefaultIncomingPersonalAssistantSettings()
): PersonalIncomingAssistantSettings {
  if (!input || typeof input !== "object") {
    return { ...fallback };
  }

  const enabled = input.enabled === true;
  let incomingReplyMode: PersonalIncomingReplyMode = "off";
  if (input.incomingReplyMode === "known_contacts_only" || input.incomingReplyMode === "all_private_contacts") {
    incomingReplyMode = input.incomingReplyMode;
  } else if (enabled) {
    incomingReplyMode = "known_contacts_only";
  }

  let disclosureMode: PersonalAssistantDisclosureMode = "first_contact";
  if (input.disclosureMode === "always" || input.disclosureMode === "never") {
    disclosureMode = input.disclosureMode;
  }

  let unknownContactPolicy: PersonalUnknownContactPolicy = "ignore";
  if (input.unknownContactPolicy === "reply" || incomingReplyMode === "all_private_contacts") {
    unknownContactPolicy = "reply";
  }

  const manualTakeoverDurationMinutes = Number.isFinite(input.manualTakeoverDurationMinutes) && input.manualTakeoverDurationMinutes > 0
    ? Math.min(Math.max(1, Math.floor(input.manualTakeoverDurationMinutes)), 1440)
    : 60;

  return {
    enabled,
    incomingReplyMode,
    globalInstructions: typeof input.globalInstructions === "string" ? input.globalInstructions : fallback.globalInstructions,
    assistantDisplayName: typeof input.assistantDisplayName === "string" && input.assistantDisplayName.trim()
      ? input.assistantDisplayName.trim()
      : fallback.assistantDisplayName,
    disclosureMode,
    unknownContactPolicy,
    manualTakeoverDurationMinutes,
    quietHours: input.quietHours && typeof input.quietHours === "object" ? {
      enabled: input.quietHours.enabled === true,
      startHour: Number(input.quietHours.startHour) || 22,
      endHour: Number(input.quietHours.endHour) || 8,
      timezone: typeof input.quietHours.timezone === "string" ? input.quietHours.timezone : "UTC",
    } : undefined,
    ownerEscalationEnabled: input.ownerEscalationEnabled !== false,
    memoryEnabled: input.memoryEnabled !== false,
    updatedAt: Number(input.updatedAt) || Date.now(),
  };
}

/**
 * Retrieves incoming assistant settings for a specific personal instance with caching.
 */
export async function getIncomingPersonalAssistantSettings(
  tenantId: string,
  instanceId: string
): Promise<PersonalIncomingAssistantSettings> {
  const cacheKey = `${tenantId}::${instanceId}`;
  const cached = settingsCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SETTINGS_CACHE_TTL_MS) {
    return { ...cached.settings };
  }

  const docId = buildIncomingSettingsDocId(tenantId, instanceId);
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId);
    let parsed: any = null;
    if (doc?.value) {
      parsed = typeof doc.value === "string" ? JSON.parse(doc.value) : doc.value;
    }
    const normalized = normalizeIncomingSettings(parsed);
    settingsCache.set(cacheKey, { settings: normalized, cachedAt: Date.now() });
    return normalized;
  } catch (err: any) {
    // Document not found -> return safe default (disabled)
    const def = getDefaultIncomingPersonalAssistantSettings();
    settingsCache.set(cacheKey, { settings: def, cachedAt: Date.now() });
    return def;
  }
}

/**
 * Saves incoming assistant settings for a specific personal instance.
 * Preserves the full authored instructions without truncation.
 */
export async function saveIncomingPersonalAssistantSettings(
  tenantId: string,
  instanceId: string,
  patch: Partial<PersonalIncomingAssistantSettings>
): Promise<PersonalIncomingAssistantSettings> {
  const current = await getIncomingPersonalAssistantSettings(tenantId, instanceId);
  const updated = normalizeIncomingSettings(
    { ...current, ...patch, updatedAt: Date.now() },
    current
  );

  const docId = buildIncomingSettingsDocId(tenantId, instanceId);
  const serialized = JSON.stringify(updated);

  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, {
      value: serialized,
      updated_at: nowSec,
    });
  } catch (err: any) {
    // If doesn't exist, create it
    try {
      await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, {
        value: serialized,
        updated_at: nowSec,
      });
    } catch (createErr: any) {
      console.error("[PersonalAssistantSettings] Failed saving settings:", createErr?.message || createErr);
      throw createErr;
    }
  }

  const cacheKey = `${tenantId}::${instanceId}`;
  settingsCache.set(cacheKey, { settings: updated, cachedAt: Date.now() });
  return updated;
}
