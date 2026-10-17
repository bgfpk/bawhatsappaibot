import test from "node:test";
import assert from "node:assert/strict";
import {
  scheduleNextAutoFollowup,
  clearAutoFollowupSchedulesForTest,
  getAutoFollowupSchedule,
  listActiveAutoFollowupSchedules,
  processDueAutoFollowups,
} from "./intelligent-auto-followup-service.ts";
import { isFollowupActive } from "./followup-campaign-service.ts";

test("Auto Follow-up Decoupling: 4-State Configuration Matrix", () => {
  const evaluateStates = (config: { followup_enabled?: any; auto_followup_enabled?: any }) => {
    const legacyState = Boolean(isFollowupActive(config.followup_enabled));
    const intelligentState = Boolean(config.auto_followup_enabled);
    return { legacyState, intelligentState };
  };

  // 1. legacy false / auto false
  const state1 = evaluateStates({ followup_enabled: 0, auto_followup_enabled: 0 });
  assert.equal(state1.legacyState, false, "legacy must be OFF");
  assert.equal(state1.intelligentState, false, "intelligent must be OFF");

  // 2. legacy true / auto false
  const state2 = evaluateStates({ followup_enabled: 1, auto_followup_enabled: 0 });
  assert.equal(state2.legacyState, true, "legacy must be ON");
  assert.equal(state2.intelligentState, false, "intelligent must be OFF");

  // 3. legacy false / auto true
  const state3 = evaluateStates({ followup_enabled: 0, auto_followup_enabled: 1 });
  assert.equal(state3.legacyState, false, "legacy must be OFF");
  assert.equal(state3.intelligentState, true, "intelligent must be ON");

  // 4. legacy true / auto true
  const state4 = evaluateStates({ followup_enabled: 1, auto_followup_enabled: 1 });
  assert.equal(state4.legacyState, true, "legacy must be ON");
  assert.equal(state4.intelligentState, true, "intelligent must be ON");

  // Missing auto_followup_enabled must always resolve to false
  const stateMissing = evaluateStates({ followup_enabled: 1 });
  assert.equal(stateMissing.intelligentState, false, "missing auto_followup_enabled must resolve to OFF");
  const stateUndefined = evaluateStates({ followup_enabled: 0, auto_followup_enabled: undefined });
  assert.equal(stateUndefined.intelligentState, false, "undefined auto_followup_enabled must resolve to OFF");
});

test("Worker Scheduler Guard: Intelligent scheduler only triggers when auto_followup_enabled is true", () => {
  clearAutoFollowupSchedulesForTest();

  // Helper simulating the post-reply worker scheduling condition from bot-worker.ts line 3390
  const maybeScheduleIntelligentFollowup = (botConfig: any, botId: string, customerJid: string) => {
    if (Boolean(botConfig?.auto_followup_enabled)) {
      scheduleNextAutoFollowup({
        botId,
        customerJid,
        lastCustomerMessageText: "Interested in product",
        lastBotReplyText: "Details sent",
        currentObjective: "product_interest",
      });
      return true;
    }
    return false;
  };

  // Case A: legacy true + auto false -> intelligent schedules created: 0
  const configA = { followup_enabled: 1, auto_followup_enabled: 0 };
  const scheduledA = maybeScheduleIntelligentFollowup(configA, "bot_a", "contact-85d2a3563239@example.invalid");
  assert.equal(scheduledA, false);
  assert.equal(getAutoFollowupSchedule("bot_a", "contact-85d2a3563239@example.invalid"), null, "0 intelligent schedules for legacy-only");

  // Case B: legacy false + auto true -> intelligent schedules created: 1
  const configB = { followup_enabled: 0, auto_followup_enabled: 1 };
  const scheduledB = maybeScheduleIntelligentFollowup(configB, "bot_b", "contact-126f2cd31c20@example.invalid");
  assert.equal(scheduledB, true);
  const schedB = getAutoFollowupSchedule("bot_b", "contact-126f2cd31c20@example.invalid");
  assert.ok(schedB, "Intelligent schedule created when auto_followup_enabled is true");

  // Case C: legacy true + auto true -> intelligent schedule operates once, without duplication
  const configC = { followup_enabled: 1, auto_followup_enabled: 1 };
  const scheduledC = maybeScheduleIntelligentFollowup(configC, "bot_c", "contact-d58a89d5392e@example.invalid");
  assert.equal(scheduledC, true);
  const schedC = getAutoFollowupSchedule("bot_c", "contact-d58a89d5392e@example.invalid");
  assert.ok(schedC);
  const allBotCSchedules = listActiveAutoFollowupSchedules("bot_c");
  assert.equal(allBotCSchedules.length, 1, "Exactly one intelligent schedule created, no duplicates");

  // Case D: legacy missing + auto missing -> 0 schedules
  const configD = {};
  const scheduledD = maybeScheduleIntelligentFollowup(configD, "bot_d", "contact-b24f3916a145@example.invalid");
  assert.equal(scheduledD, false);
  assert.equal(getAutoFollowupSchedule("bot_d", "contact-b24f3916a145@example.invalid"), null);
});

test("Worker Due Sweep Guard: processDueAutoFollowups skips execution when auto_followup_enabled is false", async () => {
  clearAutoFollowupSchedulesForTest();

  // Create a schedule that is due now
  const botId = "bot_due_test";
  const customerJid = "contact-f7ba0cd80088@example.invalid";
  const sched = scheduleNextAutoFollowup({
    botId,
    customerJid,
    lastCustomerMessageText: "Need catalog",
    lastBotReplyText: "Here is catalog",
  });
  assert.ok(sched);
  sched.nextFollowupAt = Date.now() - 1000; // Past due

  let sendsAttempted = 0;

  // When auto_followup_enabled is 0 / false -> must not send
  const resultWhileOff = await processDueAutoFollowups({
    botId,
    workerId: "worker_1",
    botConfig: { followup_enabled: 1, auto_followup_enabled: 0 },
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [{ role: "model", text: "Here is catalog" }],
    getCustomerProfile: async () => ({}),
    sendFollowupText: async () => {
      sendsAttempted++;
      return { success: true, messageId: "msg_123" };
    },
  });

  assert.equal(resultWhileOff.sent, 0, "No messages sent while auto_followup_enabled is 0");
  assert.equal(sendsAttempted, 0, "Transport sendFollowupText must never be called while OFF");
  assert.equal(sched.followupState, "SCHEDULED", "Schedule remains untouched in SCHEDULED state without sending");

  // When auto_followup_enabled is turned ON -> can send
  const resultWhileOn = await processDueAutoFollowups({
    botId,
    workerId: "worker_1",
    botConfig: { followup_enabled: 1, auto_followup_enabled: 1 },
    checkBillingEligibility: async () => ({ eligible: true }),
    getChatHistory: async () => [{ role: "model", text: "Here is catalog" }],
    getCustomerProfile: async () => ({}),
    textProviderGenerate: (async () => ({
      text: JSON.stringify({
        shouldFollowup: true,
        unresolvedObjective: "catalog_followup",
        reason: "Customer asked for catalog",
        suggestedMessage: "Did you get a chance to view our catalog?",
      }),
      model: "mock-model",
    })) as any,
    sendFollowupText: async () => {
      sendsAttempted++;
      return { success: true, messageId: "msg_124" };
    },
  });

  assert.equal(resultWhileOn.sent, 1, "Sends 1 follow-up when auto_followup_enabled is ON");
  assert.equal(sendsAttempted, 1, "Transport sendFollowupText called once");
});
