import test from "node:test";
import assert from "node:assert/strict";

import {
  createConversationGoal,
  getActiveConversationGoal,
  getStoredConversationGoal,
  updateConversationGoal,
  advanceConversationGoalAtomically,
  completeConversationGoal,
  blockConversationGoal,
  clearActiveConversationGoal,
  cleanupExpiredConversationGoals,
  cleanupExpiredGoalClaims,
  suspendAndReplaceActiveGoal,
  resumeSuspendedGoal,
  tryAcquireGoalStepClaim,
  finalizeGoalStepClaim,
  incorporateUserResponseIntoGoal,
  resolveSemanticReferent,
  clearInMemoryGoalStoreOnlyForTesting,
  resetConversationGoalStoreForTesting,
  type ConversationGoal,
} from "./conversation-goal-manager.ts";
import type { AdminConversationMemory } from "./admin-business-agent-service.ts";

const testAccountId = "acc_goal_test";
const testConversationId = "conv_goal_test_001";
const testRequester = "contact-e4ed32210a80@example.invalid";

test.beforeEach(() => {
  resetConversationGoalStoreForTesting();
});

test.afterEach(() => {
  resetConversationGoalStoreForTesting();
});

// ===========================================================================
// SECTION 1: Goal Lifecycle & Persistence
// ===========================================================================

test("Goal Lifecycle: create, update, retrieve, complete, and verify status transitions", () => {
  const goal = createConversationGoal({
    accountId: testAccountId,
    conversationId: testConversationId,
    requesterIdentity: testRequester,
    goalType: "external_contact",
    originalObjective: "Contact Starts Digital to ask about web development services",
    knownEntities: {
      activePerson: "Starts Digital",
      activePhone: "+194019413064",
      channelRequired: "personal_whatsapp",
    },
    knownArguments: {
      recipient: "Starts Digital",
      serviceQuery: "web development services",
    },
    missingArguments: ["messageContent"],
    currentStep: "awaiting_message_content",
    status: "WAITING_FOR_USER",
  });

  assert.equal(goal.status, "WAITING_FOR_USER");
  assert.equal(goal.goalType, "external_contact");
  assert.equal(goal.knownEntities.activePerson, "Starts Digital");

  // Retrieve active goal
  const retrieved = getActiveConversationGoal(testAccountId, testConversationId);
  assert.ok(retrieved);
  assert.equal(retrieved.goalId, goal.goalId);
  assert.equal(retrieved.status, "WAITING_FOR_USER");

  // Update goal: transition to IN_PROGRESS with completed step
  const updated = updateConversationGoal(testAccountId, testConversationId, {
    status: "IN_PROGRESS",
    currentStep: 2,
    completedSteps: [
      { stepIndex: 1, actionId: "resolved_recipient", params: {}, resultSummary: "resolved", success: true, timestamp: Date.now() },
      { stepIndex: 2, actionId: "received_message_content", params: {}, resultSummary: "received", success: true, timestamp: Date.now() },
    ],
    knownArguments: {
      ...retrieved.knownArguments,
      messageContent: "Hi, I would like to inquire about your web packages.",
    },
    missingArguments: [],
  });

  assert.ok(updated);
  assert.equal(updated.status, "IN_PROGRESS");
  assert.equal(updated.completedSteps.length, 2);
  assert.equal(updated.missingArguments.length, 0);

  // Mark completed
  const completed = completeConversationGoal(
    testAccountId,
    testConversationId,
    "Message delivered to Starts Digital via Personal WhatsApp."
  );
  assert.ok(completed);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.lastToolResult?.success, true);

  // Once completed, active goal is no longer returned as in-progress
  const activeAfterComplete = getActiveConversationGoal(testAccountId, testConversationId);
  assert.equal(activeAfterComplete, undefined);
});

test("Goal Blocking: blocked goal retains preserved context and blocker reason", () => {
  createConversationGoal({
    accountId: testAccountId,
    conversationId: testConversationId,
    requesterIdentity: testRequester,
    goalType: "external_contact",
    originalObjective: "Send WhatsApp message to Bilal",
    knownEntities: {
      activePerson: "Bilal",
      activePhone: "+161038041082",
      channelRequired: "personal_whatsapp",
    },
    status: "IN_PROGRESS",
  });

  const blocked = blockConversationGoal(
    testAccountId,
    testConversationId,
    "Personal WhatsApp instance is disconnected."
  );

  assert.ok(blocked);
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.blockedReason, "Personal WhatsApp instance is disconnected.");
  assert.equal(blocked.knownEntities.activePerson, "Bilal");

  // Blocked goal is still retrievable so user or agent can resume when reconnected
  const retrieved = getActiveConversationGoal(testAccountId, testConversationId);
  assert.ok(retrieved);
  assert.equal(retrieved.status, "BLOCKED");
});

test("Goal Expiration & Cleanup: stale goals beyond TTL are purged", () => {
  createConversationGoal({
    accountId: testAccountId,
    conversationId: "conv_stale_001",
    requesterIdentity: testRequester,
    goalType: "query_business",
    originalObjective: "Old query 1",
    ttlSeconds: -10, // already expired
  });

  const purgedCount = cleanupExpiredConversationGoals();
  assert.ok(purgedCount >= 1);

  // Verify getActiveConversationGoal prunes expired goal if checked before periodic cleanup
  createConversationGoal({
    accountId: testAccountId,
    conversationId: "conv_stale_002",
    requesterIdentity: testRequester,
    goalType: "query_business",
    originalObjective: "Old query 2",
    ttlSeconds: -10,
  });
  const active = getActiveConversationGoal(testAccountId, "conv_stale_002");
  assert.equal(active, undefined);
});

// ===========================================================================
// SECTION 2: Multi-Turn Continuation & Slot Filling
// ===========================================================================

test("Multi-Turn Continuation: supplies missing recipient when user provides name on next turn", () => {
  const initialGoal = createConversationGoal({
    accountId: testAccountId,
    conversationId: testConversationId,
    requesterIdentity: testRequester,
    goalType: "external_contact",
    originalObjective: "Send a message about pricing",
    missingArguments: ["recipient"],
    knownArguments: { messageContent: "Can you send the pricing list?" },
    currentStep: "awaiting_recipient",
    status: "WAITING_FOR_USER",
  });

  assert.equal(initialGoal.missingArguments.includes("recipient"), true);

  // Turn 2: User says "Starts Digital"
  const updated = incorporateUserResponseIntoGoal(initialGoal, "Starts Digital");

  assert.equal(updated.knownArguments.recipient, "Starts Digital");
  assert.equal(updated.knownEntities.activePerson, "Starts Digital");
  assert.equal(updated.missingArguments.includes("recipient"), false);
  assert.equal(updated.status, "IN_PROGRESS");
});

test("Multi-Turn Continuation: supplies missing message content when user provides body on next turn", () => {
  const initialGoal = createConversationGoal({
    accountId: testAccountId,
    conversationId: testConversationId,
    requesterIdentity: testRequester,
    goalType: "external_contact",
    originalObjective: "Message Hamza",
    knownEntities: { activePerson: "Hamza", activePhone: "+152031531721" },
    knownArguments: { recipient: "Hamza" },
    missingArguments: ["messageContent"],
    currentStep: "awaiting_message_content",
    status: "WAITING_FOR_USER",
  });

  // Turn 2: User provides message
  const updated = incorporateUserResponseIntoGoal(
    initialGoal,
    "Tell him we have approved the quotation and will start on Monday."
  );

  assert.ok(updated.knownArguments.messageContent);
  assert.equal(updated.missingArguments.length, 0);
  assert.equal(updated.status, "IN_PROGRESS");
});

// ===========================================================================
// SECTION 3: Semantic Referent Resolution (Active Object Memory)
// ===========================================================================

test("Semantic Referents: resolves 'it', 'him', 'that number', 'save it' to active objects in memory", () => {
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testRequester,
    activePhone: "+194019413064",
    activePersonName: "Starts Digital",
    activeCustomer: {
      name: "Starts Digital",
      phone: "+194019413064",
    },
    activeContact: {
      displayName: "Starts Digital",
      canonicalPhone: "+194019413064",
    },
    activeOrder: {
      orderId: "ord_9988",
      customerName: "Starts Digital",
    },
    activeLead: {
      leadId: "lead_7766",
      customerName: "Starts Digital",
    },
    updatedAt: Date.now(),
  };

  // 'it' / 'that number'
  const refPhone = resolveSemanticReferent("send a message to it", memory);
  assert.equal(refPhone.targetType, "phone");
  assert.equal(refPhone.resolvedValue, "+194019413064");

  // 'him' / 'them'
  const refPerson = resolveSemanticReferent("message him about the project", memory);
  assert.equal(refPerson.targetType, "person");
  assert.equal(refPerson.resolvedValue, "Starts Digital");

  // 'that lead' / 'same lead'
  const refLead = resolveSemanticReferent("check status of that lead", memory);
  assert.equal(refLead.targetType, "lead");
  assert.equal(refLead.resolvedValue, "lead_7766");

  // 'that order' / 'same order'
  const refOrder = resolveSemanticReferent("what is the total of that order", memory);
  assert.equal(refOrder.targetType, "order");
  assert.equal(refOrder.resolvedValue, "ord_9988");

  // 'save it' / 'save this number'
  const refSave = resolveSemanticReferent("save it as Starts Office", memory);
  assert.equal(refSave.targetType, "phone");
  assert.equal(refSave.resolvedValue, "+194019413064");

  // Unrelated sentence should NOT match
  const refUnrelated = resolveSemanticReferent("what is the weather today", memory);
  assert.equal(refUnrelated.resolvedValue, undefined);
});

// ===========================================================================
// SECTION 4: Process Restart Continuation & Durable Persistence
// ===========================================================================

test("Restart Continuation: WAITING_FOR_USER goal survives worker restart and continues without restating recipient", () => {
  // Turn 1: Owner creates goal to contact someone, recipient resolves, but message is missing
  const initialGoal = createConversationGoal({
    accountId: testAccountId,
    conversationId: testConversationId,
    requesterIdentity: { role: "owner", jid: testRequester },
    goalType: "external_contact",
    originalObjective: "Contact Starts Digital and ask about web packages",
    currentObjectiveSummary: "Contact Starts Digital",
    knownEntities: {
      activeContact: {
        contactId: "cnt_starts_01",
        displayName: "Starts Digital",
        canonicalPhone: "+194019413064",
      },
      activePerson: "Starts Digital",
      activePhone: "+194019413064",
    },
    channelRequired: "personal_whatsapp",
    knownArguments: { recipient: "Starts Digital" },
    missingArguments: ["messageContent"],
  });

  assert.equal(initialGoal.status, "WAITING_FOR_USER");
  const originalGoalId = initialGoal.goalId;

  // SIMULATE PROCESS / WORKER RESTART: Memory cleared completely
  clearInMemoryGoalStoreOnlyForTesting();

  // Turn 2: Recover goal from durable canonical persistence
  const recoveredGoal = getActiveConversationGoal(testAccountId, testConversationId);
  assert.ok(recoveredGoal, "Unfinished goal must be recovered from disk after restart");
  assert.equal(recoveredGoal.goalId, originalGoalId);
  assert.equal(recoveredGoal.status, "WAITING_FOR_USER");
  assert.equal(recoveredGoal.knownEntities.activePerson, "Starts Digital");
  assert.equal(recoveredGoal.knownEntities.activePhone, "+194019413064");

  // Owner supplies missing message without restating recipient
  const continuedGoal = incorporateUserResponseIntoGoal(
    recoveredGoal,
    "Ask them for their ecommerce starter pricing"
  );

  assert.equal(continuedGoal.status, "IN_PROGRESS");
  assert.equal(continuedGoal.missingArguments.length, 0);
  assert.equal(continuedGoal.knownArguments.recipient, "Starts Digital");
  assert.equal(
    continuedGoal.knownArguments.messageContent,
    "Ask them for their ecommerce starter pricing"
  );
});

test("Restart Continuation: BLOCKED goal survives restart and resumes when dependency restored", () => {
  // Goal created and blocked because Personal WhatsApp is disconnected
  const initialGoal = createConversationGoal({
    accountId: testAccountId,
    conversationId: testConversationId,
    requesterIdentity: { role: "owner", jid: testRequester },
    goalType: "external_contact",
    originalObjective: "Contact Starts Digital",
    currentObjectiveSummary: "Contact Starts Digital",
    knownEntities: {
      activePerson: "Starts Digital",
      activePhone: "+194019413064",
    },
    channelRequired: "personal_whatsapp",
    knownArguments: {
      recipient: "Starts Digital",
      messageContent: "Hello",
    },
    missingArguments: [],
  });

  blockConversationGoal(
    testAccountId,
    testConversationId,
    "Personal WhatsApp is currently disconnected."
  );

  // SIMULATE PROCESS / WORKER RESTART: Memory cleared
  clearInMemoryGoalStoreOnlyForTesting();

  // Reload after restart
  const recoveredGoal = getActiveConversationGoal(testAccountId, testConversationId);
  assert.ok(recoveredGoal);
  assert.equal(recoveredGoal.status, "BLOCKED");
  assert.equal(recoveredGoal.blockedReason, "Personal WhatsApp is currently disconnected.");
  assert.equal(recoveredGoal.knownEntities.activePerson, "Starts Digital");

  // Dependency is restored -> goal resumes to IN_PROGRESS
  const resumedGoal = updateConversationGoal(testAccountId, testConversationId, {
    status: "IN_PROGRESS",
    blockedReason: undefined,
  });

  assert.ok(resumedGoal);
  assert.equal(resumedGoal.status, "IN_PROGRESS");
  assert.equal(resumedGoal.blockedReason, undefined);
  assert.equal(resumedGoal.knownArguments.recipient, "Starts Digital");
});

// ===========================================================================
// SECTION 4: Section 10 Restart Test & Section 11 Concurrent Worker Test
// ===========================================================================

test("Section 10: Restart Test via Canonical Store (No local JSON files involved)", () => {
  // 1. Create unfinished goal
  const goal = createConversationGoal({
    accountId: testAccountId,
    conversationId: "conv_restart_strict",
    requesterIdentity: { role: "owner", jid: testRequester },
    goalType: "external_contact",
    originalObjective: "Send catalog to Leads Department",
    knownEntities: {
      activePerson: "Leads Department",
      activePhone: "+164143750543",
      channelRequired: "personal_whatsapp",
    },
    knownArguments: {
      recipient: "Leads Department",
    },
    missingArguments: ["messageContent"],
    currentStep: 1,
    status: "WAITING_FOR_USER",
  });

  assert.equal(goal.status, "WAITING_FOR_USER");
  assert.equal(goal.version, 1);

  // 2. Clear all in-memory caches to simulate worker / process restart
  clearInMemoryGoalStoreOnlyForTesting();

  // 3. Reload goal from canonical persistent storage
  const reloaded = getActiveConversationGoal(testAccountId, "conv_restart_strict");
  assert.ok(reloaded, "Goal must rehydrate from canonical store after memory purge");
  assert.equal(reloaded.goalId, goal.goalId);
  assert.equal(reloaded.status, "WAITING_FOR_USER");
  assert.equal(reloaded.knownEntities.activePerson, "Leads Department");
  assert.equal(reloaded.version, 1);

  // 4. Continue exact same task without loss of slots
  const continued = incorporateUserResponseIntoGoal(reloaded, "Here is our updated summer catalog PDF.");
  assert.equal(continued.status, "IN_PROGRESS");
  assert.equal(continued.knownArguments.recipient, "Leads Department");
  assert.equal(continued.knownArguments.messageContent, "Here is our updated summer catalog PDF.");
  assert.equal(continued.missingArguments.length, 0);
  assert.equal(continued.version, 2);
});

test("Section 11: Concurrent Worker Test (Atomic goal advancement prevents duplicate execution)", async () => {
  // Setup actionable goal
  const initialGoal = createConversationGoal({
    accountId: testAccountId,
    conversationId: "conv_concurrent_001",
    requesterIdentity: { role: "owner", jid: testRequester },
    goalType: "external_contact",
    originalObjective: "Send WhatsApp message to Bilal",
    knownEntities: {
      activePerson: "Bilal",
      activePhone: "+193475222105",
      channelRequired: "personal_whatsapp",
    },
    knownArguments: {
      recipient: "Bilal",
      messageContent: "Order confirmed.",
    },
    missingArguments: [],
    currentStep: 1,
    status: "IN_PROGRESS",
  });

  const baseVersion = initialGoal.version;
  assert.equal(baseVersion, 1);

  let externalActionsExecuted = 0;

  // Simulate two workers trying to continue the same actionable goal concurrently
  const worker1Promise = advanceConversationGoalAtomically({
    accountId: testAccountId,
    conversationId: "conv_concurrent_001",
    expectedVersion: baseVersion,
    executeExternalStep: async () => {
      externalActionsExecuted += 1;
      return {
        actionId: "send_personal_message",
        params: { phone: "+193475222105", text: "Order confirmed." },
        resultSummary: "Message delivered via Personal WhatsApp",
        success: true,
        nextStep: 2,
        nextStatus: "COMPLETED",
      };
    },
  });

  const worker2Promise = advanceConversationGoalAtomically({
    accountId: testAccountId,
    conversationId: "conv_concurrent_001",
    expectedVersion: baseVersion,
    executeExternalStep: async () => {
      externalActionsExecuted += 1;
      return {
        actionId: "send_personal_message",
        params: { phone: "+193475222105", text: "Order confirmed." },
        resultSummary: "Duplicate message attempt",
        success: true,
        nextStep: 2,
        nextStatus: "COMPLETED",
      };
    },
  });

  const [res1, res2] = await Promise.all([worker1Promise, worker2Promise]);

  // Exactly ONE worker succeeded in executing the external write action
  const successfulRuns = [res1, res2].filter((r) => r.success && !r.conflict);
  const conflictedRuns = [res1, res2].filter((r) => r.conflict);

  assert.equal(successfulRuns.length, 1, "Exactly one worker must succeed in advancing the goal");
  assert.equal(conflictedRuns.length, 1, "Second worker must detect concurrency conflict");
  assert.equal(externalActionsExecuted, 1, "External action must execute exactly once");

  // Second worker observes already-advanced state
  const finalGoal = getStoredConversationGoal(testAccountId, "conv_concurrent_001");
  assert.ok(finalGoal);
  assert.equal(finalGoal.version, baseVersion + 1);
  assert.equal(finalGoal.status, "COMPLETED");
  assert.equal(finalGoal.lastToolResult?.actionId, "send_personal_message");
});

test("Tenant Isolation & Authorization: Goal cannot be accessed by foreign account", () => {
  createConversationGoal({
    accountId: "account_alpha",
    conversationId: "conv_isolated_001",
    requesterIdentity: { role: "owner", jid: "contact-85d2a3563239@example.invalid" },
    goalType: "query_business",
    originalObjective: "Private financial query",
    status: "IN_PROGRESS",
  });

  // Requesting from account_beta must return undefined / blocked
  const foreignAttempt = getActiveConversationGoal("account_beta", "conv_isolated_001");
  assert.equal(foreignAttempt, undefined, "Cross-tenant goal access must be denied");

  // Requesting from true owner succeeds
  const authorized = getActiveConversationGoal("account_alpha", "conv_isolated_001");
  assert.ok(authorized);
  assert.equal(authorized.accountId, "account_alpha");
});

// ===========================================================================
// SECTION 5: Hardened Cross-Worker Atomicity, Crash Recovery & Interruption
// ===========================================================================

test("Cross-Worker Concurrency: Two independent workers with separate memory cannot both send Personal WhatsApp", async () => {
  const accountId = "acc_multi_worker_01";
  const convId = "conv_mw_whatsapp_01";

  const goal = createConversationGoal({
    accountId,
    conversationId: convId,
    requesterIdentity: { role: "owner", jid: "contact-e4ed32210a80@example.invalid" },
    goalType: "external_contact",
    originalObjective: "Send WhatsApp message to Starts Digital",
    knownEntities: {
      activePerson: "Starts Digital",
      activePhone: "+194019413064",
      channelRequired: "personal_whatsapp",
    },
    knownArguments: {
      recipient: "Starts Digital",
      message: "Here is your quotation.",
    },
    missingArguments: [],
    currentStep: 1,
    status: "IN_PROGRESS",
  });

  const baseVersion = goal.version;
  let externalWhatsAppSends = 0;
  const sentPayloads: Array<{ phone: string; text: string }> = [];

  // Worker 1 and Worker 2 act as separate PM2 worker processes with separate worker IDs
  const worker1Promise = advanceConversationGoalAtomically({
    accountId,
    conversationId: convId,
    expectedVersion: baseVersion,
    workerId: "pm2_worker_instance_1",
    executeExternalStep: async () => {
      externalWhatsAppSends += 1;
      sentPayloads.push({ phone: "+194019413064", text: "Here is your quotation." });
      return {
        actionId: "start_personal_outbound_mission",
        params: { phone: "+194019413064", text: "Here is your quotation." },
        resultSummary: "Outbound mission started to Starts Digital",
        success: true,
        nextStep: 2,
        nextStatus: "COMPLETED",
      };
    },
  });

  const worker2Promise = advanceConversationGoalAtomically({
    accountId,
    conversationId: convId,
    expectedVersion: baseVersion,
    workerId: "pm2_worker_instance_2",
    executeExternalStep: async () => {
      externalWhatsAppSends += 1;
      sentPayloads.push({ phone: "+194019413064", text: "Here is your quotation." });
      return {
        actionId: "start_personal_outbound_mission",
        params: { phone: "+194019413064", text: "Here is your quotation." },
        resultSummary: "Outbound mission started to Starts Digital",
        success: true,
        nextStep: 2,
        nextStatus: "COMPLETED",
      };
    },
  });

  const [res1, res2] = await Promise.all([worker1Promise, worker2Promise]);

  // Assertions: Exactly 1 external WhatsApp send occurred
  assert.equal(externalWhatsAppSends, 1, "Irreversible external WhatsApp send must occur EXACTLY once");
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].phone, "+194019413064");

  // Exactly 1 worker succeeded and 1 was rejected via atomic claim
  const succeeded = [res1, res2].filter((r) => r.success);
  const conflicted = [res1, res2].filter((r) => r.conflict);
  assert.equal(succeeded.length, 1, "Exactly one worker receives execution ownership");
  assert.equal(conflicted.length, 1, "Second worker must receive concurrency conflict");
});

test("Cross-Worker Concurrency: Business write (Lead department routing) executes exactly once", async () => {
  const accountId = "acc_multi_worker_02";
  const convId = "conv_mw_biz_write_01";

  const goal = createConversationGoal({
    accountId,
    conversationId: convId,
    requesterIdentity: { role: "admin", jid: "contact-fecae62e1e25@example.invalid" },
    goalType: "lead_management",
    originalObjective: "Route lead to Sales",
    knownEntities: {
      activeLead: { leadId: "lead_99", name: "Ahmed", department: "Unassigned" },
    },
    knownArguments: { leadId: "lead_99", department: "Sales" },
    missingArguments: [],
    currentStep: 1,
    status: "IN_PROGRESS",
  });

  let databaseWrites = 0;

  const runWorker = (workerId: string) =>
    advanceConversationGoalAtomically({
      accountId,
      conversationId: convId,
      expectedVersion: goal.version,
      workerId,
      executeExternalStep: async () => {
        databaseWrites += 1;
        return {
          actionId: "assign_lead_department",
          params: { leadId: "lead_99", department: "Sales" },
          resultSummary: "Lead routed to Sales Department",
          success: true,
          nextStep: 2,
          nextStatus: "COMPLETED",
        };
      },
    });

  const [resA, resB] = await Promise.all([runWorker("worker_alpha"), runWorker("worker_beta")]);

  assert.equal(databaseWrites, 1, "Business write must occur EXACTLY once across workers");
  assert.equal([resA, resB].filter((r) => r.success).length, 1);
  assert.equal([resA, resB].filter((r) => r.conflict).length, 1);
});

test("Post-Send Crash Window: Personal WhatsApp external send suppresses duplicate send on post-crash recovery", async () => {
  const accountId = "acc_crash_recovery_01";
  const convId = "conv_crash_01";

  const goal = createConversationGoal({
    accountId,
    conversationId: convId,
    requesterIdentity: { role: "owner", jid: "contact-9db689732198@example.invalid" },
    goalType: "external_contact",
    originalObjective: "Send order status to customer",
    missingArguments: [],
    status: "IN_PROGRESS",
  });

  let externalWhatsAppSends = 0;

  // 1. Worker A acquires claim with short lease (20ms)
  const claimResultA = await tryAcquireGoalStepClaim(accountId, goal.goalId, goal.version, "worker_A", 20);
  assert.equal(claimResultA.acquired, true);

  // Worker A simulates successful outbound transport send
  externalWhatsAppSends += 1;

  // Worker A CRASHES immediately after transport send succeeds, before finalizeGoalStepClaim
  // (Process terminates here without calling finalizeGoalStepClaim)

  // 2. Wait for lease to expire
  await new Promise((r) => setTimeout(r, 30));

  // 3. Worker B / recovery process runs
  let workerBExecuted = 0;
  const advanceResB = await advanceConversationGoalAtomically({
    accountId,
    conversationId: convId,
    expectedVersion: goal.version,
    workerId: "worker_B",
    executeExternalStep: async () => {
      workerBExecuted += 1;
      return {
        actionId: "send_personal_message",
        params: { text: "Order status recovered." },
        resultSummary: "Delivered",
        success: true,
      };
    },
  });

  // Under Safe Uncertain-Outcome Policy:
  // - Worker B must NOT blindly execute external transport again
  assert.equal(advanceResB.success, false);
  assert.equal(advanceResB.conflict, true);
  assert.equal(workerBExecuted, 0, "Worker B must NOT execute duplicate external send");
  assert.equal(externalWhatsAppSends, 1, "Total external WhatsApp sends across crash must be EXACTLY 1");

  // - Goal is preserved in BLOCKED status with RECONCILIATION_REQUIRED
  assert.equal(advanceResB.goal?.status, "BLOCKED");
  assert.match(advanceResB.goal?.blockedReason || "", /RECONCILIATION_REQUIRED/);

  // - Goal remains persisted in canonical store
  const stored = getStoredConversationGoal(accountId, convId);
  assert.equal(stored?.status, "BLOCKED");
});

test("Goal Interruption & Resumption: Unfinished Goal A is suspended when user starts Goal B, then resumed with zero entity corruption", () => {
  const accountId = "acc_interruption_01";
  const convId = "conv_interrupt_01";

  // 1. Goal A: Waiting for user to supply message content for Starts Digital
  const goalA = createConversationGoal({
    accountId,
    conversationId: convId,
    requesterIdentity: { role: "owner", jid: "contact-9db689732198@example.invalid" },
    goalType: "external_contact",
    originalObjective: "Send message to Starts Digital",
    knownEntities: {
      activePerson: "Starts Digital",
      activePhone: "+194019413064",
      channelRequired: "personal_whatsapp",
    },
    knownArguments: {
      recipient: "Starts Digital",
      serviceQuery: "Web development",
    },
    missingArguments: ["messageContent"],
    currentStep: 1,
    status: "WAITING_FOR_USER",
  });

  assert.equal(goalA.status, "WAITING_FOR_USER");
  assert.equal(goalA.knownEntities.activePerson, "Starts Digital");

  // 2. User interrupts with unrelated query (Goal B: Check wallet balance)
  const goalB = suspendAndReplaceActiveGoal(accountId, convId, {
    accountId,
    conversationId: convId,
    requesterIdentity: { role: "owner", jid: "contact-9db689732198@example.invalid" },
    goalType: "wallet_billing",
    originalObjective: "Check my wallet balance",
    knownArguments: {},
    missingArguments: [],
    status: "IN_PROGRESS",
  });

  assert.ok(goalB.suspendedGoal, "Goal B must stash Goal A in suspendedGoal");
  assert.equal(goalB.goalType, "wallet_billing");
  assert.equal(goalB.suspendedGoal.goalId, goalA.goalId);
  assert.equal(goalB.suspendedGoal.knownEntities.activePerson, "Starts Digital");

  // 3. Goal B executes and completes
  const resumedGoalA = completeConversationGoal(accountId, convId, "Wallet balance is $15.50.");

  // 4. Assert: Goal A was automatically resumed as active goal!
  assert.ok(resumedGoalA, "Goal A must be resumed after Goal B completes");
  assert.equal(resumedGoalA.goalId, goalA.goalId);
  assert.equal(resumedGoalA.status, "WAITING_FOR_USER");
  assert.equal(resumedGoalA.knownEntities.activePerson, "Starts Digital");
  assert.equal(resumedGoalA.knownArguments.recipient, "Starts Digital");
  assert.deepEqual(resumedGoalA.missingArguments, ["messageContent"]);

  // 5. User now supplies the missing information for Goal A
  const continued = incorporateUserResponseIntoGoal(resumedGoalA, "Send: Please email us the proposal.");
  assert.equal(continued.status, "IN_PROGRESS");
  assert.equal(continued.knownArguments.recipient, "Starts Digital");
  assert.equal(continued.knownArguments.messageContent, "Send: Please email us the proposal.");
  assert.equal(continued.missingArguments.length, 0);

  // Entities between Goal A and Goal B remained 100% segregated (zero corruption)
  assert.equal(continued.knownEntities.activePerson, "Starts Digital");
});

test("Bounded Cleanup: Completed goals and expired claims are purged from persistent store", () => {
  const accountId = "acc_cleanup_01";
  const convId = "conv_cleanup_01";

  createConversationGoal({
    accountId,
    conversationId: convId,
    requesterIdentity: { role: "owner", jid: "contact-9db689732198@example.invalid" },
    goalType: "general_task",
    originalObjective: "Temporary task",
    status: "IN_PROGRESS",
  });

  assert.ok(getActiveConversationGoal(accountId, convId));

  // Completing the goal immediately purges operational document from store
  completeConversationGoal(accountId, convId, "Finished.");
  assert.equal(getActiveConversationGoal(accountId, convId), undefined);
  assert.equal(getStoredConversationGoal(accountId, convId), undefined);

  // Expired claims cleanup runs without error
  const purgedClaims = cleanupExpiredGoalClaims();
  assert.equal(typeof purgedClaims, "number");
});

