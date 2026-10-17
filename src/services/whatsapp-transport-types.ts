export type WhatsAppProviderType = "whatsapp_web" | "whatsapp_cloud_api";

export type NormalizedConnectionStatus = 
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "connected"
  | "error"
  | "disabled";

export type NormalizedMessageType = 
  | "text" 
  | "image" 
  | "audio" 
  | "voice" 
  | "video" 
  | "document" 
  | "sticker" 
  | "location" 
  | "unknown";

export interface NormalizedIncomingMessage {
  providerType: WhatsAppProviderType;
  instanceId?: string;
  botId?: string;
  accountId?: string;
  chatId: string; // customerJid
  messageId: string;
  senderName?: string;
  timestamp: number;
  messageType: NormalizedMessageType;
  text?: string;
  caption?: string;
  hasMedia: boolean;
  mediaMimeType?: string;
  mediaId?: string; // providerMediaId
  isGroup: boolean;
  groupId?: string;
  rawProviderPayload?: any;
}

export interface NormalizedStatusUpdate {
  providerMessageId: string;
  status: string;
  timestamp: number;
  rawProviderPayload?: any;
}

export interface SendTextRequest {
  type: "text";
  jid: string;
  text: string;
  options?: any;
}

export interface SendMediaRequest {
  type: "image" | "video" | "sticker";
  jid: string;
  buffer?: Buffer;
  mediaId?: string;
  mimetype: string;
  caption?: string;
}

export interface SendVoiceAudioRequest {
  type: "voice" | "audio";
  jid: string;
  buffer?: Buffer;
  mediaId?: string;
  mimetype?: string;
}

export interface SendDocumentRequest {
  type: "document";
  jid: string;
  buffer?: Buffer;
  mediaId?: string;
  mimetype: string;
  fileName?: string;
  caption?: string;
}

export interface SendTemplateRequest {
  type: "template";
  jid: string;
  templateId: string;
  languageCode: string;
  params: any[];
}

export type OutgoingSendRequest = 
  | SendTextRequest 
  | SendMediaRequest 
  | SendVoiceAudioRequest 
  | SendDocumentRequest 
  | SendTemplateRequest;

export interface OutgoingSendResult {
  success: boolean;
  providerMessageId?: string;
  receiptStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  rawProviderResponse?: any;
}

export interface ProviderCapabilities {
  supportsQrAuth: boolean;
  supportsWebhook: boolean;
  supportsGroups: boolean;
  supportsGroupLibraryTracking: boolean;
  supportsNativeForwarding: boolean;
  supportsFreeformOutsideWindow: boolean;
  supportsTemplates: boolean;
  supportsMediaUpload: boolean;
  supportsMediaDownload: boolean;
  supportsVoiceSend: boolean;
  supportsReadReceipts: boolean;
  supportsTypingPresence: boolean;
}

export interface WhatsAppTransportProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  reload(): Promise<void>;
  resetAuth(): Promise<void>;
  getStatus(): NormalizedConnectionStatus;
  
  sendText(jid: string, text: string, options?: any): Promise<OutgoingSendResult>;
  sendMedia(jid: string, buffer: Buffer, mimetype: string, caption?: string): Promise<OutgoingSendResult>;
  sendVoice(jid: string, buffer: Buffer): Promise<OutgoingSendResult>;
  sendDocument(jid: string, buffer: Buffer, mimetype: string, fileName?: string, caption?: string): Promise<OutgoingSendResult>;
  sendTemplate(jid: string, templateId: string, languageCode: string, params: any[]): Promise<OutgoingSendResult>;
  
  markRead(jid: string, messageId: string): Promise<void>;
  downloadMedia(messageMediaRef: any): Promise<Buffer>;
  
  subscribeToIncomingMessages(callback: (msg: NormalizedIncomingMessage) => void): void;
  subscribeToConnectionEvents(callback: (event: any) => void): void;
}
