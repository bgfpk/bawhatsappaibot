import test from "node:test";
import assert from "node:assert/strict";

import {
  assertGeminiAllowedForPurpose,
  classifyGeminiPurpose,
  hasNonGeminiAudioUnderstandingProvider,
  isDeepInfraRequiredForPurpose,
  isGeminiAllowedForPurpose,
} from "./ai-provider-policy-service.ts";

test("customer text reply cannot call Gemini", () => {
  assert.equal(isDeepInfraRequiredForPurpose({ purpose: "customer_ai_reply", modality: "text" }), true);
  assert.equal(isGeminiAllowedForPurpose({ purpose: "customer_ai_reply", modality: "text" }), false);
  assert.equal(classifyGeminiPurpose({ purpose: "customer_ai_reply", modality: "text" }), "blocked_text_generation");
  assert.throws(() => assertGeminiAllowedForPurpose({ purpose: "customer_ai_reply", modality: "text" }), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);
});

test("summary memory repair and manual learning text paths cannot call Gemini", () => {
  for (const purpose of [
    "customer_summary",
    "combined_reply_memory",
    "customer_ai_reply_guard_repair",
    "customer_ai_reply_repair",
    "manual_learning",
  ]) {
    assert.equal(isGeminiAllowedForPurpose({ purpose, modality: "text" }), false, purpose);
    assert.equal(isDeepInfraRequiredForPurpose({ purpose, modality: "text" }), true, purpose);
  }
});

test("Gemini is allowed for image/audio understanding and TTS but not text replies", () => {
  assert.equal(isGeminiAllowedForPurpose({ purpose: "customer_image_context", modality: "image", hasImage: true, isImageRecognition: true }), true);
  assert.equal(classifyGeminiPurpose({
    purpose: "customer_image_context",
    modality: "image",
    hasImage: true,
    isImageRecognition: true,
  }), "image_understanding_allowed");
  assert.equal(isGeminiAllowedForPurpose({ purpose: "audio_transcription", modality: "audio_input", hasAudio: true, isVoiceUnderstanding: true }), true);
  assert.equal(hasNonGeminiAudioUnderstandingProvider(), false);
  assert.equal(isGeminiAllowedForPurpose({ purpose: "reply_tts", modality: "tts", isTts: true }), true);
  assert.equal(classifyGeminiPurpose({ purpose: "reply_tts", modality: "tts", isTts: true }), "tts_allowed");
});
