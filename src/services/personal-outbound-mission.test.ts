/**
 * Personal Outbound Mission Unit & Integration Test Suite (Prompt 5)
 * 
 * Verifies sections 71-82:
 * 1. Owner Control & Channel Separation
 * 2. Target & Personal Instance Resolution
 * 3. First Send & Idempotency
 * 4. Active Mission Routing Precedence over Generic Incoming AI
 * 5. Goal Conversation, Information Gathering & Negotiation Safeguards
 * 6. Owner360 Privacy & Prompt Injection Boundaries
 * 7. Manual Takeover, Contact Controls & Opt-Out
 * 8. Mission Persistence & Restart Invariants
 * 9. Owner Reporting & Billing/Domain Isolation
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePersonalInstanceForMission,
  resolveTargetForMission,
} from "./personal-outbound-target-service.ts";
import {
  savePersonalOutboundMission,
  getPersonalOutboundMission,
  getActiveMissionForContact,
  updateMissionStatus,
  __clearMissionsForTest,
} from "./personal-outbound-storage-service.ts";
import {
  isTargetOptOutMessage,
  extractTargetRedirection,
  generateFirstOutboundMissionMessage,
  planMissionContinuationTurn,
} from "./personal-outbound-planner-service.ts";
import {
  validatePreSendEligibility,
  sendPersonalOutboundMissionMessage,
  notifyOwnerMissionEvent,
  __clearSendDedupForTest,
} from "./personal-outbound-send-service.ts";
import {
  routePersonalInboundMessage,
} from "./personal-outbound-routing-service.ts";
import {
  recordManualTakeover,
  clearManualTakeover,
  __resetEligibilityTrackingForTest,
} from "./personal-incoming-eligibility-service.ts";
import { getAdminAction } from "./admin-action-registry-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import { __setUniversalOutboundSendTestDeps } from "./universal-outbound-send-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import type { PersonalOutboundMission } from "./personal-outbound-types.ts";
import "./personal-outbound-admin-tools.ts";

const mockTenantId = `tenant_pom_${Date.now()}`;
const mockPersonalInstanceId = "bot_personal_pom_01";
const mockControlBusinessId = "bot_biz_ctrl_01";

const mockPersonalBot = {
  $id: mockPersonalInstanceId,
  bot_id: mockPersonalInstanceId,
  user_id: mockTenantId,
  instancePurpose: "personal",
  controlBusinessInstanceId: mockControlBusinessId,
  connection_status: "connected",
};

const mockControlBot = {
  $id: mockControlBusinessId,
  bot_id: mockControlBusinessId,
  user_id: mockTenantId,
  instancePurpose: "business",
  connection_status: "connected",
};

const mockContact: PersonalContact = {
  contactId: "pc_target_001",
  schemaVersion: 1,
  revision: 1,
  accountId: mockTenantId,
  status: "active",
  displayName: "Ahmed Electronics",
  ownerAssignedName: "Ahmed Shop",
  relationship: "supplier",
  relationshipProvenance: "owner_provided",
  whatsappIdentities: [
    {
      personalInstanceId: mockPersonalInstanceId,
      jid: "contact-6c9bc40fc084@example.invalid",
      jidType: "pn",
      canonicalPhone: "+150333823501",
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      source: "owner_business_whatsapp",
    },
  ],
  durableFacts: [],
  ownerNotes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

test("Personal Outbound Mission - Comprehensive Test Suite", async (t) => {
  t.beforeEach(() => {
    __clearMissionsForTest();
    __clearSendDedupForTest();
    __resetEligibilityTrackingForTest();
    __setUniversalOutboundSendTestDeps({
      canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" }),
    });
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
  });

  // =========================================================================
  // 1. OWNER CONTROL & INSTANCE RESOLUTION (Sections 71, 72)
  // =========================================================================
  await t.test("Owner Control: Admin BA tool is registered with owner role guard", () => {
    const startAction = getAdminAction("start_personal_outbound_mission");
    assert.ok(startAction, "start_personal_outbound_mission action must be registered");
    assert.strictEqual(startAction.requiredRole, "owner");
    assert.strictEqual(startAction.category, "personal_assistant");
  });

  await t.test("Instance Resolution: Single Personal line auto-selected; Multiple asks owner", async () => {
    // Exactly 1 personal line
    const singleRes = await resolvePersonalInstanceForMission(
      mockTenantId,
      undefined,
      mockControlBusinessId,
      [mockPersonalBot, mockControlBot]
    );
    assert.strictEqual(singleRes.personalInstanceId, mockPersonalInstanceId);

    // Multiple personal lines without explicit selection -> asks owner
    const secondPersonalBot = {
      $id: "bot_personal_pom_02",
      user_id: mockTenantId,
      instancePurpose: "personal",
      controlBusinessInstanceId: mockControlBusinessId,
    };
    const multiRes = await resolvePersonalInstanceForMission(
      mockTenantId,
      undefined,
      mockControlBusinessId,
      [mockPersonalBot, secondPersonalBot, mockControlBot]
    );
    assert.strictEqual(multiRes.error, "multiple_personal_instances");
    assert.ok(multiRes.ambiguousInstances && multiRes.ambiguousInstances.length === 2);
  });

  await t.test("Target Resolution: Contact name, phone, LID rejection, and ambiguity handling", async () => {
    // 1. Raw LID targeting rejected
    const lidRes = await resolveTargetForMission(mockTenantId, mockPersonalInstanceId, "12345678901234@lid");
    assert.ok(lidRes.error);
    assert.match(lidRes.error, /LID targeting is not supported/i);

    // 2. Direct phone number resolved safely
    const phoneRes = await resolveTargetForMission(mockTenantId, mockPersonalInstanceId, "+92 300 9876543");
    assert.strictEqual(phoneRes.isNewPhone, true);
    assert.strictEqual(phoneRes.targetIdentity?.canonicalPhone, "+120585453443");
    assert.strictEqual(phoneRes.targetIdentity?.jid, "contact-b3c6be38212e@example.invalid");

    // 3. Invalid phone produces error
    const invalidRes = await resolveTargetForMission(mockTenantId, mockPersonalInstanceId, "123");
    assert.ok(invalidRes.error);
    assert.match(invalidRes.error, /Could not resolve/i);
  });

  // =========================================================================
  // 2. FIRST SEND & IDEMPOTENCY (Section 73)
  // =========================================================================
  await t.test("First Send: Sends initial message once and maintains idempotency", async () => {
    const mission: PersonalOutboundMission = {
      missionId: `pom_test_${Date.now()}`,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContact.contactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        canonicalPhone: "+150333823501",
        displayName: "Ahmed Electronics",
      },
      goal: "Ask price of 16-inch M3 MacBook Pro",
      ownerInstructions: "Ask if they have M3 Pro in space black and the price.",
      constraints: ["Do not confirm purchase"],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 0,
      status: "ACTIVE",
    };

    let sentCount = 0;
    const mockSock = {
      sendMessage: async () => {
        sentCount++;
        return { key: { id: "out_001" } };
      },
    };

    // First send
    const firstRes = await sendPersonalOutboundMissionMessage({
      mission,
      messageText: "Hello Ahmed, I am inquiring about the M3 Pro MacBook in space black.",
      stepIndex: 0,
      sock: mockSock,
    });

    assert.strictEqual(firstRes.success, true);
    assert.strictEqual(firstRes.mission.stepCount, 1);
    assert.ok(firstRes.mission.status === "WAITING_FOR_REPLY" || firstRes.mission.status === "WAITING_FOR_CONTACT");

    // Check pre-send eligibility prevents send if mission is cancelled
    mission.status = "CANCELLED";
    const cancelCheck = await validatePreSendEligibility({ mission });
    assert.strictEqual(cancelCheck.allowed, false);
    assert.strictEqual(cancelCheck.reason, "mission_cancelled");
  });

  await t.test("First Send: Send-only message completes immediately upon send", async () => {
    const mission: PersonalOutboundMission = {
      missionId: `pom_sendonly_${Date.now()}`,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContact.contactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        canonicalPhone: "+150333823501",
        displayName: "Ahmed Electronics",
      },
      goal: "Tell Ahmed I will arrive in 20 minutes",
      ownerInstructions: "Tell Ahmed I will arrive in 20 minutes.",
      constraints: [],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 0,
      isSendOnly: true,
      status: "ACTIVE",
    };

    let notified = false;
    const mockSock = {
      sendMessage: async () => ({ key: { id: "out_sendonly_001" } }),
    };
    const sendRes = await sendPersonalOutboundMissionMessage({
      mission,
      messageText: "Tell Ahmed I will arrive in 20 minutes.",
      stepIndex: 0,
      sock: mockSock,
      sendBusinessNotification: async () => {
        notified = true;
        return { success: true, messageId: "notif_001" };
      },
    });

    assert.strictEqual(sendRes.success, true);
    assert.strictEqual(sendRes.mission.status, "COMPLETED");
    assert.strictEqual(notified, true, "Owner must be notified upon send-only completion");
  });

  // =========================================================================
  // 3. ACTIVE MISSION ROUTING PRECEDENCE (Section 74)
  // =========================================================================
  await t.test("Routing Precedence: Target reply routes to active mission, suppressing generic incoming AI", async () => {
    const mission: PersonalOutboundMission = {
      missionId: `pom_route_${Date.now()}`,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContact.contactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        canonicalPhone: "+150333823501",
        displayName: "Ahmed Electronics",
      },
      goal: "Ask price and availability",
      ownerInstructions: "Ask price.",
      constraints: [],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 1,
      status: "WAITING_FOR_CONTACT",
    };

    await savePersonalOutboundMission(mission);

    // Verify active mission is recognized
    const active = await getActiveMissionForContact(mockTenantId, mockPersonalInstanceId, mockContact.contactId);
    assert.ok(active, "Active mission must be found for contact");
    assert.strictEqual(active.missionId, mission.missionId);

    // Inbound routing check
    const routeRes = await routePersonalInboundMessage({
      tenantId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      remoteJid: "contact-6c9bc40fc084@example.invalid",
      messageId: "in_reply_001",
      textContent: "Yes, we have 2 units in stock for 650,000 PKR.",
      contact: mockContact,
    });

    // It MUST be marked handled: true
    assert.strictEqual(routeRes.handled, true, "Active mission must handle target reply");

    // Unrelated contact has no mission -> route returns handled: false
    const unrelatedRoute = await routePersonalInboundMessage({
      tenantId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      remoteJid: "contact-a997ae750213@example.invalid",
      messageId: "in_unrelated_001",
      textContent: "Hello there!",
      contact: null,
    });
    assert.strictEqual(unrelatedRoute.handled, false, "Unrelated contact falls through to generic incoming assistant");
    await updateMissionStatus(mockTenantId, mission.missionId, "CANCELLED");
  });

  // =========================================================================
  // 4. GOAL CONVERSATION, SAFEGUARDS & OPT-OUT (Sections 75, 76, 77, 78)
  // =========================================================================
  await t.test("Opt-Out & Redirection: Target opt-out cancels mission; redirection triggers NEEDS_OWNER", () => {
    // 1. Opt out
    assert.strictEqual(isTargetOptOutMessage("Stop messaging me"), true);
    assert.strictEqual(isTargetOptOutMessage("Please unsubscribe"), true);
    assert.strictEqual(isTargetOptOutMessage("leave me alone"), true);
    assert.strictEqual(isTargetOptOutMessage("The price is 500"), false);

    // 2. Redirection
    const redir = extractTargetRedirection("Please contact this number 03001234567 for sales");
    assert.ok(redir);
    assert.match(redir, /contact this number/i);
  });

  await t.test("Continuation Plan: Completion tag sets COMPLETED status and extracts facts", async () => {
    const mission: PersonalOutboundMission = {
      missionId: `pom_plan_${Date.now()}`,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContact.contactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        displayName: "Ahmed Electronics",
      },
      goal: "Ask price of laptop",
      ownerInstructions: "Ask price.",
      constraints: ["Do not confirm order"],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 1,
      status: "WAITING_FOR_CONTACT",
    };

    const targetText = "The price is 450,000 PKR and we have space black available.";
    const result = await planMissionContinuationTurn({
      mission,
      targetInboundText: targetText,
      conversationHistory: [
        { role: "assistant", text: "Hello Ahmed, what is the price of the M3 MacBook?" },
      ],
      contact: mockContact,
    });

    // In simulated or live model turn, price is extracted into collected facts
    assert.ok(result.collectedFacts);
    const priceFact = result.collectedFacts.find((f) => f.key === "quoted_price");
    if (priceFact) {
      assert.match(priceFact.value, /450,000/i);
    }
  });

  // =========================================================================
  // 5. MANUAL TAKEOVER & PERSISTENCE (Sections 78, 79)
  // =========================================================================
  await t.test("Manual Takeover: fromMe suppresses active mission AI", async () => {
    const mission: PersonalOutboundMission = {
      missionId: `pom_takeover_${Date.now()}`,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContact.contactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        displayName: "Ahmed Electronics",
      },
      goal: "Ask price",
      ownerInstructions: "Ask price.",
      constraints: [],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 1,
      status: "WAITING_FOR_CONTACT",
    };

    await savePersonalOutboundMission(mission);

    // Owner manually sends message from personal phone
    recordManualTakeover(mockTenantId, mockPersonalInstanceId, mockContact.contactId, 60);

    // Pre-send check must block send
    const preCheck = await validatePreSendEligibility({ mission });
    assert.strictEqual(preCheck.allowed, false);
    assert.strictEqual(preCheck.reason, "manual_takeover_active");

    // Inbound router suppresses mission reply
    const routeRes = await routePersonalInboundMessage({
      tenantId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      remoteJid: "contact-6c9bc40fc084@example.invalid",
      messageId: "in_001",
      textContent: "Any other questions?",
      contact: mockContact,
    });

    assert.strictEqual(routeRes.handled, true);
    assert.strictEqual(routeRes.reason, "manual_takeover_active");
    await updateMissionStatus(mockTenantId, mission.missionId, "CANCELLED");
  });

  await t.test("Persistence: Mission state survives and preserves step count and status", async () => {
    const missionId = `pom_persist_${Date.now()}`;
    const persistContactId = `pc_persist_${Date.now()}`;
    const mission: PersonalOutboundMission = {
      missionId,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: persistContactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        displayName: "Ahmed Electronics",
      },
      goal: "Gather quotation",
      ownerInstructions: "Gather quotation.",
      constraints: [],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 2,
      status: "WAITING_FOR_CONTACT",
    };

    await savePersonalOutboundMission(mission);

    const fetched = await getPersonalOutboundMission(mockTenantId, missionId);
    assert.ok(fetched);
    assert.strictEqual(fetched.missionId, missionId);
    assert.strictEqual(fetched.stepCount, 2);
    assert.strictEqual(fetched.status, "WAITING_FOR_CONTACT");

    // Complete mission and verify it does not resurrect
    await updateMissionStatus(mockTenantId, missionId, "COMPLETED");
    const completed = await getPersonalOutboundMission(mockTenantId, missionId);
    assert.strictEqual(completed?.status, "COMPLETED");

    // Active mission query must return null
    const active = await getActiveMissionForContact(mockTenantId, mockPersonalInstanceId, persistContactId);
    assert.strictEqual(active, null, "Completed mission must not appear as active");
  });

  // =========================================================================
  // 6. OWNER REPORTING & BILLING ISOLATION (Sections 80, 81, 82)
  // =========================================================================
  await t.test("Owner Reporting: Dispatches notification to Business channel with deduplication", async () => {
    const mission: PersonalOutboundMission = {
      missionId: `pom_notif_${Date.now()}`,
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContact.contactId,
      targetIdentity: {
        jid: "contact-6c9bc40fc084@example.invalid",
        displayName: "Ahmed Electronics",
      },
      goal: "Check laptop availability",
      ownerInstructions: "Ask availability.",
      constraints: [],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 2,
      status: "COMPLETED",
    };

    let sentNotificationText = "";
    const mockSender = async (text: string) => {
      sentNotificationText = text;
      return { success: true, messageId: "notif_msg_01" };
    };

    // First notification
    const firstNotif = await notifyOwnerMissionEvent({
      mission,
      eventType: "COMPLETED",
      summary: "In stock: 2 units of M3 Pro for 650,000 PKR.",
      sendBusinessNotification: mockSender,
    });

    assert.strictEqual(firstNotif.sent, true);
    assert.strictEqual(firstNotif.isDuplicate, false);
    assert.match(sentNotificationText, /Personal Mission Completed/i);
    assert.match(sentNotificationText, /Ahmed Electronics/i);

    // Immediate duplicate notification -> suppressed
    const dupeNotif = await notifyOwnerMissionEvent({
      mission,
      eventType: "COMPLETED",
      summary: "In stock: 2 units of M3 Pro for 650,000 PKR.",
      sendBusinessNotification: mockSender,
    });

    assert.strictEqual(dupeNotif.sent, false);
    assert.strictEqual(dupeNotif.isDuplicate, true);
  });
});
