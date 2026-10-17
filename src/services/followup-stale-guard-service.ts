export type FollowupStaleGuardResult = {
  stale: boolean;
  reason?: "customer_replied_after_trigger";
  latestLastMessageAt: number;
  triggerLastMessageAt: number;
};

export function normalizeFollowupTimestamp(value: any) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

export function checkFollowupStaleByLastMessage(input: {
  latestLastMessageAt?: any;
  triggerLastMessageAt?: any;
}): FollowupStaleGuardResult {
  const latestLastMessageAt = normalizeFollowupTimestamp(input.latestLastMessageAt);
  const triggerLastMessageAt = normalizeFollowupTimestamp(input.triggerLastMessageAt);
  if (triggerLastMessageAt > 0 && latestLastMessageAt > triggerLastMessageAt) {
    return {
      stale: true,
      reason: "customer_replied_after_trigger",
      latestLastMessageAt,
      triggerLastMessageAt,
    };
  }
  return { stale: false, latestLastMessageAt, triggerLastMessageAt };
}
