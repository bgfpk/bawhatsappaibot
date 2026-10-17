// src/services/whatsapp-outbound-sender.ts
import { WhatsAppTransportProvider, OutgoingSendResult } from "./whatsapp-transport-types.ts";

export interface OutboundSenderOptions {
  providerType?: string;
  baileysSendMessage?: (jid: string, payload: any) => Promise<any>;
  cloudProvider?: WhatsAppTransportProvider;
  logger?: any;
}

export class WhatsAppOutboundSender {
  private providerType: string;
  private baileysSendMessage?: (jid: string, payload: any) => Promise<any>;
  private cloudProvider?: WhatsAppTransportProvider;
  private logger?: any;

  constructor(options: OutboundSenderOptions) {
    this.providerType = options.providerType === "whatsapp_cloud_api" ? "whatsapp_cloud_api" : "whatsapp_web";
    this.baileysSendMessage = options.baileysSendMessage;
    this.cloudProvider = options.cloudProvider;
    this.logger = options.logger;
  }

  async sendText(jid: string, text: string, options?: any): Promise<OutgoingSendResult> {
    if (this.providerType === "whatsapp_cloud_api") {
      if (!this.cloudProvider) {
        return { success: false, errorMessage: "cloudProvider object missing" };
      }
      try {
        return await this.cloudProvider.sendText(jid, text, options);
      } catch (err: any) {
        return { success: false, errorMessage: err?.message || String(err) };
      }
    } else {
      if (!this.baileysSendMessage) {
        return { success: false, errorMessage: "baileysSendMessage function missing" };
      }
      try {
        const response: any = await this.baileysSendMessage(jid, { text });
        return { success: true, providerMessageId: response?.key?.id, rawProviderResponse: response };
      } catch (err: any) {
        return { success: false, errorMessage: err?.message || String(err) };
      }
    }
  }

  async sendMedia(options: {
    jid: string;
    buffer: Buffer;
    mimetype: string;
    type: "image" | "video" | "sticker" | "voice" | "audio" | "document";
    caption?: string;
    fileName?: string;
  }): Promise<OutgoingSendResult> {
    const { jid, buffer, mimetype, type, caption, fileName } = options;

    if (this.providerType === "whatsapp_cloud_api") {
      if (!this.cloudProvider) {
        return { success: false, errorMessage: "cloudProvider object missing" };
      }
      try {
        if (type === "voice" || type === "audio") {
          return await this.cloudProvider.sendVoice(jid, buffer);
        } else if (type === "document") {
          return await this.cloudProvider.sendDocument(jid, buffer, mimetype, fileName);
        } else {
          return await this.cloudProvider.sendMedia(jid, buffer, mimetype, caption);
        }
      } catch (err: any) {
        return { success: false, errorMessage: err?.message || String(err) };
      }
    } else {
      if (!this.baileysSendMessage) {
        return { success: false, errorMessage: "baileysSendMessage function missing" };
      }
      try {
        let payload: any = {};
        if (type === "image") {
          payload = { image: buffer, caption };
        } else if (type === "video") {
          payload = { video: buffer, caption };
        } else if (type === "sticker") {
          payload = { sticker: buffer };
        } else if (type === "voice") {
          payload = { audio: buffer, mimetype: mimetype || "audio/ogg; codecs=opus", ptt: true };
        } else if (type === "audio") {
          payload = { audio: buffer, mimetype };
        } else if (type === "document") {
          payload = { document: buffer, mimetype, fileName };
        }

        const response: any = await this.baileysSendMessage(jid, payload);
        return { success: true, providerMessageId: response?.key?.id, rawProviderResponse: response };
      } catch (err: any) {
        return { success: false, errorMessage: err?.message || String(err) };
      }
    }
  }
}

export function createWhatsAppOutboundSender(options: OutboundSenderOptions): WhatsAppOutboundSender {
  return new WhatsAppOutboundSender(options);
}
