/**
 * Canonical Content Library Group Reset Service
 *
 * Implements safe, durable, per-group Content Library reset semantics:
 * - Deletes / forgets BlackArrow indexed Content Library data for THAT ONE group only.
 * - Records a durable reset timestamp / tombstone (groupResetAt[groupJid] = timestamp).
 * - Prevents stale resurrection from botId store, connectedBotJid store, or legacy stores.
 * - Does NOT unlink the group, change its JID, wipe instructions, or alter other groups.
 * - Enforces owner/admin authorization for WhatsApp control commands.
 */

export type ContentLibraryPurpose = "media" | "sequence" | "welcome";

export interface ResetContentLibraryGroupInput {
  accountId?: string;
  botId: string;
  groupJid: string;
  purpose: ContentLibraryPurpose;
  source?: "whatsapp" | "dashboard" | "api";
  groupResetAt?: number;
}

export interface ResetContentLibraryGroupResult {
  success: boolean;
  groupJid: string;
  purpose: ContentLibraryPurpose;
  templateCount: number;
  resetAt: number;
}

/**
 * Returns true only if the text is an exact standalone "reset" or "- reset" command.
 */
export function isExactResetCommand(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const normalized = text.trim().toLowerCase();
  return normalized === "reset" || normalized === "- reset";
}

/**
 * Normalizes phone numbers to digits only for comparison.
 */
function normalizeDigits(phone: unknown): string {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "92" + digits.substring(1);
  }
  return digits;
}

/**
 * Security: Checks whether the sender of a WhatsApp message is authorized to execute a destructive reset.
 * Only the owner (`fromMe: true`) or verified admin identities matching the configured admin phone are authorized.
 */
export function isAuthorizedResetSender(params: {
  fromMe?: boolean;
  senderJid?: string;
  adminNumber?: string;
  adminVerifiedPhone?: string;
}): boolean {
  if (params.fromMe === true) {
    return true;
  }

  const senderDigits = normalizeDigits(params.senderJid?.split("@")[0] || "");
  if (!senderDigits) {
    return false;
  }

  const allowedAdmins = [
    normalizeDigits(params.adminNumber),
    normalizeDigits(params.adminVerifiedPhone),
  ].filter(Boolean);

  if (allowedAdmins.length === 0) {
    // If no admin number configured, only fromMe is authorized
    return false;
  }

  return allowedAdmins.some((adminDigits) => senderDigits === adminDigits || senderDigits.endsWith(adminDigits) || adminDigits.endsWith(senderDigits));
}

/**
 * Extracts a normalized timestamp in milliseconds from a message object.
 */
export function getMessageTimestampMs(msg: any): number {
  if (!msg) return 0;
  const raw = msg.messageTimestamp ?? msg.timestamp ?? msg.originalMessage?.messageTimestamp ?? msg.originalMessage?.timestamp;
  if (!raw) return 0;

  let val: number;
  if (typeof raw === "number") {
    val = raw;
  } else if (typeof raw === "object" && typeof (raw as any).low === "number") {
    val = (raw as any).low;
  } else {
    val = Number(raw) || 0;
  }

  // If timestamp is in seconds (< 100 billion, i.e. before year 5138), convert to milliseconds
  if (val > 0 && val < 100_000_000_000) {
    return val * 1000;
  }
  return val;
}

/**
 * Filters out any messages that predate or match the group reset threshold.
 * Messages without a determinable timestamp are discarded if a reset threshold is active.
 */
export function filterMessagesAfterReset(messages: any[], resetThreshold: number): any[] {
  if (!Array.isArray(messages)) return [];
  if (!resetThreshold || resetThreshold <= 0) return [...messages];

  return messages.filter((msg) => {
    const msgTs = getMessageTimestampMs(msg);
    // Strict invariant: only messages created strictly AFTER the reset threshold are kept
    return msgTs > resetThreshold;
  });
}

/**
 * Applies a per-group reset to a localStore dictionary in place.
 * Clears ONLY the targeted groupJid while preserving all other keys.
 */
export function applyGroupResetToStore(
  localStore: Record<string, any[]>,
  groupJid: string
): void {
  if (!groupJid || !localStore) return;
  localStore[groupJid] = [];
}

/**
 * Merges a new reset timestamp into the groupResetAt tombstone dictionary.
 */
export function recordGroupResetTimestamp(
  existingResetMap: Record<string, number> | undefined,
  groupJid: string,
  resetAt: number = Date.now()
): Record<string, number> {
  const result: Record<string, number> = { ...(existingResetMap || {}) };
  result[groupJid] = Math.max(result[groupJid] || 0, resetAt);
  return result;
}

/**
 * Prepares the template store payload with embedded durable tombstone metadata (__meta.groupResetAt).
 */
export function serializeTemplateStoreWithMeta(
  templateStore: Record<string, any[]>,
  groupResetAtMap: Record<string, number>
): Record<string, any> {
  const payload: Record<string, any> = { ...templateStore };
  payload.__meta = {
    ...(payload.__meta || {}),
    groupResetAt: { ...(groupResetAtMap || {}) },
    version: 2,
    updatedAt: Date.now(),
  };
  return payload;
}

/**
 * Input for pure tenant candidate resolution.
 */
export interface TenantCandidateResolutionInput {
  userId?: string;
  botId?: string;
  activeBots?: Array<{ id: string; userId: string; phoneNumber?: string }>;
  userConfigs?: Array<{ userId: string; adminNumber?: string }>;
  deletedBotArchives?: Array<{ userId: string; botId: string; phoneNumber?: string }>;
  manifests?: Array<{ key?: string; botId?: string; accountId?: string; userId?: string; version?: number }>;
  allBotsLookup?: Array<{ id: string; userId: string }>;
}

/**
 * Resolves candidate template store IDs strictly isolated to the specified tenant/user.
 * Enforces:
 * 1. Only bots proven to belong to targetUserId (active BOTS or deleted archives).
 * 2. Never accepts manifests solely because manifest.botId exists.
 * 3. Never returns bot IDs belonging to other tenants.
 */
export function resolveTenantTemplateStoreCandidates(input: TenantCandidateResolutionInput): string[] {
  let targetUserId = input.userId?.trim();

  // If userId was not passed, resolve from activeBots or allBotsLookup using botId
  if (!targetUserId && input.botId) {
    const matchedBot = input.activeBots?.find((b) => b.id === input.botId) ||
      input.allBotsLookup?.find((b) => b.id === input.botId);
    if (matchedBot?.userId) {
      targetUserId = matchedBot.userId;
    }
  }

  // Without a resolved tenant identity, fail closed
  if (!targetUserId) {
    return [];
  }

  const ownedBotIds = new Set<string>();
  const ownedPhoneJids = new Set<string>();

  // 1. Authoritative active bots strictly matching targetUserId
  if (Array.isArray(input.activeBots)) {
    for (const b of input.activeBots) {
      if (b && b.userId === targetUserId && b.id) {
        ownedBotIds.add(b.id);
        if (b.phoneNumber) {
          const digits = String(b.phoneNumber).replace(/\D/g, "");
          if (digits) ownedPhoneJids.add(`${digits}@s.whatsapp.net`);
        }
      }
    }
  }

  // 2. User configs admin number
  if (Array.isArray(input.userConfigs)) {
    for (const uc of input.userConfigs) {
      if (uc && uc.userId === targetUserId && uc.adminNumber) {
        const digits = String(uc.adminNumber).replace(/\D/g, "");
        if (digits) ownedPhoneJids.add(`${digits}@s.whatsapp.net`);
      }
    }
  }

  // 3. Deleted bot archives strictly matching targetUserId
  if (Array.isArray(input.deletedBotArchives)) {
    for (const arc of input.deletedBotArchives) {
      if (arc && arc.userId === targetUserId && arc.botId) {
        ownedBotIds.add(arc.botId);
        if (arc.phoneNumber) {
          const digits = String(arc.phoneNumber).replace(/\D/g, "");
          if (digits) ownedPhoneJids.add(`${digits}@s.whatsapp.net`);
        }
      }
    }
  }

  // Set of known foreign bots for cross-tenant conflict checks
  const foreignBotIds = new Set<string>();
  if (Array.isArray(input.allBotsLookup)) {
    for (const b of input.allBotsLookup) {
      if (b && b.userId && b.userId !== targetUserId && b.id) {
        foreignBotIds.add(b.id);
      }
    }
  }
  if (Array.isArray(input.activeBots)) {
    for (const b of input.activeBots) {
      if (b && b.userId && b.userId !== targetUserId && b.id) {
        foreignBotIds.add(b.id);
      }
    }
  }

  const candidateSet = new Set<string>();

  // If explicit botId was supplied, only accept it if proven to belong to targetUserId
  if (input.botId) {
    if (
      !foreignBotIds.has(input.botId) &&
      (ownedBotIds.has(input.botId) || ownedPhoneJids.has(input.botId))
    ) {
      candidateSet.add(input.botId);
    }
  }

  // Add all proven owned bot IDs and phone JIDs
  for (const id of ownedBotIds) {
    if (!foreignBotIds.has(id)) {
      candidateSet.add(id);
    }
  }
  for (const jid of ownedPhoneJids) {
    candidateSet.add(jid);
  }

  // 4. Manifest verification:
  // Before accepting manifest.botId: prove manifest.botId belongs to targetUserId
  if (Array.isArray(input.manifests)) {
    for (const manifest of input.manifests) {
      if (!manifest || !manifest.botId) continue;
      const mBotId = manifest.botId;

      // Never accept a botId that is known to belong to a foreign tenant
      if (foreignBotIds.has(mBotId)) {
        continue;
      }

      // If mBotId is already verified as owned by targetUserId:
      if (ownedBotIds.has(mBotId) || ownedPhoneJids.has(mBotId)) {
        candidateSet.add(mBotId);
        continue;
      }

      // If manifest explicitly has accountId or userId === targetUserId and is not foreign:
      const manifestOwner = manifest.accountId || manifest.userId;
      if (manifestOwner && manifestOwner === targetUserId) {
        candidateSet.add(mBotId);
      }

      // Legacy manifests without ownership proof are strictly IGNORED.
    }
  }

  return Array.from(candidateSet).filter(Boolean);
}

export interface FilterHydrationInput {
  incomingStore: Record<string, any>;
  configuredGroupJids: Set<string> | string[];
  existingGroupResetMap?: Record<string, number>;
}

export interface FilterHydrationResult {
  filteredStore: Record<string, any[]>;
  updatedGroupResetMap: Record<string, number>;
  totalRestored: number;
}

/**
 * Defense-in-depth hydration filter:
 * 1. Isolates group templates so only configured Content Library groups are hydrated into localStore.
 * 2. Isolates groupResetAt tombstones so foreign reset timestamps never enter botConfig.
 * 3. Filters out any messages created before the group reset threshold.
 */
export function filterHydrationStoresAndGroups(input: FilterHydrationInput): FilterHydrationResult {
  const allowedGroups = new Set(input.configuredGroupJids || []);
  const resetMap: Record<string, number> = { ...(input.existingGroupResetMap || {}) };
  const filteredStore: Record<string, any[]> = {};
  let totalRestored = 0;

  const rawMeta = input.incomingStore?.__meta;
  if (rawMeta?.groupResetAt && typeof rawMeta.groupResetAt === "object") {
    for (const [gJid, ts] of Object.entries(rawMeta.groupResetAt)) {
      if (allowedGroups.has(gJid)) {
        resetMap[gJid] = Math.max(resetMap[gJid] || 0, Number(ts) || 0);
      }
    }
  }

  for (const [k, val] of Object.entries(input.incomingStore || {})) {
    if (k === "__meta") continue;
    // Group-level isolation: only hydrate groups configured on this bot/account
    if (!allowedGroups.has(k)) {
      continue;
    }
    const resetThreshold = resetMap[k] || 0;
    const messages = Array.isArray(val) ? val : [];
    const validMessages = filterMessagesAfterReset(messages, resetThreshold);
    filteredStore[k] = validMessages;
    totalRestored += validMessages.length;
  }

  return {
    filteredStore,
    updatedGroupResetMap: resetMap,
    totalRestored,
  };
}
