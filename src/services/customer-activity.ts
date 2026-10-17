function normalizeEpochSeconds(value: any) {
  const num = Number(value);
  if (!num) return 0;
  return num > 100000000000 ? Math.floor(num / 1000) : num;
}

function parseProfile(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function buildCustomerActivityUpdate(profileData: any, timestamp: number) {
  const profilePatch = { ...(profileData || {}) };
  const documentPatch: any = {};

  if (profilePatch.lastMessage) {
    profilePatch.lastMessageAt = timestamp;
    profilePatch.lastInboundWhatsAppAt = timestamp;
    documentPatch.last_message_at = timestamp;
  }

  if (profilePatch.lastInboundWhatsAppAt && !profilePatch.lastMessage) {
    profilePatch.lastInboundWhatsAppAt = profilePatch.lastInboundWhatsAppAt;
  }

  if (profilePatch.lastBotReply) {
    profilePatch.lastBotMessageAt = timestamp;
  }

  return { profilePatch, documentPatch };
}

export function getCustomerLastBotMessageTime(customer: any) {
  const profile = parseProfile(customer?.profile);
  return normalizeEpochSeconds(
    customer?.last_bot_message_at ||
    profile.lastBotMessageAt ||
    profile.lastBotReplyAt
  );
}

export function getCustomerLastInboundTime(customer: any): number {
  const profile = parseProfile(customer?.profile);
  return normalizeEpochSeconds(
    customer?.last_inbound_whatsapp_at ||
    customer?.lastInboundWhatsAppAt ||
    profile.lastInboundWhatsAppAt ||
    profile.lastInboundAt ||
    (profile.lastMessage ? (profile.lastMessageAt || customer?.last_message_at) : 0)
  );
}

