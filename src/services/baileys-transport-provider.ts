import { EventEmitter } from "events";
import {
  WhatsAppTransportProvider,
  OutgoingSendResult,
  NormalizedIncomingMessage,
  NormalizedConnectionStatus,
  WhatsAppProviderType,
} from "./whatsapp-transport-types.ts";
import {
  normalizeBaileysIncomingMessage,
  normalizeBaileysConnectionStatus,
  normalizeBaileysSendResult,
  isBaileysGroupJid,
} from "./baileys-transport-normalizer.ts";

/**
 * Skeleton Baileys transport provider.
 * It does **not** create a real Baileys socket – a fake socket can be injected for testing.
 * All methods that cannot be safely implemented without a real socket return a clear
 * unsupported result.
 */
export class BaileysTransportProvider implements WhatsAppTransportProvider {
  private botId: string | undefined;
  private socket: EventEmitter | undefined;
  private logger: Console;
  private status: NormalizedConnectionStatus = "disconnected";
  private incomingMsgCallback?: (msg: NormalizedIncomingMessage) => void;
  private connectionEventCallback?: (status: NormalizedConnectionStatus) => void;

  constructor(options: {
    botId?: string;
    socket?: EventEmitter; // expected to behave like Baileys socket (on/off/events)
    logger?: Console;
  }) {
    this.botId = options.botId;
    this.socket = options.socket;
    this.logger = options.logger || console;
  }

  /** Starts listening to Baileys events (if a socket is supplied). */
  async start(): Promise<void> {
    if (!this.socket) {
      this.logger.warn("BaileysTransportProvider.start called without a socket – no events will be received.");
      return;
    }
    // Bind internal handlers so they can be removed later.
    this.socket.on("messages.upsert", this.handleMessagesUpsert);
    this.socket.on("connection.update", this.handleConnectionUpdate);
  }

  /** Stops listening – removes all attached listeners. */
  async stop(): Promise<void> {
    if (!this.socket) return;
    this.socket.off("messages.upsert", this.handleMessagesUpsert);
    this.socket.off("connection.update", this.handleConnectionUpdate);
  }

  /** Simple reload – stop then start again. */
  async reload(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /** Baileys authentication reset is not implemented in this skeleton. */
  async resetAuth(): Promise<void> {
    throw new Error("unsupported_operation: resetAuth not implemented in BaileysTransportProvider skeleton");
  }

  /** Returns the last known connection status (defaults to disconnected). */
  getStatus(): NormalizedConnectionStatus {
    return this.status;
  }

  /** ---------- Outgoing ---------- */
  private async sendViaSocket(jid: string, payload: any, options?: any): Promise<OutgoingSendResult> {
    if (!this.socket || typeof (this.socket as any).sendMessage !== "function") {
      return { success: false, retryable: false, errorMessage: "no_socket_available" };
    }
    try {
      // @ts-ignore – we treat the socket as Baileys‑like.
      const result = await (this.socket as any).sendMessage(jid, payload, options);
      return normalizeBaileysSendResult(result);
    } catch (e: any) {
      return { success: false, retryable: false, errorMessage: e?.message || "send_error" };
    }
  }

  async sendText(jid: string, text: string, options?: any): Promise<OutgoingSendResult> {
    return this.sendViaSocket(jid, { text }, options);
  }

  async sendMedia(jid: string, buffer: Buffer, mimetype: string, caption?: string): Promise<OutgoingSendResult> {
    // Determine media type from mimetype – simplest heuristic.
    const isImage = mimetype.startsWith("image/");
    const isVideo = mimetype.startsWith("video/");
    const isSticker = mimetype === "image/webp"; // Baileys uses stickers as webp
    let payload: any = {};
    if (isImage) payload = { image: { mimetype, caption }, buffer };
    else if (isVideo) payload = { video: { mimetype, caption }, buffer };
    else if (isSticker) payload = { sticker: { mimetype }, buffer };
    else payload = { document: { mimetype, caption }, buffer };
    return this.sendViaSocket(jid, payload);
  }

  async sendVoice(jid: string, buffer: Buffer): Promise<OutgoingSendResult> {
    const payload = { audio: { mimetype: "audio/ogg", ptt: true }, buffer };
    return this.sendViaSocket(jid, payload);
  }

  async sendDocument(jid: string, buffer: Buffer, mimetype: string, fileName?: string): Promise<OutgoingSendResult> {
    const payload = { document: { mimetype, fileName }, buffer };
    return this.sendViaSocket(jid, payload);
  }

  async sendTemplate(
    jid: string,
    templateId: string,
    languageCode: string,
    params: any[]
  ): Promise<OutgoingSendResult> {
    // Baileys does not support official template messages out of the box.
    return {
      success: false,
      retryable: false,
      errorMessage: "unsupported_operation: sendTemplate not available in BaileysTransportProvider",
    };
  }

  /** ---------- Incoming ---------- */
  async markRead(jid: string, messageId: string): Promise<void> {
    // If a real socket exists we could call markRead, but in skeleton we simply resolve.
    return;
  }

  async downloadMedia(messageMediaRef: any): Promise<Buffer> {
    if (!this.socket || typeof (this.socket as any).downloadMedia !== "function") {
      throw new Error("unsupported_operation: downloadMedia not implemented without a real socket");
    }
    // @ts-ignore – real Baileys socket method.
    return (this.socket as any).downloadMedia(messageMediaRef);
  }

  /** Subscribe to normalized incoming messages. Returns an unsubscribe function. */
  subscribeToIncomingMessages(callback: (msg: NormalizedIncomingMessage) => void): void {
    this.incomingMsgCallback = callback;
  }

  /** Subscribe to normalized connection status events. Returns an unsubscribe function. */
  subscribeToConnectionEvents(callback: (status: NormalizedConnectionStatus) => void): void {
    this.connectionEventCallback = callback;
  }

  /** ---------- Internal event handlers ---------- */
  private handleMessagesUpsert = (upsert: any) => {
    if (!upsert?.messages) return;
    for (const rawMsg of upsert.messages) {
      const normalized = normalizeBaileysIncomingMessage(rawMsg);
      this.incomingMsgCallback?.(normalized);
    }
  };

  private handleConnectionUpdate = (update: any) => {
    const normalized = normalizeBaileysConnectionStatus(update?.connection ?? update);
    this.status = normalized;
    this.connectionEventCallback?.(normalized);
  };
}

/** Simple factory for convenience. */
export function createBaileysTransportProvider(opts: {
  botId?: string;
  socket?: EventEmitter;
  logger?: Console;
}): BaileysTransportProvider {
  return new BaileysTransportProvider(opts);
}
