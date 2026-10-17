export const AI_CHAT_REPLIES_DISABLED_REASON = "ai_chat_replies_disabled";

export type BotAiChatReplyMode = {
  enabled: boolean;
  reason: "" | typeof AI_CHAT_REPLIES_DISABLED_REASON;
  allowInboundAiReply: boolean;
  allowInboundMediaUnderstanding: boolean;
  allowInboundLeadCapture: boolean;
  allowInboundCustomerIntelligence: boolean;
  allowAiReplyRetry: boolean;
  allowSequences: true;
  allowShortcuts: true;
  allowScheduledFollowups: true;
  allowManualReplies: true;
};

export function resolveBotAiChatReplyMode(botConfig: any = {}): BotAiChatReplyMode {
  const enabled = typeof botConfig?.ai_chat_replies_enabled === "boolean"
    ? botConfig.ai_chat_replies_enabled
    : typeof botConfig?.autoReply === "boolean"
      ? botConfig.autoReply
      : true;
  return {
    enabled,
    reason: enabled ? "" : AI_CHAT_REPLIES_DISABLED_REASON,
    allowInboundAiReply: enabled,
    allowInboundMediaUnderstanding: enabled,
    allowInboundLeadCapture: enabled,
    allowInboundCustomerIntelligence: enabled,
    allowAiReplyRetry: enabled,
    allowSequences: true,
    allowShortcuts: true,
    allowScheduledFollowups: true,
    allowManualReplies: true,
  };
}

export function canProcessInboundAiMessage(botConfig: any, receivedAtMs: number) {
  const mode = resolveBotAiChatReplyMode(botConfig);
  if (!mode.enabled) return false;
  const enabledAt = Number(botConfig?.ai_chat_replies_enabled_at || 0);
  return !enabledAt || Number(receivedAtMs || 0) >= enabledAt;
}

export function closePendingAiRepliesForBot(queue: Map<string, any>, botId: string, nowMs = Date.now(), queueScopedToBot = false) {
  let count = 0;
  for (const job of queue.values()) {
    if (!queueScopedToBot && job?.botId !== botId) continue;
    if (!["pending_ai_generation", "retrying_ai_generation", "ai_generated_pending_send", "retrying_whatsapp_send", "AI_FAILED_RETRY_PENDING", "SEND_PENDING", "SEND_FAILED_RETRY_PENDING"].includes(job.status)) continue;
    job.status = "superseded";
    job.supersededAt = nowMs;
    job.lastError = AI_CHAT_REPLIES_DISABLED_REASON;
    count += 1;
  }
  return count;
}
