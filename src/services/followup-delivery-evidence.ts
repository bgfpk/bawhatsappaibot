export type FollowupDeliveryStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

type FollowupDeliveryPatchInput = {
  followupId: string;
  status: FollowupDeliveryStatus;
  sentMessageId?: string;
  reason?: string;
  attemptKey?: string;
  customerLastMessageAt?: number;
  billingDedupeKey?: string;
};

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeEpochSeconds(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

export function buildFollowupAttemptKey(input: {
  followupId: string;
  customerJid: string;
  customerLastMessageAt: number;
}) {
  const followupId = clean(input.followupId);
  const customerJid = clean(input.customerJid).toLowerCase();
  const lastMessageAt = normalizeEpochSeconds(input.customerLastMessageAt);
  return `${followupId}::${customerJid}::${lastMessageAt}`;
}

export function getFollowupDelivery(profile: any, followupId: string) {
  const deliveries = profile?.followupDeliveries;
  if (!deliveries || typeof deliveries !== "object") return null;
  return deliveries[String(followupId)] || null;
}

export function hasSuccessfulFollowupAttempt(profile: any, followupId: string, attemptKey: string) {
  const delivery = getFollowupDelivery(profile, followupId);
  return Boolean(delivery && delivery.status === "sent" && clean(delivery.attemptKey) === clean(attemptKey));
}

export function hasRecentIncompleteAiFollowupSkip(profile: any, followupId: string, nowSeconds = Math.floor(Date.now() / 1000), cooldownSeconds = 6 * 60 * 60) {
  const delivery = getFollowupDelivery(profile, followupId);
  if (!delivery || delivery.status !== "skipped") return false;
  if (!["ai_incomplete_output", "incomplete_output"].includes(clean(delivery.reason))) return false;
  const lastAttemptAt = normalizeEpochSeconds(delivery.lastAttemptAt || delivery.timestamp);
  return Boolean(lastAttemptAt && nowSeconds - lastAttemptAt < cooldownSeconds);
}

export function buildFollowupDeliveryPatch(profile: any, input: FollowupDeliveryPatchInput) {
  const timestamp = Math.floor(Date.now() / 1000);
  const id = clean(input.followupId);
  const deliveries = {
    ...(profile?.followupDeliveries && typeof profile.followupDeliveries === "object" ? profile.followupDeliveries : {}),
    [id]: {
      status: input.status,
      timestamp,
      lastAttemptAt: timestamp,
      sentAt: input.status === "sent" ? timestamp : normalizeEpochSeconds(profile?.followupDeliveries?.[id]?.sentAt),
      sentMessageId: clean(input.sentMessageId),
      reason: clean(input.reason),
      attemptKey: clean(input.attemptKey),
      customerLastMessageAt: normalizeEpochSeconds(input.customerLastMessageAt),
      billingDedupeKey: clean(input.billingDedupeKey),
    },
  };

  const patch: any = {
    followupDeliveries: deliveries,
    lastFollowupId: id,
    lastFollowupStatus: input.status,
    lastFollowupAttemptAt: timestamp,
  };
  if (input.status === "sent") {
    patch.lastFollowupSentAt = timestamp;
  }
  return patch;
}

function normalizeText(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function hasOutboundAfter(messages: any[], afterSeconds: number) {
  return messages.some((message) =>
    message?.role === "model" && Number(message?.timestamp || 0) > Number(afterSeconds || 0)
  );
}

export function hasMatchingOutboundText(messages: any[], expectedText: any, sinceSeconds = 0) {
  const expected = normalizeText(expectedText);
  if (!expected) return false;
  return messages.some((message) => {
    if (message?.role !== "model") return false;
    if (Number(message?.timestamp || 0) < Number(sinceSeconds || 0)) return false;
    return normalizeText(message?.text) === expected;
  });
}
