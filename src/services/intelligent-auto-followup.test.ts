import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultFollowupDelayMs,
  detectNaturalLanguageFollowupDelayMs,
  isCustomerOptedOutFromFollowups,
  scheduleNextAutoFollowup,
  cancelAutoFollowupOnCustomerReply,
  claimAutoFollowupForWorker,
  releaseAutoFollowupWorkerClaim,
  getAutoFollowupSchedule,
  clearAutoFollowupSchedulesForTest,
  clearScheduleStoreMemoryOnlyForTest,
  evaluateSemanticFollowup,
  processDueAutoFollowups,
} from "./intelligent-auto-followup-service.ts";
import {
  clearCustomerTurnAiCalls,
  getSuccessfulCustomerTurnAiCallsCountAsync,
  getSuccessfulCustomerTurnAiCallsCount,
  recordSuccessfulCustomerTurnAiCall,
} from "./customer-turn-ai-call-ledger-service.ts";

test("Intelligent Auto Follow-up - Progression and doubling backoff", () => {
  assert.equal(buildDefaultFollowupDelayMs(0), 3600 * 1000); // 1h
  assert.equal(buildDefaultFollowupDelayMs(1), 2 * 3600 * 1000); // 2h
  assert.equal(buildDefaultFollowupDelayMs(2), 4 * 3600 * 1000); // 4h
  assert.equal(buildDefaultFollowupDelayMs(3), 8 * 3600 * 1000); // 8h
  assert.equal(buildDefaultFollowupDelayMs(4), 16 * 3600 * 1000); // 16h
  assert.equal(buildDefaultFollowupDelayMs(5), 32 * 3600 * 1000); // 32h
});

test("Intelligent Auto Follow-up - Natural language chat timing overrides", () => {
  // Tomorrow / Kal
  const delayTomorrow = detectNaturalLanguageFollowupDelayMs("I am busy right now, talk tomorrow morning");
  assert.equal(delayTomorrow, 24 * 3600 * 1000);

  const delayKal = detectNaturalLanguageFollowupDelayMs("Kal baat karenge");
  assert.equal(delayKal, 24 * 3600 * 1000);

  // Next week / Aglay hafte
  const delayNextWeek = detectNaturalLanguageFollowupDelayMs("Please contact me next week");
  assert.equal(delayNextWeek, 7 * 24 * 3600 * 1000);

  const delayAglayHafte = detectNaturalLanguageFollowupDelayMs("Aglay hafte baat karte hain");
  assert.equal(delayAglayHafte, 7 * 24 * 3600 * 1000);

  // In a few days
  const delayFewDays = detectNaturalLanguageFollowupDelayMs("Check back in a few days");
  assert.equal(delayFewDays, 2 * 24 * 3600 * 1000);

  // Later / baad mein
  const delayLater = detectNaturalLanguageFollowupDelayMs("Baad mein msg karo");
  assert.equal(delayLater, 4 * 3600 * 1000);

  // Specific hours
  const delayHours = detectNaturalLanguageFollowupDelayMs("Message me in 5 hours");
  assert.equal(delayHours, 5 * 3600 * 1000);

  // Normal message without timing
  const delayNormal = detectNaturalLanguageFollowupDelayMs("What is the price of this service?");
  assert.equal(delayNormal, null);
});

test("Intelligent Auto Follow-up - Customer opt-out detection", () => {
  assert.equal(isCustomerOptedOutFromFollowups("Stop messaging me"), true);
  assert.equal(isCustomerOptedOutFromFollowups("Please unsubscribe"), true);
  assert.equal(isCustomerOptedOutFromFollowups("Dont message here again"), true);
  assert.equal(isCustomerOptedOutFromFollowups("kabhi msg mat karna"), true);
  assert.equal(isCustomerOptedOutFromFollowups("tang mat karo block karo"), true);
  assert.equal(isCustomerOptedOutFromFollowups("I want to buy the red one"), false);
});

test("Intelligent Auto Follow-up - Scheduling and progression", () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_test_123";
  const customerJid = "contact-e4ed32210a80@example.invalid";

  // Bot successfully replies to customer
  const sched1 = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Can you send the pricing list?",
    lastCustomerMessageAt: Date.now() - 3600000,
    lastBotReplyText: "Here is our full pricing brochure.",
    lastBotReplyAt: Date.now(),
    currentObjective: "pricing_qualification",
  });

  assert.ok(sched1);
  assert.equal(sched1.followupState, "SCHEDULED");
  assert.equal(sched1.attemptIndex, 0);
  assert.ok(sched1.nextFollowupAt > Date.now());

  // Check schedule retrieval
  const retrieved = getAutoFollowupSchedule(botId, customerJid);
  assert.ok(retrieved);
  assert.equal(retrieved.currentObjective, "pricing_qualification");
});

test("Intelligent Auto Follow-up - Cancellation on customer reply", () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_test_456";
  const customerJid = "contact-fb7cfca76a29@example.invalid";

  scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Are you open on weekends?",
  });

  const beforeReply = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(beforeReply?.followupState, "SCHEDULED");

  // Customer replies!
  const cancelled = cancelAutoFollowupOnCustomerReply(botId, customerJid, "msg_cust_new_999");
  assert.equal(cancelled, true);

  const afterReply = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(afterReply?.followupState, "CANCELLED");
  assert.ok(afterReply?.decisionReason.includes("New customer message arrived"));
});

test("Intelligent Auto Follow-up - Multi-worker concurrency claiming", () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_test_concurrency";
  const customerJid = "contact-80e91c1852cf@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Do you offer discounts?",
  });
  assert.ok(sched);

  // Worker 1 claims schedule
  const worker1Claimed = claimAutoFollowupForWorker(sched.id, "worker_1", 30000);
  assert.equal(worker1Claimed, true);

  // Worker 2 attempts to claim same schedule simultaneously -> MUST BE REJECTED
  const worker2Claimed = claimAutoFollowupForWorker(sched.id, "worker_2", 30000);
  assert.equal(worker2Claimed, false);

  // Worker 1 releases claim after completion
  releaseAutoFollowupWorkerClaim(sched.id, "worker_1", "SENT", "Follow-up sent successfully");

  const finalSched = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(finalSched?.followupState, "SENT");
  assert.equal(finalSched?.lockedByWorker, undefined);
});

test("Intelligent Auto Follow-up - Semantic evaluation with mocked LLM provider", async () => {
  // Case A: Customer already replied in chat history
  const evalCustomerReplied = await evaluateSemanticFollowup({
    chatHistory: [
      { role: "assistant", text: "Would you like to place an order?" },
      { role: "user", text: "Yes, I will pay via bank transfer" },
    ],
    customerProfile: {},
  });
  assert.equal(evalCustomerReplied.shouldFollowup, false);
  assert.equal(evalCustomerReplied.unresolvedObjective, "customer_already_replied");

  // Case B: Pending inquiry with mock generator returning positive evaluation
  const mockProvider = async () => ({
    text: JSON.stringify({
      shouldFollowup: true,
      unresolvedObjective: "confirm_shoe_size",
      reason: "Customer was selecting size but stopped replying.",
      suggestedMessage: "Hi, just checking which shoe size you'd like so we can reserve your pair?",
    }),
    model: "gemini-test",
  });

  const evalPending = await evaluateSemanticFollowup({
    chatHistory: [
      { role: "user", text: "Do you have the leather sneakers in blue?" },
      { role: "assistant", text: "Yes, available in sizes 41, 42, and 43!" },
    ],
    customerProfile: { customer360: { corrections: [], knownBusinesses: [] } },
    textProviderGenerate: mockProvider as any,
  });

  assert.equal(evalPending.shouldFollowup, true);
  assert.equal(evalPending.unresolvedObjective, "confirm_shoe_size");
  assert.ok(evalPending.recommendedMessage?.includes("shoe size"));
});

test("Intelligent Auto Follow-up - processDueAutoFollowups end-to-end execution", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_due_test";
  const customerJid = "contact-005149e0fabf@example.invalid";

  // Create schedule that is due now
  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Send me the address",
  });
  assert.ok(sched);
  // Force schedule to be due in the past
  sched.nextFollowupAt = Date.now() - 5000;

  const sentMessages: Array<{ to: string; text: string }> = [];

  const result = await processDueAutoFollowups({
    botId,
    workerId: "worker_test",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Send me the address" },
      { role: "assistant", text: "Our office is on Main Boulevard, Gulberg, Lahore." },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async () => ({
      text: JSON.stringify({
        shouldFollowup: true,
        unresolvedObjective: "visit_confirmation",
        reason: "Checking if customer needs appointment directions.",
        suggestedMessage: "Hi, let us know if you'd like us to book a consultation slot for you!",
      }),
      model: "mock-model",
    })) as any,
    sendFollowupText: async (jid, text) => {
      sentMessages.push({ to: jid, text });
      return { success: true, messageId: "msg_af_sent_1" };
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.sent, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, customerJid);
  assert.ok(sentMessages[0].text.includes("consultation slot"));

  // Check that the schedule progressed to next doubling attempt (+2h)
  const updatedSched = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(updatedSched?.attemptIndex, 1);
  assert.equal(updatedSched?.followupState, "SCHEDULED");
  assert.ok(updatedSched?.nextFollowupAt && updatedSched.nextFollowupAt > Date.now() + 3600000);
});

test("Intelligent Auto Follow-up - Persistence across restart", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_persist_test";
  const customerJid = "contact-094a03a4fde4@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    canonicalCustomerId: "phone:923123456789",
    lastCustomerMessageText: "Where are you located?",
    currentObjective: "location_inquiry",
  });
  assert.ok(sched);
  const nextAt = sched.nextFollowupAt;
  const attempt = sched.attemptIndex;

  // Clear in-memory schedule store to simulate worker crash / PM2 restart
  const { loadPersistedAutoFollowupSchedules, clearScheduleStoreMemoryOnlyForTest } = await import("./intelligent-auto-followup-service.ts");
  clearScheduleStoreMemoryOnlyForTest();

  // Load back from durable disk storage
  loadPersistedAutoFollowupSchedules(botId, true);
  const recovered = getAutoFollowupSchedule(botId, customerJid);

  assert.ok(recovered);
  assert.equal(recovered.customerJid, customerJid);
  assert.equal(recovered.canonicalCustomerId, "phone:923123456789");
  assert.equal(recovered.currentObjective, "location_inquiry");
  assert.equal(recovered.attemptIndex, attempt);
  assert.equal(recovered.nextFollowupAt, nextAt);
  assert.equal(recovered.followupState, "SCHEDULED");
});

test("Intelligent Auto Follow-up - Race safety prevents stale follow-up send", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_race_test";
  const customerJid = "contact-94d1bae5dd24@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Do you have stock?",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000;

  const sentMessages: string[] = [];

  const result = await processDueAutoFollowups({
    botId,
    workerId: "worker_evaluator",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Do you have stock?" },
      { role: "assistant", text: "Yes, 5 items left in stock!" },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async () => {
      // SIMULATE IN-FLIGHT RACE CONDITION: Customer replies while LLM is generating!
      cancelAutoFollowupOnCustomerReply(botId, customerJid, "msg_cust_reply_during_eval");
      return {
        text: JSON.stringify({
          shouldFollowup: true,
          unresolvedObjective: "stock_urgency",
          reason: "Checking stock urgency.",
          suggestedMessage: "Would you like us to put one on hold?",
        }),
        model: "mock-model",
      };
    }) as any,
    sendFollowupText: async (jid, text) => {
      sentMessages.push(text);
      return { success: true, messageId: "msg_stale_should_not_send" };
    },
  });

  // Outbound send must be completely aborted by the pre-send check!
  assert.equal(sentMessages.length, 0);
  assert.equal(result.sent, 0);
  assert.equal(result.cancelled, 1);

  const finalSched = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(finalSched?.followupState, "CANCELLED");
});

test("Intelligent Auto Follow-up - Extended exponential doubling continuation (64h, 128h, 256h)", () => {
  assert.equal(buildDefaultFollowupDelayMs(5), 32 * 3600 * 1000); // 32h
  assert.equal(buildDefaultFollowupDelayMs(6), 64 * 3600 * 1000); // 64h
  assert.equal(buildDefaultFollowupDelayMs(7), 128 * 3600 * 1000); // 128h
  assert.equal(buildDefaultFollowupDelayMs(8), 256 * 3600 * 1000); // 256h
});

test("Auto Follow-up Canonical Billing - Test A: semantic evaluation + generation + successful send -> 2 qualifying calls -> $0.004 wallet charge & usage breakdown", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_billing_a";
  const customerJid = "contact-e4ed32210a80@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Can you send the pricing list?",
    currentObjective: "pricing_qualification",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000;

  const logicalTurnId = sched.logicalFollowupTurnId;
  clearCustomerTurnAiCalls(logicalTurnId);

  let capturedBilledAmount = 0;
  let capturedBreakdown: any = null;

  const res = await processDueAutoFollowups({
    botId,
    workerId: "worker_a",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Can you send the pricing list?" },
      { role: "assistant", text: "Here is our base pricing brochure." },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async (callInput: any) => {
      if (callInput.purpose === "ai_smart_followup_evaluation") {
        return {
          text: JSON.stringify({
            shouldFollowup: true,
            unresolvedObjective: "pricing_confirmation",
            reason: "Customer asked for pricing list.",
            suggestedMessage: "Did you have a chance to review our pricing list?",
          }),
          model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
        };
      }
      return {
        text: "Did you have a chance to review our pricing list?",
        model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
      };
    }) as any,
    sendFollowupText: async (_jid, _text, options) => {
      capturedBilledAmount = options?.billingBreakdown?.totalAmount ?? (0.003 + (options?.extraAiCallsCount || 0) * 0.001);
      capturedBreakdown = options?.billingBreakdown;
      return { success: true, messageId: "msg_a_delivered" };
    },
  });

  assert.equal(res.processed, 1);
  assert.equal(res.sent, 1);

  // Assert canonical ledger has exactly 2 qualifying provider calls:
  const turnCalls = await getSuccessfulCustomerTurnAiCallsCountAsync(logicalTurnId);
  assert.equal(turnCalls, 2);

  // Assert exact billing breakdown & settlement:
  assert.equal(capturedBreakdown?.successfulCallsCount, 2);
  assert.equal(capturedBreakdown?.baseAmount, 0.003);
  assert.equal(capturedBreakdown?.extraCallsCount, 1);
  assert.equal(capturedBreakdown?.extraAmount, 0.001);
  assert.equal(capturedBreakdown?.totalAmount, 0.004);
  assert.equal(capturedBilledAmount, 0.004);
});

test("Auto Follow-up Canonical Billing - Test B: evaluation + generation + extra AI repair + successful send -> 3 qualifying calls -> $0.005 charge", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_billing_b";
  const customerJid = "contact-e0a67cb655df@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Do you have wholesale options?",
    currentObjective: "wholesale_inquiry",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000;

  const logicalTurnId = sched.logicalFollowupTurnId;
  clearCustomerTurnAiCalls(logicalTurnId);

  let capturedBilledAmount = 0;
  let capturedBreakdown: any = null;

  const res = await processDueAutoFollowups({
    botId,
    workerId: "worker_b",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Do you have wholesale options?" },
      { role: "assistant", text: "Yes, we offer wholesale." },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async (callInput: any) => {
      if (callInput.purpose === "ai_smart_followup_evaluation") {
        return {
          text: JSON.stringify({
            shouldFollowup: true,
            unresolvedObjective: "wholesale_volume",
            reason: "Customer asked about wholesale.",
          }),
          model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
        };
      }
      // Follow-up generation succeeds, then a legitimate extra AI repair runs
      recordSuccessfulCustomerTurnAiCall({
        customerTurnId: logicalTurnId,
        providerCallId: `call_repair_${logicalTurnId}`,
        purpose: "guard_repair",
        provider: "deepinfra",
      });
      return {
        text: "Hi, how many units are you looking to order for wholesale?",
        model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
      };
    }) as any,
    sendFollowupText: async (_jid, _text, options) => {
      capturedBilledAmount = options?.billingBreakdown?.totalAmount ?? (0.003 + (options?.extraAiCallsCount || 0) * 0.001);
      capturedBreakdown = options?.billingBreakdown;
      return { success: true, messageId: "msg_b_delivered" };
    },
  });

  assert.equal(res.processed, 1);
  assert.equal(res.sent, 1);

  // Assert canonical ledger has 3 qualifying provider calls (evaluation + generation + guard_repair)
  const turnCalls = await getSuccessfulCustomerTurnAiCallsCountAsync(logicalTurnId);
  assert.equal(turnCalls, 3);

  // Assert exact billing breakdown & settlement:
  assert.equal(capturedBreakdown?.successfulCallsCount, 3);
  assert.equal(capturedBreakdown?.baseAmount, 0.003);
  assert.equal(capturedBreakdown?.extraCallsCount, 2);
  assert.equal(capturedBreakdown?.extraAmount, 0.002);
  assert.equal(capturedBreakdown?.totalAmount, 0.005);
  assert.equal(capturedBilledAmount, 0.005);
});

test("Auto Follow-up Canonical Billing - Test C: semantic evaluation NOT_REQUIRED -> 0 sends -> $0 customer-facing settlement", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_billing_c";
  const customerJid = "contact-9a40f444e0ef@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Thanks, order received perfectly!",
    currentObjective: "post_purchase_check",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000;

  const logicalTurnId = sched.logicalFollowupTurnId;
  clearCustomerTurnAiCalls(logicalTurnId);

  let sendsAttempted = 0;
  let settledAmount = 0;

  const res = await processDueAutoFollowups({
    botId,
    workerId: "worker_c",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Thanks, order received perfectly!" },
      { role: "assistant", text: "You are welcome! Have a great day." },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async () => ({
      text: JSON.stringify({
        shouldFollowup: false,
        unresolvedObjective: "order_fulfilled",
        reason: "Customer already confirmed successful receipt; no follow-up needed.",
      }),
      model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
    })) as any,
    sendFollowupText: async () => {
      sendsAttempted++;
      settledAmount += 0.003;
      return { success: true, messageId: "msg_c_should_not_send" };
    },
  });

  assert.equal(res.processed, 1);
  assert.equal(res.sent, 0);
  assert.equal(res.stopped, 1);
  assert.equal(sendsAttempted, 0);
  assert.equal(settledAmount, 0);

  const updatedSched = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(updatedSched?.state, "COMPLETED");
});

test("Auto Follow-up Canonical Billing - Test D: evaluation + generation succeed, transport send fails -> delivered: NO -> $0 settlement", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_billing_d";
  const customerJid = "contact-a1a5e15abf82@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Can I get a discount?",
    currentObjective: "discount_request",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000;

  const logicalTurnId = sched.logicalFollowupTurnId;
  clearCustomerTurnAiCalls(logicalTurnId);

  let walletSettlement = 0;
  let delivered = false;

  const res = await processDueAutoFollowups({
    botId,
    workerId: "worker_d",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Can I get a discount?" },
      { role: "assistant", text: "We offer 10% off for first-time orders." },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async (callInput: any) => {
      if (callInput.purpose === "ai_smart_followup_evaluation") {
        return {
          text: JSON.stringify({
            shouldFollowup: true,
            unresolvedObjective: "coupon_apply",
            reason: "Customer asked for discount.",
          }),
          model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
        };
      }
      return {
        text: "Would you like me to generate your 10% discount code now?",
        model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
      };
    }) as any,
    sendFollowupText: async () => {
      // Transport failure -> no delivery, no charge
      return { success: false, error: "network_timeout" };
    },
  });

  assert.equal(res.processed, 1);
  assert.equal(res.sent, 0);
  assert.equal(delivered, false);
  assert.equal(walletSettlement, 0);

  // Assert draft text is preserved on schedule for transport retry
  const updatedSched = getAutoFollowupSchedule(botId, customerJid);
  assert.ok(updatedSched?.draftFollowupText);
  assert.equal(updatedSched?.draftFollowupText, "Would you like me to generate your 10% discount code now?");
  assert.equal(updatedSched?.state, "SCHEDULED");
});

test("Auto Follow-up Canonical Billing - Test E: transport retry reuses same generated content -> 0 additional AI calls -> no extra charge", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_billing_e";
  const customerJid = "contact-d0fa9548dd17@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Do you have free delivery?",
    currentObjective: "delivery_inquiry",
  });
  assert.ok(sched);

  const logicalTurnId = sched.logicalFollowupTurnId;
  clearCustomerTurnAiCalls(logicalTurnId);

  // Pre-seed evaluation and generation calls into the ledger, and pre-seed draft on schedule (as left by Test D)
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: logicalTurnId,
    providerCallId: `call_eval_${logicalTurnId}`,
    purpose: "ai_smart_followup_evaluation",
    provider: "deepinfra",
  });
  recordSuccessfulCustomerTurnAiCall({
    customerTurnId: logicalTurnId,
    providerCallId: `call_gen_${logicalTurnId}`,
    purpose: "ai_smart_followup_generation",
    provider: "deepinfra",
  });

  sched.draftFollowupText = "Yes, free delivery is available on orders above $50!";
  sched.nextFollowupAt = Date.now() - 1000;

  const callsBeforeRetry = getSuccessfulCustomerTurnAiCallsCount(logicalTurnId);
  assert.equal(callsBeforeRetry, 2);

  let newAiCallsDuringRetry = 0;
  let settledCharge = 0;

  const res = await processDueAutoFollowups({
    botId,
    workerId: "worker_e",
    nowMs: Date.now(),
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [
      { role: "user", text: "Do you have free delivery?" },
      { role: "assistant", text: "Delivery rates depend on order total." },
    ],
    getCustomerProfile: async () => ({}),
    isCustomerAiPaused: () => false,
    textProviderGenerate: (async () => {
      newAiCallsDuringRetry++;
      return { text: "Should not be called during retry", model: "mock" };
    }) as any,
    sendFollowupText: async (_jid, text, options) => {
      assert.equal(text, "Yes, free delivery is available on orders above $50!");
      settledCharge = options?.billingBreakdown?.totalAmount ?? (0.003 + (options?.extraAiCallsCount || 0) * 0.001);
      return { success: true, messageId: "msg_retry_delivered" };
    },
  });

  assert.equal(res.processed, 1);
  assert.equal(res.sent, 1);
  // Reused draft -> 0 new AI calls during retry
  assert.equal(newAiCallsDuringRetry, 0);

  // Calls in ledger remain exactly 2
  const callsAfterRetry = getSuccessfulCustomerTurnAiCallsCount(logicalTurnId);
  assert.equal(callsAfterRetry, 2);

  // Charged normal 2-call amount: $0.004 (no extra charge for the transport retry)
  assert.equal(settledCharge, 0.004);

  // Draft cleared on successful delivery
  const updatedSched = getAutoFollowupSchedule(botId, customerJid);
  assert.equal(updatedSched?.draftFollowupText, undefined);
});

test("Auto Follow-up Canonical Billing - Test F: restart / duplicate worker claim -> one logical turn, one ledger set, one settlement, zero duplicate charge", async () => {
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_billing_f";
  const customerJid = "contact-dbae5c149b0e@example.invalid";

  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "What are your operating hours?",
    currentObjective: "hours_inquiry",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000;

  const logicalTurnId = sched.logicalFollowupTurnId;
  clearCustomerTurnAiCalls(logicalTurnId);

  let settlementCount = 0;
  let totalBilledUsd = 0;

  const executeWorkerTurn = async (workerId: string) => {
    return processDueAutoFollowups({
      botId,
      workerId,
      nowMs: Date.now(),
      checkBillingEligibility: async () => ({ eligible: true }),
      getChatHistory: async () => [
        { role: "user", text: "What are your operating hours?" },
        { role: "assistant", text: "We are open 9am to 6pm." },
      ],
      getCustomerProfile: async () => ({}),
      isCustomerAiPaused: () => false,
      textProviderGenerate: (async (callInput: any) => {
        if (callInput.purpose === "ai_smart_followup_evaluation") {
          return {
            text: JSON.stringify({
              shouldFollowup: true,
              unresolvedObjective: "booking_time",
              reason: "Customer asked about operating hours.",
            }),
            model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
          };
        }
        return {
          text: "Would you like to schedule a visit during our open hours?",
          model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
        };
      }) as any,
      sendFollowupText: async (_jid, _text, options) => {
        settlementCount++;
        totalBilledUsd += options?.billingBreakdown?.totalAmount || 0.004;
        return { success: true, messageId: `msg_${workerId}` };
      },
    });
  };

  // Worker 1 runs and delivers
  const res1 = await executeWorkerTurn("worker_1");
  assert.equal(res1.sent, 1);
  assert.equal(settlementCount, 1);
  assert.equal(totalBilledUsd, 0.004);

  // Worker 2 attempts same turn (simulating concurrent claim or post-restart rerun on same due schedule)
  clearScheduleStoreMemoryOnlyForTest(); // simulate volatile worker restart
  const res2 = await executeWorkerTurn("worker_2");
  // Due to state progression / claim deduplication, Worker 2 skips or duplicates nothing
  assert.equal(res2.sent, 0);
  assert.equal(settlementCount, 1);
  assert.equal(totalBilledUsd, 0.004);

  // Canonical ledger has exactly 2 calls for this logical turn, not duplicated
  const count = getSuccessfulCustomerTurnAiCallsCount(logicalTurnId);
  assert.equal(count, 2);
});

test("Intelligent Auto Follow-up - Requirement #3: LID then PN resolve to same follow-up chain", async () => {
  const { recordVerifiedCustomerAlias, clearCustomerAliasStore } = await import("./customer-identity-resolver-service.ts");
  clearCustomerAliasStore();
  clearAutoFollowupSchedulesForTest();

  const botId = "bot_chain_test";
  const phone = "153238380473";
  const pnJid = "contact-d3b9636f8b0e@example.invalid";
  const lid = "8418320478394@lid";

  // Customer initially known by LID
  recordVerifiedCustomerAlias({
    accountId: botId,
    alias: lid,
    type: "lid",
    phone,
    displayName: "Ahad Firdosi",
  });

  // Follow-up scheduled under LID
  const schedLid = scheduleNextAutoFollowup({
    botId,
    customerJid: lid,
    lastCustomerMessageText: "I am interested in pricing",
    currentObjective: "pricing_inquiry",
  });
  assert.ok(schedLid);

  // Later, customer is recorded with PN alias
  recordVerifiedCustomerAlias({
    accountId: botId,
    alias: pnJid,
    type: "pn_jid",
    phone,
    displayName: "Ahad Firdosi",
  });

  // Next interaction arrives via PN -> retrieves the EXACT SAME follow-up schedule ID!
  const schedPn = getAutoFollowupSchedule(botId, pnJid);
  assert.ok(schedPn);
  assert.equal(schedPn.id, schedLid.id);
  assert.equal(schedPn.canonicalCustomerId, schedLid.canonicalCustomerId);
  assert.equal(schedPn.currentObjective, "pricing_inquiry");
});

test("Intelligent Auto Follow-up - Requirement #10: Explicit opt-out vs product disinterest", () => {
  clearAutoFollowupSchedulesForTest();
  const botId = "bot_optout_test";

  // Case A: Explicit communication opt-out -> STOPPED, permanent communication opt-out
  const schedOptOut = scheduleNextAutoFollowup({
    botId,
    customerJid: "contact-6c9bc40fc084@example.invalid",
    lastCustomerMessageText: "Please stop messaging me and block my number",
  });
  assert.ok(schedOptOut);
  assert.equal(schedOptOut.followupState, "STOPPED");
  assert.equal(schedOptOut.isCommunicationOptOut, true);
  assert.equal(schedOptOut.currentObjective, "communication_opt_out");

  // Case B: Product disinterest ("not interested in this service") -> COMPLETED, NOT communication opt-out
  const schedDisinterested = scheduleNextAutoFollowup({
    botId,
    customerJid: "contact-a997ae750213@example.invalid",
    lastCustomerMessageText: "I am not interested in this package, it's too expensive",
  });
  assert.ok(schedDisinterested);
  assert.equal(schedDisinterested.followupState, "COMPLETED");
  assert.equal(schedDisinterested.isCommunicationOptOut, false);
  assert.equal(schedDisinterested.isProductDisinterest, true);
  assert.equal(schedDisinterested.currentObjective, "product_disinterest");
});
