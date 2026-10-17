// src/services/whatsapp-cloud-api-transport-provider.ts
import { 
  WhatsAppTransportProvider, 
  NormalizedConnectionStatus, 
  OutgoingSendResult, 
  NormalizedIncomingMessage 
} from "./whatsapp-transport-types.ts";
import {
  buildCloudApiTextPayload,
  buildCloudApiMediaPayload,
  buildCloudApiDocumentPayload,
  buildCloudApiAudioPayload,
  buildCloudApiMarkReadPayload,
  buildCloudApiTemplatePayload,
} from "./whatsapp-cloud-api-payload-builder.ts";
import { buildCloudApiMessagesUrl } from "./whatsapp-cloud-api-version.ts";
import { mapCloudApiSendResponse, classifyCloudApiHttpError } from "./whatsapp-cloud-api-response.ts";
import {
  uploadMedia,
  downloadMedia,
} from "./whatsapp-cloud-api-media-client.ts";
import { sendWabaTemplateMessage } from "./whatsapp-cloud-api-template-client.ts";
import {
  isPhoneInCooldown,
  recordPhoneApiSuccess,
  recordPhoneApiFailure,
} from "./whatsapp-cloud-api-rate-controller.ts";

export interface WhatsAppCloudApiDependencies {
  httpClient?: {
    post(url: string, body: any, options?: any): Promise<any>;
  };
  phoneNumberId?: string;
  accessToken?: string;
  mediaClient?: {
    uploadMedia?: typeof uploadMedia;
    downloadMedia?: typeof downloadMedia;
  };
  logger?: {
    info(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
  };
}

export class WhatsAppCloudApiTransportProvider implements WhatsAppTransportProvider {
  private httpClient?: {
    post(url: string, body: any, options?: any): Promise<any>;
  };
  private phoneNumberId?: string;
  private accessToken?: string;
  private mediaClient?: {
    uploadMedia?: typeof uploadMedia;
    downloadMedia?: typeof downloadMedia;
  };
  private logger?: {
    info(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
  };
  private status: NormalizedConnectionStatus = "disabled";

  constructor(deps: WhatsAppCloudApiDependencies = {}) {
    this.httpClient = deps.httpClient;
    this.phoneNumberId = deps.phoneNumberId;
    this.accessToken = deps.accessToken;
    this.mediaClient = deps.mediaClient;
    this.logger = deps.logger;
  }

  async start(): Promise<void> {
    if (this.phoneNumberId && (this.httpClient || this.accessToken)) {
      this.status = "connected";
      if (this.logger) {
        this.logger.info("WhatsAppCloudApiTransportProvider started (active).");
      }
    } else {
      this.status = "disabled";
      if (this.logger) {
        this.logger.info("WhatsAppCloudApiTransportProvider started without credentials (disabled).");
      }
    }
  }

  async stop(): Promise<void> {
    this.status = "disconnected";
    if (this.logger) {
      this.logger.info("WhatsAppCloudApiTransportProvider stopped.");
    }
  }

  async reload(): Promise<void> {
    if (this.logger) {
      this.logger.info("WhatsAppCloudApiTransportProvider reloaded.");
    }
  }

  async resetAuth(): Promise<void> {
    if (this.logger) {
      this.logger.info("WhatsAppCloudApiTransportProvider resetAuth.");
    }
  }

  getStatus(): NormalizedConnectionStatus {
    return this.status;
  }

  private unsupportedResult(reason = "httpClient not configured"): OutgoingSendResult {
    return {
      success: false,
      errorCode: "unsupported_operation",
      errorMessage: `unsupported_operation: ${reason}`,
      retryable: false,
    };
  }

  private getSendUrl(): string {
    const phoneId = this.phoneNumberId;
    if (!phoneId) {
      throw new Error("cloud_api_provider: phoneNumberId must be configured to build send URL");
    }
    return buildCloudApiMessagesUrl(phoneId);
  }

  async sendText(jid: string, text: string, options?: any): Promise<OutgoingSendResult> {
    if (!this.httpClient) {
      return this.unsupportedResult("httpClient not configured");
    }
    if (!this.phoneNumberId) {
      return this.unsupportedResult("phoneNumberId not configured");
    }

    const cooldown = isPhoneInCooldown(this.phoneNumberId);
    if (cooldown.inCooldown) {
      const waitSec = Math.ceil(cooldown.remainingMs / 1000);
      return {
        success: false,
        errorCode: "rate_limited",
        errorMessage: `rate_limited: Phone number ID is in rate-limit cooldown (retry after ${waitSec}s)`,
        retryable: true,
      };
    }

    try {
      const payload = buildCloudApiTextPayload(jid, text);
      const url = this.getSendUrl();
      const response = await this.httpClient.post(url, payload, options);
      recordPhoneApiSuccess(this.phoneNumberId);
      return mapCloudApiSendResponse(response, 200);
    } catch (err: any) {
      const httpStatus = (err as any)?.status || (err as any)?.statusCode || 500;
      recordPhoneApiFailure(this.phoneNumberId, httpStatus);
      const classification = classifyCloudApiHttpError(err);
      return {
        success: false,
        errorCode: classification.errorCode,
        errorMessage: classification.errorMessage || err?.message || "send_failed",
        retryable: classification.retryable,
      };
    }
  }

  async sendMedia(jid: string, buffer: Buffer, mimetype: string, caption?: string): Promise<OutgoingSendResult> {
    if (!this.httpClient) return this.unsupportedResult("httpClient not configured");
    if (!this.phoneNumberId) return this.unsupportedResult("phoneNumberId not configured");

    const cooldown = isPhoneInCooldown(this.phoneNumberId);
    if (cooldown.inCooldown) {
      const waitSec = Math.ceil(cooldown.remainingMs / 1000);
      return {
        success: false,
        errorCode: "rate_limited",
        errorMessage: `rate_limited: Phone number ID is in rate-limit cooldown (retry after ${waitSec}s)`,
        retryable: true,
      };
    }

    try {
      const uploadFn = this.mediaClient?.uploadMedia || uploadMedia;
      const cleanMime = (mimetype || "").toLowerCase();
      let mediaType: "image" | "video" | "sticker" = "image";
      if (cleanMime.startsWith("video/")) {
        mediaType = "video";
      } else if (cleanMime.startsWith("image/webp")) {
        mediaType = "sticker";
      }

      const uploadResult = await uploadFn({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken || "",
        buffer,
        mimeType: mimetype || "image/jpeg",
        kind: mediaType,
      });

      if (!uploadResult.success || !uploadResult.mediaId) {
        return {
          success: false,
          errorCode: "media_upload_failed",
          errorMessage: "media_upload_failed: upload did not return a valid mediaId",
          retryable: false,
        };
      }

      const payload = buildCloudApiMediaPayload(jid, mediaType, uploadResult.mediaId, caption);
      const url = this.getSendUrl();
      const response = await this.httpClient.post(url, payload);
      recordPhoneApiSuccess(this.phoneNumberId);
      return mapCloudApiSendResponse(response, 200);
    } catch (err: any) {
      const httpStatus = (err as any)?.status || (err as any)?.statusCode || 500;
      recordPhoneApiFailure(this.phoneNumberId, httpStatus);
      const classification = classifyCloudApiHttpError(err);
      return {
        success: false,
        errorCode: classification.errorCode || "media_send_failed",
        errorMessage: classification.errorMessage || err?.message || "media_send_failed",
        retryable: classification.retryable,
      };
    }
  }

  async sendVoice(jid: string, buffer: Buffer): Promise<OutgoingSendResult> {
    if (!this.httpClient) return this.unsupportedResult("httpClient not configured");
    if (!this.phoneNumberId) return this.unsupportedResult("phoneNumberId not configured");

    try {
      const uploadFn = this.mediaClient?.uploadMedia || uploadMedia;
      const uploadResult = await uploadFn({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken || "",
        buffer,
        mimeType: "audio/ogg; codecs=opus",
        kind: "voice",
      });

      if (!uploadResult.success || !uploadResult.mediaId) {
        return {
          success: false,
          errorCode: "media_upload_failed",
          errorMessage: "media_upload_failed: voice upload did not return a valid mediaId",
          retryable: false,
        };
      }

      const payload = buildCloudApiAudioPayload(jid, uploadResult.mediaId, true);
      const url = this.getSendUrl();
      const response = await this.httpClient.post(url, payload);
      return mapCloudApiSendResponse(response, 200);
    } catch (err: any) {
      const classification = classifyCloudApiHttpError(err);
      return {
        success: false,
        errorCode: classification.errorCode || "voice_send_failed",
        errorMessage: classification.errorMessage || err?.message || "voice_send_failed",
        retryable: classification.retryable,
      };
    }
  }

  async sendDocument(jid: string, buffer: Buffer, mimetype: string, fileName?: string, caption?: string): Promise<OutgoingSendResult> {
    if (!this.httpClient) return this.unsupportedResult("httpClient not configured");
    if (!this.phoneNumberId) return this.unsupportedResult("phoneNumberId not configured");

    try {
      const uploadFn = this.mediaClient?.uploadMedia || uploadMedia;
      const uploadResult = await uploadFn({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken || "",
        buffer,
        mimeType: mimetype || "application/pdf",
        filename: fileName,
        kind: "document",
      });

      if (!uploadResult.success || !uploadResult.mediaId) {
        return {
          success: false,
          errorCode: "media_upload_failed",
          errorMessage: "media_upload_failed: document upload did not return a valid mediaId",
          retryable: false,
        };
      }

      const payload = buildCloudApiDocumentPayload(jid, uploadResult.mediaId, fileName, caption);
      const url = this.getSendUrl();
      const response = await this.httpClient.post(url, payload);
      return mapCloudApiSendResponse(response, 200);
    } catch (err: any) {
      const classification = classifyCloudApiHttpError(err);
      return {
        success: false,
        errorCode: classification.errorCode || "document_send_failed",
        errorMessage: classification.errorMessage || err?.message || "document_send_failed",
        retryable: classification.retryable,
      };
    }
  }

  async sendTemplate(jid: string, templateId: string, languageCode: string, params: any[]): Promise<OutgoingSendResult> {
    if (!this.phoneNumberId) {
      return this.unsupportedResult("phoneNumberId not configured");
    }

    if (this.httpClient) {
      try {
        const payload = buildCloudApiTemplatePayload(jid, templateId, languageCode || "en_US", params);
        const url = this.getSendUrl();
        const response = await this.httpClient.post(url, payload);
        return mapCloudApiSendResponse(response, 200);
      } catch (err: any) {
        const classification = classifyCloudApiHttpError(err);
        return {
          success: false,
          errorCode: classification.errorCode,
          errorMessage: classification.errorMessage || err?.message || "template_send_failed",
          retryable: classification.retryable,
        };
      }
    }

    if (!this.accessToken) {
      return this.unsupportedResult("accessToken or httpClient not configured");
    }

    return sendWabaTemplateMessage({
      phoneNumberId: this.phoneNumberId,
      accessToken: this.accessToken,
      to: jid,
      templateName: templateId,
      languageCode: languageCode || "en_US",
      components: params,
    });
  }

  async markRead(_jid: string, messageId: string): Promise<void> {
    if (!this.httpClient || !this.phoneNumberId) {
      if (this.logger) {
        this.logger.warn("markRead: httpClient or phoneNumberId not configured");
      }
      return;
    }
    try {
      const payload = buildCloudApiMarkReadPayload(messageId);
      const url = this.getSendUrl();
      await this.httpClient.post(url, payload);
    } catch (err: any) {
      if (this.logger) {
        this.logger.error(`markRead failed: ${err?.message}`);
      }
    }
  }

  async downloadMedia(messageMediaRef: any): Promise<Buffer> {
    const downloadFn = this.mediaClient?.downloadMedia || downloadMedia;
    const mediaId = typeof messageMediaRef === "string" ? messageMediaRef : messageMediaRef?.mediaId || messageMediaRef?.id;
    const phoneNumberId = (typeof messageMediaRef === "object" && messageMediaRef?.phoneNumberId) || this.phoneNumberId;
    const accessToken = (typeof messageMediaRef === "object" && messageMediaRef?.accessToken) || this.accessToken;

    if (!mediaId || !phoneNumberId || !accessToken) {
      throw new Error("missing_parameters_for_download: mediaId, phoneNumberId, and accessToken are required");
    }

    const result = await downloadFn({
      mediaId,
      phoneNumberId,
      accessToken,
    });

    return result.buffer;
  }

  subscribeToIncomingMessages(callback: (msg: NormalizedIncomingMessage) => void): void {
    if (this.logger) {
      this.logger.info("subscribeToIncomingMessages is handled via webhook ingestion");
    }
  }

  subscribeToConnectionEvents(callback: (event: any) => void): void {
    if (this.logger) {
      this.logger.info("subscribeToConnectionEvents registered");
    }
  }
}
