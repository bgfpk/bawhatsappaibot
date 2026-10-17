export const INSTANCE_IDLE_SECONDS = 24 * 60 * 60;

export type InstanceActivityDirection = "inbound" | "outbound" | "connected" | "disconnected" | "status";

type BotLike = {
  $id?: string;
  id?: string;
  jid?: string;
  user_id?: string;
  is_active?: any;
  last_inbound_at?: any;
  last_outbound_at?: any;
  last_message_at?: any;
};

function clean(value: any) {
  return String(value || "").trim();
}

function toSeconds(value: any) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 100000000000 ? Math.floor(parsed / 1000) : Math.floor(parsed);
}

function getFallbackActivity(bot: BotLike) {
  const raw = (bot as any)?.config_settings;
  if (!raw) return {};
  try {
    const parsed = typeof raw === "object" ? raw : JSON.parse(raw);
    return parsed?.__instanceActivity && typeof parsed.__instanceActivity === "object" ? parsed.__instanceActivity : {};
  } catch {
    return {};
  }
}

export function buildInstanceActivityPatch(input: {
  direction: InstanceActivityDirection;
  timestamp?: number;
  connectionStatus?: string;
  releaseReason?: string;
}) {
  const timestamp = toSeconds(input.timestamp) || Math.floor(Date.now() / 1000);
  const patch: any = {};
  if (input.direction === "inbound") {
    patch.last_inbound_at = timestamp;
    patch.last_message_at = timestamp;
  } else if (input.direction === "outbound") {
    patch.last_outbound_at = timestamp;
    patch.last_message_at = timestamp;
  } else if (input.direction === "connected") {
    patch.last_connected_at = timestamp;
  } else if (input.direction === "disconnected") {
    patch.last_disconnected_at = timestamp;
  }
  if (input.connectionStatus) patch.connection_status = clean(input.connectionStatus);
  if (input.releaseReason) {
    patch.proxy_released_at = timestamp;
    patch.proxy_release_reason = clean(input.releaseReason);
  }
  return patch;
}

export function buildCustomerOriginPatch(input: {
  botId?: string;
  botJid?: string;
  direction: "inbound" | "outbound";
  existingProfile?: any;
}) {
  const botId = clean(input.botId);
  const botJid = clean(input.botJid);
  const patch: any = {};
  if (input.direction === "inbound") {
    if (botId && !clean(input.existingProfile?.originBotId)) patch.originBotId = botId;
    if (botJid && !clean(input.existingProfile?.originBotJid)) patch.originBotJid = botJid;
    if (botId) patch.lastInboundBotId = botId;
    if (botJid) patch.lastInboundBotJid = botJid;
  } else {
    if (botId) patch.lastOutboundBotId = botId;
    if (botJid) patch.lastOutboundBotJid = botJid;
  }
  return patch;
}

export function getInstanceLastActivityAt(bot: BotLike) {
  const fallback = getFallbackActivity(bot);
  return Math.max(
    toSeconds(bot?.last_inbound_at || fallback.last_inbound_at),
    toSeconds(bot?.last_outbound_at || fallback.last_outbound_at),
    toSeconds(bot?.last_message_at || fallback.last_message_at)
  );
}

export function isInstanceRecent(bot: BotLike, nowSeconds = Math.floor(Date.now() / 1000), idleSeconds = INSTANCE_IDLE_SECONDS) {
  const last = getInstanceLastActivityAt(bot);
  return last > 0 && nowSeconds - last < idleSeconds;
}

export function hasReliableActivity(bot: BotLike) {
  return getInstanceLastActivityAt(bot) > 0;
}

export function decideProxyReleaseForUser(input: {
  targetBot: BotLike;
  userBots: BotLike[];
  nowSeconds?: number;
  idleSeconds?: number;
}) {
  const nowSeconds = input.nowSeconds || Math.floor(Date.now() / 1000);
  const idleSeconds = input.idleSeconds || INSTANCE_IDLE_SECONDS;
  const targetBot = input.targetBot || {};
  const linked = Boolean(clean(targetBot.jid));
  const activeOrRecentSibling = (input.userBots || []).some((bot) => {
    const same = clean(bot.$id || bot.id) === clean(targetBot.$id || targetBot.id);
    if (same) return false;
    return Boolean(clean(bot.jid)) && !(bot.is_active === 0 || bot.is_active === false || bot.is_active === "0") && isInstanceRecent(bot, nowSeconds, idleSeconds);
  });

  if (activeOrRecentSibling) return { release: false, reason: "release_skipped_shared_user_proxy" };
  if (!linked) return { release: true, reason: "proxy_released_due_to_unlinked" };
  if (!hasReliableActivity(targetBot)) return { release: false, reason: "release_skipped_activity_unknown" };
  if (isInstanceRecent(targetBot, nowSeconds, idleSeconds)) return { release: false, reason: "release_skipped_active_recent" };
  return { release: true, reason: "proxy_released_due_to_24h_inactive" };
}
