import * as dbService from "./db-service.ts";
import { addMutedNumber } from "./muted-number-service.ts";
import { normalizePhoneDigits } from "../utils/whatsapp-jid.ts";

const MAIN_ACCOUNT_EMAIL = "contact-5bff87735818@example.invalid";

function instanceNumber(jid: any) {
  const digits = normalizePhoneDigits(String(jid || "").split("@")[0]);
  return digits.length >= 8 ? digits : "";
}

export async function syncInstanceNumberToMainBlacklist(input: {
  instanceJid: string;
  sourceBotId?: string;
}) {
  const number = instanceNumber(input.instanceJid);
  if (!number) return { updated: 0 };

  const mainUser = await dbService.getUser(MAIN_ACCOUNT_EMAIL).catch(() => null) as any;
  if (!mainUser?.$id) return { updated: 0 };

  const bots = await dbService.getBotsByUser(mainUser.$id).catch(() => []) as any[];
  let updated = 0;
  for (const bot of bots) {
    const botId = bot?.$id || bot?.id;
    if (!botId) continue;
    const config = await dbService.loadBotConfig(botId).catch(() => null) || {};
    const mutedNumbers = addMutedNumber(config.muted_numbers || [], number);
    if (JSON.stringify(mutedNumbers) === JSON.stringify(config.muted_numbers || [])) continue;
    await dbService.saveBotConfig(botId, { ...config, muted_numbers: mutedNumbers }).catch(() => {});
    updated++;
  }

  return { updated, number };
}

export async function syncAllInstanceNumbersToMainBlacklist() {
  const bots = await dbService.listBots(1000).catch(() => []) as any[];
  let synced = 0;
  for (const bot of bots) {
    if (!bot?.jid) continue;
    const result = await syncInstanceNumberToMainBlacklist({ instanceJid: bot.jid, sourceBotId: bot.$id || bot.id }).catch(() => null);
    if (result?.number) synced++;
  }
  return { synced };
}
