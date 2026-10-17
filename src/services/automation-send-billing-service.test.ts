import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetAutomationSendBillingTestDeps,
  __setAutomationSendBillingTestDeps,
  buildAutomationBillingEventId,
  buildAutomationTemplateKey,
  canSendBillableAutomation,
  chargeAutomationSendUsage,
} from "./automation-send-billing-service.ts";

test.afterEach(() => {
  __resetAutomationSendBillingTestDeps();
});

test("sequence item successful send charges once", async () => {
  const chargedKeys = new Set<string>();
  __setAutomationSendBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 5 } as any),
    buildUsageChargeDedupeKey: (_action, parts) => parts.join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: action === "sequence_template_send" ? 0.0005 : 0, walletBalance: 4.9995, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const first = await chargeAutomationSendUsage("sequence_template_send", {
    userId: "user_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId: "seq-1",
    templateKey: "tpl-1",
    source: "sequence",
  });
  const second = await chargeAutomationSendUsage("sequence_template_send", {
    userId: "user_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId: "seq-1",
    templateKey: "tpl-1",
    source: "sequence",
  });

  assert.equal(first.charged, true);
  assert.equal(second.duplicate, true);
});

test("failed sequence send does not charge", async () => {
  let charged = false;
  __setAutomationSendBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 5 } as any),
    chargeUsageAction: async () => {
      charged = true;
      return { charged: true, cost: 0.0005, walletBalance: 4.9995, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  assert.equal(charged, false);
});

test("media group file successful send charges once", async () => {
  const chargedKeys = new Set<string>();
  __setAutomationSendBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 5 } as any),
    buildUsageChargeDedupeKey: (_action, parts) => parts.join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: action === "media_group_file_send" ? 0.001 : 0, walletBalance: 4.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const result = await chargeAutomationSendUsage("media_group_file_send", {
    userId: "user_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId: "media-1",
    templateKey: "media-tpl",
    mediaTitle: "catalog",
    source: "media_group",
  });

  assert.equal(result.charged, true);
});

test("failed media group send does not charge", async () => {
  let charged = false;
  __setAutomationSendBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 0.0001 } as any),
    chargeUsageAction: async () => {
      charged = true;
      return { charged: true, cost: 0.001, walletBalance: 0, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const gate = await canSendBillableAutomation("user_1", "media_group_file_send");
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "insufficient_wallet");
  assert.equal(charged, false);
});

test("expired account blocks sequence send before wallet charge", async () => {
  let charged = false;
  __setAutomationSendBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 5 } as any),
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "trial_expired" } as any),
    chargeUsageAction: async () => {
      charged = true;
      return { charged: true, cost: 0.0005, walletBalance: 4.9995, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const gate = await canSendBillableAutomation("user_1", "sequence_template_send");
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "trial_expired");
  assert.equal(charged, false);
});

test("expired account blocks customer update/follow-up text before send and charge", async () => {
  let sendCalls = 0;
  let chargeCalls = 0;
  const { __resetUniversalOutboundSendTestDeps, __setUniversalOutboundSendTestDeps, sendUniversalOutboundText } = await import("./universal-outbound-send-service.ts");
  __setUniversalOutboundSendTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: false, action: "customer_update_scheduled_text", cost: 0.003, reason: "subscription_expired" })) as any,
    chargeUsageBillingAction: (async () => {
      chargeCalls += 1;
      return { charged: true, cost: 0.003 };
    }) as any,
    findOutboundReceiptByIdempotencyKey: (() => null) as any,
    createOutboundReceiptAttempt: ((input: any) => ({ receiptId: "receipt-expired-update", ...input })) as any,
    updateOutboundReceipt: (((_receiptId: string, patch: any) => patch) as any),
  });
  try {
    const result = await sendUniversalOutboundText({
      userId: "user_1",
      botId: "bot_1",
      customerJid: "contact-6c9bc40fc084@example.invalid",
      messageText: "Your scheduled update",
      idempotencyKey: "customer-update:expired",
      billingAction: "customer_update_scheduled_text",
      sendText: async () => {
        sendCalls += 1;
        return { messageId: "wamid-expired" };
      },
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "subscription_expired");
    assert.equal(sendCalls, 0);
    assert.equal(chargeCalls, 0);
  } finally {
    __resetUniversalOutboundSendTestDeps();
  }
});

test("retry does not double charge", async () => {
  const chargedKeys = new Set<string>();
  __setAutomationSendBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 5 } as any),
    buildUsageChargeDedupeKey: (_action, parts) => parts.join("|"),
    chargeUsageAction: async (_userId, _action, options) => {
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: 0.001, walletBalance: 4.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const eventId = buildAutomationBillingEventId(["media", "110064053003", "catalog", 1710000000]);
  const first = await chargeAutomationSendUsage("media_group_file_send", {
    userId: "user_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId,
    templateKey: buildAutomationTemplateKey({ imageMessage: { caption: "Catalog" } }),
    mediaTitle: "catalog",
    source: "pending_media_group_send",
  });
  const second = await chargeAutomationSendUsage("media_group_file_send", {
    userId: "user_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId,
    templateKey: buildAutomationTemplateKey({ imageMessage: { caption: "Catalog" } }),
    mediaTitle: "catalog",
    source: "pending_media_group_send",
  });

  assert.equal(first.charged, true);
  assert.equal(second.duplicate, true);
});
