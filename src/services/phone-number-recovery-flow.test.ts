import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetCustomerFacingSendGuardTestDeps,
  __setCustomerFacingSendGuardTestDeps,
} from "./customer-facing-send-guard-service.ts";
import { sendPhoneNumberRequestIfNeeded } from "./phone-number-recovery-flow.ts";

test.afterEach(() => {
  __resetCustomerFacingSendGuardTestDeps();
});

test("expired account blocks phone number recovery prompt before any send", async () => {
  let sendCalls = 0;
  __setCustomerFacingSendGuardTestDeps({
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "subscription_expired" } as any),
  });

  const result = await sendPhoneNumberRequestIfNeeded({
    sock: {
      sendMessage: async () => {
        sendCalls += 1;
        return { key: { id: "wamid-1" } };
      },
    },
    io: { emit: () => {} },
    botSentMessageIds: new Set<string>(),
    userId: "user_1",
    jid: "923001112233@lid",
    dataOwnerKey: "owner_1",
    profile: {},
  });

  assert.equal(result.requested, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "subscription_expired");
  assert.equal(sendCalls, 0);
});
