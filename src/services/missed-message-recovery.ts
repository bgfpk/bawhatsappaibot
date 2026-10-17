import { getReadableMessageContent, isIgnorableWhatsappMessage } from "./whatsapp-message-content.ts";
import { normalizeWhatsAppJid, resolveCustomerChatJid } from "../utils/whatsapp-jid.ts";
import {
  getCustomerFacingAiDeliveryEvidence,
  isDeliveredAfterLatestPendingCustomerMessage,
} from "./ai-retry-schedule-service.ts";
import {
  collectPendingInboundMessageBatch,
  isRealInboundCustomerMessage,
  type PendingBatchSelectionOptions,
} from "./customer-message-batch-service.ts";

export const MISSED_MESSAGE_STARTUP_DELAY_MS = 15 * 1000;
export const MISSED_MESSAGE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const MISSED_MESSAGE_GRACE_SECONDS = 90;
export const MISSED_MESSAGE_LOOKBACK_SECONDS = 2 * 60 * 60;
export const MISSED_MESSAGE_SWEEP_BATCH_SIZE = 3;
export const MISSED_MESSAGE_SWEEP_PAUSE_MS = 5000;

export function normalizeEpochSeconds(value: any) {
  const num = Number(value);
  if (!num) return 0;
  return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

export function normalizeCustomerJid(customer: any) {
  if (customer && typeof customer === "object") {
    return resolveCustomerChatJid(customer);
  }
  return normalizeWhatsAppJid(customer);
}

export function getMessageTimestampSeconds(message: any) {
  const raw = message?.messageTimestamp;
  const timestamp = raw && typeof raw.toNumber === "function" ? raw.toNumber() : raw;
  return normalizeEpochSeconds(timestamp || message?.timestamp || Date.now());
}

export function getProfileLastBotSeconds(profile: any) {
  return normalizeEpochSeconds(profile?.lastBotMessageAt || profile?.lastBotReplyAt || 0);
}

function hasCustomerFacingAiReplyAfter(profile: any, incomingAtSeconds: number) {
  const evidence = getCustomerFacingAiDeliveryEvidence(profile || {});
  return isDeliveredAfterLatestPendingCustomerMessage({
    lastDeliveredBotAtMs: evidence.deliveredAtMs,
    latestIncomingAtMs: incomingAtSeconds * 1000,
    jobLastCustomerMessageAtMs: incomingAtSeconds * 1000,
    deliveredContextType: evidence.contextType,
    deliveredMessageId: evidence.messageId,
    deliveredReceiptId: evidence.receiptId,
  });
}

export function findLatestIncomingMessage(historyArray: any[] = [], selection?: PendingBatchSelectionOptions) {
  const pending = collectPendingInboundMessageBatch(historyArray, selection);
  if (pending.messages.length > 0) return pending.messages.at(-1);
  return historyArray
    .filter((message: any) => !isIgnorableWhatsappMessage(message))
    .filter((message: any) => isRealInboundCustomerMessage(message).ok)
    .pop();
}

export function findLatestLedgerMessage(historyArray: any[] = []) {
  return historyArray
    .filter((message: any) => !isIgnorableWhatsappMessage(message))
    .filter((message: any) => getReadableMessageContent(message.message).hasMeaningfulContent)
    .pop();
}

export function getLatestCustomerRecoveryCandidate(input: {
  historyArray: any[];
  profile?: any;
  nowSeconds?: number;
  graceSeconds?: number;
  lookbackSeconds?: number;
  selection?: PendingBatchSelectionOptions;
}) {
  const pendingBatch = collectPendingInboundMessageBatch(input.historyArray, input.selection);
  const latestMessage = pendingBatch.messages.at(-1);
  if (!latestMessage) return { shouldRecover: false, reason: "empty_thread" };
  const latestLedgerMessage = findLatestLedgerMessage(input.historyArray);
  if (latestLedgerMessage?.key?.fromMe === true && getMessageTimestampSeconds(latestLedgerMessage) >= getMessageTimestampSeconds(latestMessage)) {
    return { shouldRecover: false, reason: "latest_is_reply", latestMessage, incomingAt: getMessageTimestampSeconds(latestMessage) };
  }

  const incomingAt = getMessageTimestampSeconds(latestMessage);
  const nowSeconds = input.nowSeconds || Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - incomingAt;
  const graceSeconds = input.graceSeconds ?? MISSED_MESSAGE_GRACE_SECONDS;
  const lookbackSeconds = input.lookbackSeconds ?? MISSED_MESSAGE_LOOKBACK_SECONDS;

  if (ageSeconds < graceSeconds) return { shouldRecover: false, reason: "inside_grace_window", latestMessage, incomingAt };
  if (ageSeconds > lookbackSeconds) return { shouldRecover: false, reason: "outside_lookback_window", latestMessage, incomingAt };
  if (hasCustomerFacingAiReplyAfter(input.profile || {}, incomingAt)) {
    return { shouldRecover: false, reason: "bot_replied_after_customer", latestMessage, incomingAt };
  }

  return { shouldRecover: true, reason: "latest_customer_message_unreplied", latestMessage, incomingAt, ageSeconds };
}

export function getLatestCustomerRecoveryCandidateAcrossAliases(input: {
  aliases: Array<{ jid?: string; historyArray?: any[]; profile?: any }>;
  nowSeconds?: number;
  graceSeconds?: number;
  lookbackSeconds?: number;
  selection?: PendingBatchSelectionOptions;
}) {
  const histories = (input.aliases || []).flatMap((alias) => (alias.historyArray || []).map((message: any) => ({
    ...message,
    key: {
      ...(message?.key || {}),
      remoteJid: message?.key?.remoteJid || alias.jid,
    },
  })));
  const latestMessage = collectPendingInboundMessageBatch(mergeRecoveryHistories(histories, []), input.selection).messages.at(-1);
  if (!latestMessage) return { shouldRecover: false, reason: "empty_thread" };
  const incomingAt = getMessageTimestampSeconds(latestMessage);
  const nowSeconds = input.nowSeconds || Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - incomingAt;
  const graceSeconds = input.graceSeconds ?? MISSED_MESSAGE_GRACE_SECONDS;
  const lookbackSeconds = input.lookbackSeconds ?? MISSED_MESSAGE_LOOKBACK_SECONDS;
  if (ageSeconds < graceSeconds) return { shouldRecover: false, reason: "inside_grace_window", latestMessage, incomingAt };
  if (ageSeconds > lookbackSeconds) return { shouldRecover: false, reason: "outside_lookback_window", latestMessage, incomingAt };
  const replied = (input.aliases || []).some((alias) => hasCustomerFacingAiReplyAfter(alias.profile || {}, incomingAt));
  if (replied) return { shouldRecover: false, reason: "bot_replied_after_customer", latestMessage, incomingAt };
  return { shouldRecover: true, reason: "latest_customer_message_unreplied", latestMessage, incomingAt, ageSeconds };
}

export function buildSyntheticHistoryFromDb(history: any[] = [], customerJid: string) {
  return history
    .filter((message: any) => message?.text)
    .map((message: any) => ({
      key: {
        fromMe: message.role !== "user",
        remoteJid: customerJid,
        id: message.messageId || `db-${message.role}-${message.timestamp || Date.now()}`,
      },
      message: { conversation: String(message.text || "") },
      messageTimestamp: normalizeEpochSeconds(message.timestamp || Date.now()),
    }));
}

export function mergeRecoveryHistories(localHistory: any[] = [], dbHistory: any[] = []) {
  const seen = new Set<string>();
  const merged = [...dbHistory, ...localHistory].filter((message: any) => {
    const id = message?.key?.id || `${message?.key?.fromMe}-${message?.messageTimestamp}-${message?.message?.conversation || ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return merged
    .sort((a: any, b: any) => getMessageTimestampSeconds(a) - getMessageTimestampSeconds(b))
    .slice(-60);
}
