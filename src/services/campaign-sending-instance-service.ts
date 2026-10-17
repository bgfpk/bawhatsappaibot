export type CampaignSendFromMode = "default_only" | "customer_origin_then_default";

export type CampaignFallbackReason =
  | "default_used_by_campaign_mode"
  | "customer_has_no_origin"
  | "origin_missing"
  | "origin_unlinked"
  | "origin_inactive"
  | "origin_disconnected";

type ResolveCampaignSendingInstanceInput = {
  defaultBotId?: string;
  sendFromMode?: string;
  customer?: any;
  bots?: any[];
  isBotConnected?: (bot: any) => boolean;
};

function clean(value: any) {
  return String(value || "").trim();
}

export function normalizeCampaignSendFromMode(value: any): CampaignSendFromMode {
  return clean(value) === "customer_origin_then_default" ? "customer_origin_then_default" : "default_only";
}

export function getBotStableId(bot: any) {
  return clean(bot?.$id || bot?.id);
}

function getProfile(customer: any) {
  const profile = customer?.profile;
  if (!profile) return {};
  if (typeof profile === "object") return profile;
  try {
    return JSON.parse(profile);
  } catch {
    return {};
  }
}

export function getCustomerOriginBotId(customer: any) {
  const profile = getProfile(customer);
  return clean(
    customer?.originBotId ||
    customer?.lastInboundBotId ||
    customer?.sourceBotId ||
    profile.originBotId ||
    profile.lastInboundBotId
  );
}

function findBot(bots: any[], botId: string) {
  if (!botId) return null;
  return bots.find((bot) => getBotStableId(bot) === botId || clean(bot?.jid) === botId) || null;
}

function isLinked(bot: any) {
  return Boolean(clean(bot?.jid));
}

function isActive(bot: any) {
  return !(bot?.is_active === 0 || bot?.is_active === false || bot?.is_active === "0");
}

export function resolveCampaignSendingInstance(input: ResolveCampaignSendingInstanceInput) {
  const bots = Array.isArray(input.bots) ? input.bots : [];
  const mode = normalizeCampaignSendFromMode(input.sendFromMode);
  const defaultBot = findBot(bots, clean(input.defaultBotId));
  const defaultReason: CampaignFallbackReason = mode === "default_only"
    ? "default_used_by_campaign_mode"
    : "customer_has_no_origin";

  if (mode === "default_only") {
    return {
      bot: defaultBot,
      botId: getBotStableId(defaultBot) || clean(input.defaultBotId),
      botJid: clean(defaultBot?.jid),
      defaultBotId: clean(input.defaultBotId),
      sendFromMode: mode,
      fallbackReason: defaultReason,
    };
  }

  const originBotId = getCustomerOriginBotId(input.customer);
  if (!originBotId) {
    return {
      bot: defaultBot,
      botId: getBotStableId(defaultBot) || clean(input.defaultBotId),
      botJid: clean(defaultBot?.jid),
      defaultBotId: clean(input.defaultBotId),
      sendFromMode: mode,
      fallbackReason: "customer_has_no_origin" as CampaignFallbackReason,
    };
  }

  const originBot = findBot(bots, originBotId);
  if (!originBot) {
    return {
      bot: defaultBot,
      botId: getBotStableId(defaultBot) || clean(input.defaultBotId),
      botJid: clean(defaultBot?.jid),
      defaultBotId: clean(input.defaultBotId),
      sendFromMode: mode,
      fallbackReason: "origin_missing" as CampaignFallbackReason,
    };
  }
  if (!isLinked(originBot)) {
    return {
      bot: defaultBot,
      botId: getBotStableId(defaultBot) || clean(input.defaultBotId),
      botJid: clean(defaultBot?.jid),
      defaultBotId: clean(input.defaultBotId),
      sendFromMode: mode,
      fallbackReason: "origin_unlinked" as CampaignFallbackReason,
    };
  }
  if (!isActive(originBot)) {
    return {
      bot: defaultBot,
      botId: getBotStableId(defaultBot) || clean(input.defaultBotId),
      botJid: clean(defaultBot?.jid),
      defaultBotId: clean(input.defaultBotId),
      sendFromMode: mode,
      fallbackReason: "origin_inactive" as CampaignFallbackReason,
    };
  }
  if (input.isBotConnected && !input.isBotConnected(originBot)) {
    return {
      bot: defaultBot,
      botId: getBotStableId(defaultBot) || clean(input.defaultBotId),
      botJid: clean(defaultBot?.jid),
      defaultBotId: clean(input.defaultBotId),
      sendFromMode: mode,
      fallbackReason: "origin_disconnected" as CampaignFallbackReason,
    };
  }

  return {
    bot: originBot,
    botId: getBotStableId(originBot),
    botJid: clean(originBot?.jid),
    defaultBotId: clean(input.defaultBotId),
    sendFromMode: mode,
    fallbackReason: "",
  };
}
