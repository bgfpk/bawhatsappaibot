import {
  extractGeminiTtsInlineAudio,
  getSafeTtsFailureReason,
  shouldConvertGeminiTtsAudioForWhatsApp,
} from "./gemini-tts-service.ts";

export type VoiceReplyFallbackReason = "tts_failed" | "conversion_failed" | "send_failed";

export type VoiceReplyDeliveryResult = {
  sent: boolean;
  messageId: string;
  receiptId: string;
  failureReason: string;
  fallbackReasonType: VoiceReplyFallbackReason;
};

function safeMime(value: any) {
  const mime = String(value || "").trim();
  return mime || "audio/unknown";
}

function safeReceipt(ref: any) {
  const value = String(ref || "").trim();
  return value ? value.slice(0, 12) : "none";
}

function asError(error: any, fallback: string) {
  const reason = getSafeTtsFailureReason(error, fallback);
  return { reason, safe: reason };
}

export async function deliverVoiceReplyAudio(input: {
  response: any;
  io?: any;
  convertAudioToOpus: (buffer: Buffer, mimeType?: string) => Promise<Buffer>;
  beforeSend?: () => Promise<void>;
  createReceipt?: () => { receiptId: string };
  updateReceipt?: (receiptId: string, patch: Record<string, any>) => void;
  sendVoiceNote: (payload: { buffer: Buffer; mimetype: string; ptt: true }) => Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>;
}) : Promise<VoiceReplyDeliveryResult> {
  const inlineAudio = extractGeminiTtsInlineAudio(input.response);
  if (!inlineAudio || inlineAudio.bytes <= 0) {
    input.io?.emit?.("system-log", { type: "error", msg: "tts_result provider=gemini success=false bytes=0 mime=audio/unknown duration=unknown" });
    input.io?.emit?.("system-log", { type: "error", msg: "tts_failed provider=gemini reason=tts_audio_missing" });
    return { sent: false, messageId: "", receiptId: "", failureReason: "tts_audio_missing", fallbackReasonType: "tts_failed" };
  }

  input.io?.emit?.("system-log", {
    type: "info",
    msg: `tts_result provider=gemini success=true bytes=${inlineAudio.bytes} mime=${safeMime(inlineAudio.mimeType)} duration=unknown`,
  });

  let sendBuffer = inlineAudio.buffer;
  let sendMimeType = safeMime(inlineAudio.mimeType);

  if (shouldConvertGeminiTtsAudioForWhatsApp(sendMimeType)) {
    input.io?.emit?.("system-log", {
      type: "info",
      msg: `tts_audio_conversion_started fromMime=${safeMime(sendMimeType)} toMime=audio/ogg; codecs=opus`,
    });
    try {
      sendBuffer = await input.convertAudioToOpus(sendBuffer, sendMimeType);
      sendMimeType = "audio/ogg; codecs=opus";
      input.io?.emit?.("system-log", {
        type: "success",
        msg: `tts_audio_conversion_result success=true bytes=${sendBuffer.length} mime=${sendMimeType}`,
      });
    } catch (error: any) {
      const failure = asError(error, "tts_audio_conversion_failed");
      input.io?.emit?.("system-log", {
        type: "error",
        msg: `tts_audio_conversion_result success=false bytes=0 mime=audio/ogg; codecs=opus`,
      });
      input.io?.emit?.("system-log", { type: "error", msg: `tts_failed provider=gemini reason=${failure.safe}` });
      return { sent: false, messageId: "", receiptId: "", failureReason: failure.reason, fallbackReasonType: "conversion_failed" };
    }
  } else {
    sendMimeType = sendMimeType.includes("codecs=opus") ? sendMimeType : "audio/ogg; codecs=opus";
  }

  if (sendBuffer.length <= 500) {
    input.io?.emit?.("system-log", {
      type: "error",
      msg: `tts_failed provider=gemini reason=tts_audio_too_small_${sendBuffer.length}`,
    });
    return {
      sent: false,
      messageId: "",
      receiptId: "",
      failureReason: `tts_audio_too_small_${sendBuffer.length}`,
      fallbackReasonType: "tts_failed",
    };
  }

  try {
    await input.beforeSend?.();
  } catch (error: any) {
    const failure = asError(error, "voice_send_blocked");
    input.io?.emit?.("system-log", { type: "error", msg: `voice_reply_send_failed reason=${failure.safe}` });
    return { sent: false, messageId: "", receiptId: "", failureReason: failure.reason, fallbackReasonType: "send_failed" };
  }

  const receipt = input.createReceipt?.();
  const receiptId = String(receipt?.receiptId || "");
  if (receiptId) {
    input.updateReceipt?.(receiptId, { sendStatus: "sending", errorReason: "" });
  }

  input.io?.emit?.("system-log", {
    type: "info",
    msg: `voice_reply_send_started bytes=${sendBuffer.length} mime=${sendMimeType} ptt=true`,
  });

  try {
    const result = await input.sendVoiceNote({
      buffer: sendBuffer,
      mimetype: sendMimeType,
      ptt: true,
    });
    if (!result?.success || !String(result?.providerMessageId || "").trim()) {
      const failureReason = getSafeTtsFailureReason(result?.errorMessage || "missing_message_id", "missing_message_id");
      if (receiptId) {
        input.updateReceipt?.(receiptId, { sendStatus: "failed", errorReason: failureReason });
      }
      input.io?.emit?.("system-log", { type: "error", msg: `voice_reply_send_failed reason=${failureReason}` });
      input.io?.emit?.("system-log", {
        type: "warning",
        msg: `voice_reply_send_result success=false receipt=${safeReceipt(receiptId)}`,
      });
      return { sent: false, messageId: "", receiptId, failureReason, fallbackReasonType: "send_failed" };
    }

    const messageId = String(result.providerMessageId || "");
    if (receiptId) {
      input.updateReceipt?.(receiptId, {
        sendStatus: "sent",
        messageId,
        sentTimestamp: Date.now(),
        errorReason: "",
      });
    }
    input.io?.emit?.("system-log", {
      type: "success",
      msg: `voice_reply_send_result success=true receipt=${safeReceipt(receiptId)}`,
    });
    return { sent: true, messageId, receiptId, failureReason: "", fallbackReasonType: "send_failed" };
  } catch (error: any) {
    const failure = asError(error, "voice_send_failed");
    if (receiptId) {
      input.updateReceipt?.(receiptId, { sendStatus: "failed", errorReason: failure.reason });
    }
    input.io?.emit?.("system-log", { type: "error", msg: `voice_reply_send_failed reason=${failure.safe}` });
    input.io?.emit?.("system-log", {
      type: "warning",
      msg: `voice_reply_send_result success=false receipt=${safeReceipt(receiptId)}`,
    });
    return { sent: false, messageId: "", receiptId, failureReason: failure.reason, fallbackReasonType: "send_failed" };
  }
}
