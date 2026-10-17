import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildMediaReplyContextAttachment,
  understandLatestCustomerAudio,
  understandLatestCustomerImage,
} from "./customer-media-understanding-service.ts";

test("incoming image buffer reaches Gemini media understanding and produces useful context", async () => {
  let received = 0;
  let instruction = "";
  const result = await understandLatestCustomerImage({
    imageBuffer: Buffer.from("fake-flower-seeds-image"),
    mimeType: "image/jpeg",
    latestCustomerText: "What is this?",
    visionGenerate: async (input: any) => {
      received = input.media.buffer.length;
      instruction = input.instruction;
      return {
        text: JSON.stringify({
          confidence: 0.94,
          detectedType: "product_poster",
          conciseSummary: "This is a Black Gold Fertilizer Summer & Monsoon Flower Seeds Combo Pack poster.",
          visibleText: "Black Gold Fertilizer Summer & Monsoon Flower Seeds Combo Pack",
          answerFocus: "It promotes seasonal flower seeds for colorful summer and monsoon flowers.",
        }),
        provider: "platform_gemini",
        model: "models/gemini-2.5-flash",
        requestStatus: "success",
        raw: null,
      };
    },
  });

  assert.equal(received, Buffer.from("fake-flower-seeds-image").length);
  assert.equal(result.useful, true);
  assert.match(result.contextText, /Black Gold Fertilizer/i);
  assert.doesNotMatch(instruction, /full CRM|full customer history|tool\/function-call|full business prompt/i);
});

test("generic or empty image recognition is not treated as useful", async () => {
  const result = await understandLatestCustomerImage({
    imageBuffer: Buffer.from("fake-image"),
    visionGenerate: async () => ({
      text: JSON.stringify({
        confidence: 0.21,
        detectedType: "image",
        conciseSummary: "Unable to determine from the image.",
        visibleText: "",
        answerFocus: "",
      }),
      provider: "platform_gemini",
      model: "models/gemini-2.5-flash",
      requestStatus: "success",
      raw: null,
    }),
  });

  assert.equal(result.useful, false);
  assert.equal(result.retryable, true);
});

test("readable product label image is useful even when only partial visible text is available", async () => {
  const result = await understandLatestCustomerImage({
    imageBuffer: Buffer.from("product-label-image"),
    mimeType: "image/jpeg",
    latestCustomerText: "I have this product too",
    caption: "I have this product too",
    visionGenerate: async () => ({
      text: JSON.stringify({
        confidence: 0.81,
        detectedType: "product_label",
        conciseSummary: "A packaged supplement product label.",
        visibleText: "Bio Grow Plus",
        productName: "Bio Grow Plus",
        claims: ["Plant nutrition"],
      }),
      provider: "platform_gemini",
      model: "models/gemini-2.5-flash",
      requestStatus: "success",
      raw: null,
    }),
  });

  assert.equal(result.useful, true);
  assert.match(result.contextText, /Bio Grow Plus/i);
  assert.match(result.contextText, /Plant nutrition/i);
});

test("image parser can salvage useful product label details from loose JSON text", async () => {
  const result = await understandLatestCustomerImage({
    imageBuffer: Buffer.from("loose-product-label-image"),
    visionGenerate: async () => ({
      text: `{
        "detectedType": "product_label",
        "visibleText": "Black Gold",
        "packagingDetails": "Yellow bottle label",
        "confidence": 0.77
      }`,
      provider: "platform_gemini",
      model: "models/gemini-2.5-flash",
      requestStatus: "success",
      raw: null,
    }),
  });

  assert.equal(result.useful, true);
  assert.match(result.contextText, /Black Gold/i);
  assert.match(result.contextText, /Yellow bottle label/i);
});

test("flower seeds poster understanding is attached as latest image context", () => {
  const attachment = buildMediaReplyContextAttachment({
    kind: "image",
    useful: true,
    provider: "platform_gemini",
    model: "models/gemini-2.5-flash",
    requestStatus: "success",
    retryable: false,
    reason: "",
    confidence: 0.95,
    detectedType: "product_poster",
    contextText: "This is a Black Gold Fertilizer Summer & Monsoon Flower Seeds Combo Pack poster.",
    transcriptText: "",
    usedProvider: true,
  });

  assert.match(attachment, /\[Latest image understanding\]/);
  assert.match(attachment, /Flower Seeds Combo Pack/i);
});

test("audio transcript is reused only when the real audio buffer is unavailable", async () => {
  const result = await understandLatestCustomerAudio({
    transcript: "Please tell me the price of these flower seeds.",
  });

  assert.equal(result.useful, true);
  assert.equal(result.usedProvider, false);
  assert.equal(result.provider, "message_transcript");
  assert.match(result.contextText, /price of these flower seeds/i);
});

test("failed audio understanding stays retryable and does not fake a transcript", async () => {
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("audio"),
    mimeType: "audio/ogg",
    audioGenerate: async () => ({
      text: "",
      provider: "platform_gemini",
      model: "models/gemini-2.5-flash",
      requestStatus: "failed",
      raw: null,
    }),
  });

  assert.equal(result.useful, false);
  assert.equal(result.retryable, true);
  assert.equal(result.transcriptText, "");
});

test("latest image understanding prompt forbids old CRM or dashboard guesses", async () => {
  const code = await fs.readFile(path.join(process.cwd(), "src/services/customer-media-understanding-service.ts"), "utf-8");
  assert.match(code, /Do not use CRM, dashboard, website, or earlier chat knowledge\./);
  assert.match(code, /product, package, or label/i);
  assert.match(code, /partial useful detail/i);
});

test("audio understanding uses Gemini media prompt without full history", async () => {
  let instruction = "";
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("voice-note"),
    mimeType: "audio/ogg",
    latestCustomerText: "Ye kya keh rahe hain?",
    audioGenerate: async (input: any) => {
      instruction = input.instruction;
      return {
        text: JSON.stringify({
          confidence: 0.92,
          transcript: "Ye flower seeds combo pack hai.",
          conciseSummary: "Customer is asking what the poster is about.",
        }),
        provider: "platform_gemini",
        model: "models/gemini-2.5-flash",
        requestStatus: "success",
        raw: null,
      };
    },
  });

  assert.equal(result.useful, true);
  assert.match(instruction, /Transcribe only the latest WhatsApp voice note/i);
  assert.doesNotMatch(instruction, /full CRM|full customer history|full reply-generation prompt|tool\/function-call/i);
});

test("WhatsApp OGG/OPUS voice note is converted to WAV before Gemini call", async () => {
  let receivedMime = "";
  let receivedBytes = 0;
  let convertCalls = 0;
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("voice-note-ogg-opus"),
    mimeType: "audio/ogg; codecs=opus",
    audioConvert: async ({ buffer }) => {
      convertCalls += 1;
      assert.equal(buffer.length, Buffer.from("voice-note-ogg-opus").length);
      return {
        buffer: Buffer.from("converted-wav-audio"),
        mimeType: "audio/wav" as const,
      };
    },
    audioGenerate: async (input: any) => {
      receivedMime = input.media.mimeType;
      receivedBytes = input.media.buffer.length;
      return {
        text: JSON.stringify({
          confidence: 0.88,
          transcript: "Please send me the clinic timing.",
          summary: "Customer is asking for clinic timing.",
          language: "en",
        }),
        provider: "platform_gemini",
        model: "models/gemini-2.5-flash",
        requestStatus: "success",
        raw: null,
      };
    },
  });

  assert.equal(convertCalls, 1);
  assert.equal(receivedMime, "audio/wav");
  assert.equal(receivedBytes, Buffer.from("converted-wav-audio").length);
  assert.equal(result.useful, true);
});

test("empty audio buffer does not call Gemini and stays retryable", async () => {
  let called = 0;
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.alloc(0),
    mimeType: "audio/ogg",
    audioGenerate: async () => {
      called += 1;
      return {
        text: "",
        provider: "platform_gemini",
        model: "models/gemini-2.5-flash",
        requestStatus: "failed",
        raw: null,
      };
    },
  });

  assert.equal(called, 0);
  assert.equal(result.useful, false);
  assert.equal(result.reason, "missing_audio_buffer");
});

test("OGG voice note does not call Gemini twice as OGG then WAV", async () => {
  const seenMimes: string[] = [];
  let convertCalls = 0;
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("ogg-voice"),
    mimeType: "audio/ogg; codecs=opus",
    audioGenerate: async (input: any) => {
      seenMimes.push(input.media.mimeType);
      return {
        text: JSON.stringify({ transcript: "", summary: "", confidence: 0 }),
        provider: "platform_gemini",
        model: "models/gemini-2.5-flash",
        requestStatus: "success",
        raw: null,
      };
    },
    audioConvert: async ({ buffer }) => {
      convertCalls += 1;
      assert.equal(buffer.length, Buffer.from("ogg-voice").length);
      return {
        buffer: Buffer.from("converted-wav"),
        mimeType: "audio/wav" as const,
      };
    },
  });

  assert.deepEqual(seenMimes, ["audio/wav"]);
  assert.equal(convertCalls, 1);
  assert.equal(result.useful, false);
});

test("if WAV conversion fails, original audio fallback is attempted at most once", async () => {
  const seenMimes: string[] = [];
  let convertCalls = 0;
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("ogg-voice"),
    mimeType: "audio/ogg; codecs=opus",
    audioGenerate: async (input: any) => {
      seenMimes.push(input.media.mimeType);
      return {
        text: JSON.stringify({
          transcript: "Aap clinic timing bata dein.",
          summary: "Customer is asking about clinic timing.",
          confidence: 0.91,
          language: "roman_ur",
        }),
        provider: "platform_gemini",
        model: "models/gemini-2.5-flash",
        requestStatus: "success",
        raw: null,
      };
    },
    audioConvert: async () => {
      convertCalls += 1;
      throw new Error("ffmpeg_failed");
    },
  });

  assert.equal(convertCalls, 1);
  assert.deepEqual(seenMimes, ["audio/ogg"]);
  assert.equal(result.useful, true);
});

test("meaningful partial audio transcript can be salvaged safely on MAX_TOKENS", async () => {
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("voice-note"),
    mimeType: "audio/wav",
    audioGenerate: async () => ({
      text: `{"transcript":"Please share the clinic timing","summary":"Customer wants clinic timing","language":"en","confidence":0.84`,
      provider: "platform_gemini",
      model: "models/gemini-2.5-flash",
      requestStatus: "success",
      finishReason: "MAX_TOKENS",
      partial: true,
      raw: null,
    }),
  });

  assert.equal(result.useful, true);
  assert.equal(result.detectedType, "partial_json_salvaged");
  assert.equal(result.sourceTag, "partial_json_salvaged");
  assert.match(result.contextText, /clinic timing/i);
});

test("summary-only Gemini audio result still counts as useful context", async () => {
  const result = await understandLatestCustomerAudio({
    audioBuffer: Buffer.from("voice-note"),
    mimeType: "audio/ogg",
    audioGenerate: async () => ({
      text: JSON.stringify({
        transcript: "",
        summary: "Customer wants pricing and appointment details.",
        language: "en",
        confidence: 0.76,
      }),
      provider: "platform_gemini",
      model: "models/gemini-2.5-flash",
      requestStatus: "success",
      raw: null,
    }),
  });

  assert.equal(result.useful, true);
  assert.equal(result.transcriptText, "");
  assert.match(result.contextText, /Customer wants pricing and appointment details/i);
});
