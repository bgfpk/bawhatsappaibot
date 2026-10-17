// src/services/whatsapp-cloud-api-normalizer.ts
import {
  NormalizedIncomingMessage,
  NormalizedMessageType,
} from "./whatsapp-transport-types.ts";

/**
 * Helper to determine whether the payload contains a customer message.
 */
export function isCloudApiCustomerMessage(payload: any): boolean {
  return !!payload?.messages?.[0] || !!payload?.value?.messages?.[0];
}

/**
 * Helper to determine whether the payload is a status update webhook.
 */
export function isCloudApiStatusUpdate(payload: any): boolean {
  return !!payload?.statuses?.[0];
}

/**
 * Normalizes WhatsApp Cloud API message `type` to our internal enum.
 */
export function normalizeCloudApiMessageType(message: any): NormalizedMessageType {
  const type = String(message?.type).toLowerCase();
  switch (type) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "voice":
      return "voice";
    case "video":
      return "video";
    case "document":
      return "document";
    case "sticker":
      return "sticker";
    case "location":
      return "location";
    default:
      return "unknown";
  }
}

/** Extract plain text from a text message */
export function extractCloudApiText(message: any): string | undefined {
  return message?.text?.body ?? undefined;
}

/** Extract caption from image/video/document messages */
export function extractCloudApiCaption(message: any): string | undefined {
  return message?.caption ?? undefined;
}

/**
 * Extract media id & mime type (and optional caption) from a media message.
 */
export function extractCloudApiMediaInfo(message: any): {
  mediaId: string | undefined;
  mimeType: string | undefined;
  caption?: string;
} {
  const type = normalizeCloudApiMessageType(message);
  const mediaObj = message?.[type];
  if (!mediaObj) {
    return { mediaId: undefined, mimeType: undefined };
  }
  return {
    mediaId: mediaObj.id,
    mimeType: mediaObj.mime_type ?? mediaObj.mimetype,
    caption: mediaObj.caption ?? undefined,
  };
}

/**
 * Normalizes a Cloud API webhook message payload into our provider‑neutral type.
 * Returns `null` when the payload does not contain a recognizable message.
 */
export function normalizeCloudApiWebhookMessage(
  payload: any
): NormalizedIncomingMessage | null {
  if (!payload) return null;

  // Direct payload formats and Meta subscription entry/changes format
  const directMsg = payload?.messages?.[0] ?? payload?.value?.messages?.[0];
  const entryMsg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const msg = directMsg ?? entryMsg;
  if (!msg) return null;

  const messageType = normalizeCloudApiMessageType(msg);
  const hasMedia = ["image", "audio", "voice", "video", "document", "sticker", "location"].includes(
    messageType
  );

  const normalized: NormalizedIncomingMessage = {
    providerType: "whatsapp_cloud_api",
    chatId: msg.from,
    messageId: msg.id,
    timestamp: Number(msg.timestamp) * 1000,
    messageType,
    hasMedia,
    isGroup: false, // Cloud API does not expose group JIDs in the same way as Baileys
    rawProviderPayload: payload,
  };

  if (messageType === "text") {
    normalized.text = extractCloudApiText(msg);
  } else if (hasMedia) {
    const mediaInfo = extractCloudApiMediaInfo(msg);
    normalized.mediaId = mediaInfo.mediaId;
    normalized.mediaMimeType = mediaInfo.mimeType;
    if (mediaInfo.caption) normalized.caption = mediaInfo.caption;
    // Location coordinates as text
    if (messageType === "location" && msg.location) {
      const { latitude, longitude } = msg.location;
      normalized.text = `${latitude},${longitude}`;
    }
  }
  return normalized;
}
/**
 * Normalizes a Cloud API status webhook payload (message status updates).
 */
export interface NormalizedStatusUpdate {
  providerMessageId: string;
  status: string;
  timestamp: number;
  rawProviderPayload?: any;
}

export function normalizeCloudApiStatusWebhook(payload: any): NormalizedStatusUpdate | null {
  // Direct formats and Meta subscription entry/changes format
  const directStatus = payload?.statuses?.[0] ?? payload?.value?.statuses?.[0];
  const entryStatus = payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  const statusObj = directStatus ?? entryStatus;
  if (!statusObj) return null;
  return {
    providerMessageId: statusObj.id,
    status: statusObj.status,
    timestamp: Number(statusObj.timestamp) * 1000,
    rawProviderPayload: payload,
  };
}
