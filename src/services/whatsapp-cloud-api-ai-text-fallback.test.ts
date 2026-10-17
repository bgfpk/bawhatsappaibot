import assert from "node:assert/strict";
import test from "node:test";
import { buildVoiceReplyPlan } from "./voice-reply-policy-service.ts";

test("CloudPrompt1: Always Voice setting + Cloud text-only capability falls back safely to text", () => {
  // When sock is Cloud tracked sender, voiceEnabled is resolved to false
  const plan = buildVoiceReplyPlan({
    replyMode: "voice_only",
    customerTextOrTranscript: "Hello, what are your prices?",
    voiceEnabled: false, // Cloud runtime capability in Prompt 1
  });

  assert.equal(plan.sendVoice, false, "Must not send voice on Cloud Prompt 1 runtime");
  assert.equal(plan.sendText, true, "Must send text fallback");
  assert.match(plan.reason, /voice simulation is disabled/);
});

test("CloudPrompt1: Text Preferred setting + Cloud text-only capability delivers text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    customerTextOrTranscript: "Hello",
    voiceEnabled: false,
  });

  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("CloudPrompt1: Customer Preference setting + Cloud text-only capability delivers text even for incoming voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "preference",
    incomingMessageType: "voice",
    customerTextOrTranscript: "Voice transcript",
    voiceEnabled: false,
  });

  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("CloudPrompt1: Always Text setting delivers text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_only",
    customerTextOrTranscript: "Hello",
    voiceEnabled: false,
  });

  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});
