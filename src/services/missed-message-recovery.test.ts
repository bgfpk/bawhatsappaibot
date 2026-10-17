import test from "node:test";
import assert from "node:assert/strict";

import { getLatestCustomerRecoveryCandidate, getLatestCustomerRecoveryCandidateAcrossAliases } from "./missed-message-recovery.ts";

function incoming(id: string, timestamp: number, text = "Need help", remoteJid = "contact-2658838c5e39@example.invalid") {
  return {
    key: { fromMe: false, id, remoteJid },
    message: { conversation: text },
    messageTimestamp: timestamp,
  };
}

function fromMe(id: string, timestamp: number, text = ",", remoteJid = "contact-2658838c5e39@example.invalid") {
  return {
    key: { fromMe: true, id, remoteJid },
    message: { conversation: text },
    messageTimestamp: timestamp,
  };
}

test("manual comma/fromMe timestamp does not count as delivered bot reply evidence", () => {
  const result = getLatestCustomerRecoveryCandidate({
    historyArray: [incoming("customer_1", 1_000), fromMe("manual_comma", 1_100, ",")],
    profile: {
      lastBotMessageAt: 1_100,
      lastBotReplyAt: 1_100,
    },
    nowSeconds: 1_200,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, false);
  assert.equal(result.reason, "latest_is_reply");
});

test("profile lastBotMessageAt alone does not suppress missed recovery", () => {
  const result = getLatestCustomerRecoveryCandidate({
    historyArray: [incoming("customer_1", 1_000)],
    profile: {
      lastBotMessageAt: 1_100,
      lastBotReplyAt: 1_100,
    },
    nowSeconds: 1_200,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, true);
  assert.equal(result.reason, "latest_customer_message_unreplied");
});

test("customer-facing AI delivery evidence suppresses recovery after latest customer message", () => {
  const result = getLatestCustomerRecoveryCandidate({
    historyArray: [incoming("customer_1", 1_000)],
    profile: {
      lastCustomerFacingAiReplyAt: 1_100,
      lastCustomerFacingAiReplyMessageId: "bot_ai_1",
      lastCustomerFacingAiReplyContextType: "ai_text_reply",
    },
    nowSeconds: 1_200,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, false);
  assert.equal(result.reason, "bot_replied_after_customer");
});

test("manual comma context never suppresses recovery even with message id", () => {
  const result = getLatestCustomerRecoveryCandidate({
    historyArray: [incoming("customer_1", 1_000)],
    profile: {
      lastCustomerFacingAiReplyAt: 1_100,
      lastCustomerFacingAiReplyMessageId: "manual_comma",
      lastCustomerFacingAiReplyContextType: "manual comma shortcut",
    },
    nowSeconds: 1_200,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, true);
  assert.equal(result.reason, "latest_customer_message_unreplied");
});

test("alias recovery sees newer customer message across aliases", () => {
  const result = getLatestCustomerRecoveryCandidateAcrossAliases({
    aliases: [
      { jid: "contact-e4ed32210a80@example.invalid", historyArray: [incoming("old_customer", 1_000, "old", "contact-e4ed32210a80@example.invalid"), fromMe("old_bot", 1_050, "old answer", "contact-e4ed32210a80@example.invalid")] },
      { jid: "abc123@lid", historyArray: [incoming("new_customer", 1_200, "Waiting your reply", "abc123@lid")] },
    ],
    nowSeconds: 1_300,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, true);
  assert.equal(result.reason, "latest_customer_message_unreplied");
  assert.equal(result.latestMessage?.key?.remoteJid, "abc123@lid");
});

test("old bot reply on phone alias does not suppress newer customer message on alias", () => {
  const result = getLatestCustomerRecoveryCandidateAcrossAliases({
    aliases: [
      { jid: "contact-e4ed32210a80@example.invalid", historyArray: [incoming("c1", 1_000), fromMe("bot_old", 1_050, "answered old")] },
      { jid: "abc123@lid", historyArray: [incoming("c2", 1_300, "Need help", "abc123@lid")] },
    ],
    nowSeconds: 1_500,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, true);
});

test("real AI delivery on any alias suppresses only after latest customer message", () => {
  const result = getLatestCustomerRecoveryCandidateAcrossAliases({
    aliases: [
      { jid: "abc123@lid", historyArray: [incoming("c2", 1_300, "Need help", "abc123@lid")] },
      { jid: "contact-e4ed32210a80@example.invalid", profile: { lastCustomerFacingAiReplyAt: 1_350, lastCustomerFacingAiReplyMessageId: "bot_ai", lastCustomerFacingAiReplyContextType: "ai_text_reply" } },
    ],
    nowSeconds: 1_500,
    graceSeconds: 1,
    lookbackSeconds: 1_000,
  });

  assert.equal(result.shouldRecover, false);
  assert.equal(result.reason, "bot_replied_after_customer");
});
