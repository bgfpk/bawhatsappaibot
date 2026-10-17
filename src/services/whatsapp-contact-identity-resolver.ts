import fs from "node:fs";
import path from "node:path";
import { normalizeWhatsAppJid, extractPhoneDigits as extractPhoneDigitsUtil } from "../utils/whatsapp-jid.ts";

export type CanonicalContactIdentityInput = {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  participant?: string | null;
  participantAlt?: string | null;
  senderPn?: string | null;
  participantPn?: string | null;
  addressingMode?: string | null;
  signalRepository?: any;
  sock?: any;
  persistedMappings?: Map<string, string> | Record<string, string>;
  contactStore?: any;
  profile?: any;
  dataOwnerKey?: string;
};

export type CanonicalContactIdentity = {
  canonicalJid: string;
  phoneJid: string | null;
  phoneNumber: string | null;
  lidJid: string | null;
  displayJid: string;
  isPhoneResolved: boolean;
  resolutionSource:
    | "direct_pn"
    | "remote_jid_alt"
    | "sender_pn"
    | "participant_alt"
    | "participant_pn"
    | "persisted_lid_mapping"
    | "signal_repository"
    | "contact_store"
    | "unresolved_lid";
};

// In-memory mapping stores: lid -> pn and pn -> lid, scoped by tenant/dataOwnerKey and global fallback
const memoryLidToPnByOwner = new Map<string, Map<string, string>>();
const memoryPnToLidByOwner = new Map<string, Map<string, string>>();
const globalLidToPn = new Map<string, string>();
const globalPnToLid = new Map<string, string>();

const DATA_DIR = path.resolve(process.cwd(), "data", "lid-mappings");

function ensureDirectoryExists(dirPath: string) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch {}
}

function sanitizeKey(key: string) {
  return String(key || "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function getMappingFilePath(dataOwnerKey?: string) {
  const safeKey = sanitizeKey(dataOwnerKey || "global");
  return path.join(DATA_DIR, `lid-mappings-${safeKey}.json`);
}

function clean(value: any) {
  return String(value || "").trim();
}

export function isLidJid(value: any): boolean {
  const text = clean(value).toLowerCase();
  return text.endsWith("@lid") || text.endsWith("@hosted.lid");
}

export function isPhoneJid(value: any): boolean {
  const text = clean(value).toLowerCase();
  if (!text.endsWith("@s.whatsapp.net")) return false;
  const digits = text.split("@")[0].replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function extractPhoneDigits(value: any): string | null {
  return extractPhoneDigitsUtil(clean(value));
}

export function loadPersistedLidMappings(dataOwnerKey?: string): Record<string, string> {
  try {
    const filePath = getMappingFilePath(dataOwnerKey);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        const owner = dataOwnerKey || "global";
        if (!memoryLidToPnByOwner.has(owner)) {
          memoryLidToPnByOwner.set(owner, new Map());
          memoryPnToLidByOwner.set(owner, new Map());
        }
        const lidMap = memoryLidToPnByOwner.get(owner)!;
        const pnMap = memoryPnToLidByOwner.get(owner)!;

        for (const [lid, pn] of Object.entries(parsed)) {
          const normLid = clean(lid).toLowerCase();
          const normPn = clean(pn).toLowerCase();
          if (normLid && normPn) {
            lidMap.set(normLid, normPn);
            pnMap.set(normPn, normLid);
            globalLidToPn.set(normLid, normPn);
            globalPnToLid.set(normPn, normLid);
          }
        }
        return parsed;
      }
    }
  } catch {}
  return {};
}

export function savePersistedLidMappings(dataOwnerKey: string | undefined, mappings: Record<string, string>) {
  try {
    ensureDirectoryExists(DATA_DIR);
    const filePath = getMappingFilePath(dataOwnerKey);
    fs.writeFileSync(filePath, JSON.stringify(mappings, null, 2), "utf8");
  } catch (err: any) {
    console.error("[LidMapping] Failed to save mappings:", err?.message || err);
  }
}

export function recordLidPnMapping(input: {
  dataOwnerKey?: string;
  lid: string;
  pn: string;
  source?: string;
}): boolean {
  const normLid = clean(input.lid).toLowerCase();
  const rawPn = clean(input.pn);
  const digits = extractPhoneDigits(rawPn);
  if (!normLid || !isLidJid(normLid) || !digits) {
    return false;
  }
  const normPn = `${digits}@s.whatsapp.net`;

  const owner = input.dataOwnerKey || "global";
  if (!memoryLidToPnByOwner.has(owner)) {
    memoryLidToPnByOwner.set(owner, new Map());
    memoryPnToLidByOwner.set(owner, new Map());
    loadPersistedLidMappings(owner);
  }
  const lidMap = memoryLidToPnByOwner.get(owner)!;
  const pnMap = memoryPnToLidByOwner.get(owner)!;

  const currentPn = lidMap.get(normLid);
  if (currentPn === normPn) {
    return false; // Already mapped
  }

  lidMap.set(normLid, normPn);
  pnMap.set(normPn, normLid);
  if (owner === "global") {
    globalLidToPn.set(normLid, normPn);
    globalPnToLid.set(normPn, normLid);
  }

  // Convert map to plain object and persist to local fast cache
  const plainObj: Record<string, string> = {};
  for (const [k, v] of lidMap.entries()) {
    plainObj[k] = v;
  }
  savePersistedLidMappings(owner, plainObj);

  // Synchronize through canonical identity aliases model (Requirement #2)
  import("./customer-identity-resolver-service.ts")
    .then(({ recordVerifiedCustomerAlias }) => {
      recordVerifiedCustomerAlias({
        accountId: owner,
        alias: normLid,
        type: "lid",
        phone: digits,
        source: input.source || "whatsapp_mapping",
      });
      recordVerifiedCustomerAlias({
        accountId: owner,
        alias: normPn,
        type: "pn_jid",
        phone: digits,
        source: input.source || "whatsapp_mapping",
      });
    })
    .catch(() => {});

  // Synchronize to durable Appwrite customer profile and shared phone directory
  if (typeof process !== "undefined" && process.env?.APPWRITE_ENDPOINT) {
    if (input.dataOwnerKey && input.dataOwnerKey !== "global") {
      import("./db-service.ts")
        .then((dbService) => {
          dbService.updateCustomerProfile(input.dataOwnerKey!, normLid, {
            lidJid: normLid,
            phoneJid: normPn,
            phoneNumber: digits,
            whatsapp_number: digits,
            phone: digits,
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }

  return true;
}

export function getPersistedPnForLid(lid: string, dataOwnerKey?: string): string | null {
  const normLid = clean(lid).toLowerCase();
  if (!normLid) return null;

  if (dataOwnerKey && dataOwnerKey !== "global") {
    if (memoryLidToPnByOwner.has(dataOwnerKey)) {
      const pn = memoryLidToPnByOwner.get(dataOwnerKey)?.get(normLid);
      if (pn) return pn;
    }
    const loaded = loadPersistedLidMappings(dataOwnerKey);
    if (loaded[normLid]) return loaded[normLid];
    return null;
  }

  if (globalLidToPn.has(normLid)) {
    return globalLidToPn.get(normLid) || null;
  }
  const globalLoaded = loadPersistedLidMappings("global");
  return globalLoaded[normLid] || null;
}

export function getPersistedLidForPn(pn: string, dataOwnerKey?: string): string | null {
  const digits = extractPhoneDigits(pn);
  if (!digits) return null;
  const normPn = `${digits}@s.whatsapp.net`;

  if (dataOwnerKey && dataOwnerKey !== "global") {
    if (memoryPnToLidByOwner.has(dataOwnerKey)) {
      const lid = memoryPnToLidByOwner.get(dataOwnerKey)?.get(normPn);
      if (lid) return lid;
    }
    loadPersistedLidMappings(dataOwnerKey);
    const lid = memoryPnToLidByOwner.get(dataOwnerKey)?.get(normPn);
    if (lid) return lid;
    return null;
  }

  if (globalPnToLid.has(normPn)) {
    return globalPnToLid.get(normPn) || null;
  }
  loadPersistedLidMappings("global");
  return globalPnToLid.get(normPn) || null;
}

export function clearLidMappingsMemoryForTesting() {
  memoryLidToPnByOwner.clear();
  memoryPnToLidByOwner.clear();
  globalLidToPn.clear();
  globalPnToLid.clear();
}

export function clearAllPersistedLidMappingsForTesting() {
  clearLidMappingsMemoryForTesting();
  try {
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        if (file.startsWith("lid-mappings-")) {
          try { fs.unlinkSync(path.join(DATA_DIR, file)); } catch {}
        }
      }
    }
  } catch {}
}

/**
 * Resolves canonical WhatsApp contact identity following strict priority:
 * 1. Explicit PN JID from message metadata
 * 2. remoteJidAlt / participantAlt PN
 * 3. senderPn / participantPn
 * 4. Persisted trusted LID -> PN mapping
 * 5. signalRepository.lidMapping.getPNForLID
 * 6. Contact/app-state mapping
 * 7. Unresolved LID fallback
 *
 * CRITICAL: NEVER treats numeric portion of @lid as a phone number.
 */
export async function resolveCanonicalContactIdentity(
  input: CanonicalContactIdentityInput
): Promise<CanonicalContactIdentity> {
  const rawRemoteJid = clean(input.remoteJid);
  const rawRemoteJidAlt = clean(input.remoteJidAlt);
  const rawParticipant = clean(input.participant);
  const rawParticipantAlt = clean(input.participantAlt);
  const rawSenderPn = clean(input.senderPn);
  const rawParticipantPn = clean(input.participantPn);

  // Identify any LID candidate present in the input
  let lidCandidate: string | null = null;
  if (isLidJid(rawRemoteJid)) lidCandidate = rawRemoteJid;
  else if (isLidJid(rawRemoteJidAlt)) lidCandidate = rawRemoteJidAlt;
  else if (isLidJid(rawParticipant)) lidCandidate = rawParticipant;
  else if (isLidJid(rawParticipantAlt)) lidCandidate = rawParticipantAlt;
  else if (isLidJid(input.profile?.lidJid || input.profile?.lid)) {
    lidCandidate = clean(input.profile?.lidJid || input.profile?.lid);
  }

  // 1. Explicit PN JID from message metadata (remoteJid or participant)
  if (isPhoneJid(rawRemoteJid)) {
    const phoneNumber = extractPhoneDigits(rawRemoteJid)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    const resolvedLid = lidCandidate || getPersistedLidForPn(phoneJid, input.dataOwnerKey);
    if (resolvedLid && phoneJid) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: resolvedLid, pn: phoneJid, source: "direct_pn" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: resolvedLid,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "direct_pn",
    };
  }
  if (isPhoneJid(rawParticipant)) {
    const phoneNumber = extractPhoneDigits(rawParticipant)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    const resolvedLid = lidCandidate || getPersistedLidForPn(phoneJid, input.dataOwnerKey);
    if (resolvedLid && phoneJid) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: resolvedLid, pn: phoneJid, source: "direct_pn" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: resolvedLid,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "direct_pn",
    };
  }

  // 2. remoteJidAlt / participantAlt PN
  if (isPhoneJid(rawRemoteJidAlt)) {
    const phoneNumber = extractPhoneDigits(rawRemoteJidAlt)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    if (lidCandidate) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "remote_jid_alt" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "remote_jid_alt",
    };
  }
  if (isPhoneJid(rawParticipantAlt)) {
    const phoneNumber = extractPhoneDigits(rawParticipantAlt)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    if (lidCandidate) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "participant_alt" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "participant_alt",
    };
  }

  // 3. senderPn / participantPn
  const senderPnDigits = extractPhoneDigits(rawSenderPn);
  if (senderPnDigits) {
    const phoneJid = `${senderPnDigits}@s.whatsapp.net`;
    if (lidCandidate) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "sender_pn" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber: senderPnDigits,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "sender_pn",
    };
  }
  const participantPnDigits = extractPhoneDigits(rawParticipantPn);
  if (participantPnDigits) {
    const phoneJid = `${participantPnDigits}@s.whatsapp.net`;
    if (lidCandidate) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "participant_pn" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber: participantPnDigits,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "participant_pn",
    };
  }

  // B. Current connected socket: signalRepository.lidMapping.getPNForLID
  if (lidCandidate) {
    const signalRepo = input.signalRepository || input.sock?.signalRepository;
    if (signalRepo?.lidMapping && typeof signalRepo.lidMapping.getPNForLID === "function") {
      try {
        const repoPn = await signalRepo.lidMapping.getPNForLID(lidCandidate);
        const repoDigits = extractPhoneDigits(repoPn);
        if (repoDigits) {
          const phoneJid = `${repoDigits}@s.whatsapp.net`;
          recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "signal_repository" });
          return {
            canonicalJid: phoneJid,
            phoneJid,
            phoneNumber: repoDigits,
            lidJid: lidCandidate,
            displayJid: phoneJid,
            isPhoneResolved: true,
            resolutionSource: "signal_repository",
          };
        }
      } catch {}
    }
  }

  // C. Tenant + instance scoped durable Appwrite mapping
  if (lidCandidate && input.dataOwnerKey && typeof process !== "undefined" && process.env?.APPWRITE_ENDPOINT) {
    try {
      const { getCustomerProfile } = await import("./db-service.ts");
      const dbProfile = await getCustomerProfile(input.dataOwnerKey, lidCandidate).catch(() => null);
      const dbPhone = extractPhoneDigits(dbProfile?.phoneJid || dbProfile?.phoneNumber || dbProfile?.whatsapp_number || dbProfile?.phone);
      if (dbPhone) {
        const phoneJid = `${dbPhone}@s.whatsapp.net`;
        recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "persisted_lid_mapping" });
        return {
          canonicalJid: phoneJid,
          phoneJid,
          phoneNumber: dbPhone,
          lidJid: lidCandidate,
          displayJid: phoneJid,
          isPhoneResolved: true,
          resolutionSource: "persisted_lid_mapping",
        };
      }
    } catch {}
  }

  // D & E. Local memory cache and local disk cache (scoped to tenant)
  if (lidCandidate) {
    const persistedPn = getPersistedPnForLid(lidCandidate, input.dataOwnerKey);
    const persistedDigits = extractPhoneDigits(persistedPn);
    if (persistedDigits) {
      const phoneJid = `${persistedDigits}@s.whatsapp.net`;
      return {
        canonicalJid: phoneJid,
        phoneJid,
        phoneNumber: persistedDigits,
        lidJid: lidCandidate,
        displayJid: phoneJid,
        isPhoneResolved: true,
        resolutionSource: "persisted_lid_mapping",
      };
    }
  }

  // F. Contact / app-state / profile mapping (lower-trust helper)
  const profileCandidate = input.profile?.phoneJid || input.profile?.phoneNumber || input.profile?.whatsapp_number || input.profile?.phone || input.contactStore?.[lidCandidate || ""]?.phoneNumber;
  const profileDigits = extractPhoneDigits(profileCandidate);
  if (profileDigits) {
    const phoneJid = `${profileDigits}@s.whatsapp.net`;
    if (lidCandidate) {
      recordLidPnMapping({ dataOwnerKey: input.dataOwnerKey, lid: lidCandidate, pn: phoneJid, source: "contact_store" });
    }
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber: profileDigits,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "contact_store",
    };
  }

  // G. Unresolved LID fallback
  if (lidCandidate) {
    return {
      canonicalJid: lidCandidate,
      phoneJid: null,
      phoneNumber: null,
      lidJid: lidCandidate,
      displayJid: lidCandidate,
      isPhoneResolved: false,
      resolutionSource: "unresolved_lid",
    };
  }

  // Fallback for non-LID, non-phone raw JID (e.g. unknown string)
  const direct = rawRemoteJid || rawParticipant || "";
  return {
    canonicalJid: direct,
    phoneJid: null,
    phoneNumber: null,
    lidJid: null,
    displayJid: direct,
    isPhoneResolved: false,
    resolutionSource: "unresolved_lid",
  };
}

export function resolveCanonicalContactIdentitySync(
  input: CanonicalContactIdentityInput
): CanonicalContactIdentity {
  const rawRemoteJid = clean(input.remoteJid);
  const rawRemoteJidAlt = clean(input.remoteJidAlt);
  const rawParticipant = clean(input.participant);
  const rawParticipantAlt = clean(input.participantAlt);
  const rawSenderPn = clean(input.senderPn);
  const rawParticipantPn = clean(input.participantPn);

  let lidCandidate: string | null = null;
  if (isLidJid(rawRemoteJid)) lidCandidate = rawRemoteJid;
  else if (isLidJid(rawRemoteJidAlt)) lidCandidate = rawRemoteJidAlt;
  else if (isLidJid(rawParticipant)) lidCandidate = rawParticipant;
  else if (isLidJid(rawParticipantAlt)) lidCandidate = rawParticipantAlt;
  else if (isLidJid(input.profile?.lidJid || input.profile?.lid)) {
    lidCandidate = clean(input.profile?.lidJid || input.profile?.lid);
  }

  if (isPhoneJid(rawRemoteJid)) {
    const phoneNumber = extractPhoneDigits(rawRemoteJid)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    const resolvedLid = lidCandidate || getPersistedLidForPn(phoneJid, input.dataOwnerKey);
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: resolvedLid,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "direct_pn",
    };
  }
  if (isPhoneJid(rawParticipant)) {
    const phoneNumber = extractPhoneDigits(rawParticipant)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    const resolvedLid = lidCandidate || getPersistedLidForPn(phoneJid, input.dataOwnerKey);
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: resolvedLid,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "direct_pn",
    };
  }

  if (isPhoneJid(rawRemoteJidAlt)) {
    const phoneNumber = extractPhoneDigits(rawRemoteJidAlt)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "remote_jid_alt",
    };
  }
  if (isPhoneJid(rawParticipantAlt)) {
    const phoneNumber = extractPhoneDigits(rawParticipantAlt)!;
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "participant_alt",
    };
  }

  const senderPnDigits = extractPhoneDigits(rawSenderPn);
  if (senderPnDigits) {
    const phoneJid = `${senderPnDigits}@s.whatsapp.net`;
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber: senderPnDigits,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "sender_pn",
    };
  }
  const participantPnDigits = extractPhoneDigits(rawParticipantPn);
  if (participantPnDigits) {
    const phoneJid = `${participantPnDigits}@s.whatsapp.net`;
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber: participantPnDigits,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "participant_pn",
    };
  }

  if (lidCandidate) {
    const persistedPn = getPersistedPnForLid(lidCandidate, input.dataOwnerKey);
    const persistedDigits = extractPhoneDigits(persistedPn);
    if (persistedDigits) {
      const phoneJid = `${persistedDigits}@s.whatsapp.net`;
      return {
        canonicalJid: phoneJid,
        phoneJid,
        phoneNumber: persistedDigits,
        lidJid: lidCandidate,
        displayJid: phoneJid,
        isPhoneResolved: true,
        resolutionSource: "persisted_lid_mapping",
      };
    }
  }

  const profileCandidate = input.profile?.phoneJid || input.profile?.phoneNumber || input.profile?.whatsapp_number || input.profile?.phone || input.contactStore?.[lidCandidate || ""]?.phoneNumber;
  const profileDigits = extractPhoneDigits(profileCandidate);
  if (profileDigits) {
    const phoneJid = `${profileDigits}@s.whatsapp.net`;
    return {
      canonicalJid: phoneJid,
      phoneJid,
      phoneNumber: profileDigits,
      lidJid: lidCandidate,
      displayJid: phoneJid,
      isPhoneResolved: true,
      resolutionSource: "contact_store",
    };
  }

  if (lidCandidate) {
    return {
      canonicalJid: lidCandidate,
      phoneJid: null,
      phoneNumber: null,
      lidJid: lidCandidate,
      displayJid: lidCandidate,
      isPhoneResolved: false,
      resolutionSource: "unresolved_lid",
    };
  }

  const direct = rawRemoteJid || rawParticipant || "";
  return {
    canonicalJid: direct,
    phoneJid: null,
    phoneNumber: null,
    lidJid: null,
    displayJid: direct,
    isPhoneResolved: false,
    resolutionSource: "unresolved_lid",
  };
}
