import { 
  NormalizedIncomingMessage,
  NormalizedConnectionStatus,
  NormalizedMessageType,
  WhatsAppProviderType,
  OutgoingSendResult,
} from "./whatsapp-transport-types.ts";

/**
 * Normalize Baileys connection status strings to the shared `NormalizedConnectionStatus`.
 * Defensive: unknown values map to "disconnected".
 */
export function normalizeBaileysConnectionStatus(input: any): NormalizedConnectionStatus {
  if (!input) return "disconnected";
  const status = String(input).toLowerCase();
  if (["disconnected","close","closed"].includes(status)) return "disconnected";
  if (["connected","open"].includes(status)) return "connected";
  if (status.includes("connect")) return "connecting";
  if (status.includes("qr")) return "qr_ready";
  if (status === "open" || status.includes("open")) return "connected";
  if (status === "close" || status.includes("close")) return "disconnected";
  if (status.includes("error")) return "error";
  return "disconnected";
}

/**
 * Detect if a JID belongs to a group.
 */
export function isBaileysGroupJid(jid: string | undefined): boolean {
  if (!jid) return false;
  return jid.endsWith("@g.us");
}

/**
 * Determine the normalized message type from a Baileys raw message payload.
 */
export function normalizeBaileysMessageType(message: any): NormalizedMessageType {
  if (!message) return "unknown";
  if (message.conversation !== undefined) return "text";
  if (message.extendedTextMessage !== undefined) return "text";
  if (message.imageMessage !== undefined) return "image";
  if (message.videoMessage !== undefined) return "video";
  if (message.documentMessage !== undefined) return "document";
  if (message.stickerMessage !== undefined) return "sticker";
  if (message.locationMessage !== undefined) return "location";
  if (message.audioMessage !== undefined) {
    // Baileys marks pushâ€‘toâ€‘talk (voice) with ptt flag
    return message.audioMessage.ptt ? "voice" : "audio";
  }
  return "unknown";
}

/** Extract text from supported Baileys message formats. */
export function extractBaileysText(message: any): string | undefined {
  if (!message) return undefined;
  if (typeof message.conversation === "string") return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  // Audio messages occasionally contain a caption, treat it as text only if explicit
  if (message.audioMessage?.caption) return message.audioMessage.caption;
  return undefined;
}

/** Extract caption (for media) if present. */
export function extractBaileysCaption(message: any): string | undefined {
  if (!message) return undefined;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return undefined;
}

/** Extract media information (mime type and optional id) */
export function extractBaileysMediaInfo(message: any): {
  mediaMimeType?: string;
  mediaId?: string;
} {
  if (!message) return {};
  const info: any = {};
  if (message.imageMessage) {
    info.mediaMimeType = message.imageMessage.mimetype || message.imageMessage.mimeType;
    info.mediaId = message.imageMessage.mediaKey;
  } else if (message.videoMessage) {
    info.mediaMimeType = message.videoMessage.mimetype || message.videoMessage.mimeType;
    info.mediaId = message.videoMessage.mediaKey;
  } else if (message.audioMessage) {
    info.mediaMimeType = message.audioMessage.mimetype || message.audioMessage.mimeType;
    info.mediaId = message.audioMessage.mediaKey;
  } else if (message.documentMessage) {
    info.mediaMimeType = message.documentMessage.mimetype || message.documentMessage.mimeType;
    info.mediaId = message.documentMessage.mediaKey;
  } else if (message.stickerMessage) {
    info.mediaMimeType = message.stickerMessage.mimetype || message.stickerMessage.mimeType;
    info.mediaId = message.stickerMessage.mediaKey;
  } else if (message.locationMessage) {
    // location does not have media mime, but we keep undefined
  }
  return info;
}

/**
 * Normalize a Baileys incoming message (the structure as received in `sock.ev.on('messages.upsert')`).
 * Expected input shape (simplified): { messages: [{ key: {...}, message: {...}, ... }], ... }
 * This function works on a single message object (the first element of the array).
 */
export function normalizeBaileysIncomingMessage(rawMsg: any): NormalizedIncomingMessage {
  const providerType: WhatsAppProviderType = "whatsapp_web";

  const key = rawMsg?.key ?? {};
  const chatId = key?.remoteJid || "";
  const messageId = key?.id || "";
  const participant = key?.participant; // for groups, the sender's JID
  const timestamp = typeof key?.timestamp === "number" ? key.timestamp * 1000 : Date.now();

  const message = rawMsg?.message ?? {};
  const messageType = normalizeBaileysMessageType(message);
  const text = extractBaileysText(message);
  const caption = extractBaileysCaption(message);
  const mediaInfo = extractBaileysMediaInfo(message);

  const hasMedia = messageType !== "text" && messageType !== "unknown" && !!mediaInfo.mediaMimeType;

  const isGroup = isBaileysGroupJid(chatId);

  const normalized: NormalizedIncomingMessage = {
    providerType,
    chatId,
    messageId,
    senderName: participant,
    timestamp,
    messageType,
    text,
    caption,
    hasMedia,
    mediaMimeType: mediaInfo.mediaMimeType,
    mediaId: mediaInfo.mediaId,
    isGroup,
    groupId: isGroup ? chatId : undefined,
    rawProviderPayload: rawMsg,
  };

  return normalized;
}

/**
 * Normalize Baileys send result (the return value of `sock.sendMessage`).
 * Typical shape: { key: { id: string, remoteJid: string, ... }, ... }
 */
export function normalizeBaileysSendResult(result: any): OutgoingSendResult {
  if (!result) {
    return { success: false, retryable: false };
  }
  const key = result?.key ?? {};
  const success = typeof key.id === "string" && key.id.length > 0;
  const providerMessageId = key.id;
  const receiptStatus = result?.status ?? undefined;
  // Baileys does not expose retryable flag directly; assume false unless error indicates
  const retryable = false;
  return {
    success,
    providerMessageId,
    receiptStatus,
    retryable,
    rawProviderResponse: result,
  };
}
