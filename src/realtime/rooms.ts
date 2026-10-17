export const ROOMS = {
  account: (accountId: string) => `account:${accountId}`,
  accountOwner: (ownerKey: string) => `account-owner:${ownerKey}`,
  admin: () => `admin:global`,
  bot: (botId: string) => `bot:${botId}`,
  conversation: (dataOwnerKey: string, customerJid: string) => `conversation:${dataOwnerKey}:${customerJid}`,
};
