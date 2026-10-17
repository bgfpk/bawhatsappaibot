export const MAX_CONSECUTIVE_AI_FALLBACKS = 1;
export const MAX_AI_REPLY_RETRY_ATTEMPTS = 1;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function getAiFallbackCount(profile: any = {}) {
  const count = Number(profile?.aiFallbackConsecutiveCount || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function shouldSkipRepeatedAiFallback(profile: any = {}) {
  return getAiFallbackCount(profile) >= MAX_CONSECUTIVE_AI_FALLBACKS;
}

export function buildAiFallbackSentPatch(profile: any = {}, messageId: any, reason = "timeout", at = nowSeconds()) {
  return {
    aiFallbackConsecutiveCount: getAiFallbackCount(profile) + 1,
    aiFallbackLastSentAt: at,
    aiFallbackLastMessageId: String(messageId || ""),
    aiFallbackLastReason: String(reason || "timeout").slice(0, 120),
    aiReplyFailurePaused: false,
    aiReplyFailurePausedForMessageId: "",
    aiReplyFailurePausedAt: 0,
  };
}

export function buildAiFallbackSuppressedPatch(messageId: any, reason = "repeated_fallback", at = nowSeconds()) {
  return {
    aiReplyFailurePaused: true,
    aiReplyFailurePausedForMessageId: String(messageId || ""),
    aiReplyFailurePausedAt: at,
    aiReplyFailureReason: String(reason || "repeated_fallback").slice(0, 160),
  };
}

export function buildAiFallbackClearedPatch(at = nowSeconds()) {
  return {
    aiFallbackConsecutiveCount: 0,
    aiFallbackLastReason: "",
    aiLastRealReplyAt: at,
    aiReplyFailurePaused: false,
    aiReplyFailurePausedForMessageId: "",
    aiReplyFailurePausedAt: 0,
    aiReplyFailureReason: "",
  };
}

export function isAiReplyFailurePausedForMessage(profile: any = {}, messageId: any) {
  const pausedFor = String(profile?.aiReplyFailurePausedForMessageId || "");
  return Boolean(profile?.aiReplyFailurePaused && pausedFor && pausedFor === String(messageId || ""));
}
