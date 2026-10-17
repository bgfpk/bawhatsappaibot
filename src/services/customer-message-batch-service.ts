import { getReadableMessageContent, unwrapMessageContent } from "./whatsapp-message-content.ts";

function clean(value: any, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export const MESSAGE_BATCH_INITIAL_DEBOUNCE_MS = 3_000;
export const MESSAGE_BATCH_EXTENSION_MS = 3_000;
export const MESSAGE_BATCH_MAX_WAIT_MS = 8_000;
export const MESSAGE_BATCH_FAST_TEXT_INITIAL_DEBOUNCE_MS = 700;
export const MESSAGE_BATCH_FAST_TEXT_EXTENSION_MS = 900;
export const MESSAGE_BATCH_FAST_TEXT_MAX_WAIT_MS = 1_600;
export const MESSAGE_BATCH_MAX_PENDING_MESSAGES = 6;
export const MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES = 3;
export const MESSAGE_BATCH_MAX_PENDING_AUDIO_MESSAGES = 2;

export type RealInboundMessageCheck = {
  ok: boolean;
  reason: string;
  kind: "text" | "image" | "audio" | "video" | "document" | "sticker" | "unknown";
};

export type PendingBatchSelectionOptions = {
  allowedMessageIds?: Iterable<string>;
  handledMessageIds?: Iterable<string>;
  lastHandledMessageCursor?: string;
  lastHandledMessageTimestamp?: number;
  maxMessages?: number;
  maxMediaMessages?: number;
  maxAudioMessages?: number;
};

export type PendingBatchSkippedMessage = {
  messageId: string;
  reason: string;
  kind: RealInboundMessageCheck["kind"];
};

export type MessageBatchDelayProfile = {
  fastPath: boolean;
  mode: "default" | "normal_text_fast";
  initialDebounceMs: number;
  extensionMs: number;
  maxWaitMs: number;
};

export function normalizeBatchMessageTimestampSeconds(message: any) {
  const raw = message?.messageTimestamp;
  const timestamp = raw && typeof raw.toNumber === "function" ? raw.toNumber() : raw;
  const num = Number(timestamp || message?.timestamp || 0);
  if (!num) return 0;
  return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
}

export function buildBatchMessageCursor(message: any) {
  const timestamp = normalizeBatchMessageTimestampSeconds(message);
  const messageId = clean(message?.key?.id, 120);
  if (!timestamp || !messageId) return "";
  return `${String(timestamp).padStart(12, "0")}:${messageId}`;
}

export function getInternalPlaceholderReason(text: any) {
  const value = clean(text, 300).toLowerCase();
  if (!value) return "empty_text";
  if (value === "media") return "system_saved_media_placeholder";
  if (value === "voice message") return "system_saved_voice_placeholder";
  if (value === "voice note received, transcript unavailable") return "voice_note_transcript_unavailable_placeholder";
  if (value === "summary refresh") return "summary_refresh";
  if (value.includes("pending_ai_reply_retry_scheduled")) return "pending_ai_reply_retry_scheduled";
  if (value.includes("ai retry queue recovery")) return "ai_retry_queue_recovery";
  if (value.includes("local store recovery")) return "local_store_recovery";
  if (value.includes("database recovery")) return "database_recovery";
  if (value.includes("background unreplied checker")) return "background_unreplied_checker";
  if (value.includes("internal note")) return "internal_note";
  return "";
}

export function classifyInboundMessageKind(message: any): RealInboundMessageCheck["kind"] {
  const content = unwrapMessageContent(message?.message);
  if (content?.audioMessage) return "audio";
  if (content?.imageMessage) return "image";
  if (content?.videoMessage) return "video";
  if (content?.documentMessage) return "document";
  if (content?.stickerMessage) return "sticker";
  if (clean(getReadableMessageContent(message?.message).text, 200)) return "text";
  return "unknown";
}

export function isRealInboundCustomerMessage(message: any): RealInboundMessageCheck {
  const readable = getReadableMessageContent(message?.message);
  const text = clean(readable.text, 400);
  const placeholderReason = getInternalPlaceholderReason(text);
  const kind = classifyInboundMessageKind(message);
  const messageId = clean(message?.key?.id, 120);
  const remoteJid = clean(message?.key?.remoteJid, 120);
  const timestampSeconds = normalizeBatchMessageTimestampSeconds(message);
  const hasRawInboundPayload = Boolean(unwrapMessageContent(message?.message));
  if (message?.key?.fromMe !== false) return { ok: false, reason: "from_me_or_bot_message", kind };
  if (!messageId) return { ok: false, reason: "missing_message_id", kind };
  if (!remoteJid) return { ok: false, reason: "missing_customer_jid", kind };
  if (!timestampSeconds) return { ok: false, reason: "missing_message_timestamp", kind };
  if (!hasRawInboundPayload) return { ok: false, reason: "missing_real_inbound_payload", kind };
  if (placeholderReason && kind === "text") return { ok: false, reason: placeholderReason, kind };
  if (kind === "unknown" && placeholderReason) return { ok: false, reason: placeholderReason, kind };
  if (!readable.hasMeaningfulContent) return { ok: false, reason: "empty_text", kind };
  return { ok: true, reason: "real_inbound_whatsapp_message", kind };
}

function isMediaKind(kind: RealInboundMessageCheck["kind"]) {
  return kind === "audio" || kind === "image" || kind === "video" || kind === "document" || kind === "sticker";
}

export function getMessageBatchDelayProfile(input: {
  kinds?: Iterable<RealInboundMessageCheck["kind"]>;
  messages?: any[];
} = {}): MessageBatchDelayProfile {
  const kinds = [
    ...Array.from(input.kinds || []).filter(Boolean),
    ...((input.messages || []).map((message) => classifyInboundMessageKind(message))),
  ].filter(Boolean) as RealInboundMessageCheck["kind"][];
  const fastPath = kinds.length > 0 && kinds.every((kind) => kind === "text");
  if (fastPath) {
    return {
      fastPath: true,
      mode: "normal_text_fast",
      initialDebounceMs: MESSAGE_BATCH_FAST_TEXT_INITIAL_DEBOUNCE_MS,
      extensionMs: MESSAGE_BATCH_FAST_TEXT_EXTENSION_MS,
      maxWaitMs: MESSAGE_BATCH_FAST_TEXT_MAX_WAIT_MS,
    };
  }
  return {
    fastPath: false,
    mode: "default",
    initialDebounceMs: MESSAGE_BATCH_INITIAL_DEBOUNCE_MS,
    extensionMs: MESSAGE_BATCH_EXTENSION_MS,
    maxWaitMs: MESSAGE_BATCH_MAX_WAIT_MS,
  };
}

function findLatestOutboundReplyHighWater(sorted: any[]) {
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const message = sorted[index];
    if (message?.key?.fromMe !== true) continue;
    const readable = getReadableMessageContent(message?.message);
    const text = clean(readable.text, 40);
    if (!readable.hasMeaningfulContent) continue;
    if (text === "," || text.toLowerCase() === "ai") continue;
    return {
      cursor: buildBatchMessageCursor(message),
      timestamp: normalizeBatchMessageTimestampSeconds(message),
    };
  }
  return { cursor: "", timestamp: 0 };
}

function isMessageAtOrBeforeHighWater(message: any, cursor: string, timestampSeconds: number) {
  const messageTimestamp = normalizeBatchMessageTimestampSeconds(message);
  const messageCursor = buildBatchMessageCursor(message);
  if (cursor) return Boolean(messageCursor) && messageCursor <= cursor;
  return messageTimestamp > 0 && timestampSeconds > 0 && messageTimestamp <= timestampSeconds;
}

function selectNewestMessagesWithinCap(messages: any[], options: PendingBatchSelectionOptions) {
  const maxMessages = Math.max(1, Number(options.maxMessages || MESSAGE_BATCH_MAX_PENDING_MESSAGES));
  const maxMediaMessages = Math.max(0, Number(options.maxMediaMessages || MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES));
  const maxAudioMessages = Math.max(0, Number(options.maxAudioMessages || MESSAGE_BATCH_MAX_PENDING_AUDIO_MESSAGES));
  const selectedNewest: any[] = [];
  const overflow: PendingBatchSkippedMessage[] = [];
  let mediaSelected = 0;
  let audioSelected = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const messageId = clean(message?.key?.id, 120);
    const kind = classifyInboundMessageKind(message);
    if (selectedNewest.length >= maxMessages) {
      overflow.push({ messageId, reason: "batch_message_cap", kind });
      continue;
    }
    if (kind === "audio" && audioSelected >= maxAudioMessages) {
      overflow.push({ messageId, reason: "batch_audio_cap", kind });
      continue;
    }
    if (isMediaKind(kind) && mediaSelected >= maxMediaMessages) {
      overflow.push({ messageId, reason: "batch_media_cap", kind });
      continue;
    }
    selectedNewest.push(message);
    if (kind === "audio") audioSelected += 1;
    if (isMediaKind(kind)) mediaSelected += 1;
  }

  return {
    messages: selectedNewest.reverse(),
    overflow: overflow.reverse(),
    capSummary: {
      maxMessages,
      maxMediaMessages,
      maxAudioMessages,
      mediaSelected,
      audioSelected,
      overflowCount: overflow.length,
    },
  };
}

export function collectPendingInboundMessageBatch(historyArray: any[] = [], options: PendingBatchSelectionOptions = {}) {
  const sorted = [...(historyArray || [])].sort((a, b) => normalizeBatchMessageTimestampSeconds(a) - normalizeBatchMessageTimestampSeconds(b));
  const allowedMessageIds = new Set(Array.from(options.allowedMessageIds || []).map((value) => clean(value, 120)).filter(Boolean));
  const handledMessageIds = new Set(Array.from(options.handledMessageIds || []).map((value) => clean(value, 120)).filter(Boolean));
  const fallbackHighWater = findLatestOutboundReplyHighWater(sorted);
  const highWaterCursor = clean(options.lastHandledMessageCursor, 160) || fallbackHighWater.cursor;
  const highWaterTimestamp = Math.max(0, Number(options.lastHandledMessageTimestamp || 0)) || fallbackHighWater.timestamp;
  const seen = new Set<string>();
  const eligibleMessages: any[] = [];
  const ignored: Array<{ messageId: string; reason: string }> = [];
  const skippedHandled: PendingBatchSkippedMessage[] = [];
  const skippedOld: PendingBatchSkippedMessage[] = [];
  const skippedNotAllowed: PendingBatchSkippedMessage[] = [];
  for (const message of sorted) {
    const messageId = clean(message?.key?.id, 120);
    if (messageId && seen.has(messageId)) continue;
    if (messageId) seen.add(messageId);
    const check = isRealInboundCustomerMessage(message);
    if (check.ok) {
      if (messageId && handledMessageIds.has(messageId)) {
        skippedHandled.push({ messageId, reason: "already_handled", kind: check.kind });
        continue;
      }
      if (isMessageAtOrBeforeHighWater(message, highWaterCursor, highWaterTimestamp)) {
        skippedOld.push({ messageId, reason: "older_than_high_water_mark", kind: check.kind });
        continue;
      }
      if (allowedMessageIds.size > 0 && (!messageId || !allowedMessageIds.has(messageId))) {
        skippedNotAllowed.push({ messageId, reason: "not_in_active_batch_message_ids", kind: check.kind });
        continue;
      }
      eligibleMessages.push(message);
    } else if (message?.key?.fromMe === false) {
      ignored.push({ messageId, reason: check.reason });
    }
  }
  const selected = selectNewestMessagesWithinCap(eligibleMessages, options);
  return {
    messages: selected.messages,
    ignored,
    skippedHandled,
    skippedOld,
    skippedNotAllowed,
    overflow: selected.overflow,
    highWaterCursor,
    highWaterTimestamp,
    oldHistoryContextCount: Math.max(0, eligibleMessages.length - selected.messages.length),
    capSummary: selected.capSummary,
  };
}

export function summarizePendingBatch(messages: any[] = []) {
  let mediaCount = 0;
  let audioCount = 0;
  for (const message of messages) {
    const kind = classifyInboundMessageKind(message);
    if (kind === "audio") {
      audioCount += 1;
      mediaCount += 1;
    } else if (kind === "image" || kind === "video" || kind === "document" || kind === "sticker") {
      mediaCount += 1;
    }
  }
  return { messageCount: messages.length, mediaCount, audioCount };
}
