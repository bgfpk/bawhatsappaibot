// src/services/whatsapp-cloud-api-local-history-adapter.ts
//
// Converts a normalized Cloud API inbound message into the Baileys-like
// local history shape expected by the existing AI/history code.
// Supports text, image, audio, voice, video, document, and sticker messages.

import type { NormalizedIncomingMessage } from "./whatsapp-transport-types.ts";

/**
 * Converts a normalized Cloud API incoming message to a Baileys-compatible local history shape.
 * Returns null if message is invalid or unsupported.
 */
export function cloudIncomingMessageToLocalHistoryMessage(
  message: NormalizedIncomingMessage | null | undefined
): any {
  if (!message || !message.chatId || !message.messageId) {
    return null;
  }

  const timestampSeconds = Math.floor((message.timestamp || Date.now()) / 1000);
  const phoneNumberId = (message as any).rawProviderPayload?.phoneNumberId;

  const baseKey = {
    remoteJid: message.chatId,
    fromMe: false,
    id: message.messageId,
  };

  const messageType = String(message.messageType || "unknown").toLowerCase();

  // 1. Text message
  if (messageType === "text") {
    const text = (message.text || "").trim();
    if (!text) return null;

    return {
      key: baseKey,
      messageTimestamp: timestampSeconds,
      message: {
        conversation: text,
      },
      pushName: message.senderName || undefined,
    };
  }

  // 2. Image message
  if (messageType === "image") {
    return {
      key: baseKey,
      messageTimestamp: timestampSeconds,
      message: {
        imageMessage: {
          mimetype: message.mediaMimeType || "image/jpeg",
          caption: message.caption || message.text || "",
          mediaId: message.mediaId,
          cloudMedia: {
            mediaId: message.mediaId,
            mimeType: message.mediaMimeType || "image/jpeg",
            phoneNumberId,
          },
        },
      },
      pushName: message.senderName || undefined,
    };
  }

  // 3. Audio / Voice message
  if (messageType === "audio" || messageType === "voice") {
    return {
      key: baseKey,
      messageTimestamp: timestampSeconds,
      message: {
        audioMessage: {
          mimetype: message.mediaMimeType || "audio/ogg; codecs=opus",
          ptt: messageType === "voice" || true,
          mediaId: message.mediaId,
          cloudMedia: {
            mediaId: message.mediaId,
            mimeType: message.mediaMimeType || "audio/ogg; codecs=opus",
            phoneNumberId,
          },
        },
      },
      pushName: message.senderName || undefined,
    };
  }

  // 4. Video message
  if (messageType === "video") {
    return {
      key: baseKey,
      messageTimestamp: timestampSeconds,
      message: {
        videoMessage: {
          mimetype: message.mediaMimeType || "video/mp4",
          caption: message.caption || message.text || "",
          mediaId: message.mediaId,
          cloudMedia: {
            mediaId: message.mediaId,
            mimeType: message.mediaMimeType || "video/mp4",
            phoneNumberId,
          },
        },
      },
      pushName: message.senderName || undefined,
    };
  }

  // 5. Document message
  if (messageType === "document") {
    return {
      key: baseKey,
      messageTimestamp: timestampSeconds,
      message: {
        documentMessage: {
          mimetype: message.mediaMimeType || "application/pdf",
          fileName: (message as any).fileName || message.caption || "document",
          caption: message.caption || message.text || "",
          mediaId: message.mediaId,
          cloudMedia: {
            mediaId: message.mediaId,
            mimeType: message.mediaMimeType || "application/pdf",
            phoneNumberId,
          },
        },
      },
      pushName: message.senderName || undefined,
    };
  }

  // 6. Sticker message
  if (messageType === "sticker") {
    return {
      key: baseKey,
      messageTimestamp: timestampSeconds,
      message: {
        stickerMessage: {
          mimetype: message.mediaMimeType || "image/webp",
          mediaId: message.mediaId,
          cloudMedia: {
            mediaId: message.mediaId,
            mimeType: message.mediaMimeType || "image/webp",
            phoneNumberId,
          },
        },
      },
      pushName: message.senderName || undefined,
    };
  }

  return null;
}

/**
 * Summarizes the converted local history message shape for safe logging.
 * Never includes raw text bodies, payloads, download URLs, or secrets.
 */
export function summarizeCloudLocalHistoryMessage(
  result: any
): Record<string, any> {
  if (!result) {
    return { status: "unsupported_or_null" };
  }

  try {
    const remoteJid = result.key?.remoteJid;
    const messageId = result.key?.id;
    const isText = typeof result.message?.conversation === "string";
    const hasImage = Boolean(result.message?.imageMessage);
    const hasAudio = Boolean(result.message?.audioMessage);
    const hasVideo = Boolean(result.message?.videoMessage);
    const hasDocument = Boolean(result.message?.documentMessage);
    const hasSticker = Boolean(result.message?.stickerMessage);

    const textLength = typeof result.message?.conversation === "string"
      ? result.message.conversation.length
      : 0;

    return {
      status: "success",
      remoteJid,
      messageId,
      isText,
      textLength,
      hasImage,
      hasAudio,
      hasVideo,
      hasDocument,
      hasSticker,
      fromMe: result.key?.fromMe,
      hasPushName: typeof result.pushName === "string" && result.pushName.length > 0,
    };
  } catch (e) {
    return { status: "error", error: "failed_to_summarize" };
  }
}
