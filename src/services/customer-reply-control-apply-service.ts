import * as dbService from "./db-service.ts";
import {
  buildCustomerReplyControlPatch,
  getCustomerReplyControlTargetJids,
} from "./customer-reply-control-service.ts";
import { removeMutedNumbers } from "./muted-number-service.ts";
import { SHARED_PHONE_DIRECTORY_OWNER } from "./shared-phone-directory-service.ts";

type ReplyControlCommand = {
  action: string;
};

type ApplyReplyControlInput = {
  dataOwnerKey: string;
  primaryJid: string;
  altJid?: string;
  profile?: any;
  command: ReplyControlCommand;
  extraPatch?: Record<string, any>;
  botConfig?: any;
  botId?: string;
  onBotConfigUpdated?: (updatedMutedNumbers: string[]) => void;
};

export async function applyCustomerReplyControlToLinkedProfiles(input: ApplyReplyControlInput) {
  const discovered = new Set<string>(
    getCustomerReplyControlTargetJids(input.primaryJid, input.altJid, input.profile || {})
  );

  const queue = Array.from(discovered);
  while (queue.length > 0) {
    const jid = queue.shift() || "";
    if (!jid) continue;

    const profile = await dbService.getCustomerProfile(input.dataOwnerKey, jid).catch(() => null);
    for (const target of getCustomerReplyControlTargetJids(jid, "", profile || {})) {
      if (!discovered.has(target)) {
        discovered.add(target);
        queue.push(target);
      }
    }

    const sharedProfile = await dbService.getCustomerProfile(SHARED_PHONE_DIRECTORY_OWNER, jid).catch(() => null);
    for (const target of getCustomerReplyControlTargetJids(jid, "", sharedProfile || {})) {
      if (!discovered.has(target)) {
        discovered.add(target);
        queue.push(target);
      }
    }
  }

  const patch = {
    ...buildCustomerReplyControlPatch(input.command),
    ...(input.extraPatch || {}),
  };

  for (const jid of discovered) {
    await dbService.updateCustomerProfile(input.dataOwnerKey, jid, patch).catch(() => {});
  }

  // When resuming (.1) or setting temporary 1-hour pause (.0), clear legacy muted numbers
  // for this customer so stale legacy blacklist entries do not block auto-reply.
  if (input.command.action === "resume" || input.command.action === "pause_temp") {
    const targets = Array.from(discovered);
    const targetDigitsAndJids = [
      ...targets,
      input.primaryJid,
      input.altJid,
      input.profile?.phoneJid,
      input.profile?.phoneNumber,
      input.profile?.whatsapp_number,
      input.profile?.lidJid,
    ].filter(Boolean);

    if (input.botConfig && Array.isArray(input.botConfig.muted_numbers)) {
      const updated = removeMutedNumbers(input.botConfig.muted_numbers, targetDigitsAndJids);
      input.botConfig.muted_numbers = updated;
      if (typeof input.onBotConfigUpdated === "function") {
        input.onBotConfigUpdated(updated);
      }
    }

    const targetBotId = input.botId || (input.dataOwnerKey && !input.dataOwnerKey.includes("@") ? input.dataOwnerKey : undefined);
    if (targetBotId) {
      const currentConfig = await dbService.loadBotConfig(targetBotId).catch(() => null);
      if (currentConfig && Array.isArray(currentConfig.muted_numbers)) {
        const updated = removeMutedNumbers(currentConfig.muted_numbers, targetDigitsAndJids);
        if (JSON.stringify(updated) !== JSON.stringify(currentConfig.muted_numbers)) {
          await dbService.saveBotConfig(targetBotId, { ...currentConfig, muted_numbers: updated }).catch(() => {});
        }
      }
    }
  }

  return Array.from(discovered);
}
