import test from "node:test";
import assert from "node:assert/strict";

import { buildVoiceReplyPlan, isVoiceOutputOnlyRequest } from "./voice-reply-policy-service.ts";
import { detectCustomerReplyPreference, resolveEffectiveReplyBehavior } from "./customer-reply-preference-service.ts";

test("Text Preferred + text message + no voice request -> text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "text",
    customerTextOrTranscript: "What is the price?",
    voiceEnabled: true,
    replyText: "The price is 2500 PKR.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("Text Preferred + voice note + no voice request -> text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "voice",
    customerTextOrTranscript: "[Voice Message]",
    voiceEnabled: true,
    replyText: "Sure, here are the details.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("Text Preferred + voice note transcript says voice mein jawab dein -> voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "voice",
    customerTextOrTranscript: "voice mein jawab dein",
    voiceEnabled: true,
    replyText: "Ji, main ab voice mein samjha deta hoon.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Text Preferred + text says reply in voice -> voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "text",
    customerTextOrTranscript: "Please reply in voice",
    voiceEnabled: true,
    replyText: "Sure.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Text Preferred + practical reason -> voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "text",
    customerTextOrTranscript: "I am driving, send voice",
    voiceEnabled: true,
    replyText: "Understood.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Always Text + explicit voice request -> text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "send voice reply",
    voiceEnabled: true,
    replyText: "Sure.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("Always Voice + normal message -> voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "voice_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "Need details",
    voiceEnabled: true,
    replyText: "Here are the details.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Always Voice + voice disabled -> text fallback plan", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "voice_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "Need details",
    voiceEnabled: false,
    replyText: "Here are the details.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("Customer Preference + text input -> text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "preference",
    incomingMessageType: "text",
    customerTextOrTranscript: "Need details",
    voiceEnabled: true,
    replyText: "Details here.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("Customer Preference + voice input + voice enabled -> voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "preference",
    incomingMessageType: "voice",
    customerTextOrTranscript: "[Voice Message]",
    voiceEnabled: true,
    replyText: "Voice answer.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Customer Preference + saved text-only -> text", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "preference",
    savedCustomerPreference: "text_only",
    incomingMessageType: "voice",
    customerTextOrTranscript: "[Voice Message]",
    voiceEnabled: true,
    replyText: "Details here.",
  });
  assert.equal(plan.sendVoice, false);
});

test("Customer Preference + saved voice-only -> voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "preference",
    savedCustomerPreference: "voice_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "Details please",
    voiceEnabled: true,
    replyText: "Details here.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Voice generation failure fallback stays text-capable", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "text",
    customerTextOrTranscript: "send audio",
    voiceEnabled: true,
    replyText: "Here is the answer.",
  });
  assert.equal(plan.sendVoice, true);
  assert.equal(plan.sendText, false);
});

test("AI-confirmed voice request can unlock Text Preferred for voice-note routing", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "voice",
    customerTextOrTranscript: "[Voice Message]",
    voiceEnabled: true,
    aiRequestedVoiceReply: true,
    replyText: "Voice explanation",
  });
  assert.equal(plan.sendVoice, true);
});

test("Text Preferred does not get overridden by a saved text-only preference", () => {
  assert.equal(resolveEffectiveReplyBehavior("text_preferred", { customerReplyPreference: "text_only" }), "text_preferred");
});

test("missing instance reply behavior defaults to Text Preferred", () => {
  assert.equal(resolveEffectiveReplyBehavior("", {}), "text_preferred");
});

test("Text Preferred + explicit voice request + saved text-only preference still allows current voice request", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: resolveEffectiveReplyBehavior("text_preferred", { customerReplyPreference: "text_only" }),
    incomingMessageType: "text",
    customerTextOrTranscript: "send voice reply",
    voiceEnabled: true,
    replyText: "Sure.",
  });
  assert.equal(plan.sendVoice, true);
});

test("Text me now is detected as text-only preference", () => {
  assert.equal(detectCustomerReplyPreference("Text me now"), "text_only");
  assert.equal(detectCustomerReplyPreference("message me now please"), "text_only");
});

test("Text Preferred + saved text-only suppresses AI-requested voice when latest customer did not ask for voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    savedCustomerPreference: "text_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "Text me now",
    voiceEnabled: true,
    aiRequestedVoiceReply: true,
    replyText: "Sure, here are the details.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("explicit voice request still falls back to text when voice is disabled", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "text",
    customerTextOrTranscript: "reply in voice message",
    voiceEnabled: false,
    replyText: "Here are the details you asked for.",
  });

  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
  assert.match(plan.reason, /disabled/i);
});

test("voice-output-only request is detected without inventing a CRM flow", () => {
  assert.equal(isVoiceOutputOnlyRequest("send me in voice message"), true);
  assert.equal(isVoiceOutputOnlyRequest("reply in voice"), true);
  assert.equal(isVoiceOutputOnlyRequest("audio please"), true);
});

test('"send me in voice message" plans voice output without duplicate text by default', () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "text_preferred",
    incomingMessageType: "text",
    customerTextOrTranscript: "send me in voice message",
    voiceEnabled: true,
    replyText: "Here is the answer you asked for.",
  });

  assert.equal(plan.sendVoice, true);
  assert.equal(plan.sendText, false);
});

test("voice request plus a real question is not treated as output-preference-only", () => {
  assert.equal(isVoiceOutputOnlyRequest("send me in voice message and tell me the price"), false);
  assert.equal(isVoiceOutputOnlyRequest("reply in voice, what is your timing?"), false);
});

test("Customer Preference + saved text-only suppresses stale AI-requested voice", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "preference",
    savedCustomerPreference: "text_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "Text me now",
    voiceEnabled: true,
    aiRequestedVoiceReply: true,
    replyText: "Sure, here are the details.",
  });
  assert.equal(plan.sendVoice, false);
  assert.equal(plan.sendText, true);
});

test("Always Voice still sends voice despite saved text-only preference", () => {
  const plan = buildVoiceReplyPlan({
    replyMode: "voice_only",
    savedCustomerPreference: "text_only",
    incomingMessageType: "text",
    customerTextOrTranscript: "Text me now",
    voiceEnabled: true,
    aiRequestedVoiceReply: true,
    replyText: "Sure, here are the details.",
  });
  assert.equal(plan.sendVoice, true);
});
