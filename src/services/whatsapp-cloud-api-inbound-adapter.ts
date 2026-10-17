// src/services/whatsapp-cloud-api-inbound-adapter.ts
import {
  NormalizedIncomingMessage,
  NormalizedStatusUpdate,
} from "./whatsapp-transport-types.ts";

/**
 * Builds the internal WhatsApp JID from a WhatsApp ID (phone number).
 */
export function buildCloudApiCustomerJid(waId: string): string {
  const cleaned = String(waId || "").replace(/[^0-9]/g, "");
  return cleaned ? `${cleaned}@s.whatsapp.net` : "";
}

/**
 * Interface representing the safe envelope payload coming from server forwarding.
 */
export interface CloudWebhookEventEnvelope {
  botId?: string;
  phoneNumberId?: string;
  eventType?: "message" | "status" | "other";
  event?: {
    type: "message" | "status" | "other";
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    contact?: {
      name?: string;
      waId?: string;
    };
    message?: {
      id: string;
      from: string;
      timestamp: number;
      type: string;
      textBody?: string;
      rawPayload?: any;
    };
    status?: {
      id: string;
      status: string;
      timestamp: number;
      recipientId: string;
      rawPayload?: any;
    };
    timestamp?: number;
  };
}

/**
 * Converts a Cloud API webhook message event into our safe internal NormalizedIncomingMessage shape.
 * Returns null if the event is malformed or not a message event.
 */
export function cloudWebhookEventToInternalIncomingMessage(
  envelope: CloudWebhookEventEnvelope
): (NormalizedIncomingMessage & { displayPhoneNumber?: string }) | null {
  try {
    if (!envelope || envelope.eventType !== "message" || !envelope.event) {
      return null;
    }

    const { botId, phoneNumberId } = envelope;
    const { displayPhoneNumber, contact, message } = envelope.event;

    if (!message || !message.id || !message.from) {
      return null;
    }

    const waId = contact?.waId || message.from;
    const chatId = buildCloudApiCustomerJid(waId);

    if (!chatId) {
      return null;
    }

    // Determine type, mapping to NormalizedMessageType
    const typeStr = String(message.type || "").toLowerCase();
    let messageType: any = "unknown";
    if (["text", "image", "audio", "voice", "video", "document", "sticker", "location"].includes(typeStr)) {
      messageType = typeStr;
    }

    const hasMedia = ["image", "audio", "voice", "video", "document", "sticker", "location"].includes(
      messageType
    );

    // Extract media information from rawPayload if present
    const rawMsgObj = message.rawPayload;
    let mediaId: string | undefined;
    let mediaMimeType: string | undefined;
    let caption: string | undefined;
    let text = message.textBody;

    if (hasMedia && rawMsgObj) {
      const mediaObj = rawMsgObj[messageType];
      if (mediaObj) {
        mediaId = mediaObj.id || undefined;
        mediaMimeType = (mediaObj.mime_type || mediaObj.mimetype) || undefined;
        caption = mediaObj.caption || undefined;
      }
      if (messageType === "location" && rawMsgObj.location) {
        const { latitude, longitude } = rawMsgObj.location;
        text = `${latitude},${longitude}`;
      }
    }

    const result: NormalizedIncomingMessage & { displayPhoneNumber?: string } = {
      providerType: "whatsapp_cloud_api",
      botId: botId || undefined,
      chatId,
      messageId: message.id,
      senderName: contact?.name || undefined,
      timestamp: (message.timestamp || Math.floor(Date.now() / 1000)) * 1000,
      messageType,
      text: text || undefined,
      caption,
      hasMedia,
      mediaId,
      mediaMimeType,
      isGroup: false,
    };

    if (displayPhoneNumber) {
      result.displayPhoneNumber = displayPhoneNumber;
      result.rawProviderPayload = { phoneNumberId };
    }

    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Interface representing internal status update along with extra attributes.
 */
export interface CloudApiStatusResult extends NormalizedStatusUpdate {
  providerType: "whatsapp_cloud_api";
  phoneNumberId?: string;
  recipientId: string;
  shouldTriggerAi: false;
  errors?: any[];
}

/**
 * Converts a Cloud API webhook status event into our safe internal status result.
 * Returns null if the event is malformed or not a status event.
 */
export function cloudWebhookStatusToInternalStatus(
  envelope: CloudWebhookEventEnvelope
): CloudApiStatusResult | null {
  try {
    if (!envelope || envelope.eventType !== "status" || !envelope.event) {
      return null;
    }

    const { phoneNumberId } = envelope;
    const { status: statusObj } = envelope.event;

    if (!statusObj || !statusObj.id || !statusObj.status || !statusObj.recipientId) {
      return null;
    }

    // Safely summarize error details if present
    const rawObj = statusObj.rawPayload;
    let errors: any[] | undefined;
    if (rawObj?.errors && Array.isArray(rawObj.errors)) {
      errors = rawObj.errors.map((err: any) => ({
        code: err.code,
        title: err.title,
        message: err.message,
      }));
    }

    return {
      providerType: "whatsapp_cloud_api",
      providerMessageId: statusObj.id,
      status: statusObj.status,
      timestamp: (statusObj.timestamp || Math.floor(Date.now() / 1000)) * 1000,
      recipientId: statusObj.recipientId,
      phoneNumberId: phoneNumberId || undefined,
      shouldTriggerAi: false,
      errors,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Summarizes the adapter result into a safe log description.
 */
export function summarizeCloudApiInboundAdapterResult(
  result: any
): Record<string, any> {
  if (!result) {
    return { status: "unsupported_or_malformed" };
  }

  if (result.providerType !== "whatsapp_cloud_api") {
    return { status: "unknown_provider" };
  }

  // If it's a message
  if (result.chatId) {
    return {
      status: "success",
      type: "message",
      botId: result.botId,
      chatId: result.chatId,
      messageId: result.messageId,
      messageType: result.messageType,
      hasMedia: result.hasMedia,
      mediaId: result.mediaId,
    };
  }

  // If it's a status
  if (result.recipientId) {
    return {
      status: "success",
      type: "status",
      providerMessageId: result.providerMessageId,
      recipientId: result.recipientId,
      messageStatus: result.status,
      shouldTriggerAi: result.shouldTriggerAi,
      errorCount: result.errors?.length || 0,
    };
  }

  return { status: "unsupported" };
}
