import test from "node:test";
import assert from "node:assert/strict";

import { shouldSendWelcomeSequence } from "./sequence-history-service.ts";
import {
  __resetWelcomeSequenceGuardTestDeps,
  __setWelcomeSequenceGuardTestDeps,
  shouldSendWelcomeSequenceNow,
} from "./welcome-sequence-guard.ts";

test.afterEach(() => {
  __resetWelcomeSequenceGuardTestDeps();
});

test("first inbound customer message triggers welcome sequence", () => {
  assert.equal(shouldSendWelcomeSequence([{
    key: { fromMe: false, id: "m1" },
    message: { conversation: "hello" },
    messageTimestamp: 1,
  }]), true);
});

test("welcome sequence is not blocked by existing model-only history", () => {
  assert.equal(shouldSendWelcomeSequence([
    {
      key: { fromMe: true, id: "model-1" },
      message: { conversation: "AI asked something" },
      messageTimestamp: 1,
    },
    {
      key: { fromMe: false, id: "m1" },
      message: { conversation: "hello" },
      messageTimestamp: 2,
    },
  ]), true);
});

test("welcome sequence is not duplicated when already marked sent", async () => {
  __setWelcomeSequenceGuardTestDeps({
    checkWelcomeSequence: async () => true,
  });

  const result = await shouldSendWelcomeSequenceNow({
    dataOwnerKey: "bot-1",
    customerJid: "contact-4e899668752d@example.invalid",
    historyArray: [{
      key: { fromMe: false, id: "m1" },
      message: { conversation: "hello" },
      messageTimestamp: 1,
    }],
  });

  assert.equal(result.shouldSend, false);
  assert.equal(result.reason, "already_marked_sent");
});

test("welcome recovery can still run once for first-contact history", async () => {
  __setWelcomeSequenceGuardTestDeps({
    checkWelcomeSequence: async () => false,
  });

  const result = await shouldSendWelcomeSequenceNow({
    dataOwnerKey: "bot-1",
    customerJid: "contact-4e899668752d@example.invalid",
    historyArray: [
      {
        key: { fromMe: false, id: "m1" },
        message: { conversation: "hello" },
        messageTimestamp: 1,
      },
      {
        key: { fromMe: true, id: "model-1" },
        message: { conversation: "AI text fallback" },
        messageTimestamp: 2,
      },
    ],
  });

  assert.equal(result.shouldSend, true);
  assert.equal(result.reason, "new_customer");
});
