import test from "node:test";
import assert from "node:assert/strict";

import {
  deliverWelcomeSequence,
  resolveRuntimeWelcomePayload,
  __setWelcomeDeliveryTestDeps,
  __resetWelcomeDeliveryTestDeps,
} from "./welcome-sequence-delivery-service.ts";
import { processAutomaticWelcomeSequence } from "./sequence-manager.ts";
import {
  __setAtomicClaimTestDeps,
  __resetAtomicClaimTestDeps,
  __clearMemoryClaimsForTest,
} from "./canonical-claim-service.ts";
import { shouldSendWelcomeSequence } from "./sequence-history-service.ts";
import {
  isExactResetCommand,
  isAuthorizedResetSender,
  applyGroupResetToStore,
  filterMessagesAfterReset,
  recordGroupResetTimestamp,
} from "../content-library/content-library-reset-service.ts";

test.beforeEach(() => {
  __resetAtomicClaimTestDeps(true);
  __clearMemoryClaimsForTest();
  __resetWelcomeDeliveryTestDeps();
});

test.afterEach(() => {
  __resetAtomicClaimTestDeps(true);
  __clearMemoryClaimsForTest();
  __resetWelcomeDeliveryTestDeps();
});

function createMockEnvironment() {
  const profiles = new Map<string, any>();
  const messagesStore = new Map<string, any>();
  const sentTemplatesLog: any[] = [];
  const statusHistory: any[] = [];
  const outboundReceipts = new Map<string, any>();
  let walletBalanceAllowed = true;
  let markWelcomeFailure = false;
  let updateProfileFailure = false;
  let finalizeClaimFailure = false;

  const mockDeps = {
    checkWelcomeSequence: async (botJid: string, customerJid: string) => {
      const key = `${botJid}:${customerJid}`;
      const profile = profiles.get(key);
      if (profile?.welcomeSequenceSent || profile?.welcomeSequenceSentAt) return true;
      return messagesStore.has(`w_${customerJid.split("@")[0]}`);
    },
    markWelcomeSequence: async (botJid: string, customerJid: string, input?: any) => {
      if (markWelcomeFailure) {
        return { success: false, profilePersisted: false, markerPersisted: false, error: "simulated_persistence_failure" };
      }
      const key = `${botJid}:${customerJid}`;
      const profile = profiles.get(key) || {};
      profile.welcomeSequenceSent = true;
      profile.welcomeSequenceSentAt = input?.timestamp || Date.now();
      profiles.set(key, profile);
      messagesStore.set(`w_${customerJid.split("@")[0]}`, { text: "welcome_sent" });
      return { success: true, profilePersisted: true, markerPersisted: true };
    },
    recordWelcomeSequenceStatus: async (botJid: string, customerJid: string, input: any) => {
      statusHistory.push({ botJid, customerJid, ...input });
    },
    getCustomerProfile: async (botJid: string, customerJid: string) => {
      const key = `${botJid}:${customerJid}`;
      return profiles.get(key) || null;
    },
    updateCustomerProfile: async (botJid: string, customerJid: string, patch: any) => {
      if (updateProfileFailure) {
        throw new Error("simulated_profile_update_failure");
      }
      const key = `${botJid}:${customerJid}`;
      const existing = profiles.get(key) || {};
      const merged = { ...existing, ...patch };
      if (patch.sequenceDeliveryProgress !== undefined) {
        merged.sequenceDeliveryProgress = patch.sequenceDeliveryProgress;
      }
      profiles.set(key, merged);
      return merged;
    },
    finalizeAtomicClaim: async (claimKey: string, workerId: string) => {
      if (finalizeClaimFailure) {
        return false;
      }
      const { finalizeAtomicClaim } = await import("./canonical-claim-service.ts");
      return finalizeAtomicClaim(claimKey, workerId);
    },
    findOutboundReceiptByIdempotencyKey: (key: string) => {
      return outboundReceipts.get(key) || null;
    },
    canSendBillableAutomation: async () => {
      return { allowed: walletBalanceAllowed, required: 0.003 };
    },
    saveMessage: async () => {},
    resolveAccountDataOwnerKey: async (_u: any, _j: any) => "bot_test_1",
    waitRandomSequenceDelay: async () => {},
  };

  __setWelcomeDeliveryTestDeps(mockDeps as any);

  const forwardTemplateMock = async (
    jid: string,
    template: any,
    _isMedia: boolean = false,
    options: any = {}
  ) => {
    sentTemplatesLog.push({ jid, template: { ...template }, options, timestamp: Date.now() });
    if (template?.__fail) {
      return { status: "failed", reason: "simulated_send_failure" };
    }
    const receipt = {
      sendStatus: "sent",
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      receiptId: `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      idempotencyKey: options?.billingEventId,
    };
    if (options?.billingEventId) {
      outboundReceipts.set(options.billingEventId, receipt);
    }
    return receipt;
  };

  return {
    profiles,
    messagesStore,
    sentTemplatesLog,
    statusHistory,
    outboundReceipts,
    setWalletAllowed: (val: boolean) => {
      walletBalanceAllowed = val;
    },
    setMarkWelcomeFailure: (val: boolean) => {
      markWelcomeFailure = val;
    },
    setUpdateProfileFailure: (val: boolean) => {
      updateProfileFailure = val;
    },
    setFinalizeClaimFailure: (val: boolean) => {
      finalizeClaimFailure = val;
    },
    forwardTemplateMock,
  };
}

// ----------------------------------------------------
// Requirement 1 & 2: ALL Synced Templates in Source Order (no slicing, 1..N)
// ----------------------------------------------------

test("Requirement 1 & 2: new customer receives ALL synced templates in exact source order (1 to 5 items)", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-6c9bc40fc084@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Welcome to our store!" } },
    { key: { id: "tpl_2" }, message: { imageMessage: { caption: "Here is catalog 1" } } },
    { key: { id: "tpl_3" }, message: { imageMessage: { caption: "Here is catalog 2" } } },
    { key: { id: "tpl_4" }, message: { videoMessage: { caption: "How to order" } } },
    { key: { id: "tpl_5" }, message: { documentMessage: { title: "PriceList.pdf" } } },
  ];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  const result = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(result.success, true);
  assert.equal(result.completed, true);
  assert.equal(result.deliveredCount, 5);
  assert.equal(env.sentTemplatesLog.length, 5);

  // Exact source order preserved
  for (let i = 0; i < templates.length; i++) {
    assert.equal(env.sentTemplatesLog[i].template.key.id, `tpl_${i + 1}`);
  }

  // Customer marked sent after all delivered
  const profile = await env.profiles.get("bot_1:" + customerJid);
  assert.equal(profile.welcomeSequenceSent, true);
});

test("Requirement 2: large welcome sequence (20 templates) sends all 20 without slicing or limit", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-f3e665cdb447@example.invalid";
  const templates = Array.from({ length: 20 }, (_, i) => ({
    key: { id: `tpl_${i + 1}` },
    message: { conversation: `Template ${i + 1}` },
  }));
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  const result = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(result.success, true);
  assert.equal(result.completed, true);
  assert.equal(result.deliveredCount, 20);
  assert.equal(env.sentTemplatesLog.length, 20);
});

// ----------------------------------------------------
// Requirement 3: First-Contact Rule
// ----------------------------------------------------

test("Requirement 3: first meaningful customer inbound event is eligible; existing chat is not", () => {
  // Brand new customer: 1 incoming message
  assert.equal(
    shouldSendWelcomeSequence([
      { key: { fromMe: false, id: "msg_1" }, message: { conversation: "Hi" }, messageTimestamp: 100 },
    ]),
    true
  );

  // Existing chat with prior inbound message: ineligible
  assert.equal(
    shouldSendWelcomeSequence([
      { key: { fromMe: false, id: "msg_1" }, message: { conversation: "Hi yesterday" }, messageTimestamp: 100 },
      { key: { fromMe: true, id: "bot_1" }, message: { conversation: "Hello!" }, messageTimestamp: 105 },
      { key: { fromMe: false, id: "msg_2" }, message: { conversation: "Price?" }, messageTimestamp: 200 },
    ]),
    false
  );

  // Automation markers (welcome_sent, phone request) do not make new customer appear old
  assert.equal(
    shouldSendWelcomeSequence([
      { key: { fromMe: true, id: "sys_1" }, message: { conversation: "welcome_sent" }, messageTimestamp: 50 },
      { key: { fromMe: false, id: "msg_1" }, message: { conversation: "Hello" }, messageTimestamp: 100 },
    ]),
    true
  );

  // Duplicate incoming events within 120s representing the same inbound message
  assert.equal(
    shouldSendWelcomeSequence([
      { key: { fromMe: false, id: "msg_dup_1" }, message: { conversation: "Hello" }, messageTimestamp: 100 },
      { key: { fromMe: false, id: "msg_dup_2" }, message: { conversation: "Hello" }, messageTimestamp: 105 },
    ]),
    true
  );
});

// ----------------------------------------------------
// Requirement 4: Already Sent = Never Send Again
// ----------------------------------------------------

test("Requirement 4: already-sent customer never receives Welcome sequence again", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-e4ed32210a80@example.invalid";
  const templates = [{ key: { id: "tpl_1" }, message: { conversation: "Welcome!" } }];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  // 1. First send: delivers
  const firstResult = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(firstResult.success, true);
  assert.equal(env.sentTemplatesLog.length, 1);

  // 2. Second message: rejected, $0 charge, 0 sends
  const secondResult = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(secondResult.success, false);
  assert.equal(secondResult.reason, "already_marked_sent");
  assert.equal(secondResult.alreadySent, true);
  assert.equal(env.sentTemplatesLog.length, 1); // No new sends
});

// ----------------------------------------------------
// Requirement 5, 23 & 26-J: Reset Semantics & Reset + New Content Flow
// ----------------------------------------------------

test("Requirement 23: full demo flow: reset welcome templates preserves sent history and new templates only go to new customers", async () => {
  const env = createMockEnvironment();
  const customer1 = "contact-85d2a3563239@example.invalid";
  const customer2 = "contact-126f2cd31c20@example.invalid";

  const groupJid = "contact-811310a47f84@example.invalid";
  const config = { groupJid, enabled: true, name: "Welcome Flow" };

  let localGroupStore: Record<string, any[]> = {
    [groupJid]: [
      { key: { id: "tpl_A" }, message: { conversation: "Template A" } },
      { key: { id: "tpl_B" }, message: { conversation: "Template B" } },
      { key: { id: "tpl_C" }, message: { conversation: "Template C" } },
    ],
  };

  // 1. Customer 1 contacts -> A, B, C sent -> marked SENT
  const res1 = await deliverWelcomeSequence({
    customerJid: customer1,
    templates: localGroupStore[groupJid],
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(res1.success, true);
  assert.equal(res1.deliveredCount, 3);
  assert.equal(env.sentTemplatesLog.length, 3);
  assert.equal(env.profiles.get("bot_1:" + customer1)?.welcomeSequenceSent, true);

  // 2. Reset Welcome Templates
  applyGroupResetToStore(localGroupStore, groupJid);
  assert.equal(localGroupStore[groupJid].length, 0);

  // 3. Customer 1 messages again -> Nothing sent
  const res1AfterReset = await deliverWelcomeSequence({
    customerJid: customer1,
    templates: localGroupStore[groupJid],
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(res1AfterReset.success, false);
  assert.equal(env.sentTemplatesLog.length, 3); // Unchanged

  // 4. Upload/sync D, E, F into same Welcome Group
  localGroupStore[groupJid] = [
    { key: { id: "tpl_D" }, message: { conversation: "Template D" } },
    { key: { id: "tpl_E" }, message: { conversation: "Template E" } },
    { key: { id: "tpl_F" }, message: { conversation: "Template F" } },
  ];

  // 5. Customer 1 messages again -> D, E, F are NOT sent (Customer 1 already received Welcome)
  const res1AfterNewContent = await deliverWelcomeSequence({
    customerJid: customer1,
    templates: localGroupStore[groupJid],
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(res1AfterNewContent.success, false);
  assert.equal(res1AfterNewContent.alreadySent, true);
  assert.equal(env.sentTemplatesLog.length, 3); // Still unchanged

  // 6. Brand-new Customer 2 sends first message -> D, E, F are all sent exactly once
  const res2 = await deliverWelcomeSequence({
    customerJid: customer2,
    templates: localGroupStore[groupJid],
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(res2.success, true);
  assert.equal(res2.deliveredCount, 3);
  assert.equal(env.sentTemplatesLog.length, 6);
  assert.equal(env.sentTemplatesLog[3].template.key.id, "tpl_D");
  assert.equal(env.sentTemplatesLog[4].template.key.id, "tpl_E");
  assert.equal(env.sentTemplatesLog[5].template.key.id, "tpl_F");
  assert.equal(env.profiles.get("bot_1:" + customer2)?.welcomeSequenceSent, true);
});

// ----------------------------------------------------
// Requirement 9 & 24: Partial Send Must Resume Safely
// ----------------------------------------------------

test("Requirement 9 & 24: partial send resumes from failed item without resending delivered items", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-f7ba0cd80088@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Item 1" } },
    { key: { id: "tpl_2" }, message: { conversation: "Item 2" } },
    { key: { id: "tpl_3" }, message: { conversation: "Item 3" }, __fail: true }, // fails
    { key: { id: "tpl_4" }, message: { conversation: "Item 4" } },
    { key: { id: "tpl_5" }, message: { conversation: "Item 5" } },
  ];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  // Attempt 1: 1 and 2 sent, 3 fails, 4 and 5 not attempted
  const attempt1 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(attempt1.success, false);
  assert.equal(attempt1.completed, false);
  assert.equal(attempt1.deliveredCount, 2);
  assert.equal(env.sentTemplatesLog.length, 3); // 1 sent, 2 sent, 3 attempted & failed

  // Profile not marked fully sent
  const profileAfterAttempt1 = env.profiles.get("bot_1:" + customerJid);
  assert.equal(profileAfterAttempt1?.welcomeSequenceSent, undefined);
  // Item-level progress saved
  const progress1 = profileAfterAttempt1.sequenceDeliveryProgress.welcome;
  assert.deepEqual(progress1.deliveredIndexes, [0, 1]);
  assert.deepEqual(progress1.pendingIndexes, [2, 3, 4]);

  // Fix item 3
  templates[2].__fail = false;

  // Attempt 2: retry sends only items 3, 4, 5 (does NOT resend 1 and 2)
  const attempt2 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(attempt2.success, true);
  assert.equal(attempt2.completed, true);
  assert.equal(attempt2.deliveredCount, 5);

  // Total templates sent: 3 (attempt 1) + 3 (attempt 2 for tpl 3, 4, 5) = 6 total forward invocations
  assert.equal(env.sentTemplatesLog.length, 6);
  assert.equal(env.sentTemplatesLog[3].template.key.id, "tpl_3");
  assert.equal(env.sentTemplatesLog[4].template.key.id, "tpl_4");
  assert.equal(env.sentTemplatesLog[5].template.key.id, "tpl_5");

  // Fully marked sent now
  const profileAfterAttempt2 = env.profiles.get("bot_1:" + customerJid);
  assert.equal(profileAfterAttempt2?.welcomeSequenceSent, true);
});

// ----------------------------------------------------
// Requirement 11 & 25: Multi-Process Race Test (Distributed Claim)
// ----------------------------------------------------

test("Requirement 25: multi-process race test: concurrent first messages send Welcome exactly once without duplicate sends", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-b8f345e550c3@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Hello!" } },
    { key: { id: "tpl_2" }, message: { conversation: "Catalog" } },
  ];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  // Simulate two concurrent requests arriving simultaneously
  const [resA, resB] = await Promise.all([
    deliverWelcomeSequence({
      customerJid,
      templates,
      config,
      source: "automatic_welcome",
      forwardTemplate: env.forwardTemplateMock,
      userId: "user_1",
      botId: "bot_1",
      dataOwnerKey: "bot_1",
    }),
    deliverWelcomeSequence({
      customerJid,
      templates,
      config,
      source: "automatic_welcome",
      forwardTemplate: env.forwardTemplateMock,
      userId: "user_1",
      botId: "bot_1",
      dataOwnerKey: "bot_1",
    }),
  ]);

  // One winner succeeds, one is skipped due to active claim
  const winners = [resA, resB].filter((r) => r.success);
  const claimSkipped = [resA, resB].filter((r) => r.skippedDueToClaim);

  assert.equal(winners.length, 1);
  assert.equal(claimSkipped.length, 1);
  assert.equal(winners[0].completed, true);

  // Exactly 2 template sends (tpl_1, tpl_2), NO duplicates
  assert.equal(env.sentTemplatesLog.length, 2);

  // Exactly one sent marker
  const profile = env.profiles.get("bot_1:" + customerJid);
  assert.equal(profile?.welcomeSequenceSent, true);
});

// ----------------------------------------------------
// Requirement 17: Wallet Low Balance
// ----------------------------------------------------

test("Requirement 17: low wallet balance prevents send and does not mark welcome as sent", async () => {
  const env = createMockEnvironment();
  env.setWalletAllowed(false); // Simulate low balance

  const customerJid = "contact-068e9b682683@example.invalid";
  const templates = [{ key: { id: "tpl_1" }, message: { conversation: "Welcome" } }];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  const result = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "wallet_balance_too_low");
  assert.equal(result.pending, true);
  assert.equal(env.sentTemplatesLog.length, 0);

  // Profile must NOT be marked sent
  const profile = env.profiles.get("bot_1:" + customerJid);
  assert.equal(profile?.welcomeSequenceSent, undefined);
});

// ----------------------------------------------------
// Requirement 20: Disabled Welcome
// ----------------------------------------------------

test("Requirement 20: disabled welcome does not send and does not mark customer sent", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-797d5190d3cb@example.invalid";
  const templates = [{ key: { id: "tpl_1" }, message: { conversation: "Welcome" } }];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: false, name: "Welcome Flow" };

  const result = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "disabled");
  assert.equal(env.sentTemplatesLog.length, 0);

  const profile = env.profiles.get("bot_1:" + customerJid);
  assert.equal(profile?.welcomeSequenceSent, undefined);
});

// ----------------------------------------------------
// Requirement 21: Zero Templates
// ----------------------------------------------------

test("Requirement 21: zero templates does not send and does not mark customer sent", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-f93433a815a9@example.invalid";
  const templates: any[] = [];
  const config = { groupJid: "contact-59e45739340c@example.invalid", enabled: true, name: "Welcome Flow" };

  const result = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, "templates_not_loaded");
  assert.equal(env.sentTemplatesLog.length, 0);

  const profile = env.profiles.get("bot_1:" + customerJid);
  assert.equal(profile?.welcomeSequenceSent, undefined);
});

// ----------------------------------------------------
// Requirement 26: Reset Tests Suite
// ----------------------------------------------------

test("Requirement 26-B & 26-C: WhatsApp authorized 'reset' clears templates and is not indexed as template", () => {
  assert.equal(isExactResetCommand("reset"), true);
  assert.equal(isExactResetCommand("RESET"), true);
  assert.equal(isExactResetCommand("- reset"), true);
  assert.equal(isExactResetCommand("please reset"), false);
});

test("Requirement 26-D: unauthorized group participant cannot reset", () => {
  assert.equal(
    isAuthorizedResetSender({
      fromMe: false,
      senderJid: "contact-0e83d00e5fc3@example.invalid",
      adminNumber: "130550897135",
    }),
    false
  );
  assert.equal(
    isAuthorizedResetSender({
      fromMe: true,
      senderJid: "contact-83742b4558c8@example.invalid",
    }),
    true
  );
});

test("Requirement 26-E, F, G, H, I, J: reset preserves JID, instructions, enabled, autoSync, shortcut, and customer sent history", () => {
  const welcomeGroup = {
    id: "welcome_grp_1",
    name: "Welcome Flow",
    purpose: "welcome",
    jid: "contact-7d8804e41169@example.invalid",
    instructions: "Greet warm and professional",
    autoSync: true,
    enabled: true,
    shortcutCode: "welcome",
    templateCount: 5,
  };

  const localStore = {
    "contact-7d8804e41169@example.invalid": [{ key: { id: "tpl_1" } }, { key: { id: "tpl_2" } }],
  };

  const customerHistory = {
    "customer_1": { welcomeSequenceSent: true, welcomeSequenceSentAt: 1700000000 },
  };

  // Reset operation
  applyGroupResetToStore(localStore, "contact-7d8804e41169@example.invalid");
  welcomeGroup.templateCount = 0;

  // Templates cleared
  assert.equal(localStore["contact-7d8804e41169@example.invalid"].length, 0);
  assert.equal(welcomeGroup.templateCount, 0);

  // Group config preserved intact
  assert.equal(welcomeGroup.jid, "contact-7d8804e41169@example.invalid");
  assert.equal(welcomeGroup.instructions, "Greet warm and professional");
  assert.equal(welcomeGroup.enabled, true);
  assert.equal(welcomeGroup.autoSync, true);
  assert.equal(welcomeGroup.shortcutCode, "welcome");

  // Customer history preserved intact
  assert.equal(customerHistory.customer_1.welcomeSequenceSent, true);
});

test("Requirement 26-K: stale persisted Welcome templates cannot resurrect after reset", () => {
  const resetTimestamp = 1700005000000;
  const staleMessages = [
    { key: { id: "old_tpl_1" }, messageTimestamp: 1700001000 },
    { key: { id: "old_tpl_2" }, messageTimestamp: 1700004000 },
    { key: { id: "fresh_tpl_1" }, messageTimestamp: 1700006000 },
  ];

  const restored = filterMessagesAfterReset(staleMessages, resetTimestamp);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].key.id, "fresh_tpl_1");
});

// ----------------------------------------------------
// Section: Final Durability Hardening Tests (A to K)
// ----------------------------------------------------

test("Test A: markWelcomeSequence persistence failure cannot report complete and allows safe retry", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-33011000e273@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Item 1" } },
    { key: { id: "tpl_2" }, message: { conversation: "Item 2" } },
    { key: { id: "tpl_3" }, message: { conversation: "Item 3" } },
    { key: { id: "tpl_4" }, message: { conversation: "Item 4" } },
    { key: { id: "tpl_5" }, message: { conversation: "Item 5" } },
  ];
  const config = { groupJid: "contact-b537d6b121aa@example.invalid", enabled: true, name: "Welcome Flow" };

  // Simulate Appwrite persistence failure on markWelcomeSequence
  env.setMarkWelcomeFailure(true);

  const res = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // All 5 items were forwarded
  assert.equal(env.sentTemplatesLog.length, 5);
  // BUT result cannot report complete because durable sent marker was not confirmed
  assert.equal(res.completed, false);
  assert.equal(res.success, false);
  assert.equal(res.reason, "durable_sent_marker_persistence_failed");
  assert.equal(res.pending, true);

  // Claim is not permanently finalized
  const { getAtomicClaimStatus } = await import("./canonical-claim-service.ts");
  const claimStatus = await getAtomicClaimStatus(`welcome_claim:bot_1:${customerJid}`);
  assert.equal(claimStatus?.finalized, undefined);
});

test("Test B: progress persistence failure uses outbound receipts as recovery evidence and avoids resend", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-f3f3cc5038ff@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Item 1" } },
    { key: { id: "tpl_2" }, message: { conversation: "Item 2" } },
    { key: { id: "tpl_3" }, message: { conversation: "Item 3" }, __fail: true },
  ];
  const config = { groupJid: "contact-1ca415494604@example.invalid", enabled: true, name: "Welcome Flow" };

  // Simulate profile update failure during progress save
  env.setUpdateProfileFailure(true);

  const res1 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Progress update failed, but returns recoverable state
  assert.equal(res1.completed, false);
  assert.equal(res1.pending, true);
  assert.equal(res1.reason, "partial_sent_progress_persistence_failed");

  // Outbound receipts exist for items 1 and 2
  assert.equal(env.outboundReceipts.size, 2);

  // Now fix item 3 and restore profile update
  templates[2].__fail = false;
  env.setUpdateProfileFailure(false);

  // Retry
  const res2 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res2.success, true);
  assert.equal(res2.completed, true);

  // Total forwards across both attempts:
  // Attempt 1: tpl_1, tpl_2, tpl_3 (failed) = 3
  // Attempt 2: tpl_3 only (tpl_1 and tpl_2 skipped via receipt evidence) = 1
  // Total = 4 forwards
  assert.equal(env.sentTemplatesLog.length, 4);
  assert.equal(env.sentTemplatesLog[3].template.key.id, "tpl_3");
});

test("Test C: completion marker retry without media resend", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-f6a5cb6b570a@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Item 1" } },
    { key: { id: "tpl_2" }, message: { conversation: "Item 2" } },
    { key: { id: "tpl_3" }, message: { conversation: "Item 3" } },
    { key: { id: "tpl_4" }, message: { conversation: "Item 4" } },
    { key: { id: "tpl_5" }, message: { conversation: "Item 5" } },
  ];
  const config = { groupJid: "contact-2429476cfe4a@example.invalid", enabled: true, name: "Welcome Flow" };

  // Run 1: all 5 sent, but markWelcomeSequence fails
  env.setMarkWelcomeFailure(true);

  const res1 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res1.completed, false);
  assert.equal(env.sentTemplatesLog.length, 5);

  // Run 2: markWelcomeSequence now succeeds
  env.setMarkWelcomeFailure(false);

  const res2 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res2.success, true);
  assert.equal(res2.completed, true);

  // Exactly 0 new WhatsApp forwards on retry! Total remains 5
  assert.equal(env.sentTemplatesLog.length, 5);
  assert.equal(env.profiles.get("bot_1:" + customerJid)?.welcomeSequenceSent, true);
});

test("Test D: stable-ID retry after template reorder", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-4de2d0acf056@example.invalid";
  const initialTemplates = [
    { key: { id: "tpl_A" }, message: { conversation: "A" } },
    { key: { id: "tpl_B" }, message: { conversation: "B" } },
    { key: { id: "tpl_C" }, message: { conversation: "C" }, __fail: true },
    { key: { id: "tpl_D" }, message: { conversation: "D" } },
  ];
  const config = { groupJid: "contact-2f9a79968b1e@example.invalid", enabled: true, name: "Welcome Flow" };

  // Attempt 1: A and B delivered, C fails
  const res1 = await deliverWelcomeSequence({
    customerJid,
    templates: initialTemplates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res1.completed, false);
  assert.equal(res1.deliveredCount, 2);

  // Before retry, templates are refreshed/reordered with new template X inserted:
  // [A, B, X, C, D]
  const reorderedTemplates = [
    { key: { id: "tpl_A" }, message: { conversation: "A" } },
    { key: { id: "tpl_B" }, message: { conversation: "B" } },
    { key: { id: "tpl_X" }, message: { conversation: "X" } },
    { key: { id: "tpl_C" }, message: { conversation: "C" } }, // fixed
    { key: { id: "tpl_D" }, message: { conversation: "D" } },
  ];

  // Attempt 2: retry
  const res2 = await deliverWelcomeSequence({
    customerJid,
    templates: reorderedTemplates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res2.success, true);
  assert.equal(res2.completed, true);

  // Verify send sequence across both runs:
  // Run 1: tpl_A, tpl_B, tpl_C (fail)
  // Run 2: tpl_X, tpl_C, tpl_D
  // Total = 6 forward calls
  assert.equal(env.sentTemplatesLog.length, 6);
  assert.equal(env.sentTemplatesLog[0].template.key.id, "tpl_A");
  assert.equal(env.sentTemplatesLog[1].template.key.id, "tpl_B");
  assert.equal(env.sentTemplatesLog[2].template.key.id, "tpl_C"); // failed
  assert.equal(env.sentTemplatesLog[3].template.key.id, "tpl_X"); // newly sent
  assert.equal(env.sentTemplatesLog[4].template.key.id, "tpl_C"); // sent
  assert.equal(env.sentTemplatesLog[5].template.key.id, "tpl_D"); // sent

  // Confirm NO duplicate A or B
  const sentIds = env.sentTemplatesLog.filter(s => !s.template.__fail).map(s => s.template.key.id);
  assert.deepEqual(sentIds, ["tpl_A", "tpl_B", "tpl_X", "tpl_C", "tpl_D"]);
});

test("Test E: reset during partial Welcome preserves sent history and isolates generations", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-25b01cca1849@example.invalid";
  const groupJid = "contact-268d4f7f16a4@example.invalid";

  const configOld = {
    groupJid,
    enabled: true,
    name: "Welcome Flow",
    groupResetAt: { [groupJid]: 1000 },
  };

  const oldTemplates = [
    { key: { id: "tpl_A" }, message: { conversation: "A" } },
    { key: { id: "tpl_B" }, message: { conversation: "B" } },
    { key: { id: "tpl_C" }, message: { conversation: "C" }, __fail: true },
  ];

  // 1. Partial delivery under old generation (1000)
  await deliverWelcomeSequence({
    customerJid,
    templates: oldTemplates,
    config: configOld,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(env.sentTemplatesLog.length, 3); // A, B, C(fail)

  // 2. Owner resets templates and syncs new templates D, E, F under new generation (2000)
  const configNew = {
    groupJid,
    enabled: true,
    name: "Welcome Flow",
    groupResetAt: { [groupJid]: 2000 },
  };
  const newTemplates = [
    { key: { id: "tpl_D" }, message: { conversation: "D" } },
    { key: { id: "tpl_E" }, message: { conversation: "E" } },
    { key: { id: "tpl_F" }, message: { conversation: "F" } },
  ];

  // 3. Existing partially-served customer triggers retry/check -> must NOT receive D, E, F!
  const retryRes = await deliverWelcomeSequence({
    customerJid,
    templates: newTemplates,
    config: configNew,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(retryRes.alreadySent, true);
  assert.equal(retryRes.reason, "generation_reset");
  // No new sends to customer 1!
  assert.equal(env.sentTemplatesLog.length, 3);

  // 4. Genuinely new customer sends first message -> receives D, E, F
  const newCustomerJid = "contact-5fde6e2a14d3@example.invalid";
  const newCustRes = await deliverWelcomeSequence({
    customerJid: newCustomerJid,
    templates: newTemplates,
    config: configNew,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(newCustRes.success, true);
  assert.equal(newCustRes.deliveredCount, 3);
  // Total forwards = 3 (old) + 3 (new customer) = 6
  assert.equal(env.sentTemplatesLog.length, 6);
  assert.equal(env.sentTemplatesLog[3].template.key.id, "tpl_D");
  assert.equal(env.sentTemplatesLog[4].template.key.id, "tpl_E");
  assert.equal(env.sentTemplatesLog[5].template.key.id, "tpl_F");
});

test("Test F: lease heartbeat beyond 60 seconds prevents duplicate delivery", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-37a7134ade5d@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Slow 1" } },
    { key: { id: "tpl_2" }, message: { conversation: "Slow 2" } },
  ];
  const config = { groupJid: "contact-9b52971b822f@example.invalid", enabled: true, name: "Welcome Flow" };

  const { renewAtomicClaim } = await import("./canonical-claim-service.ts");

  // Worker 1 forwardTemplate simulates a long sequence delivery with heartbeat renewals
  const forwardWithHeartbeat = async (jid: string, template: any, isMedia: any, options: any) => {
    // Simulate periodic heartbeat renewing the claim
    await renewAtomicClaim(`welcome_claim:bot_1:${jid}`, "worker_long_1", 60000, Date.now() + 70000);
    return env.forwardTemplateMock(jid, template, isMedia, options);
  };

  // Start Worker 1
  const res1 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: forwardWithHeartbeat,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res1.success, true);
  assert.equal(res1.completed, true);

  // Worker 2 attempting to run now sees already sent
  const res2 = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(res2.alreadySent, true);
  // Total items sent across both workers is exactly 2 (zero duplicates)
  assert.equal(env.sentTemplatesLog.length, 2);
});

test("Test G: two-worker expired-lease takeover race: true atomic revision CAS", async () => {
  __resetAtomicClaimTestDeps(true);
  __clearMemoryClaimsForTest();

  const { acquireAtomicClaim, getAtomicClaimStatus } = await import("./canonical-claim-service.ts");
  const claimKey = "welcome_claim:test_bot:test_cust_race";

  // Worker 1 acquires claim initially at T = 1000, expires at T = 2000
  const init = await acquireAtomicClaim(claimKey, "worker_1", 1000, 1000);
  assert.equal(init.acquired, true);

  // At T = 3000, claim has expired
  const nowMs = 3000;
  const statusBefore = await getAtomicClaimStatus(claimKey);
  assert.equal(Number(statusBefore?.expiresAt) < nowMs, true);
  assert.equal(statusBefore?.revision, 1);

  // Worker A and Worker B concurrently attempt to takeover the expired claim at T = 3000
  const [resA, resB] = await Promise.all([
    acquireAtomicClaim(claimKey, "worker_A", 10000, nowMs),
    acquireAtomicClaim(claimKey, "worker_B", 10000, nowMs),
  ]);

  // Exactly ONE worker won the takeover!
  const winners = [resA, resB].filter(r => r.acquired);
  const losers = [resA, resB].filter(r => !r.acquired);
  assert.equal(winners.length, 1, "Exactly one worker must win expired claim takeover");
  assert.equal(losers.length, 1, "The other worker must fail takeover");

  // Main claim record advanced revision to 2 and is held by the winner
  const statusAfter = await getAtomicClaimStatus(claimKey);
  assert.equal(statusAfter?.revision, 2);
  assert.equal(statusAfter?.workerId, winners[0].holderWorkerId);
});

test("Test H: crash then two-worker recovery delivers missing items once with single billing", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-ccdd5b9bc789@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Item 1" } },
    { key: { id: "tpl_2" }, message: { conversation: "Item 2" } },
    { key: { id: "tpl_3" }, message: { conversation: "Item 3" } },
  ];
  const config = { groupJid: "contact-4a98dff488f6@example.invalid", enabled: true, name: "Welcome Flow" };

  // Worker 1 sends 1 and 2, then simulates crash before item 3
  let sentCount = 0;
  const crashForward = async (jid: string, tpl: any, isMedia: any, options: any) => {
    sentCount++;
    if (sentCount === 3) {
      throw new Error("Worker 1 simulated crash before sending item 3");
    }
    return env.forwardTemplateMock(jid, tpl, isMedia, options);
  };

  const w1Res = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: crashForward,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(w1Res.completed, false);
  assert.equal(env.sentTemplatesLog.length, 2);

  // Worker 2 and Worker 3 race to recover
  const [rec2, rec3] = await Promise.all([
    deliverWelcomeSequence({
      customerJid,
      templates,
      config,
      source: "welcome_recovery",
      forwardTemplate: env.forwardTemplateMock,
      userId: "user_1",
      botId: "bot_1",
      dataOwnerKey: "bot_1",
    }),
    deliverWelcomeSequence({
      customerJid,
      templates,
      config,
      source: "welcome_recovery",
      forwardTemplate: env.forwardTemplateMock,
      userId: "user_1",
      botId: "bot_1",
      dataOwnerKey: "bot_1",
    }),
  ]);

  // One of the recovery workers succeeds, the other is skipped/holds no claim
  const finishedSuccess = [rec2, rec3].filter(r => r.completed && r.success);
  assert.equal(finishedSuccess.length, 1);

  // Exactly 3 items delivered total (items 1 and 2 were NOT resent)
  assert.equal(env.sentTemplatesLog.length, 3);
  assert.equal(env.sentTemplatesLog[2].template.key.id, "tpl_3");

  // Profile confirmed sent
  assert.equal(env.profiles.get("bot_1:" + customerJid)?.welcomeSequenceSent, true);
});

test("Test I: failed finalizeAtomicClaim reports unconfirmed completion without resending", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-03479a0fdad7@example.invalid";
  const templates = [
    { key: { id: "tpl_1" }, message: { conversation: "Item 1" } },
  ];
  const config = { groupJid: "contact-15fde34bfeeb@example.invalid", enabled: true, name: "Welcome Flow" };

  // Simulate finalizeAtomicClaim failure
  env.setFinalizeClaimFailure(true);

  const res = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Does not report completed=true
  assert.equal(res.completed, false);
  assert.equal(res.reason, "claim_finalization_unconfirmed");

  // But durable sent state IS confirmed
  assert.equal(env.profiles.get("bot_1:" + customerJid)?.welcomeSequenceSent, true);

  // A subsequent attempt never resends
  const retry = await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  assert.equal(retry.alreadySent, true);
  assert.equal(env.sentTemplatesLog.length, 1);
});

test("Test J & K: no duplicate WhatsApp sends and zero double billing across partial resume", async () => {
  const env = createMockEnvironment();
  const customerJid = "contact-96ccc6c2a7b5@example.invalid";
  const templates = [
    { key: { id: "tpl_A" }, message: { conversation: "A" } },
    { key: { id: "tpl_B" }, message: { conversation: "B" }, __fail: true },
    { key: { id: "tpl_C" }, message: { conversation: "C" } },
  ];
  const config = { groupJid: "contact-73d00bad3862@example.invalid", enabled: true, name: "Welcome Flow" };

  // Run 1: A succeeds, B fails
  await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Run 2: B fixed, B and C succeed
  templates[1].__fail = false;
  await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Run 3: retry called again for any reason
  await deliverWelcomeSequence({
    customerJid,
    templates,
    config,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Requirement J: No duplicate sends for A or C
  const sentSuccessfulIds = env.sentTemplatesLog.filter(s => !s.template.__fail).map(s => s.template.key.id);
  assert.deepEqual(sentSuccessfulIds, ["tpl_A", "tpl_B", "tpl_C"]);

  // Requirement K: Unique billing event IDs for delivered items
  const billingEventIds = env.sentTemplatesLog.filter(s => !s.template.__fail).map(s => s.options.billingEventId);
  const uniqueBillingEvents = new Set(billingEventIds);
  assert.equal(billingEventIds.length, uniqueBillingEvents.size);
});

// ----------------------------------------------------
// Section: Runtime Wiring & Reset Generation Tests
// ----------------------------------------------------

test("Runtime wiring: resolveRuntimeWelcomePayload extracts authoritative reset timestamp and builds generationId", () => {
  const botConfig = {
    groups: [
      { id: "g1", purpose: "welcome", jid: "contact-3b022987d128@example.invalid", name: "Welcome Flow", enabled: true },
    ],
    groupResetAt: {
      "contact-3b022987d128@example.invalid": 1710009999,
    },
  };
  const templates = [{ key: { id: "t1" } }];

  const payload = resolveRuntimeWelcomePayload(botConfig, templates);
  assert.ok(payload);
  assert.equal(payload.groupJid, "contact-3b022987d128@example.invalid");
  assert.equal(payload.groupResetAt, 1710009999);
  assert.equal(payload.generationId, "contact-3b022987d128@example.invalid:gen_1710009999");
  assert.equal(payload.config.groupResetAt, 1710009999);
  assert.equal(payload.config.generationId, "contact-3b022987d128@example.invalid:gen_1710009999");
  assert.equal(payload.templates.length, 1);
});

test("Runtime wiring: automatic, recovery, and pending retry paths use same authoritative generation", async () => {
  const env = createMockEnvironment();
  const groupJid = "contact-09878ba10ee7@example.invalid";
  const resetAt = 1715000000;
  const botConfig = {
    groups: [{ id: "welcome_grp", purpose: "welcome", jid: groupJid, name: "Welcome", enabled: true }],
    groupResetAt: { [groupJid]: resetAt },
  };
  const templates = [{ key: { id: "tpl_1" }, message: { conversation: "Hello" } }];

  const runtimePayload = resolveRuntimeWelcomePayload(botConfig, templates);
  assert.ok(runtimePayload);
  assert.equal(runtimePayload.generationId, `${groupJid}:gen_${resetAt}`);

  // 1. Automatic path
  const autoRes = await processAutomaticWelcomeSequence(
    {} as any,
    "contact-4eb0566c8dc9@example.invalid",
    "Customer 1",
    { key: { id: "m1", fromMe: false } },
    runtimePayload,
    [],
    async () => {},
    env.forwardTemplateMock,
    [],
    new Set(),
    { emit: () => {} } as any
  );
  assert.equal(autoRes, true);

  // 2. Recovery path (ai-handler)
  const recoveryRes = await deliverWelcomeSequence({
    customerJid: "contact-d6360023e322@example.invalid",
    templates: runtimePayload.templates,
    config: runtimePayload.config,
    groupResetAt: runtimePayload.groupResetAt,
    generationId: runtimePayload.generationId,
    source: "welcome_recovery",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(recoveryRes.success, true);
  assert.equal(recoveryRes.completed, true);

  // 3. Pending retry path (bot-worker interval)
  const retryRes = await deliverWelcomeSequence({
    customerJid: "contact-f0388bba0786@example.invalid",
    templates: runtimePayload.templates,
    config: runtimePayload.config,
    groupResetAt: runtimePayload.groupResetAt,
    generationId: runtimePayload.generationId,
    source: "pending_welcome_retry",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(retryRes.success, true);
  assert.equal(retryRes.completed, true);
});

test("Realistic reset during partial Welcome: real runtime assembly prevents obsolete customer receiving new templates", async () => {
  const env = createMockEnvironment();
  const groupJid = "contact-ca7e3c22d5fc@example.invalid";
  const customerJid = "contact-d0abffc64d26@example.invalid";

  // Phase 1: Real runtime botConfig with empty groupResetAt
  const botConfig: any = {
    groups: [{ id: "grp_welcome", purpose: "welcome", jid: groupJid, name: "Welcome Flow", enabled: true }],
    groupResetAt: {},
  };
  const initialTemplates = [
    { key: { id: "tpl_A" }, message: { conversation: "A" } },
    { key: { id: "tpl_B" }, message: { conversation: "B" } },
    { key: { id: "tpl_C" }, message: { conversation: "C" }, __fail: true },
  ];

  // Resolve runtime payload as done in bot-worker
  const initialPayload = resolveRuntimeWelcomePayload(botConfig, initialTemplates);
  assert.ok(initialPayload);
  assert.equal(initialPayload.generationId, `${groupJid}:gen_0`);

  // Partial delivery
  const res1 = await deliverWelcomeSequence({
    customerJid,
    templates: initialPayload.templates,
    config: initialPayload.config,
    groupResetAt: initialPayload.groupResetAt,
    generationId: initialPayload.generationId,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });
  assert.equal(res1.completed, false);
  assert.equal(res1.deliveredCount, 2);

  // Phase 2: Content Library performs group reset
  const RESET_TIMESTAMP = 1720000000;
  botConfig.groupResetAt[groupJid] = RESET_TIMESTAMP;

  // New templates synced
  const newTemplates = [
    { key: { id: "tpl_D" }, message: { conversation: "D" } },
    { key: { id: "tpl_E" }, message: { conversation: "E" } },
    { key: { id: "tpl_F" }, message: { conversation: "F" } },
  ];

  // Runtime re-assembles welcome payload from botConfig
  const rebuiltPayload = resolveRuntimeWelcomePayload(botConfig, newTemplates);
  assert.ok(rebuiltPayload);
  assert.equal(rebuiltPayload.generationId, `${groupJid}:gen_${RESET_TIMESTAMP}`);

  // Phase 3: Partial customer runs welcome recovery/retry
  const recoveryRes = await deliverWelcomeSequence({
    customerJid,
    templates: rebuiltPayload.templates,
    config: rebuiltPayload.config,
    groupResetAt: rebuiltPayload.groupResetAt,
    generationId: rebuiltPayload.generationId,
    source: "welcome_recovery",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Old customer must NOT receive D, E, F!
  assert.equal(recoveryRes.alreadySent, true);
  assert.equal(recoveryRes.reason, "generation_reset");
  assert.equal(recoveryRes.deliveredCount, 0);

  // Sent templates log contains only initial items (A, B, C-fail), NO D/E/F!
  const allForwardedIds = env.sentTemplatesLog.map(s => s.template.key.id);
  assert.deepEqual(allForwardedIds, ["tpl_A", "tpl_B", "tpl_C"]);

  // Phase 4: Genuinely new customer arrives
  const newCustomerJid = "contact-381cabc7d3ff@example.invalid";
  const newCustRes = await deliverWelcomeSequence({
    customerJid: newCustomerJid,
    templates: rebuiltPayload.templates,
    config: rebuiltPayload.config,
    groupResetAt: rebuiltPayload.groupResetAt,
    generationId: rebuiltPayload.generationId,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Genuinely new customer receives new templates D, E, F
  assert.equal(newCustRes.completed, true);
  assert.equal(newCustRes.success, true);
  assert.equal(newCustRes.deliveredCount, 3);
  const newCustForwarded = env.sentTemplatesLog.filter(s => s.jid === newCustomerJid).map(s => s.template.key.id);
  assert.deepEqual(newCustForwarded, ["tpl_D", "tpl_E", "tpl_F"]);
});

test("Generation-mismatch persistence failure does not falsely report alreadySent and recovers on retry", async () => {
  const env = createMockEnvironment();
  const groupJid = "contact-6fd014e5ece2@example.invalid";
  const customerJid = "contact-b7e0725d1330@example.invalid";

  const botConfig: any = {
    groups: [{ id: "grp_welcome", purpose: "welcome", jid: groupJid, name: "Welcome Flow", enabled: true }],
    groupResetAt: {},
  };
  const initialTemplates = [
    { key: { id: "tpl_1" }, message: { conversation: "1" } },
    { key: { id: "tpl_2" }, message: { conversation: "2" }, __fail: true },
  ];
  const initialPayload = resolveRuntimeWelcomePayload(botConfig, initialTemplates);
  assert.ok(initialPayload);

  // Partial delivery
  await deliverWelcomeSequence({
    customerJid,
    templates: initialPayload.templates,
    config: initialPayload.config,
    groupResetAt: initialPayload.groupResetAt,
    generationId: initialPayload.generationId,
    source: "automatic_welcome",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Group reset occurs
  botConfig.groupResetAt[groupJid] = 1729000000;
  const newTemplates = [
    { key: { id: "tpl_X" }, message: { conversation: "X" } },
    { key: { id: "tpl_Y" }, message: { conversation: "Y" } },
  ];
  const rebuiltPayload = resolveRuntimeWelcomePayload(botConfig, newTemplates);
  assert.ok(rebuiltPayload);

  // Simulate persistence failure when writing markWelcomeSequence during generation reset
  env.setMarkWelcomeFailure(true);

  const failRes = await deliverWelcomeSequence({
    customerJid,
    templates: rebuiltPayload.templates,
    config: rebuiltPayload.config,
    groupResetAt: rebuiltPayload.groupResetAt,
    generationId: rebuiltPayload.generationId,
    source: "welcome_recovery",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // MUST NOT report alreadySent=true when persistence failed!
  assert.equal(failRes.alreadySent, false);
  assert.equal(failRes.completed, false);
  assert.equal(failRes.pending, true);
  assert.equal(failRes.reason, "generation_reset_sent_marker_persistence_failed");

  // Zero new templates forwarded
  const forwardedAfterReset = env.sentTemplatesLog.filter(s => s.template.key.id === "tpl_X" || s.template.key.id === "tpl_Y");
  assert.equal(forwardedAfterReset.length, 0);

  // Now simulate persistence healthy again
  env.setMarkWelcomeFailure(false);

  // Retry
  const retryRes = await deliverWelcomeSequence({
    customerJid,
    templates: rebuiltPayload.templates,
    config: rebuiltPayload.config,
    groupResetAt: rebuiltPayload.groupResetAt,
    generationId: rebuiltPayload.generationId,
    source: "welcome_recovery",
    forwardTemplate: env.forwardTemplateMock,
    userId: "user_1",
    botId: "bot_1",
    dataOwnerKey: "bot_1",
  });

  // Now markWelcomeSequence succeeds, customer safely blocked from new generation
  assert.equal(retryRes.alreadySent, true);
  assert.equal(retryRes.reason, "generation_reset");

  // Still zero new templates sent
  const forwardedFinal = env.sentTemplatesLog.filter(s => s.template.key.id === "tpl_X" || s.template.key.id === "tpl_Y");
  assert.equal(forwardedFinal.length, 0);
});
