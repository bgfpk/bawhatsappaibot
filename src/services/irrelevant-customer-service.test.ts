import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetCustomerFacingSendGuardTestDeps,
  __setCustomerFacingSendGuardTestDeps,
} from "./customer-facing-send-guard-service.ts";
import {
  __resetIrrelevantCustomerTestDeps,
  __setIrrelevantCustomerTestDeps,
  buildIrrelevantBoundaryReply,
  detectIrrelevantCustomerMessage,
  handleIrrelevantCustomer,
} from "./irrelevant-customer-service.ts";

test.afterEach(() => {
  __resetCustomerFacingSendGuardTestDeps();
  __resetIrrelevantCustomerTestDeps();
});

test("expired account blocks irrelevant-customer boundary auto-reply", async () => {
  let sendCalls = 0;
  let savedBoundary = false;
  __setCustomerFacingSendGuardTestDeps({
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "trial_expired" } as any),
  });
  __setIrrelevantCustomerTestDeps({
    updateCustomerProfile: async () => ({} as any),
    saveMessage: async () => {
      savedBoundary = true;
      return undefined as any;
    },
    sendAdminOnlyText: async () => ({ sent: false, message: null } as any),
  });

  const handled = await handleIrrelevantCustomer({
    sock: {
      sendMessage: async () => {
        sendCalls += 1;
        return { key: { id: "wamid-boundary" } };
      },
    },
    userConfig: {},
    userId: "user_1",
    dataOwnerKey: "owner_1",
    sender: "contact-6c9bc40fc084@example.invalid",
    latestText: "I want friendship with a girl",
    profile: {},
    language: "english",
    io: { emit: () => {} },
  });

  assert.equal(handled, true);
  assert.equal(sendCalls, 0);
  assert.equal(savedBoundary, false);
});

test("irrelevant boundary reply is business and context aware", () => {
  assert.equal(
    buildIrrelevantBoundaryReply({ language: "roman_urdu", businessType: "clinic appointment" }),
    "Main service/appointment ke hawale se help kar sakta hun. Appointment, timing, ya service detail ka sawal hai to pooch lein."
  );
  assert.equal(
    buildIrrelevantBoundaryReply({
      language: "roman_urdu",
      businessType: "clinic",
      profile: { customFields: { "Appointment Date": "23 June", "Appointment Time": "2 to 3" } },
    }),
    "Ji, aapka appointment detail already saved hai. Agar time/date change karna hai ya appointment confirm rakhna hai to bata dein."
  );
  assert.doesNotMatch(
    buildIrrelevantBoundaryReply({ language: "roman_urdu", businessType: "clinic appointment" }),
    /business\/product|product, price|delivery/i
  );
});

test("active customer context prevents low-confidence timepass pause", () => {
  const result = detectIrrelevantCustomerMessage({
    latestText: "timepass ho raha hai",
    profile: { latestProductName: "Doctor visit", customFields: { "Appointment Time": "2 to 3" } },
  });

  assert.equal(result.isIrrelevant, false);
});
