import test from "node:test";
import assert from "node:assert/strict";

import { sendUniversalAutomationRelay } from "./universal-automation-relay-service.ts";
import {
  __resetAutomationSendBillingTestDeps,
  __setAutomationSendBillingTestDeps,
} from "./automation-send-billing-service.ts";
import { clearOutboundReceipts } from "./outbound-send-receipt-service.ts";

test.beforeEach(() => {
  __resetAutomationSendBillingTestDeps();
  clearOutboundReceipts();
});

test.afterEach(() => {
  __resetAutomationSendBillingTestDeps();
  clearOutboundReceipts();
});

test("sequence/template send does not double charge on duplicate retry", async () => {
  let chargeCalls = 0;
  let relayCalls = 0;
  const key = `sequence:test:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  __setAutomationSendBillingTestDeps({
    getUser: (async () => ({ wallet_balance: 5 })) as any,
    chargeUsageAction: (async () => {
      chargeCalls += 1;
      return { charged: true, cost: 0.0005, walletBalance: 5, breakdown: [] };
    }) as any,
  });

  const first = await sendUniversalAutomationRelay({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    billingAction: "sequence_template_send",
    idempotencyKey: key,
    messageType: "sequence_template",
    contextType: "sequence_template",
    contextId: key,
    template: { message: { conversation: "hi" } },
    buildMessageId: () => "wamid-seq-1",
    relay: async () => {
      relayCalls += 1;
    },
    saveMessage: async () => {},
  });

  const second = await sendUniversalAutomationRelay({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    billingAction: "sequence_template_send",
    idempotencyKey: key,
    messageType: "sequence_template",
    contextType: "sequence_template",
    contextId: key,
    template: { message: { conversation: "hi" } },
    buildMessageId: () => "wamid-seq-2",
    relay: async () => {
      relayCalls += 1;
    },
    saveMessage: async () => {},
  });

  assert.equal(first.status, "sent");
  assert.ok(["duplicate", "sent"].includes(second.status));
  assert.equal(chargeCalls, 1);
});

test("media send does not double charge on duplicate retry", async () => {
  let chargeCalls = 0;
  let relayCalls = 0;
  const key = `media:test:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  __setAutomationSendBillingTestDeps({
    getUser: (async () => ({ wallet_balance: 5 })) as any,
    chargeUsageAction: (async () => {
      chargeCalls += 1;
      return { charged: true, cost: 0.001, walletBalance: 5, breakdown: [] };
    }) as any,
  });

  const first = await sendUniversalAutomationRelay({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    billingAction: "media_group_file_send",
    idempotencyKey: key,
    messageType: "media_group",
    contextType: "ai_media_group",
    contextId: key,
    template: { message: { imageMessage: { caption: "photo" } } },
    buildMessageId: () => "wamid-media-1",
    relay: async () => {
      relayCalls += 1;
    },
    saveMessage: async () => {},
  });

  const second = await sendUniversalAutomationRelay({
    userId: "user_1",
    botId: "bot_1",
    customerJid: "contact-4e899668752d@example.invalid",
    billingAction: "media_group_file_send",
    idempotencyKey: key,
    messageType: "media_group",
    contextType: "ai_media_group",
    contextId: key,
    template: { message: { imageMessage: { caption: "photo" } } },
    buildMessageId: () => "wamid-media-2",
    relay: async () => {
      relayCalls += 1;
    },
    saveMessage: async () => {},
  });

  assert.equal(first.status, "sent");
  assert.ok(["duplicate", "sent"].includes(second.status));
  assert.equal(chargeCalls, 1);
});
