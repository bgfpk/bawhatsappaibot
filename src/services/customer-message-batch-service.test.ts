import test from "node:test";
import assert from "node:assert/strict";

import {
  MESSAGE_BATCH_FAST_TEXT_INITIAL_DEBOUNCE_MS,
  MESSAGE_BATCH_FAST_TEXT_MAX_WAIT_MS,
  MESSAGE_BATCH_INITIAL_DEBOUNCE_MS,
  MESSAGE_BATCH_MAX_PENDING_AUDIO_MESSAGES,
  MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES,
  MESSAGE_BATCH_MAX_PENDING_MESSAGES,
  MESSAGE_BATCH_MAX_WAIT_MS,
  buildBatchMessageCursor,
  collectPendingInboundMessageBatch,
  getMessageBatchDelayProfile,
  getInternalPlaceholderReason,
  isRealInboundCustomerMessage,
  summarizePendingBatch,
} from "./customer-message-batch-service.ts";

function inboundMessage(input: {
  id: string;
  timestamp: number;
  text?: string;
  image?: boolean;
  audio?: boolean;
}) {
  return {
    key: { id: input.id, remoteJid: "contact-e4ed32210a80@example.invalid", fromMe: false },
    messageTimestamp: input.timestamp,
    message: input.audio
      ? { audioMessage: { mimetype: "audio/ogg" } }
      : input.image
        ? { imageMessage: { caption: input.text || "" } }
        : { conversation: input.text || "" },
  };
}

test("real inbound customer message detection accepts text image and audio", () => {
  assert.equal(isRealInboundCustomerMessage(inboundMessage({ id: "m1", timestamp: 100, text: "Hello" })).ok, true);
  assert.equal(isRealInboundCustomerMessage(inboundMessage({ id: "m2", timestamp: 101, image: true, text: "What is this?" })).ok, true);
  assert.equal(isRealInboundCustomerMessage(inboundMessage({ id: "m3", timestamp: 102, audio: true })).ok, true);
});

test("internal placeholders are ignored as fake customer messages", () => {
  assert.equal(getInternalPlaceholderReason("Media"), "system_saved_media_placeholder");
  assert.equal(getInternalPlaceholderReason("Voice note received, transcript unavailable"), "voice_note_transcript_unavailable_placeholder");
  assert.equal(isRealInboundCustomerMessage(inboundMessage({ id: "m4", timestamp: 103, text: "Media" })).ok, false);
  assert.equal(isRealInboundCustomerMessage(inboundMessage({ id: "m5", timestamp: 104, text: "Voice Message" })).ok, false);
});

test("pending inbound batch collects only unhandled real customer messages after last bot reply", () => {
  const history = [
    inboundMessage({ id: "u1", timestamp: 100, text: "Old message" }),
    inboundMessage({ id: "u2", timestamp: 106, image: true, text: "Logo" }),
    inboundMessage({ id: "u3", timestamp: 107, audio: true }),
    inboundMessage({ id: "u4", timestamp: 108, text: "How much?" }),
    inboundMessage({ id: "u5", timestamp: 109, text: "Media" }),
  ];
  const batch = collectPendingInboundMessageBatch(history, {
    handledMessageIds: ["u2"],
    lastHandledMessageCursor: buildBatchMessageCursor(inboundMessage({ id: "u1", timestamp: 100, text: "Old message" })),
  });

  assert.deepEqual(batch.messages.map((message) => message.key.id), ["u3", "u4"]);
  assert.equal(batch.ignored.some((entry) => entry.reason === "system_saved_media_placeholder"), true);
  assert.equal(batch.skippedHandled.some((entry) => entry.messageId === "u2"), true);
  assert.equal(batch.skippedOld.some((entry) => entry.messageId === "u1"), true);
  assert.deepEqual(summarizePendingBatch(batch.messages), { messageCount: 2, mediaCount: 1, audioCount: 1 });
});

test("batch safety caps keep only newest unhandled messages and preserve latest image or voice focus", () => {
  const history = [
    inboundMessage({ id: "m1", timestamp: 101, image: true, text: "old image" }),
    inboundMessage({ id: "m2", timestamp: 102, audio: true }),
    inboundMessage({ id: "m3", timestamp: 103, text: "old text" }),
    inboundMessage({ id: "m4", timestamp: 104, image: true, text: "latest image" }),
    inboundMessage({ id: "m5", timestamp: 105, audio: true }),
    inboundMessage({ id: "m6", timestamp: 106, text: "latest text" }),
    inboundMessage({ id: "m7", timestamp: 107, image: true, text: "overflow image" }),
  ];
  const batch = collectPendingInboundMessageBatch(history);

  assert.equal(batch.messages.length <= MESSAGE_BATCH_MAX_PENDING_MESSAGES, true);
  assert.equal(summarizePendingBatch(batch.messages).mediaCount <= MESSAGE_BATCH_MAX_PENDING_MEDIA_MESSAGES, true);
  assert.equal(summarizePendingBatch(batch.messages).audioCount <= MESSAGE_BATCH_MAX_PENDING_AUDIO_MESSAGES, true);
  assert.equal(batch.messages.at(-1)?.key?.id, "m7");
  assert.equal(batch.overflow.length > 0, true);
});

test("existing-chat baseline leaves only one new image or one new voice note pending", () => {
  const imageHistory = [
    inboundMessage({ id: "old1", timestamp: 100, text: "Old hello" }),
    inboundMessage({ id: "new-image", timestamp: 201, image: true, text: "Check this" }),
  ];
  const imageBatch = collectPendingInboundMessageBatch(imageHistory, {
    handledMessageIds: ["old1"],
    lastHandledMessageCursor: "000000000200:bot-reply",
  });
  assert.deepEqual(imageBatch.messages.map((message) => message.key.id), ["new-image"]);
  assert.deepEqual(summarizePendingBatch(imageBatch.messages), { messageCount: 1, mediaCount: 1, audioCount: 0 });

  const audioHistory = [
    inboundMessage({ id: "old2", timestamp: 100, text: "Old hello" }),
    inboundMessage({ id: "new-audio", timestamp: 202, audio: true }),
  ];
  const audioBatch = collectPendingInboundMessageBatch(audioHistory, {
    handledMessageIds: ["old2"],
    lastHandledMessageCursor: "000000000200:bot-reply",
  });
  assert.deepEqual(audioBatch.messages.map((message) => message.key.id), ["new-audio"]);
  assert.deepEqual(summarizePendingBatch(audioBatch.messages), { messageCount: 1, mediaCount: 1, audioCount: 1 });
});

test("allowedMessageIds restrict live batch selection to active batch messages only", () => {
  const history = [
    inboundMessage({ id: "old-image", timestamp: 201, image: true, text: "Old product image" }),
    inboundMessage({ id: "old-audio", timestamp: 202, audio: true }),
    inboundMessage({ id: "fresh-hi", timestamp: 203, text: "hi" }),
  ];

  const batch = collectPendingInboundMessageBatch(history, {
    allowedMessageIds: ["fresh-hi"],
  });

  assert.deepEqual(batch.messages.map((message) => message.key.id), ["fresh-hi"]);
  assert.deepEqual(summarizePendingBatch(batch.messages), { messageCount: 1, mediaCount: 0, audioCount: 0 });
  assert.deepEqual(batch.skippedNotAllowed.map((message) => message.messageId), ["old-image", "old-audio"]);
});

test("allowedMessageIds can still coalesce fresh image and text inside the same active batch", () => {
  const history = [
    inboundMessage({ id: "old-text", timestamp: 300, text: "Earlier message" }),
    inboundMessage({ id: "fresh-image", timestamp: 401, image: true, text: "Check this product" }),
    inboundMessage({ id: "fresh-text", timestamp: 402, text: "I want to market this" }),
  ];

  const batch = collectPendingInboundMessageBatch(history, {
    allowedMessageIds: ["fresh-image", "fresh-text"],
    lastHandledMessageCursor: buildBatchMessageCursor(inboundMessage({ id: "old-text", timestamp: 300, text: "Earlier message" })),
  });

  assert.deepEqual(batch.messages.map((message) => message.key.id), ["fresh-image", "fresh-text"]);
  assert.deepEqual(summarizePendingBatch(batch.messages), { messageCount: 2, mediaCount: 1, audioCount: 0 });
});

test("without allowedMessageIds broad recovery-style selection remains unchanged", () => {
  const history = [
    inboundMessage({ id: "m1", timestamp: 501, text: "Old pending" }),
    inboundMessage({ id: "m2", timestamp: 502, image: true, text: "Pending image" }),
    inboundMessage({ id: "m3", timestamp: 503, text: "Latest pending" }),
  ];

  const batch = collectPendingInboundMessageBatch(history);

  assert.deepEqual(batch.messages.map((message) => message.key.id), ["m1", "m2", "m3"]);
  assert.equal(batch.skippedNotAllowed.length, 0);
});

test("batch debounce constants stay within emergency fast-reply window", () => {
  assert.equal(MESSAGE_BATCH_INITIAL_DEBOUNCE_MS, 3000);
  assert.equal(MESSAGE_BATCH_MAX_WAIT_MS, 8000);
  assert.equal(MESSAGE_BATCH_FAST_TEXT_INITIAL_DEBOUNCE_MS, 700);
  assert.equal(MESSAGE_BATCH_FAST_TEXT_MAX_WAIT_MS, 1600);
});

test("text-only batches get the fast timing profile while media keeps the default profile", () => {
  const fastProfile = getMessageBatchDelayProfile({
    messages: [
      inboundMessage({ id: "t1", timestamp: 601, text: "hello" }),
      inboundMessage({ id: "t2", timestamp: 602, text: "need details" }),
    ],
  });
  const defaultProfile = getMessageBatchDelayProfile({
    messages: [
      inboundMessage({ id: "m1", timestamp: 603, text: "hello" }),
      inboundMessage({ id: "m2", timestamp: 604, image: true, text: "see this" }),
    ],
  });

  assert.equal(fastProfile.mode, "normal_text_fast");
  assert.equal(fastProfile.fastPath, true);
  assert.equal(fastProfile.maxWaitMs, MESSAGE_BATCH_FAST_TEXT_MAX_WAIT_MS);
  assert.equal(defaultProfile.mode, "default");
  assert.equal(defaultProfile.fastPath, false);
  assert.equal(defaultProfile.maxWaitMs, MESSAGE_BATCH_MAX_WAIT_MS);
});
