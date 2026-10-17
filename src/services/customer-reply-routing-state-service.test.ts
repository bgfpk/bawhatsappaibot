import test from "node:test";
import assert from "node:assert/strict";

import { resolveLatestCustomerReplyRoutingState } from "./customer-reply-routing-state-service.ts";

test("latest customer text message is routed as text-only even if previous message was audio", () => {
  const state = resolveLatestCustomerReplyRoutingState({
    latestMessageType: "text",
    latestMessageId: "msg_text_1",
    latestUserHasAudio: false,
    latestUserHasMedia: false,
    conversationHasAudio: true,
    conversationHasMedia: true,
  });

  assert.equal(state.forceTextOnly, true);
  assert.equal(state.hasAudio, false);
  assert.equal(state.hasMedia, false);
  assert.equal(state.staleMediaRequirementCleared, true);
  assert.equal(state.staleMediaSource, "conversation_media");
});

test("latest customer text message is routed as text-only even if previous message was image", () => {
  const state = resolveLatestCustomerReplyRoutingState({
    latestMessageType: "text",
    latestMessageId: "msg_text_2",
    latestUserHasImage: false,
    latestUserHasMedia: false,
    conversationHasMedia: true,
  });

  assert.equal(state.forceTextOnly, true);
  assert.equal(state.hasImage, false);
  assert.equal(state.hasMedia, false);
  assert.equal(state.staleMediaRequirementCleared, true);
  assert.equal(state.staleMediaSource, "conversation_media");
});

test("old audio required profile state cannot block a newer text reply", () => {
  const state = resolveLatestCustomerReplyRoutingState({
    latestMessageType: "text",
    latestMessageId: "msg_text_3",
    profileLastMediaUnderstandingEventId: "voice_msg_1",
    profileLastMediaUnderstandingStatus: "pending_audio_understanding",
  });

  assert.equal(state.forceTextOnly, true);
  assert.equal(state.hasAudio, false);
  assert.equal(state.staleMediaRequirementCleared, true);
  assert.equal(state.shouldCancelPendingMediaRetry, true);
  assert.equal(state.staleMessageId, "voice_msg_1");
});

test("old image required profile state cannot block a newer text reply", () => {
  const state = resolveLatestCustomerReplyRoutingState({
    latestMessageType: "text",
    latestMessageId: "msg_text_4",
    profileLastMediaUnderstandingEventId: "image_msg_1",
    profileLastMediaUnderstandingStatus: "image_understood_pending_reply",
  });

  assert.equal(state.forceTextOnly, true);
  assert.equal(state.hasMedia, false);
  assert.equal(state.staleMediaRequirementCleared, true);
  assert.equal(state.shouldCancelPendingMediaRetry, true);
  assert.equal(state.staleMessageId, "image_msg_1");
});

test("audio latest message still keeps audio routing requirements", () => {
  const state = resolveLatestCustomerReplyRoutingState({
    latestMessageType: "audio",
    latestMessageId: "voice_msg_2",
    latestUserHasAudio: true,
    latestUserHasMedia: true,
    conversationHasAudio: true,
    conversationHasMedia: true,
  });

  assert.equal(state.forceTextOnly, false);
  assert.equal(state.hasAudio, true);
  assert.equal(state.hasMedia, true);
  assert.equal(state.staleMediaRequirementCleared, false);
});

test("simple greeting text stays on text-only routing", () => {
  const state = resolveLatestCustomerReplyRoutingState({
    latestMessageType: "text",
    latestMessageId: "msg_greeting_1",
    conversationHasAudio: true,
    conversationHasMedia: true,
    profileLastMediaUnderstandingEventId: "voice_msg_3",
    profileLastMediaUnderstandingStatus: "pending_audio_understanding",
  });

  assert.equal(state.forceTextOnly, true);
  assert.equal(state.hasAudio, false);
  assert.equal(state.hasMedia, false);
  assert.equal(state.shouldCancelPendingMediaRetry, true);
});
