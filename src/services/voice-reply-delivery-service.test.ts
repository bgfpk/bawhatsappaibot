import test from "node:test";
import assert from "node:assert/strict";

import { deliverVoiceReplyAudio } from "./voice-reply-delivery-service.ts";

function buildResponse(mimeType: string, text: string) {
  return {
    output_audio: {
      mime_type: mimeType,
      data: Buffer.from(text).toString("base64"),
    },
  };
}

function buildIoLogCollector() {
  const logs: string[] = [];
  return {
    logs,
    io: {
      emit: (_channel: string, event: any) => {
        logs.push(String(event?.msg || ""));
      },
    },
  };
}

test("missing Gemini TTS audio fails before conversion, receipt, and send", async () => {
  const { io, logs } = buildIoLogCollector();
  let receiptCalls = 0;
  let sendCalls = 0;

  const result = await deliverVoiceReplyAudio({
    response: { outputs: [{ type: "text", text: "no audio" }] },
    io,
    convertAudioToOpus: async (buffer) => buffer,
    createReceipt: () => {
      receiptCalls += 1;
      return { receiptId: "receipt-1" };
    },
    sendVoiceNote: async () => {
      sendCalls += 1;
      return { success: true, providerMessageId: "msg-1" };
    },
  });

  assert.equal(result.sent, false);
  assert.equal(result.failureReason, "tts_audio_missing");
  assert.equal(result.fallbackReasonType, "tts_failed");
  assert.equal(receiptCalls, 0);
  assert.equal(sendCalls, 0);
  assert.ok(logs.some((msg) => msg.includes("tts_result provider=gemini success=false")));
});

test("unsupported TTS mime converts to ogg/opus and sends as voice note", async () => {
  const { io, logs } = buildIoLogCollector();
  const receiptUpdates: any[] = [];
  let sendPayload: any = null;

  const result = await deliverVoiceReplyAudio({
    response: buildResponse("audio/wav", "a".repeat(900)),
    io,
    convertAudioToOpus: async (_buffer, mimeType) => {
      assert.equal(mimeType, "audio/wav");
      return Buffer.from("b".repeat(1200));
    },
    beforeSend: async () => {},
    createReceipt: () => ({ receiptId: "receipt-voice-1" }),
    updateReceipt: (_receiptId, patch) => {
      receiptUpdates.push(patch);
    },
    sendVoiceNote: async (payload) => {
      sendPayload = payload;
      return { success: true, providerMessageId: "voice-msg-1" };
    },
  });

  assert.equal(result.sent, true);
  assert.equal(result.messageId, "voice-msg-1");
  assert.equal(sendPayload.mimetype, "audio/ogg; codecs=opus");
  assert.equal(sendPayload.ptt, true);
  assert.equal(sendPayload.buffer.length, 1200);
  assert.equal(receiptUpdates[0].sendStatus, "sending");
  assert.equal(receiptUpdates[1].sendStatus, "sent");
  assert.ok(logs.some((msg) => msg.includes("tts_audio_conversion_started fromMime=audio/wav")));
  assert.ok(logs.some((msg) => msg.includes("voice_reply_send_result success=true")));
});

test("conversion failure sends no voice, creates no receipt, and marks conversion failure", async () => {
  let receiptCalls = 0;
  let sendCalls = 0;

  const result = await deliverVoiceReplyAudio({
    response: buildResponse("audio/wav", "a".repeat(900)),
    convertAudioToOpus: async () => {
      throw new Error("ffmpeg_missing");
    },
    createReceipt: () => {
      receiptCalls += 1;
      return { receiptId: "receipt-voice-2" };
    },
    sendVoiceNote: async () => {
      sendCalls += 1;
      return { success: true, providerMessageId: "voice-msg-2" };
    },
  });

  assert.equal(result.sent, false);
  assert.equal(result.fallbackReasonType, "conversion_failed");
  assert.equal(result.failureReason, "ffmpeg_missing");
  assert.equal(receiptCalls, 0);
  assert.equal(sendCalls, 0);
});

test("voice send failure returns specific send_failed result and failed receipt", async () => {
  const receiptUpdates: any[] = [];

  const result = await deliverVoiceReplyAudio({
    response: buildResponse("audio/ogg; codecs=opus", "a".repeat(900)),
    convertAudioToOpus: async (buffer) => buffer,
    beforeSend: async () => {},
    createReceipt: () => ({ receiptId: "receipt-voice-3" }),
    updateReceipt: (_receiptId, patch) => {
      receiptUpdates.push(patch);
    },
    sendVoiceNote: async () => ({
      success: false,
      errorMessage: "upload_failed",
    }),
  });

  assert.equal(result.sent, false);
  assert.equal(result.failureReason, "upload_failed");
  assert.equal(result.fallbackReasonType, "send_failed");
  assert.equal(receiptUpdates[0].sendStatus, "sending");
  assert.equal(receiptUpdates[1].sendStatus, "failed");
});
