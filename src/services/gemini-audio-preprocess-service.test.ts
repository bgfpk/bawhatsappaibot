import test from "node:test";
import assert from "node:assert/strict";

import {
  isGeminiAudioConversionAvailable,
  normalizeGeminiAudioMimeType,
  shouldRetryGeminiAudioWithConversion,
} from "./gemini-audio-preprocess-service.ts";

test("audio mime normalization keeps WhatsApp OGG/OPUS Gemini-safe", () => {
  assert.equal(normalizeGeminiAudioMimeType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(normalizeGeminiAudioMimeType("audio/opus"), "audio/ogg");
  assert.equal(normalizeGeminiAudioMimeType("application/ogg"), "audio/ogg");
  assert.equal(normalizeGeminiAudioMimeType("audio/wav"), "audio/wav");
});

test("WhatsApp OGG audio is the only conversion retry target", () => {
  assert.equal(shouldRetryGeminiAudioWithConversion("audio/ogg; codecs=opus"), true);
  assert.equal(shouldRetryGeminiAudioWithConversion("audio/wav"), false);
  assert.equal(shouldRetryGeminiAudioWithConversion("audio/mpeg"), false);
});

test("ffmpeg availability is exposed safely for audio preprocessing", () => {
  assert.equal(typeof isGeminiAudioConversionAvailable(), "boolean");
});
