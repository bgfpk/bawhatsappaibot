function parseProfile(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

export function normalizeCustomerTimestamp(value: any) {
  if (!value) return 0;
  if (typeof value === "object" && value.seconds) return Number(value.seconds) || 0;
  if (typeof value === "object" && value._seconds) return Number(value._seconds) || 0;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export function getCustomerLastInteractionInfo(customer: any) {
  const profile = parseProfile(customer?.profile);
  const candidates = [
    ["last_message_at", customer?.last_message_at],
    ["profile.lastMessageAt", profile.lastMessageAt],
    ["profile.lastCustomerMessageAt", profile.lastCustomerMessageAt],
    ["profile.lastBotMessageAt", profile.lastBotMessageAt],
    ["profile.lastBotReplyAt", profile.lastBotReplyAt],
    ["lastInteraction", customer?.lastInteraction],
    ["profile.lastInteraction", profile.lastInteraction],
    ["profile.lastInteractedAt", profile.lastInteractedAt],
  ] as const;

  for (const [source, value] of candidates) {
    const timestamp = normalizeCustomerTimestamp(value);
    if (timestamp > 0) return { timestamp, source, fallback: false };
  }

  const fallbackCandidates = [
    ["$updatedAt", customer?.$updatedAt],
    ["updated_at", customer?.updated_at],
    ["$createdAt", customer?.$createdAt],
    ["created_at", customer?.created_at],
  ] as const;
  for (const [source, value] of fallbackCandidates) {
    const timestamp = normalizeCustomerTimestamp(value);
    if (timestamp > 0) return { timestamp, source, fallback: true };
  }

  return { timestamp: 0, source: "", fallback: true };
}

export function getCustomerLastInteractionTimestamp(customer: any) {
  return getCustomerLastInteractionInfo(customer).timestamp;
}

export function customerHasSummarizableActivity(customer: any) {
  const profile = parseProfile(customer?.profile);
  return Boolean(
    customer?.last_message_at ||
    profile.lastMessageAt ||
    profile.lastCustomerMessageAt ||
    profile.lastBotMessageAt ||
    profile.lastBotReplyAt ||
    profile.lastMessage ||
    profile.lastBotReply
  );
}

export function getCustomerSummaryDisplayState(customer: any) {
  const profile = parseProfile(customer?.profile);
  const summary = String(profile.chatSummary || "").trim();
  const lastInteractionAt = getCustomerLastInteractionTimestamp(customer);
  const summarizedAt = normalizeCustomerTimestamp(profile.chatSummaryLastMessageAt);
  const updatedAt = normalizeCustomerTimestamp(profile.chatSummaryUpdatedAt);
  const stale = Boolean(summary && lastInteractionAt && lastInteractionAt > Math.max(summarizedAt, updatedAt));
  if (summary) {
    return { summary, pending: stale, canRefresh: stale };
  }
  const canRefresh = customerHasSummarizableActivity(customer);
  return {
    summary: canRefresh ? "Summary will update after the next meaningful message." : "",
    pending: canRefresh,
    canRefresh,
  };
}

export function compareCustomersByLastInteraction(a: any, b: any, direction: "asc" | "desc" = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  const aInfo = getCustomerLastInteractionInfo(a);
  const bInfo = getCustomerLastInteractionInfo(b);
  if (aInfo.fallback !== bInfo.fallback) return aInfo.fallback ? 1 : -1;
  const diff = aInfo.timestamp - bInfo.timestamp;
  if (diff !== 0) return diff * multiplier;
  const aName = String(a?.profile?.name || a?.profile?.customerName || a?.name || a?.customer_id || "").toLowerCase();
  const bName = String(b?.profile?.name || b?.profile?.customerName || b?.name || b?.customer_id || "").toLowerCase();
  return aName.localeCompare(bName);
}

export function sortCustomersByLastInteraction(customers: any[] = [], direction: "asc" | "desc" = "desc") {
  return [...customers].sort((a, b) => compareCustomersByLastInteraction(a, b, direction));
}
