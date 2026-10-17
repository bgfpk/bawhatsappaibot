import crypto from "crypto";
import { Query } from "node-appwrite";
import { COLLECTIONS, DATABASE_ID, databases, getBotById, getSystemConfig, setSystemConfig } from "./db-service.ts";

type LockRecord = {
  jid: string;
  ownerUserId: string;
  ownerBotId: string;
  firstLockedAt: number;
  lastConnectedBotId: string;
  updatedAt: number;
};

const whatsappLockDeps = {
  isUniquenessEnforced: () => {
    const envVal = process.env.ENFORCE_UNIQUE_WHATSAPP_NUMBER;
    return envVal === "true" || envVal === "1";
  },
  getSystemConfig,
  setSystemConfig,
  getBotById,
  listBotsByJid: async (jid: string) => {
    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
      Query.equal("jid", jid),
      Query.limit(20),
    ]).catch(() => ({ documents: [] } as any));
    return response.documents || [];
  },
  deleteSystemConfig: async (key: string) => {
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
  },
};

export function __setWhatsAppNumberLockTestDeps(overrides: Partial<typeof whatsappLockDeps>) {
  Object.assign(whatsappLockDeps, overrides || {});
}

export function __resetWhatsAppNumberLockTestDeps() {
  Object.assign(whatsappLockDeps, {
    isUniquenessEnforced: () => {
      const envVal = process.env.ENFORCE_UNIQUE_WHATSAPP_NUMBER;
      return envVal === "true" || envVal === "1";
    },
    getSystemConfig,
    setSystemConfig,
    getBotById,
    listBotsByJid: async (jid: string) => {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BOTS, [
        Query.equal("jid", jid),
        Query.limit(20),
      ]).catch(() => ({ documents: [] } as any));
      return response.documents || [];
    },
    deleteSystemConfig: async (key: string) => {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, key);
    },
  });
}

export function isWhatsAppNumberUniquenessEnforced(): boolean {
  if (typeof (whatsappLockDeps as any).isUniquenessEnforced === "function") {
    return (whatsappLockDeps as any).isUniquenessEnforced();
  }
  const envVal = process.env.ENFORCE_UNIQUE_WHATSAPP_NUMBER;
  return envVal === "true" || envVal === "1";
}

function now() {
  return Math.floor(Date.now() / 1000);
}

export function normalizeWhatsAppJid(value: string) {
  const raw = String(value || "").trim();
  const phone = raw.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  return phone ? `${phone}@s.whatsapp.net` : "";
}

function lockKey(jid: string) {
  const hash = crypto.createHash("sha1").update(jid).digest("hex").slice(0, 22);
  return `wa_lock_${hash}`;
}

function phoneLabel(jid: string) {
  const phone = jid.split("@")[0];
  return phone ? `+${phone}` : "this WhatsApp number";
}

async function readLock(jid: string): Promise<LockRecord | null> {
  const raw = await whatsappLockDeps.getSystemConfig(lockKey(jid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const ownerUserId = String(parsed?.ownerUserId || parsed?.userId || "").trim();
    if (!ownerUserId) return null;
    return {
      jid: normalizeWhatsAppJid(parsed?.jid || jid),
      ownerUserId,
      ownerBotId: String(parsed?.ownerBotId || parsed?.botId || "").trim(),
      firstLockedAt: Number(parsed?.firstLockedAt || parsed?.lockedAt || now()),
      lastConnectedBotId: String(parsed?.lastConnectedBotId || parsed?.botId || parsed?.ownerBotId || "").trim(),
      updatedAt: Number(parsed?.updatedAt || now()),
    };
  } catch {
    return null;
  }
}

async function writeLock(record: LockRecord) {
  await whatsappLockDeps.setSystemConfig(lockKey(record.jid), JSON.stringify(record));
}

async function findExistingBotForJid(jid: string, exceptBotId: string) {
  const bots = await whatsappLockDeps.listBotsByJid(jid);
  return (bots || []).find((bot: any) => {
    const id = bot.$id || bot.id;
    return id !== exceptBotId;
  }) || null;
}

export async function verifyWhatsAppNumberLock(input: {
  jid: string;
  userId: string;
  botId: string;
}) {
  const jid = normalizeWhatsAppJid(input.jid);
  if (!jid || !input.userId || !input.botId) {
    return { allowed: false, jid, message: "WhatsApp number lock check failed. Please reconnect this instance." };
  }

  const currentBot = await whatsappLockDeps.getBotById(input.botId) as any;
  const currentBotJid = normalizeWhatsAppJid(currentBot?.jid || "");
  if (currentBotJid && currentBotJid !== jid) {
    console.warn(`[WhatsAppNumberLock] Relink blocked for bot ${input.botId}: current ${currentBotJid}, scanned ${jid}. Reset/login removal required first.`);
    return {
      allowed: false,
      jid,
      message: `This instance is locked to ${phoneLabel(currentBotJid)}. Ask a super admin to unlink it before scanning ${phoneLabel(jid)} here.`
    };
  }

  let existingLock = await readLock(jid);
  const existingBot = await findExistingBotForJid(jid, input.botId);
  if (!existingLock && existingBot?.user_id) {
    existingLock = {
      jid,
      ownerUserId: String(existingBot.user_id || "").trim(),
      ownerBotId: String(existingBot.$id || existingBot.id || "").trim(),
      firstLockedAt: now(),
      lastConnectedBotId: String(existingBot.$id || existingBot.id || "").trim(),
      updatedAt: now(),
    };
    await writeLock(existingLock);
    console.log(`[WhatsAppNumberLock] Backfilled owner lock for ${jid} from existing bot ${existingLock.ownerBotId}.`);
  }

  if (isWhatsAppNumberUniquenessEnforced()) {
    if (existingLock?.ownerUserId && existingLock.ownerUserId !== input.userId) {
      console.warn(`[WhatsAppNumberLock] Duplicate-number block for ${jid}: requested by user ${input.userId}, owned by user ${existingLock.ownerUserId}.`);
      return {
        allowed: false,
        jid,
        ownerUserId: existingLock.ownerUserId,
        ownerBotId: existingLock.ownerBotId || existingLock.lastConnectedBotId,
        message: `${phoneLabel(jid)} is already locked to another BlackArrow account. Log in to its original account, or ask a super admin to unlink it from Admin Panel before scanning it here.`
      };
    }

    if (existingBot && String(existingBot.user_id || "").trim() && String(existingBot.user_id || "").trim() !== input.userId) {
      console.warn(`[WhatsAppNumberLock] Existing bot duplicate block for ${jid}: requested bot ${input.botId}, existing bot ${existingBot.$id || existingBot.id}, user ${existingBot.user_id}.`);
      return {
        allowed: false,
        jid,
        ownerUserId: existingBot.user_id,
        ownerBotId: existingBot.$id || existingBot.id,
        message: `${phoneLabel(jid)} is already linked to another BlackArrow instance. Use the original account, or ask a super admin to unlink it first.`
      };
    }
  } else {
    console.log(`[WhatsAppNumberLock] Global uniqueness enforcement disabled. Allowing JID ${jid} for user ${input.userId}, bot ${input.botId}.`);
  }

  await writeLock({
    jid,
    ownerUserId: existingLock?.ownerUserId || input.userId,
    ownerBotId: existingLock?.ownerBotId || input.botId,
    firstLockedAt: existingLock?.firstLockedAt || now(),
    lastConnectedBotId: input.botId,
    updatedAt: now()
  });

  console.log(`[WhatsAppNumberLock] Connected ${jid} to user ${input.userId}, bot ${input.botId}.`);
  return { allowed: true, jid };
}

export async function releaseWhatsAppNumberLock(jid: string, expectedBotId?: string) {
  const normalized = normalizeWhatsAppJid(jid);
  if (!normalized) return false;
  try {
    const existingLock = await readLock(normalized);
    const matchesExpectedBot = !expectedBotId || [
      existingLock?.ownerBotId,
      existingLock?.lastConnectedBotId,
    ].filter(Boolean).includes(expectedBotId);
    if (expectedBotId && existingLock && !matchesExpectedBot) {
      console.warn(`[WhatsAppNumberLock] Delink skipped for ${normalized}: expected bot ${expectedBotId}, lock belongs to ${existingLock.ownerBotId || existingLock.lastConnectedBotId}.`);
      return false;
    }
    await whatsappLockDeps.deleteSystemConfig(lockKey(normalized));
    console.log(`[WhatsAppNumberLock] Released permanent ownership for ${normalized}${expectedBotId ? ` from bot ${expectedBotId}` : ""}.`);
    return true;
  } catch (e: any) {
    console.warn(`[WhatsAppNumberLock] Release failed for ${normalized}: ${e?.message || e}`);
    return false;
  }
}
