// src/services/whatsapp-cloud-api-tracked-sender.ts
//
// Provider-neutral tracked sender helper for WhatsApp Cloud API.
// Creates an AI-handler-compatible send surface backed by an injected WhatsAppTransportProvider.
// Supports text, image, video, audio, voice (ptt), document, and sticker sends.

import type { WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";

export interface SentIdTracker {
  add(id: string): void;
}

export interface CloudTrackedSenderLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface CloudApiTrackedSenderOptions {
  /** Injected Cloud API transport provider. All actual sending is delegated here. */
  cloudProvider: WhatsAppTransportProvider;

  /**
   * Mutable set that receives providerMessageId for every successfully sent
   * Cloud API message. Used by bot-worker to prevent echo-loop processing.
   */
  sentIds: SentIdTracker;

  /**
   * Stable JID-shaped identity for this bot instance.
   * Defaults to "contact-26e46082e92c@example.invalid" when omitted.
   */
  botIdentityJid?: string;

  /** Optional safe diagnostic logger. Never receives secrets. */
  logger?: CloudTrackedSenderLogger;
}

export interface BaileysCompatibleSendResult {
  key: { id: string };
}

export interface CloudApiTrackedSender {
  user: { id: string };
  isCloud?: boolean;
  supportsVoice?: boolean;
  supportsVoiceSend?: boolean;
  sendMessage(jid: string, payload: { text?: string; [key: string]: any }): Promise<BaileysCompatibleSendResult>;
  sendPresenceUpdate(jid: string, presence: string): Promise<void>;
}

const CLOUD_BOT_IDENTITY_FALLBACK = "contact-26e46082e92c@example.invalid";

/**
 * Creates an AI-handler-compatible sender backed by an injected WhatsApp Cloud API transport provider.
 */
export function createCloudApiTrackedSender(
  options: CloudApiTrackedSenderOptions,
): CloudApiTrackedSender {
  const { cloudProvider, sentIds, logger } = options;

  const botIdentityJid =
    typeof options.botIdentityJid === "string" && options.botIdentityJid.trim()
      ? options.botIdentityJid.trim()
      : CLOUD_BOT_IDENTITY_FALLBACK;

  return {
    user: { id: botIdentityJid },
    isCloud: true,
    supportsVoice: true,
    supportsVoiceSend: true,

    async sendMessage(
      jid: string,
      payload: { text?: string; [key: string]: any },
    ): Promise<BaileysCompatibleSendResult> {
      let result: any = null;

      // 1. Text payload
      if (typeof payload.text === "string" && !payload.image && !payload.video && !payload.audio && !payload.document && !payload.sticker) {
        const text = payload.text.trim();
        if (!text) {
          throw new Error("cloud_tracked_sender: sendMessage called with missing or empty text payload");
        }
        logger?.info(`cloud_tracked_sender: sending text to ${jid} (${text.length} chars)`);
        result = await cloudProvider.sendText(jid, text);
      }
      // 2. Image payload
      else if (payload.image && Buffer.isBuffer(payload.image)) {
        logger?.info(`cloud_tracked_sender: sending image to ${jid} (${payload.image.length} bytes)`);
        const mime = payload.mimetype || "image/jpeg";
        result = await cloudProvider.sendMedia(jid, payload.image, mime, payload.caption);
      }
      // 3. Video payload
      else if (payload.video && Buffer.isBuffer(payload.video)) {
        logger?.info(`cloud_tracked_sender: sending video to ${jid} (${payload.video.length} bytes)`);
        const mime = payload.mimetype || "video/mp4";
        result = await cloudProvider.sendMedia(jid, payload.video, mime, payload.caption);
      }
      // 4. Voice Note / Audio payload
      else if (payload.audio && Buffer.isBuffer(payload.audio)) {
        if (payload.ptt === true || (payload.mimetype && String(payload.mimetype).includes("opus"))) {
          logger?.info(`cloud_tracked_sender: sending voice note (ptt) to ${jid} (${payload.audio.length} bytes)`);
          result = await cloudProvider.sendVoice(jid, payload.audio);
        } else {
          logger?.info(`cloud_tracked_sender: sending audio to ${jid} (${payload.audio.length} bytes)`);
          const mime = payload.mimetype || "audio/mp4";
          result = await cloudProvider.sendMedia(jid, payload.audio, mime);
        }
      }
      // 5. Document payload
      else if (payload.document && Buffer.isBuffer(payload.document)) {
        logger?.info(`cloud_tracked_sender: sending document to ${jid} (${payload.document.length} bytes)`);
        const mime = payload.mimetype || "application/pdf";
        const fileName = payload.fileName || payload.filename;
        result = await cloudProvider.sendDocument(jid, payload.document, mime, fileName, payload.caption);
      }
      // 6. Sticker payload
      else if (payload.sticker && Buffer.isBuffer(payload.sticker)) {
        logger?.info(`cloud_tracked_sender: sending sticker to ${jid} (${payload.sticker.length} bytes)`);
        result = await cloudProvider.sendMedia(jid, payload.sticker, "image/webp");
      }
      // 7. Template payload
      else if (payload.template || payload.type === "template") {
        const tpl = payload.template || payload;
        const templateName = tpl.name || tpl.templateName || payload.templateName;
        const languageCode = tpl.language?.code || tpl.languageCode || payload.languageCode || "en_US";
        const components = tpl.components || payload.components || tpl.params || payload.params || [];
        logger?.info(`cloud_tracked_sender: sending template '${templateName}' (${languageCode}) to ${jid}`);
        result = await cloudProvider.sendTemplate(jid, templateName, languageCode, components);
      } else {
        const fields = Object.keys(payload).join(", ");
        throw new Error(`cloud_tracked_sender: unsupported payload shape (${fields})`);
      }

      if (!result || !result.success) {
        const errMsg =
          result?.errorMessage ||
          "cloud_tracked_sender: provider returned failure";
        logger?.error(`cloud_tracked_sender: send failed — ${errMsg}`);
        throw new Error(errMsg);
      }

      const providerMessageId = String(result.providerMessageId || "");
      if (providerMessageId) {
        sentIds.add(providerMessageId);
      }

      logger?.info(
        `cloud_tracked_sender: sent ok — providerMessageId=${providerMessageId}`,
      );

      return { key: { id: providerMessageId } };
    },

    async sendPresenceUpdate(
      _jid: string,
      _presence: string,
    ): Promise<void> {
      // Cloud API has no equivalent. Intentional no-op.
    },
  };
}
