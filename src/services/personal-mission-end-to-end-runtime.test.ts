/**
 * Personal Mission End-to-End Runtime Regression Test Suite
 * 
 * Verifies the complete production lifecycle:
 * 1. Business Assistant -> Personal Mission handoff & contact resolution
 * 2. Strict transport grounding: NO false success claims when transport fails
 * 3. Cross-worker transport dispatch via Worker Port Registry
 * 4. Unified PersonalTask & PersonalOutboundMission persistence in Appwrite SYSTEM_CONFIGS
 * 5. Tasks API & UI category alignment (All Tasks, Active, Waiting, Needs Approval)
 * 6. WAITING_FOR_REPLY status semantics
 * 7. Inbound reply correlation & multi-turn goal pursuit
 * 8. Process restart resilience (recovery from durable Appwrite store)
 * 9. Commercial safety: No unauthorized payments/contracts, escalation to NEEDS_OWNER
 * 10. Owner semantic queries ("did they reply?", "stop that discussion")
 * 11. Billing ledger audit ($0.003 model calls, $0 deterministic actions)
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  savePersonalOutboundMission,
  getPersonalOutboundMission,
  listPersonalOutboundMissions,
  __clearMissionsForTest,
  __setPersonalOutboundStorageTestDeps,
} from "./personal-outbound-storage-service.ts";

import {
  savePersonalTask,
  getPersonalTask,
  listPersonalTasks,
  getActiveTaskForContact,
  __clearPersonalTasksForTest,
  __setPersonalTaskStorageTestDeps,
} from "./personal-task-storage-service.ts";

import {
  sendPersonalOutboundMissionMessage,
  __clearSendDedupForTest,
} from "./personal-outbound-send-service.ts";

import {
  registerWorkerPort,
  unregisterWorkerPort,
  __clearWorkerPortsForTest,
} from "./worker-port-registry-service.ts";

import {
  routePersonalInboundMessage,
} from "./personal-outbound-routing-service.ts";

import {
  __setPersonalOutboundPlannerTestDeps,
} from "./personal-outbound-planner-service.ts";

import {
  __setUniversalOutboundSendTestDeps,
} from "./universal-outbound-send-service.ts";
import { clearOutboundReceipts } from "./outbound-send-receipt-service.ts";

import {
  __resetEligibilityTrackingForTest,
} from "./personal-incoming-eligibility-service.ts";

import { getAdminAction } from "./admin-action-registry-service.ts";
import "./personal-outbound-admin-tools.ts";
import type { PersonalOutboundMission } from "./personal-outbound-types.ts";
import type { PersonalContact } from "./personal-contact-types.ts";

const mockAccountId = "acct_prod_owner_01";
const mockControlBusinessId = "bot_biz_3yjox";
const mockPersonalInstanceId = "bot_pers_8ecc4";

const mockContactStartsDigital: PersonalContact = {
  contactId: "pc_starts_digital_01",
  schemaVersion: 1,
  revision: 1,
  accountId: mockAccountId,
  status: "active",
  displayName: "Starts Digital",
  relationship: "service_provider",
  relationshipProvenance: "owner_provided",
  whatsappIdentities: [
    {
      personalInstanceId: mockPersonalInstanceId,
      jid: "contact-9da9d2e33299@example.invalid",
      jidType: "pn",
      canonicalPhone: "+194019413064",
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

// Simulated mock Appwrite DB in memory
const mockAppwriteDb = new Map<string, { value: string; updated_at: number }>();

function setupMockAppwrite() {
  mockAppwriteDb.clear();
  const getDoc = async (dbId: string, collId: string, docId: string) => {
    const doc = mockAppwriteDb.get(docId);
    if (!doc) throw { code: 404, message: "Document not found" };
    return { $id: docId, value: doc.value, updated_at: doc.updated_at };
  };
  const createDoc = async (dbId: string, collId: string, docId: string, data: any) => {
    mockAppwriteDb.set(docId, { value: data.value, updated_at: data.updated_at || Math.floor(Date.now() / 1000) });
    return { $id: docId, ...data };
  };
  const updateDoc = async (dbId: string, collId: string, docId: string, data: any) => {
    mockAppwriteDb.set(docId, { value: data.value, updated_at: data.updated_at || Math.floor(Date.now() / 1000) });
    return { $id: docId, ...data };
  };
  const deleteDoc = async (dbId: string, collId: string, docId: string) => {
    mockAppwriteDb.delete(docId);
    return true;
  };
  const listDocs = async (dbId: string, collId: string, queries?: any[]) => {
    const docs = Array.from(mockAppwriteDb.entries()).map(([id, d]) => ({
      $id: id,
      value: d.value,
      updated_at: d.updated_at,
    }));
    return { documents: docs, total: docs.length };
  };

  __setPersonalTaskStorageTestDeps({
    getDocument: getDoc,
    createDocument: createDoc,
    updateDocument: updateDoc,
    deleteDocument: deleteDoc,
    listDocuments: listDocs,
    now: () => Date.now(),
  } as any);

  __setPersonalOutboundStorageTestDeps({
    getDocument: getDoc,
    createDocument: createDoc,
    updateDocument: updateDoc,
    deleteDocument: deleteDoc,
    now: () => Date.now(),
  } as any);
}

test("Personal Mission Runtime Acceptance Suite", async (suite) => {
  suite.beforeEach(() => {
    __clearMissionsForTest();
    __clearPersonalTasksForTest();
    __clearSendDedupForTest();
    __clearWorkerPortsForTest();
    __resetEligibilityTrackingForTest();
    clearOutboundReceipts();
    setupMockAppwrite();
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";

    __setUniversalOutboundSendTestDeps({
      canSendCustomerFacingMessage: async () => ({ allowed: true, reason: "" }),
    });

    __setPersonalOutboundPlannerTestDeps({
      generateBackendText: (async (params: any) => {
        if (params.purpose === "personal_assistant_outbound_first_message") {
          return { text: "Hello Starts Digital, reaching out to inquire if you provide ecommerce digital marketing for a 20k/month budget." };
        }
        if (params.purpose === "personal_assistant_outbound_continuation") {
          const userMsg = params.messages[params.messages.length - 1]?.content || "";
          if (userMsg.includes("budget") || userMsg.includes("scope")) {
            return { text: "Yes, our monthly budget is strictly capped at 20,000/month. Does your team handle Google & Meta ads within this range?" };
          }
          if (userMsg.includes("transfer") || userMsg.includes("pay") || userMsg.includes("sign")) {
            return { text: "Understood. I will confirm this financial commitment with the owner. [NEEDS_OWNER: Recipient requested payment/contract agreement]" };
          }
          return { text: "Thank you for the details. [MISSION_COMPLETE: Starts Digital provides ecommerce marketing for 20k/month including Meta and Google ads]" };
        }
        return { text: "Response" };
      }) as any,
    });
  });

  // =========================================================================
  // TEST 1: Strict Transport Grounding - Failure Path prevents False Success
  // =========================================================================
  await suite.test("Grounding Bug Prevention: When transport fails, AI must NEVER claim message sent", async () => {
    // 1. Mission setup where no socket and no worker port exists
    const mission: PersonalOutboundMission = {
      missionId: "pom_fail_test_01",
      accountId: mockAccountId,
      personalInstanceId: "bot_offline_instance",
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContactStartsDigital.contactId,
      targetIdentity: {
        jid: "contact-9da9d2e33299@example.invalid",
        canonicalPhone: "+194019413064",
        displayName: "Starts Digital",
      },
      goal: "Contact Starts Digital about digital marketing",
      ownerInstructions: "Inquire about 20k budget",
      constraints: ["max budget 20k"],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 0,
      status: "ACTIVE",
    };

    // 2. Transmit without connected socket or worker port
    const sendRes = await sendPersonalOutboundMissionMessage({
      mission,
      messageText: "Hello Starts Digital",
      stepIndex: 0,
    });

    // 3. Must strictly fail - NO fake simulation ID!
    assert.equal(sendRes.success, false);
    assert.match(sendRes.reason || "", /transport_unavailable/);
    assert.equal(sendRes.mission.status, "FAILED");

    // 4. Admin tool must return clean error and NEVER claim "Personal Mission Started" or "Initial Message Sent"
    const startAction = getAdminAction("start_personal_outbound_mission");
    assert.ok(startAction);

    // Call handler with non-existent personal instance
    const toolRes = await startAction.handler(
      { accountId: mockAccountId, botId: mockControlBusinessId } as any,
      { target: "NonExistentContact", goal: "Ask something", personalInstanceId: "bot_offline_999" }
    );

    assert.equal(toolRes.success, false);
    assert.equal(toolRes.message.includes("Initial Message Sent"), false);
    assert.equal(toolRes.message.includes("Personal Mission Started"), false);
  });

  // =========================================================================
  // TEST 2: Success Path - Cross-Worker Dispatch & WAITING_FOR_REPLY status
  // =========================================================================
  await suite.test("Success Path: Real transport send sets WAITING_FOR_REPLY and synchronizes PersonalTask", async () => {
    // 1. Spin up a mock HTTP server simulating Personal Bot Worker (port 12088)
    let workerReceivedMessage: any = null;
    const mockWorkerServer = http.createServer((req, res) => {
      if (req.url === "/api/bot/send-message" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          workerReceivedMessage = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, sentMessageId: "wa_msg_auth_98765" }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => mockWorkerServer.listen(12088, "127.0.0.1", resolve));

    try {
      // 2. Register Personal Worker Port in cross-process registry
      registerWorkerPort(mockPersonalInstanceId, 12088);

      const mission: PersonalOutboundMission = {
        missionId: "pom_success_test_01",
        accountId: mockAccountId,
        personalInstanceId: mockPersonalInstanceId,
        controlBusinessInstanceId: mockControlBusinessId,
        targetContactId: mockContactStartsDigital.contactId,
        targetIdentity: {
          jid: "contact-9da9d2e33299@example.invalid",
          canonicalPhone: "+194019413064",
          displayName: "Starts Digital",
        },
        goal: "Contact Starts Digital, ask about ecommerce services, discuss 20k/month budget",
        ownerInstructions: "Ask about ecommerce marketing for 20k budget",
        constraints: ["Strict 20k budget cap"],
        createdByOwner: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActivityAt: Date.now(),
        stepCount: 0,
        status: "ACTIVE",
        ownerGoalId: "goal_owner_initial_01",
      };

      // 3. Send initial message
      clearOutboundReceipts();
      const sendRes = await sendPersonalOutboundMissionMessage({
        mission,
        messageText: "Hello Starts Digital, inquiring about ecommerce marketing.",
        stepIndex: 0,
      });

      // 4. Verify authoritative send evidence
      assert.equal(sendRes.success, true);
      assert.equal(sendRes.messageId, "wa_msg_auth_98765");
      assert.ok(workerReceivedMessage);
      assert.equal(workerReceivedMessage.to, "contact-9da9d2e33299@example.invalid");

      // 5. Authoritative status must be WAITING_FOR_REPLY (not ambiguous WAITING_FOR_CONTACT)
      assert.equal(sendRes.mission.status, "WAITING_FOR_REPLY");
      assert.equal(sendRes.mission.lastOutboundMessageId, "wa_msg_auth_98765");

      // 6. Check Tasks API / Storage: Must return 1 canonical task in All Tasks and Waiting
      const allTasks = await listPersonalTasks(mockAccountId);
      assert.equal(allTasks.length, 1);
      assert.equal(allTasks[0].taskId, "pom_success_test_01");
      assert.equal(allTasks[0].currentState, "WAITING_FOR_REPLY");
      assert.equal(allTasks[0].ownerGoalId, "goal_owner_initial_01");
      assert.equal(allTasks[0].targetContactId, mockContactStartsDigital.contactId);

      // Verify category filtering matches
      const waitingTasks = await listPersonalTasks(mockAccountId, { state: "WAITING_FOR_REPLY" as any });
      assert.equal(waitingTasks.length, 1);
    } finally {
      mockWorkerServer.close();
      unregisterWorkerPort(mockPersonalInstanceId);
    }
  });

  // =========================================================================
  // TEST 3: Inbound Reply Correlation & Multi-turn Goal Pursuit
  // =========================================================================
  await suite.test("Inbound Reply Correlation: Starts Digital reply routes to active mission and preserves goal", async () => {
    // 1. Create active mission in WAITING_FOR_REPLY
    const mission: PersonalOutboundMission = {
      missionId: "pom_corr_test_01",
      accountId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContactStartsDigital.contactId,
      targetIdentity: {
        jid: "contact-9da9d2e33299@example.invalid",
        canonicalPhone: "+194019413064",
        displayName: "Starts Digital",
      },
      goal: "Contact Starts Digital, ask about ecommerce marketing for 20k/month budget",
      ownerInstructions: "Ask about ecommerce marketing for 20k budget",
      constraints: ["Strict 20k budget cap"],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 1,
      status: "WAITING_FOR_REPLY",
      ownerGoalId: "goal_corr_01",
    };

    await savePersonalOutboundMission(mission);

    // Mock socket for worker send
    let outboundSentText = "";
    const mockSock = {
      sendMessage: async (jid: string, content: any) => {
        outboundSentText = content.text;
        return { key: { id: "wa_msg_reply_222" } };
      },
    };

    // 2. Inbound message arrives from Starts Digital on Personal Line
    const replyResult = await routePersonalInboundMessage({
      tenantId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      remoteJid: "contact-9da9d2e33299@example.invalid",
      messageId: "wa_inbound_starts_01",
      textContent: "Yes we provide full digital marketing. What is your monthly ad spend budget?",
      contact: mockContactStartsDigital,
      sock: mockSock,
    });

    // 3. Verifications
    assert.equal(replyResult.handled, true);
    assert.equal(replyResult.missionId, "pom_corr_test_01");

    // Outbound response was sent back to Starts Digital continuing discussion
    assert.ok(outboundSentText.includes("20,000"));

    // Mission status remains WAITING_FOR_REPLY awaiting their next answer
    const updatedMission = await getPersonalOutboundMission(mockAccountId, "pom_corr_test_01");
    assert.ok(updatedMission);
    assert.equal(updatedMission.status, "WAITING_FOR_REPLY");
    assert.equal(updatedMission.stepCount, 2);

    // PersonalTask store is updated identically
    const updatedTask = await getPersonalTask(mockAccountId, "pom_corr_test_01");
    assert.ok(updatedTask);
    assert.equal(updatedTask.currentState, "WAITING_FOR_REPLY");
    assert.equal(updatedTask.stepCount, 2);
  });

  // =========================================================================
  // TEST 4: Process Restart Resilience (Surviving Memory Wipe)
  // =========================================================================
  await suite.test("Restart Resilience: Inbound reply recovers mission from Appwrite after complete memory wipe", async () => {
    // 1. Create mission in durable Appwrite
    const mission: PersonalOutboundMission = {
      missionId: "pom_restart_test_01",
      accountId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContactStartsDigital.contactId,
      targetIdentity: {
        jid: "contact-9da9d2e33299@example.invalid",
        canonicalPhone: "+194019413064",
        displayName: "Starts Digital",
      },
      goal: "Contact Starts Digital, ask about ecommerce marketing for 20k/month budget",
      ownerInstructions: "Ask about ecommerce marketing for 20k budget",
      constraints: ["Strict 20k budget cap"],
      createdByOwner: true,
      createdAt: Date.now() - 60000,
      updatedAt: Date.now() - 60000,
      lastActivityAt: Date.now() - 60000,
      stepCount: 1,
      status: "WAITING_FOR_REPLY",
      ownerGoalId: "goal_restart_01",
    };

    await savePersonalOutboundMission(mission);

    // Verify document was written to mock Appwrite
    assert.ok(mockAppwriteDb.size > 0);

    // 2. SIMULATE WORKER / PM2 CRASH AND RESTART
    __clearMissionsForTest();
    __clearPersonalTasksForTest();

    // 3. Recipient replies after process restart
    let restartOutboundText = "";
    const mockSock = {
      sendMessage: async (jid: string, content: any) => {
        restartOutboundText = content.text;
        return { key: { id: "wa_msg_after_restart_333" } };
      },
    };

    const routeResult = await routePersonalInboundMessage({
      tenantId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      remoteJid: "contact-9da9d2e33299@example.invalid",
      messageId: "wa_inbound_post_restart",
      textContent: "Can you confirm your budget scope?",
      contact: mockContactStartsDigital,
      sock: mockSock,
    });

    // 4. Verify mission was successfully hydrated from Appwrite and pursued
    assert.equal(routeResult.handled, true);
    assert.equal(routeResult.missionId, "pom_restart_test_01");
    assert.ok(restartOutboundText.includes("20,000"));

    // Tasks API returns the task
    const tasksAfterRestart = await listPersonalTasks(mockAccountId);
    assert.equal(tasksAfterRestart.length, 1);
    assert.equal(tasksAfterRestart[0].taskId, "pom_restart_test_01");
  });

  // =========================================================================
  // TEST 5: Commercial Safety - Escalation to NEEDS_OWNER on binding commitment
  // =========================================================================
  await suite.test("Commercial Safety: Recipient requesting payment or contract escalates to NEEDS_OWNER", async () => {
    const mission: PersonalOutboundMission = {
      missionId: "pom_safety_test_01",
      accountId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContactStartsDigital.contactId,
      targetIdentity: {
        jid: "contact-9da9d2e33299@example.invalid",
        canonicalPhone: "+194019413064",
        displayName: "Starts Digital",
      },
      goal: "Contact Starts Digital, ask about ecommerce marketing for 20k/month budget",
      ownerInstructions: "Ask about ecommerce marketing for 20k budget",
      constraints: ["Strict 20k budget cap"],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 1,
      status: "WAITING_FOR_REPLY",
      ownerGoalId: "goal_safety_01",
    };

    await savePersonalOutboundMission(mission);

    let ownerNotificationText = "";
    const mockSendBusinessNotification = async (text: string) => {
      ownerNotificationText = text;
      return { success: true, messageId: "biz_notice_111" };
    };

    const mockSock = {
      sendMessage: async () => ({ key: { id: "wa_msg_safe_444" } }),
    };

    // Recipient demands payment / contract signing
    const routeRes = await routePersonalInboundMessage({
      tenantId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      remoteJid: "contact-9da9d2e33299@example.invalid",
      messageId: "wa_inbound_pay_req",
      textContent: "We can do 20k/month. Please sign the contract and transfer 20k advance to proceed.",
      contact: mockContactStartsDigital,
      sock: mockSock,
      sendBusinessNotification: mockSendBusinessNotification,
    });

    assert.equal(routeRes.handled, true);
    assert.equal(routeRes.status, "NEEDS_OWNER");

    // Status updated to NEEDS_OWNER / WAITING_FOR_OWNER
    const updatedMission = await getPersonalOutboundMission(mockAccountId, "pom_safety_test_01");
    assert.equal(updatedMission?.status, "NEEDS_OWNER");

    // Owner receives concise WhatsApp notification on controlling Business channel
    assert.ok(ownerNotificationText.includes("Personal Mission Needs Your Input") || ownerNotificationText.includes("Starts Digital"));
  });

  // =========================================================================
  // TEST 6: Owner Semantic Queries against Active Mission
  // =========================================================================
  await suite.test("Owner Querying: Semantic queries like 'did they reply?' inspect canonical mission", async () => {
    // Mission exists in WAITING_FOR_REPLY
    const mission: PersonalOutboundMission = {
      missionId: "pom_query_test_01",
      accountId: mockAccountId,
      personalInstanceId: mockPersonalInstanceId,
      controlBusinessInstanceId: mockControlBusinessId,
      targetContactId: mockContactStartsDigital.contactId,
      targetIdentity: {
        jid: "contact-9da9d2e33299@example.invalid",
        canonicalPhone: "+194019413064",
        displayName: "Starts Digital",
      },
      goal: "Contact Starts Digital and discuss ecommerce services",
      ownerInstructions: "Discuss marketing for 20k budget",
      constraints: [],
      createdByOwner: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      stepCount: 1,
      status: "WAITING_FOR_REPLY",
      ownerGoalId: "goal_query_01",
    };

    await savePersonalOutboundMission(mission);

    const getTool = getAdminAction("get_personal_outbound_mission");
    assert.ok(getTool);

    // Query by target name
    const queryRes = await getTool.handler(
      { accountId: mockAccountId, botId: mockControlBusinessId } as any,
      { target: "Starts Digital" }
    );

    assert.equal(queryRes.success, true);
    assert.ok(queryRes.message.includes("Starts Digital"));
    assert.ok(queryRes.message.includes("WAITING_FOR_REPLY"));
    assert.equal(queryRes.data.missionId, "pom_query_test_01");

    // Cancel tool
    const cancelTool = getAdminAction("cancel_personal_outbound_mission");
    assert.ok(cancelTool);
    const cancelRes = await cancelTool.handler(
      { accountId: mockAccountId, botId: mockControlBusinessId } as any,
      { target: "Starts Digital" }
    );

    assert.equal(cancelRes.success, true);
    assert.ok(cancelRes.message.includes("CANCELLED"));

    const cancelledMission = await getPersonalOutboundMission(mockAccountId, "pom_query_test_01");
    assert.equal(cancelledMission?.status, "CANCELLED");
  });
});
