import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CHAT_REPLIES_DISABLED_REASON,
  canProcessInboundAiMessage,
  closePendingAiRepliesForBot,
  resolveBotAiChatReplyMode,
} from "./bot-ai-chat-reply-mode-service.ts";

test("canonical setting resolves with legacy fallback and defaults ON", () => {
  assert.equal(resolveBotAiChatReplyMode({}).enabled, true);
  assert.equal(resolveBotAiChatReplyMode({ autoReply: true }).enabled, true);
  assert.equal(resolveBotAiChatReplyMode({ autoReply: false }).enabled, false);
  assert.equal(resolveBotAiChatReplyMode({ ai_chat_replies_enabled: false, autoReply: true }).enabled, false);
  assert.equal(resolveBotAiChatReplyMode({ ai_chat_replies_enabled: true, autoReply: false }).enabled, true);
});

test("OFF blocks inbound AI capabilities but preserves deterministic and outbound capabilities", () => {
  const mode = resolveBotAiChatReplyMode({ ai_chat_replies_enabled: false });
  assert.equal(mode.reason, AI_CHAT_REPLIES_DISABLED_REASON);
  assert.equal(mode.allowInboundAiReply, false);
  assert.equal(mode.allowInboundMediaUnderstanding, false);
  assert.equal(mode.allowInboundLeadCapture, false);
  assert.equal(mode.allowInboundCustomerIntelligence, false);
  assert.equal(mode.allowAiReplyRetry, false);
  assert.equal(mode.allowSequences, true);
  assert.equal(mode.allowShortcuts, true);
  assert.equal(mode.allowScheduledFollowups, true);
  assert.equal(mode.allowManualReplies, true);
});

test("re-enabled mode applies only to new inbound messages", () => {
  const config = { ai_chat_replies_enabled: true, ai_chat_replies_enabled_at: 2_000 };
  assert.equal(canProcessInboundAiMessage(config, 1_999), false);
  assert.equal(canProcessInboundAiMessage(config, 2_000), true);
});

test("turning OFF closes only selected bot pending AI replies", () => {
  const queue = new Map<string, any>([
    ["a", { id: "a", botId: "bot_1", status: "pending_ai_generation" }],
    ["b", { id: "b", botId: "bot_2", status: "pending_ai_generation" }],
    ["c", { id: "c", botId: "bot_1", status: "sent" }],
  ]);
  assert.equal(closePendingAiRepliesForBot(queue, "bot_1", 3_000), 1);
  assert.equal(queue.get("a").status, "superseded");
  assert.equal(queue.get("a").lastError, AI_CHAT_REPLIES_DISABLED_REASON);
  assert.equal(queue.get("b").status, "pending_ai_generation");
  assert.equal(queue.get("c").status, "sent");
});
