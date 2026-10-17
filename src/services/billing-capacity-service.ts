import * as dbService from "./db-service.ts";

type BotConfigOverrideMap = Record<string, any>;

const parseJson = (value: any) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const getBotId = (bot: any) => String(bot?.$id || bot?.id || "");

const getEnabledGroups = (config: any) => {
  const groups = Array.isArray(config?.groups) ? config.groups : [];
  return groups.filter((group: any) => group?.enabled !== false);
};

const getStoredTemplateCount = (store: Record<string, any[]>, group: any) => {
  const jid = String(group?.jid || "").trim();
  if (jid && Array.isArray(store[jid])) {
    return store[jid].length;
  }
  return Math.max(0, Number(group?.templateCount || 0));
};

const loadTemplateStoreForBot = async (bot: any) => {
  const storeIds = Array.from(new Set([getBotId(bot), String(bot?.jid || "").trim()].filter(Boolean)));
  for (const storeId of storeIds) {
    const rawStore = await dbService.loadTemplateStore(storeId).catch(() => null);
    const parsedStore = parseJson(rawStore);
    if (parsedStore && typeof parsedStore === "object") {
      return parsedStore as Record<string, any[]>;
    }
  }
  return {} as Record<string, any[]>;
};

export async function getSavedBillingCapacityUsageForUser(userId: string, botConfigOverrides: BotConfigOverrideMap = {}) {
  const bots = await dbService.getBotsByUser(userId).catch(() => []);
  const usage = {
    mediaTemplates: 0,
    mediaGroups: 0,
    sequenceGroups: 0,
  };

  await Promise.all((bots || []).map(async (bot: any) => {
    const botId = getBotId(bot);
    const config = botConfigOverrides[botId] ?? parseJson(bot?.config_settings);
    if (!config) return;

    const groups = getEnabledGroups(config);
    if (groups.length === 0) return;

    const templateStore = await loadTemplateStoreForBot(bot);
    usage.mediaGroups += groups.filter((group: any) => group?.purpose === "media").length;
    usage.sequenceGroups += groups.filter((group: any) => group?.purpose === "sequence").length;
    usage.mediaTemplates += groups.reduce((sum: number, group: any) => sum + getStoredTemplateCount(templateStore, group), 0);
  }));

  return usage;
}
