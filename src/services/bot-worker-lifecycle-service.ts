import { readProviderConfigFromBotDocument } from "./whatsapp-provider-bot-config-adapter.ts";

type BotRecord = Record<string, any>;

export type BotWorkerSpawnReason =
  | "startup_restore"
  | "watchdog_restore"
  | "worker_exit_restart"
  | "dashboard_wake"
  | "manual_activate"
  | "system_bot"
  | string;

type LifecycleDeps = {
  isEligible?: (bot: BotRecord | null | undefined) => boolean;
  listBots: () => Promise<BotRecord[]>;
  getBotById: (botId: string) => Promise<BotRecord | null | undefined>;
  spawnWorker: (botId: string, userId: string, reason: BotWorkerSpawnReason) => Promise<any>;
  isWorkerActive: (botId: string) => boolean;
  isWorkerSpawning: (botId: string) => boolean;
  logger?: Pick<Console, "log" | "warn" | "error">;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  nowMs?: () => number;
  minRestartDelayMs?: number;
  maxRestartDelayMs?: number;
};

const STOP_STATUSES = new Set([
  "disabled",
  "inactive",
  "stopped",
  "deleted",
  "removed",
  "reset",
  "reset_required",
  "login_required",
  "logged_out",
  "qr_required",
]);

function clean(value: any) {
  return String(value || "").trim();
}

export function getLifecycleBotId(bot: BotRecord | null | undefined) {
  return clean(bot?.$id || bot?.id || bot?.bot_id || bot?.botId);
}

export function getLifecycleBotUserId(bot: BotRecord | null | undefined) {
  return clean(bot?.user_id || bot?.userId || bot?.owner_id || bot?.ownerId);
}

function normalizeActiveFlag(value: any) {
  if (value === false || value === 0 || value === "0") return false;
  if (String(value || "").toLowerCase() === "false") return false;
  return true;
}

export function isActiveLinkedBot(bot: BotRecord | null | undefined) {
  if (!bot) return false;
  if (!getLifecycleBotId(bot) || !getLifecycleBotUserId(bot)) return false;
  if (!normalizeActiveFlag(bot.is_active ?? bot.isActive ?? bot.active ?? 1)) return false;
  if (bot.deleted || bot.removed) return false;

  const providerConfig = readProviderConfigFromBotDocument(bot);

  // Cloud API lifecycle: requires valid saved provider configuration, does not require Baileys JID
  if (providerConfig.providerType === "whatsapp_cloud_api") {
    if (!clean(providerConfig.phoneNumberId) || !clean(providerConfig.encryptedAccessTokenRef)) {
      return false;
    }
    const status = clean(
      bot.connection_status || bot.connectionStatus || bot.status || bot.login_status || bot.loginStatus
    ).toLowerCase();
    if (status === "disabled" || status === "inactive" || status === "stopped" || status === "deleted" || status === "removed") {
      return false;
    }
    return true;
  }

  // WhatsApp Web (Baileys) lifecycle: requires linked JID and healthy connection status
  if (!clean(bot.jid || bot.whatsapp_jid || bot.whatsappJid || bot.phone_jid || bot.phoneJid)) return false;

  const status = clean(bot.connection_status || bot.connectionStatus || bot.status || bot.login_status || bot.loginStatus).toLowerCase();
  if (STOP_STATUSES.has(status)) return false;
  if (bot.reset_required || bot.login_required || bot.logged_out) return false;
  return true;
}

export function shouldReleaseProxyForMissingWorker(bot: BotRecord | null | undefined) {
  return !isActiveLinkedBot(bot);
}

export function createBotWorkerLifecycleManager(deps: LifecycleDeps) {
  const eligible = deps.isEligible || isActiveLinkedBot;
  const logger = deps.logger || console;
  const setTimer = deps.setTimeoutFn || setTimeout;
  const clearTimer = deps.clearTimeoutFn || clearTimeout;
  const nowMs = deps.nowMs || (() => Date.now());
  const minDelay = Math.max(1000, deps.minRestartDelayMs ?? 15_000);
  const maxDelay = Math.max(minDelay, deps.maxRestartDelayMs ?? 5 * 60_000);
  const intentionalStops = new Map<string, string>();
  const restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const restartAttempts = new Map<string, number>();
  const retryAfter = new Map<string, number>();

  function canSpawnNow(botId: string) {
    return nowMs() >= (retryAfter.get(botId) || 0);
  }

  function getRestartDelayMs(botId: string) {
    const attempts = restartAttempts.get(botId) || 0;
    const delay = Math.min(maxDelay, minDelay * Math.pow(2, attempts));
    restartAttempts.set(botId, attempts + 1);
    retryAfter.set(botId, nowMs() + delay);
    return delay;
  }

  function clearRestartTimer(botId: string) {
    const timer = restartTimers.get(botId);
    if (timer) clearTimer(timer);
    restartTimers.delete(botId);
  }

  async function spawnIfEligible(bot: BotRecord, reason: BotWorkerSpawnReason) {
    const botId = getLifecycleBotId(bot);
    const userId = getLifecycleBotUserId(bot);
    if (!eligible(bot) || !botId || !userId) return { spawned: false, skipped: "not_active_linked" };
    if (deps.isWorkerActive(botId) || deps.isWorkerSpawning(botId)) return { spawned: false, skipped: "already_running" };
    if (!canSpawnNow(botId)) return { spawned: false, skipped: "backoff_active" };
    logger.log(`[Manager] ${reason}: spawning active linked bot ${botId}.`);
    try {
      await deps.spawnWorker(botId, userId, reason);
      restartAttempts.delete(botId);
      retryAfter.delete(botId);
      intentionalStops.delete(botId);
      return { spawned: true };
    } catch (error: any) {
      const delay = getRestartDelayMs(botId);
      logger.warn(`[Manager] ${reason}: failed to spawn bot ${botId}; retry after ${Math.round(delay / 1000)}s: ${error?.message || error}`);
      return { spawned: false, skipped: "spawn_failed" };
    }
  }

  async function restoreActiveLinkedWorkers(reason: BotWorkerSpawnReason) {
    const bots = await deps.listBots();
    const results = [];
    for (const bot of bots || []) {
      results.push(await spawnIfEligible(bot, reason));
    }
    return results;
  }

  function scheduleRestart(botId: string, reason: BotWorkerSpawnReason) {
    if (!botId || restartTimers.has(botId)) return;
    const delay = getRestartDelayMs(botId);
    logger.warn(`[Manager] ${reason}: scheduling restart for bot ${botId} in ${Math.round(delay / 1000)}s.`);
    const timer = setTimer(async () => {
      restartTimers.delete(botId);
      try {
        const bot = await deps.getBotById(botId);
        if (!eligible(bot)) return;
        await spawnIfEligible(bot as BotRecord, reason);
      } catch (error: any) {
        logger.error(`[Manager] ${reason}: restart check failed for bot ${botId}: ${error?.message || error}`);
        scheduleRestart(botId, reason);
      }
    }, delay);
    restartTimers.set(botId, timer);
  }

  async function handleWorkerExit(botId: string) {
    if (!botId) return;
    clearRestartTimer(botId);
    if (intentionalStops.has(botId)) {
      logger.log(`[Manager] intentional_stop_no_restart: bot ${botId} (${intentionalStops.get(botId) || "manual stop"}).`);
      return;
    }
    const bot = await deps.getBotById(botId).catch(() => null);
    if (eligible(bot)) {
      scheduleRestart(botId, "worker_exit_restart");
    }
  }

  function markIntentionalStop(botId: string, reason = "intentional stop") {
    if (!botId) return;
    intentionalStops.set(botId, reason);
    clearRestartTimer(botId);
  }

  function clearIntentionalStop(botId: string) {
    intentionalStops.delete(botId);
  }

  return {
    restoreActiveLinkedWorkers,
    handleWorkerExit,
    markIntentionalStop,
    clearIntentionalStop,
    noteWorkerSpawned(botId: string) {
      restartAttempts.delete(botId);
      retryAfter.delete(botId);
      clearRestartTimer(botId);
    },
    shouldReleaseProxyForMissingWorker,
    isActiveLinkedBot,
  };
}
