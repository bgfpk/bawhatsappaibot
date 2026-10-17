export function chooseFollowupCenterInstance(bots: any[] = [], savedBotId?: string | null, currentBotId?: string | null) {
  const list = Array.isArray(bots) ? bots : [];
  const byId = (id?: string | null) => id ? list.find((bot) => bot?.id === id || bot?.$id === id) : null;
  const current = byId(currentBotId);
  if (current) return current;
  const saved = byId(savedBotId);
  if (saved) return saved;
  return list.find((bot) => bot?.is_active !== 0 && bot?.jid) || list.find((bot) => bot?.is_active !== 0) || list[0] || null;
}

export function getBotStableId(bot: any) {
  return bot?.id || bot?.$id || "";
}
