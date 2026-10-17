import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetClientGeminiBillingTestDeps,
  __setClientGeminiBillingTestDeps,
  chargeClientGeminiExplicitCacheBoost,
  chargeClientGeminiApiRequest,
  chargeClientGeminiMessageCycle,
  buildClientGeminiBillingGroupKey,
  finalizeDeferredGeminiTtsCustomerBilling,
  getClientGeminiPurposeLabel,
  runGeminiRequestWithClientBilling,
} from "./client-gemini-billing-service.ts";
import {
  __resetClientGeminiCacheTelemetryTestDeps,
  __setClientGeminiCacheTelemetryTestDeps,
} from "./client-gemini-cache-telemetry-service.ts";
import {
  __resetAiProviderCallLedgerTestDeps,
  __setAiProviderCallLedgerTestDeps,
} from "./ai-provider-call-ledger-service.ts";

test.beforeEach(() => {
  __setAiProviderCallLedgerTestDeps({
    createDocument: async () => ({}),
    listDocuments: async () => ({ documents: [] }),
    updateDocument: async () => ({}),
    idUnique: () => "ledger_unique",
    now: () => 2000,
  } as any);
  __setClientGeminiBillingTestDeps({
    canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" }),
    logUsageChargeFailure: () => {},
  } as any);
});

test.afterEach(() => {
  __resetClientGeminiBillingTestDeps();
  __resetClientGeminiCacheTelemetryTestDeps();
  __resetAiProviderCallLedgerTestDeps();
});

test("client Gemini cycle charges $0.001 once per stable billing group", async () => {
  const chargedKeys = new Set<string>();
  let chargeCalls = 0;
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      chargeCalls += 1;
      assert.equal(action, "client_gemini_message_cycle");
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const context = {
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "summary",
    billingContext: { customerJid: "contact-d46626999a99@example.invalid", eventId: "msg_1" },
  };
  const first = await chargeClientGeminiApiRequest(context);
  const second = await chargeClientGeminiApiRequest(context);

  assert.equal(first.charged, true);
  assert.equal((first as any).cost, 0.001);
  assert.equal((second as any).duplicate, true);
  assert.equal(chargeCalls, 2);
});

test("AI reply, repair, and summary in same message cycle create one Gemini cycle debit", async () => {
  const chargedKeys = new Set<string>();
  const descriptions: string[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      assert.equal(action, "client_gemini_message_cycle");
      descriptions.push(String(options?.description || ""));
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const baseContext = {
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    billingContext: { customerJid: "contact-d46626999a99@example.invalid", eventId: "inbound_msg_1" },
  };

  const reply = await chargeClientGeminiMessageCycle({ ...baseContext, purpose: "customer_ai_reply" });
  const repair = await chargeClientGeminiMessageCycle({ ...baseContext, purpose: "customer_ai_reply_repair" });
  const summary = await chargeClientGeminiMessageCycle({ ...baseContext, purpose: "ai_customer_summary" });

  assert.equal(reply.charged, true);
  assert.equal((repair as any).duplicate, true);
  assert.equal((summary as any).duplicate, true);
  assert.equal(chargedKeys.size, 1);
  assert.equal(descriptions[0], "Custom Gemini: AI reply");
  assert.doesNotMatch(descriptions.join("\n"), /provider=|purpose=|customer=|billingGroupKey=/);
});

test("separate follow-up automation cycle gets its own Gemini cycle debit", async () => {
  const chargedKeys = new Set<string>();
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      assert.equal(action, "client_gemini_message_cycle");
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const inbound = await chargeClientGeminiMessageCycle({
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_reply",
    billingContext: { customerJid: "contact-d46626999a99@example.invalid", eventId: "inbound_msg_1" },
  });
  const followup = await chargeClientGeminiMessageCycle({
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "ai_smart_followup_generation",
    billingContext: { customerJid: "contact-d46626999a99@example.invalid", eventId: "followup_attempt_1" },
  });

  assert.equal(inbound.charged, true);
  assert.equal(followup.charged, true);
  assert.equal(chargedKeys.size, 2);
});

test("successful Gemini TTS cycle charges after provider success", async () => {
  let charged = false;
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async () => {
      charged = true;
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const result = await runGeminiRequestWithClientBilling({
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_2" },
  }, async () => {
    return { text: "ok" };
  });

  assert.deepEqual(result, { text: "ok" });
  assert.equal(charged, true);
});

test("deferred Gemini TTS wrapper does not charge before WhatsApp voice delivery succeeds", async () => {
  const actions: string[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const result = await runGeminiRequestWithClientBilling({
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_deferred", customerJid: "contact-d46626999a99@example.invalid" },
  }, async () => {
    return { text: "ok" };
  }, {
    deferCustomerBillingUntilConfirmed: true,
  });

  assert.deepEqual(result, { text: "ok" });
  assert.deepEqual(actions, []);
});

test("failed Gemini TTS request does not charge cycle fee", async () => {
  let charged = false;
  __setClientGeminiBillingTestDeps({
    chargeUsageAction: async () => {
      charged = true;
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
  } as any);

  await assert.rejects(() => runGeminiRequestWithClientBilling({
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_2" },
  }, async () => {
    throw new Error("401 auth failed");
  }));

  assert.equal(charged, false);
});

test("deferred Gemini TTS finalizer skips customer charge when conversion fails", async () => {
  const actions: string[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const provider = {
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_conversion_fail", customerJid: "contact-d46626999a99@example.invalid" },
  };

  const result = await runGeminiRequestWithClientBilling(provider, async () => ({ text: "ok" }), {
    deferCustomerBillingUntilConfirmed: true,
  });
  const finalized = await finalizeDeferredGeminiTtsCustomerBilling({
    provider,
    result,
    finalSendOutcome: "skipped",
    reason: "conversion_failed",
    receiptId: "receipt-conversion",
    messageId: "",
  });

  assert.equal(finalized.charged, false);
  assert.equal(finalized.skipped, true);
  assert.deepEqual(actions, []);
});

test("deferred Gemini TTS finalizer skips customer charge when WhatsApp voice send fails", async () => {
  const actions: string[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const provider = {
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_send_fail", customerJid: "contact-d46626999a99@example.invalid" },
  };

  const result = await runGeminiRequestWithClientBilling(provider, async () => ({ text: "ok" }), {
    deferCustomerBillingUntilConfirmed: true,
  });
  const finalized = await finalizeDeferredGeminiTtsCustomerBilling({
    provider,
    result,
    finalSendOutcome: "failed",
    reason: "voice_delivery_failed",
    receiptId: "receipt-send",
    messageId: "",
  });

  assert.equal(finalized.charged, false);
  assert.equal(finalized.skipped, true);
  assert.deepEqual(actions, []);
});

test("deferred Gemini TTS finalizer charges once after successful voice delivery and stays deduped on retry", async () => {
  const chargedKeys = new Set<string>();
  let chargeCalls = 0;
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (_action, parts) => parts.filter(Boolean).join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      assert.equal(action, "client_gemini_message_cycle");
      chargeCalls += 1;
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const provider = {
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_sent", customerJid: "contact-d46626999a99@example.invalid" },
  };

  const result = await runGeminiRequestWithClientBilling(provider, async () => ({ text: "ok" }), {
    deferCustomerBillingUntilConfirmed: true,
  });
  const first = await finalizeDeferredGeminiTtsCustomerBilling({
    provider,
    result,
    finalSendOutcome: "sent",
    reason: "voice_delivery_success",
    receiptId: "receipt-voice",
    messageId: "voice-msg-1",
  });
  const second = await finalizeDeferredGeminiTtsCustomerBilling({
    provider,
    result,
    finalSendOutcome: "sent",
    reason: "voice_delivery_success",
    receiptId: "receipt-voice",
    messageId: "voice-msg-1",
  });

  assert.equal(first.cycleResult?.charged, true);
  assert.equal(second.cycleResult?.duplicate, true);
  assert.equal(chargedKeys.size, 1);
  assert.equal(chargeCalls, 2);
});

test("Gemini TTS helper request is skipped before provider call when account is not eligible", async () => {
  let requestCalled = false;
  __setClientGeminiBillingTestDeps({
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "account_access_expired" }),
  } as any);

  await assert.rejects(() => runGeminiRequestWithClientBilling({
    provider: "platform_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "summary_1" },
  }, async () => {
    requestCalled = true;
    return { text: "summary" };
  }), /account_access_expired/);

  assert.equal(requestCalled, false);
});

test("customer reply Gemini path is blocked before request and before helper eligibility logic", async () => {
  let requestCalled = false;
  __setClientGeminiBillingTestDeps({
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "account_access_expired" }),
  } as any);

  await assert.rejects(() => runGeminiRequestWithClientBilling({
    provider: "platform_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_reply",
    billingContext: { eventId: "msg_1" },
  }, async () => {
    requestCalled = true;
    return { text: "reply" };
  }), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);

  assert.equal(requestCalled, false);
});

test("platform or skipped cycles do not charge client Gemini fee", async () => {
  let chargeCalls = 0;
  __setClientGeminiBillingTestDeps({
    chargeUsageAction: async () => {
      chargeCalls += 1;
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
  } as any);

  const result = await chargeClientGeminiApiRequest({
    provider: "platform_gemini",
    userId: "acct_1",
    purpose: "reply",
  });

  assert.equal(result.skipped, true);
  assert.equal(chargeCalls, 0);
});

test("Gemini Cache Boost charges separate $0.001 action only when enabled", async () => {
  const actions: string[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (action, parts) => [action, ...parts.filter(Boolean)].join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 0.998, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const disabled = await chargeClientGeminiExplicitCacheBoost({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: false,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_explicit_cache",
    billingContext: { eventId: "msg_3" },
  });
  const enabled = await chargeClientGeminiExplicitCacheBoost({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    cachedTokens: 1200,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_explicit_cache",
    billingContext: { eventId: "msg_3" },
  });

  assert.equal(disabled.skipped, true);
  assert.equal((enabled as any).cost, 0.001);
  assert.deepEqual(actions, ["client_gemini_explicit_cache_boost"]);
});

test("Cache Boost ON with zero cached tokens does not charge", async () => {
  let chargeCalls = 0;
  __setClientGeminiBillingTestDeps({
    chargeUsageAction: async () => {
      chargeCalls += 1;
      return { charged: true, cost: 0.001, walletBalance: 0.998, breakdown: [] };
    },
  } as any);

  const result = await chargeClientGeminiExplicitCacheBoost({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    cachedTokens: 0,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_explicit_cache",
    billingContext: { eventId: "msg_zero" },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "cache_miss_zero_cached_tokens");
  assert.equal(chargeCalls, 0);
});

test("blocked Gemini text wrapper does not charge or persist telemetry", async () => {
  const actions: string[] = [];
  const telemetryRows: any[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (action, parts) => [action, ...parts.filter(Boolean)].join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 0.998, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);
  __setClientGeminiCacheTelemetryTestDeps({
    createDocument: async (_databaseId, _collection, _id, doc) => {
      telemetryRows.push(JSON.parse(String(doc.value || "{}")));
      return doc;
    },
    idUnique: () => "unique_missing_metadata",
    now: () => 2001,
  } as any);

  await assert.rejects(() => runGeminiRequestWithClientBilling({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_reply",
    billingContext: { eventId: "msg_missing_metadata" },
    cacheTelemetryContext: { cacheAttempted: true, cacheAttached: true },
  }, async () => ({ text: "ok" })), /GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED/);

  assert.deepEqual(actions, []);
  assert.equal(telemetryRows.length, 0);
});

test("Cache Boost charges once per successful cache use in the same cycle", async () => {
  const chargedKeys = new Set<string>();
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (action, parts) => [action, ...parts.filter(Boolean)].join("|"),
    chargeUsageAction: async (_userId, action, options) => {
      assert.equal(action, "client_gemini_explicit_cache_boost");
      const key = String(options?.dedupeKey || "");
      if (chargedKeys.has(key)) return { charged: false, duplicate: true, cost: 0, breakdown: [] };
      chargedKeys.add(key);
      return { charged: true, cost: 0.001, walletBalance: 0.999, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  const context = {
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    cachedTokens: 900,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_explicit_cache",
    billingContext: { eventId: "msg_3" },
  };

  const first = await chargeClientGeminiExplicitCacheBoost(context);
  const second = await chargeClientGeminiExplicitCacheBoost({ ...context, purpose: "another_cache_internal_call", cachedTokens: 1100 });

  assert.equal(first.charged, true);
  assert.equal((second as any).duplicate, true);
  assert.equal(chargedKeys.size, 1);
});

test("custom Gemini cycle plus Cache Boost totals $0.002 in BlackArrow AI API fees", async () => {
  let total = 0;
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (action, parts) => [action, ...parts.filter(Boolean)].join("|"),
    chargeUsageAction: async (_userId, action) => {
      assert.ok(["client_gemini_message_cycle", "client_gemini_explicit_cache_boost"].includes(action));
      total += 0.001;
      return { charged: true, cost: 0.001, walletBalance: 1 - total, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);

  await chargeClientGeminiApiRequest({
    provider: "client_custom_gemini",
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_reply",
    billingContext: { eventId: "msg_4" },
  });
  await chargeClientGeminiExplicitCacheBoost({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    cachedTokens: 800,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_explicit_cache",
    billingContext: { eventId: "msg_4" },
  });

  assert.equal(total, 0.002);
});

test("Gemini TTS wrapper charges cycle and persists telemetry without text blocking", async () => {
  const actions: string[] = [];
  const telemetryRows: any[] = [];
  __setClientGeminiBillingTestDeps({
    buildUsageChargeDedupeKey: (action, parts) => [action, ...parts.filter(Boolean)].join("|"),
    chargeUsageAction: async (_userId, action) => {
      actions.push(action);
      return { charged: true, cost: 0.001, walletBalance: 0.998, breakdown: [] };
    },
    logUsageChargeFailure: () => {},
  } as any);
  __setClientGeminiCacheTelemetryTestDeps({
    createDocument: async (_databaseId, _collection, _id, doc) => {
      telemetryRows.push(JSON.parse(String(doc.value || "{}")));
      return doc;
    },
    idUnique: () => "unique_1",
    now: () => 2000,
  } as any);

  await runGeminiRequestWithClientBilling({
    provider: "client_custom_gemini",
    explicitCacheBoostEnabled: true,
    userId: "acct_1",
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "reply_tts",
    billingContext: { eventId: "msg_cached" },
    cacheTelemetryContext: { cacheAttempted: false, cacheAttached: false },
  }, async () => ({
    text: "ok",
    usageMetadata: {
      promptTokenCount: 2000,
      cachedContentTokenCount: 0,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 10,
      totalTokenCount: 2050,
    },
  }));

  assert.deepEqual(actions, ["client_gemini_message_cycle"]);
  assert.equal(telemetryRows.length, 1);
  assert.equal(telemetryRows[0].cachedTokens, 0);
  assert.equal(telemetryRows[0].cacheHit, false);
  assert.equal(telemetryRows[0].cacheBoostCharged, false);
  assert.equal(telemetryRows[0].inputTokens, 2000);
  assert.equal(telemetryRows[0].outputTokens, 40);
  assert.equal(telemetryRows[0].thoughtTokens, 10);
});

test("billing group prefers explicit group, then event/message/request ids", () => {
  assert.equal(buildClientGeminiBillingGroupKey({ billingContext: { billingGroupKey: "cycle_1", eventId: "event_1" } }), "cycle_1");
  assert.equal(buildClientGeminiBillingGroupKey({ billingContext: { eventId: "event_1", messageId: "msg_1" } }), "event_1");
  assert.equal(buildClientGeminiBillingGroupKey({ billingContext: { messageId: "msg_1", requestId: "req_1" } }), "msg_1");
  assert.equal(buildClientGeminiBillingGroupKey({ billingContext: { requestId: "req_1" } }), "req_1");
});

test("multiple legitimate Gemini purposes get separate readable labels", () => {
  assert.equal(getClientGeminiPurposeLabel("customer_ai_reply"), "AI reply generation");
  assert.equal(getClientGeminiPurposeLabel("combined_reply_memory"), "AI reply + memory generation");
  assert.equal(getClientGeminiPurposeLabel("ai_customer_summary"), "AI summary");
  assert.equal(getClientGeminiPurposeLabel("customer_ai_reply_repair"), "reply repair");
  assert.equal(getClientGeminiPurposeLabel("image_contact_extractor"), "image understanding");
  assert.equal(getClientGeminiPurposeLabel("ai_smart_followup_generation"), "AI Smart Follow-up generation");
  assert.equal(getClientGeminiPurposeLabel("ai_order_lead_summary"), "order/lead summary");
});
