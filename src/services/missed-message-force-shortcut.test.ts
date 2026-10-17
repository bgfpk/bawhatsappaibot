import test from "node:test";
import assert from "node:assert/strict";

import {
  buildForcedMissedReplyHistory,
  describeForcedMissedReplyTarget,
  FORCE_REPLY_PENDING_DELIVERY_REASON,
  isMissedReplyForceShortcutText,
} from "./missed-message-force-shortcut.ts";

function message(id: string, text: string, fromMe = false, timestamp = 100) {
  return {
    key: { id, fromMe, remoteJid: "contact-e4ed32210a80@example.invalid" },
    message: { conversation: text },
    messageTimestamp: timestamp,
  };
}

test("quoted comma shortcut targets the quoted customer message", () => {
  const history = [
    message("cust-1", "First question", false, 100),
    message("cust-2", "Latest question", false, 200),
    message("bot-1", "Old reply", true, 250),
  ];
  const commandMessage = {
    key: { id: "cmd-1", fromMe: true, remoteJid: "contact-e4ed32210a80@example.invalid" },
    message: {
      extendedTextMessage: {
        text: ",",
        contextInfo: {
          stanzaId: "cust-1",
          quotedMessage: { conversation: "First question" },
        },
      },
    },
    messageTimestamp: 300,
  };

  const result = buildForcedMissedReplyHistory(history, commandMessage, "contact-e4ed32210a80@example.invalid");

  assert.equal(result.usedQuotedMessage, true);
  assert.equal(result.targetIncoming?.key?.id, "cust-1");
  assert.equal(result.replyHistory.at(-1)?.key?.id, "cust-1");
});

test("plain comma shortcut targets the latest missed customer message", () => {
  const history = [
    message("cust-1", "First question", false, 100),
    message("bot-1", "Old reply", true, 150),
    message("cust-2", "Latest question", false, 200),
  ];
  const commandMessage = message("cmd-2", ",", true, 300);

  const result = buildForcedMissedReplyHistory(history, commandMessage, "contact-e4ed32210a80@example.invalid");

  assert.equal(result.usedQuotedMessage, false);
  assert.equal(result.targetIncoming?.key?.id, "cust-2");
});

test("shortcut helpers expose the pending-delivery reason and labels", () => {
  assert.equal(isMissedReplyForceShortcutText(","), true);
  assert.equal(FORCE_REPLY_PENDING_DELIVERY_REASON, "force_reply_pending_delivery");
  assert.equal(describeForcedMissedReplyTarget(true), "quoted customer message");
  assert.equal(describeForcedMissedReplyTarget(false), "latest missed customer message");
});
