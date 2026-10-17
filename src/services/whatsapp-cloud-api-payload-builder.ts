// src/services/whatsapp-cloud-api-payload-builder.ts
import { OutgoingSendResult } from "./whatsapp-transport-types.ts";
import { normalizeCloudApiRecipient } from "./whatsapp-cloud-api-recipient.ts";
import { mapCloudApiSendResponse } from "./whatsapp-cloud-api-response.ts";

/**
 * Basic validation helper – throws an Error with a clear message when a required field is missing.
 */
function requireField<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new Error(`cloud_api_payload_builder_error: missing required field '${name}'`);
  }
  return value as T;
}

/**
 * Build a text message payload for the Cloud API strictly matching Meta's contract.
 */
export function buildCloudApiTextPayload(to: string, text: string) {
  requireField(to, "to");
  requireField(text, "text");

  const normalized = normalizeCloudApiRecipient(to);
  if (!normalized.ok) {
    throw new Error(`cloud_api_payload_builder_error: invalid recipient '${to}' (${normalized.reason})`);
  }

  const safeBody = String(text || "").trim();
  if (!safeBody) {
    throw new Error("cloud_api_payload_builder_error: text body cannot be empty");
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  };
}

/** Build a template message payload */
export function buildCloudApiTemplatePayload(
  to: string,
  templateName: string,
  languageCode: string,
  components?: any[]
) {
  requireField(to, "to");
  requireField(templateName, "templateName");
  requireField(languageCode, "languageCode");

  const normalized = normalizeCloudApiRecipient(to);
  if (!normalized.ok) {
    throw new Error(`cloud_api_payload_builder_error: invalid recipient '${to}' (${normalized.reason})`);
  }

  const payload: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };
  if (components && components.length) payload.template.components = components;
  return payload;
}

/** Build a generic media payload (image, video, sticker) */
export function buildCloudApiMediaPayload(
  to: string,
  mediaType: "image" | "video" | "sticker",
  mediaId: string,
  caption?: string
) {
  requireField(to, "to");
  requireField(mediaId, "mediaId");

  const normalized = normalizeCloudApiRecipient(to);
  if (!normalized.ok) {
    throw new Error(`cloud_api_payload_builder_error: invalid recipient '${to}' (${normalized.reason})`);
  }

  const payload: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: mediaType,
    [mediaType]: { id: mediaId },
  };
  if (caption && mediaType !== "sticker") payload[mediaType].caption = caption;
  return payload;
}

/** Build a document payload */
export function buildCloudApiDocumentPayload(
  to: string,
  mediaId: string,
  fileName?: string,
  caption?: string
) {
  requireField(to, "to");
  requireField(mediaId, "mediaId");

  const normalized = normalizeCloudApiRecipient(to);
  if (!normalized.ok) {
    throw new Error(`cloud_api_payload_builder_error: invalid recipient '${to}' (${normalized.reason})`);
  }

  const doc: any = { id: mediaId };
  if (fileName) doc.filename = fileName;
  if (caption) doc.caption = caption;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: "document",
    document: doc,
  };
}

/** Build an audio payload (including voice) */
export function buildCloudApiAudioPayload(to: string, mediaId: string, voice?: boolean) {
  requireField(to, "to");
  requireField(mediaId, "mediaId");

  const normalized = normalizeCloudApiRecipient(to);
  if (!normalized.ok) {
    throw new Error(`cloud_api_payload_builder_error: invalid recipient '${to}' (${normalized.reason})`);
  }

  const audioObj: any = { id: mediaId };
  if (voice === true) {
    audioObj.voice = true;
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.to,
    type: "audio",
    audio: audioObj,
  };
}

/** Build a mark‑read payload */
export function buildCloudApiMarkReadPayload(messageId: string) {
  requireField(messageId, "messageId");
  return {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  };
}

/**
 * Maps send results using the authoritative Meta Cloud API response mapper.
 */
export function mapPlaceholderSendResult(result: any): OutgoingSendResult {
  return mapCloudApiSendResponse(result);
}
