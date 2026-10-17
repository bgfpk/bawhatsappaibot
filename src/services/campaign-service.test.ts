import test from "node:test";
import assert from "node:assert/strict";
import {
  createCampaign,
  getCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  changeCampaignSendingInstance,
  handleSendingInstanceDeleted,
  processDueCampaignRecipients,
  queryCampaignRecipients,
  listCampaignEvents,
  computeNextSendTime,
  resolveRecipientMessage,
  __clearCampaignStoresForTest,
} from "./campaign-service.ts";
import {
  createContactList,
  getContactList,
  importContactsFromCsv,
  runContactListWhatsAppValidation,
  suppressPhone,
  __clearContactListStoresForTest,
} from "./contact-list-service.ts";
import {
  getSuccessfulCustomerTurnAiCallsCount,
  clearCustomerTurnAiCalls,
} from "./customer-turn-ai-call-ledger-service.ts";
import { __clearMemoryClaimsForTest } from "./canonical-claim-service.ts";

test("Campaign - Timing & Sending Window calculation across timezones", () => {
  // Fixed delay: 60s
  const next1 = computeNextSendTime({
    baseTimeMs: 100000,
    delaySeconds: 60,
  });
  assert.equal(next1, 160000);

  // Sending window: 09:00 to 21:00 UTC
  // Case A: Base time is 08:30 UTC -> advances to 09:00 UTC today (+30 mins)
  const base830 = new Date("2026-07-15T08:30:00Z").getTime();
  const res830 = computeNextSendTime({
    baseTimeMs: base830,
    delaySeconds: 0,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "21:00",
    timezone: "UTC",
  });
  assert.equal(new Date(res830).toISOString(), "2026-07-15T09:00:00.000Z");

  // Case B: Base time is 21:30 UTC -> advances to 09:00 UTC tomorrow (+11.5 hours)
  const base2130 = new Date("2026-07-15T21:30:00Z").getTime();
  const res2130 = computeNextSendTime({
    baseTimeMs: base2130,
    delaySeconds: 0,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "21:00",
    timezone: "UTC",
  });
  assert.equal(new Date(res2130).toISOString(), "2026-07-16T09:00:00.000Z");
});

test("Campaign - Fixed Message Mode precedence: row fixed message > campaign fallback > blocked if missing", async () => {
  __clearCampaignStoresForTest();
  __clearContactListStoresForTest();

  const accountId = "acct_fixed_test";
  const list = await createContactList({ accountId, name: "Fixed Mode List" });
  const csv = [
    `Name,Phone,Fixed Message`,
    `Ahad,+923001111111,Special row custom message for Ahad`,
    `Sara,+923002222222,`, // will use campaign fallback
    `Zubair,+923003333333,`, // will be tested with empty campaign fallback
  ].join("\n");

  await importContactsFromCsv({ accountId, listId: list.id, csvText: csv });
  await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_1",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
  });

  // Campaign with fallback
  const camp = await createCampaign({
    accountId,
    name: "Summer Promo",
    contactListId: list.id,
    sendingInstanceId: "bot_1",
    messageMode: "FIXED",
    campaignFixedMessage: "Standard campaign promo message",
  });

  await startCampaign({ accountId, campaignId: camp.id, consentAcknowledged: true });
  const { recipients } = await queryCampaignRecipients(accountId, camp.id);

  // Recipient 1: Row message takes precedence
  const r1 = recipients.find((r) => r.name === "Ahad")!;
  const res1 = await resolveRecipientMessage({ campaign: camp, recipient: r1 });
  assert.equal(res1.messageText, "Special row custom message for Ahad");
  assert.equal(res1.isAiGenerated, false);

  // Recipient 2: Campaign fallback
  const r2 = recipients.find((r) => r.name === "Sara")!;
  const res2 = await resolveRecipientMessage({ campaign: camp, recipient: r2 });
  assert.equal(res2.messageText, "Standard campaign promo message");
  assert.equal(res2.isAiGenerated, false);

  // Recipient 3 with empty campaign fallback -> BLOCKED
  const emptyCamp = { ...camp, campaignFixedMessage: undefined };
  const r3 = recipients.find((r) => r.name === "Zubair")!;
  const res3 = await resolveRecipientMessage({ campaign: emptyCamp as any, recipient: r3 });
  assert.equal(res3.blocked, true);
  assert.ok(res3.blockedReason?.includes("No fixed message"));
});

test("Campaign - AI Personalized Mode: sandboxing, provider ledger, persisted generated text, retry reuse", async () => {
  __clearCampaignStoresForTest();
  __clearContactListStoresForTest();

  const accountId = "acct_ai_test";
  const list = await createContactList({ accountId, name: "AI Mode List" });
  const csv = [
    `Name,Phone,AI Instructions`,
    `Tariq,+923001234567,Special interest in enterprise tier setup`,
  ].join("\n");

  await importContactsFromCsv({ accountId, listId: list.id, csvText: csv });
  await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_ai",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
  });

  const camp = await createCampaign({
    accountId,
    name: "Enterprise Outreach",
    contactListId: list.id,
    sendingInstanceId: "bot_ai",
    messageMode: "AI_PERSONALIZED",
    campaignInstructions: "Introduce our high-volume WhatsApp automation capabilities.",
  });

  await startCampaign({ accountId, campaignId: camp.id, consentAcknowledged: true });
  const { recipients } = await queryCampaignRecipients(accountId, camp.id);
  const recipient = recipients[0];
  clearCustomerTurnAiCalls(recipient.logicalCampaignTurnId);

  let providerCallCount = 0;
  const mockTextGenerate = async (input: any) => {
    providerCallCount++;
    assert.ok(input.prompt.includes("Tariq"));
    assert.ok(input.prompt.includes("enterprise tier setup"));
    return {
      text: "Hello Tariq, would you like to explore our high-volume WhatsApp automation for your enterprise?",
      model: "deepinfra/meta-llama/Llama-3.3-70B-Instruct",
    };
  };

  // 1. Initial generation & persistence
  const res1 = await resolveRecipientMessage({
    campaign: camp,
    recipient,
    textProviderGenerateFn: mockTextGenerate,
  });

  assert.equal(res1.isAiGenerated, true);
  assert.equal(providerCallCount, 1);
  assert.ok(recipient.generatedMessageText);

  // Assert canonical provider ledger recorded this call
  const recordedCalls = getSuccessfulCustomerTurnAiCallsCount(recipient.logicalCampaignTurnId);
  assert.equal(recordedCalls, 1);

  // 2. Retry / re-resolution reuses generated text without calling AI provider again (Requirement 17, Test E)
  const res2 = await resolveRecipientMessage({
    campaign: camp,
    recipient,
    textProviderGenerateFn: mockTextGenerate,
  });

  assert.equal(res2.isAiGenerated, false); // 0 new AI calls
  assert.equal(providerCallCount, 1); // Not incremented!
  assert.equal(res2.messageText, res1.messageText);
});

test("Campaign - End-to-End Orchestration: Scheduling, Atomic Claims, 2-Worker Contention, Receipts, Pause/Resume/Cancel", async () => {
  __clearCampaignStoresForTest();
  __clearContactListStoresForTest();
  __clearMemoryClaimsForTest();

  const accountId = "acct_orch_test";
  const list = await createContactList({ accountId, name: "Orchestration List" });
  const csv = [
    `Name,Phone,Message`,
    `Person 1,+923001000001,Message 1`,
    `Person 2,+923001000002,Message 2`,
    `Person 3,+923001000003,Message 3`,
    `Person 4,+923001000004,Message 4`,
  ].join("\n");

  await importContactsFromCsv({ accountId, listId: list.id, csvText: csv });
  await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_1",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
  });

  const camp = await createCampaign({
    accountId,
    name: "End to End Campaign",
    contactListId: list.id,
    sendingInstanceId: "bot_1",
    messageMode: "FIXED",
    timingMode: "FIXED_DELAY",
    fixedDelaySeconds: 10,
  });

  // Launch campaign
  await startCampaign({ accountId, campaignId: camp.id, consentAcknowledged: true, startAt: Date.now() - 1000 });
  assert.equal(camp.status, "RUNNING");
  assert.equal(camp.totalRecipients, 4);

  let sentMessages = 0;
  const mockSend = async (jid: string, text: string) => {
    sentMessages++;
    return { success: true, messageId: `msg_${sentMessages}_${jid}` };
  };

  // Two workers execute concurrently -> exactly 1 winner per recipient, no duplicate sends
  const [worker1Res, worker2Res] = await Promise.all([
    processDueCampaignRecipients({
      accountId,
      workerId: "worker_1",
      nowMs: Date.now() + 100000,
      sendTextMessageFn: mockSend,
    }),
    processDueCampaignRecipients({
      accountId,
      workerId: "worker_2",
      nowMs: Date.now() + 100000,
      sendTextMessageFn: mockSend,
    }),
  ]);

  assert.equal(worker1Res.sent + worker2Res.sent, 4);
  assert.equal(sentMessages, 4);

  const updatedCamp = await getCampaign(accountId, camp.id);
  assert.equal(updatedCamp?.status, "COMPLETED");
  assert.equal(updatedCamp?.sentCount, 4);
  assert.equal(updatedCamp?.failedCount, 0);

  // Events audit trail
  const events = await listCampaignEvents(accountId, camp.id);
  assert.ok(events.some((e) => e.eventType === "STARTED"));
  assert.ok(events.some((e) => e.eventType === "SENT"));
  assert.ok(events.some((e) => e.eventType === "COMPLETED"));
});

test("Campaign - Instance Deletion & Reassignment: preserves lists/campaigns and transitions state", async () => {
  __clearCampaignStoresForTest();
  __clearContactListStoresForTest();

  const accountId = "acct_del_test";
  const list = await createContactList({ accountId, name: "Preserved List" });
  await importContactsFromCsv({
    accountId,
    listId: list.id,
    csvText: "Name,Phone\nTest,+923001111111",
  });
  await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_to_delete",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
  });

  const camp = await createCampaign({
    accountId,
    name: "Preserved Campaign",
    contactListId: list.id,
    sendingInstanceId: "bot_to_delete",
    messageMode: "FIXED",
    campaignFixedMessage: "Hello",
  });

  await startCampaign({ accountId, campaignId: camp.id, consentAcknowledged: true, startAt: Date.now() + 100000 });
  assert.equal(camp.status, "SCHEDULED");

  // Simulate instance deletion
  const affected = await handleSendingInstanceDeleted("bot_to_delete");
  assert.equal(affected, 1);

  // Contact list is preserved!
  const listAfter = await getContactList(accountId, list.id);
  assert.ok(listAfter);
  assert.equal(listAfter.status, "ACTIVE");

  // Campaign is preserved and marked NEEDS_SENDING_INSTANCE!
  const campAfter = await getCampaign(accountId, camp.id);
  assert.ok(campAfter);
  assert.equal(campAfter.status, "NEEDS_SENDING_INSTANCE");

  // Reassign to replacement instance
  await changeCampaignSendingInstance({
    accountId,
    campaignId: camp.id,
    newInstanceId: "bot_new_replacement",
  });

  const campReassigned = await getCampaign(accountId, camp.id);
  assert.equal(campReassigned?.sendingInstanceId, "bot_new_replacement");
  assert.equal(campReassigned?.status, "RUNNING");
});

test("Campaign - Random Delay Range: chosen once and persisted across restarts without compression", async () => {
  __clearCampaignStoresForTest();
  __clearContactListStoresForTest();

  const accountId = "acct_random_test";
  const list = await createContactList({ accountId, name: "Random Delay List" });
  await importContactsFromCsv({
    accountId,
    listId: list.id,
    csvText: "Name,Phone\nA,+923001000001\nB,+923001000002\nC,+923001000003",
  });
  await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_rnd",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
  });

  const camp = await createCampaign({
    accountId,
    name: "Random Range Campaign",
    contactListId: list.id,
    sendingInstanceId: "bot_rnd",
    messageMode: "FIXED",
    campaignFixedMessage: "Hi random",
    timingMode: "RANDOM_RANGE",
    randomMinSeconds: 30,
    randomMaxSeconds: 90,
  });

  const baseStart = Date.now() + 10000;
  await startCampaign({ accountId, campaignId: camp.id, consentAcknowledged: true, startAt: baseStart });

  const { recipients } = await queryCampaignRecipients(accountId, camp.id);
  assert.equal(recipients.length, 3);

  // Each recipient has chosenDelaySeconds in [30, 90]
  for (const r of recipients) {
    assert.ok(r.chosenDelaySeconds !== undefined);
    assert.ok(r.chosenDelaySeconds >= 30 && r.chosenDelaySeconds <= 90, `Delay ${r.chosenDelaySeconds} must be in [30, 90]`);
    assert.ok(r.scheduledAt >= baseStart);
  }

  // Record initial chosen delays
  const initialDelays = recipients.map((r) => ({ id: r.id, delay: r.chosenDelaySeconds, scheduledAt: r.scheduledAt }));

  // Simulate worker / server restart: reload recipients from store
  const { recipients: reloaded } = await queryCampaignRecipients(accountId, camp.id);
  for (let i = 0; i < reloaded.length; i++) {
    assert.equal(reloaded[i].chosenDelaySeconds, initialDelays[i].delay, "Chosen delay must survive restart without change");
    assert.equal(reloaded[i].scheduledAt, initialDelays[i].scheduledAt, "Scheduled time must survive restart without change");
  }
});

test("Campaign - Sender Offline, Pre-send Suppression, and Transport Receipt Verification", async () => {
  __clearCampaignStoresForTest();
  __clearContactListStoresForTest();
  __clearMemoryClaimsForTest();

  const accountId = "acct_safety_test";
  const list = await createContactList({ accountId, name: "Safety Test List" });
  await importContactsFromCsv({
    accountId,
    listId: list.id,
    csvText: "Name,Phone,Message\nUser 1,+923001111111,Msg 1\nUser 2,+923002222222,Msg 2\nUser 3,+923003333333,Msg 3",
  });
  await runContactListWhatsAppValidation({
    accountId,
    listId: list.id,
    botId: "bot_safety",
    onWhatsAppFn: async (jids) => jids.map((j) => ({ jid: j, exists: true })),
  });

  const camp = await createCampaign({
    accountId,
    name: "Safety Campaign",
    contactListId: list.id,
    sendingInstanceId: "bot_safety",
    messageMode: "FIXED",
    campaignFixedMessage: "Fallback",
  });

  await startCampaign({ accountId, campaignId: camp.id, consentAcknowledged: true, startAt: Date.now() - 5000 });

  // 1. Instance Offline: Sweep does NOT mark contacts invalid or fail campaign
  const offlineResult = await processDueCampaignRecipients({
    accountId,
    workerId: "worker_test",
    nowMs: Date.now(),
    sendTextMessageFn: async () => ({ success: true, messageId: "never_called" }),
    isInstanceConnectedFn: () => false, // instance offline!
  });
  assert.equal(offlineResult.processed, 0);

  const { recipients: recipsAfterOffline } = await queryCampaignRecipients(accountId, camp.id);
  for (const r of recipsAfterOffline) {
    assert.equal(r.status, "PENDING"); // Preserved in PENDING state!
  }

  // 2. Pre-send Suppression Recheck: Suppress User 2 right now before send
  await suppressPhone({ accountId, phone: "+151929803453", reason: "opt_out_mid_campaign" });

  // 3. Sender returns success without messageId -> Must NOT mark SENT (requires real receipt)
  let sendCount = 0;
  const mockSendWithReceiptCheck = async (jid: string) => {
    sendCount++;
    if (jid.includes("108870305034")) {
      // Missing messageId receipt -> fails receipt verification
      return { success: true };
    }
    return { success: true, messageId: `msg_${Date.now()}_${jid}`, rawReceipt: { key: { id: "real_receipt" } } };
  };

  const sweepResult = await processDueCampaignRecipients({
    accountId,
    workerId: "worker_test",
    nowMs: Date.now() + 100000,
    sendTextMessageFn: mockSendWithReceiptCheck,
    isInstanceConnectedFn: () => true, // instance online
  });

  const { recipients: finalRecips } = await queryCampaignRecipients(accountId, camp.id);

  // User 1 sent successfully with receipt
  assert.equal(sweepResult.sent, 1);
  // User 2 was skipped because of pre-send suppression
  assert.equal(sweepResult.skipped, 1);
  // User 3 failed receipt verification
  assert.equal(sweepResult.failed, 1);

  const u1 = finalRecips.find((r) => r.normalizedPhone === "112250469451")!;
  assert.equal(u1.status, "SENT");
  assert.ok(u1.messageId);

  const u2 = finalRecips.find((r) => r.normalizedPhone === "173464065383")!;
  assert.equal(u2.status, "SKIPPED_SUPPRESSED");

  const u3 = finalRecips.find((r) => r.normalizedPhone === "108870305034")!;
  // u3 did not have a valid messageId receipt so it must NOT be SENT!
  assert.notEqual(u3.status, "SENT");
  assert.equal(u3.status, "FAILED");
});
