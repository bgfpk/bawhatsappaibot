import test from "node:test";
import assert from "node:assert/strict";

import {
  executeGoalDrivenAgentLoop,
  resolveAdminAgentIntent,
  saveAdminConversationContext,
  clearAdminConversationContext,
  __setAdminBusinessAgentTestDeps,
  __resetAdminBusinessAgentTestDeps,
  type AdminConversationMemory,
} from "./admin-business-agent-service.ts";
import {
  handleAdminBusinessAssistantMessage,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  getActiveConversationGoal,
  clearActiveConversationGoal,
  type ConversationGoal,
} from "./conversation-goal-manager.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

const testAccountId = "acc_agent_loop_test";
const testAdminJid = "contact-e4ed32210a80@example.invalid";

const testContext: AdminBusinessAssistantContext = {
  accountId: testAccountId,
  userId: "user_loop_test",
  botId: "bot_loop_test",
  adminPhone: "195545134641",
  adminJid: testAdminJid,
  adminRole: "owner",
  isBusinessAssistantEnabled: true,
  mode: "admin_business_assistant",
  conversationId: "conv_loop_001",
  isAuthorizedAdmin: true,
  isPrimaryOwner: true,
};

test.beforeEach(() => {
  __resetAdminBusinessAgentTestDeps();
  __resetAdminRouterTestDeps();
  clearAdminConversationContext(testAccountId, testAdminJid);
  clearActiveConversationGoal(testAccountId, testAdminJid);
});

// ===========================================================================
// SECTION 1: Multi-Step Chaining (Contact Lookup -> Outbound Send -> Complete)
// ===========================================================================

test("Multi-Step Chaining: does not stop at contact card; continues automatically to outbound send", async () => {
  const executedActions: string[] = [];

  __setAdminBusinessAgentTestDeps({
    generateBackendText: (async (params: any) => {
      if (params.purpose === "admin_domain_classification") {
        return {
          requestStatus: "success" as const,
          model: "test-model",
          text: JSON.stringify({ primaryDomain: "operations", secondaryDomain: "general", confidence: 0.99 }),
        };
      }
      return {
        requestStatus: "success" as const,
        model: "test-model",
        text: "",
        toolCalls: [
          {
            id: "call_01",
            type: "function" as const,
            name: "find_personal_contact",
            arguments: { target: "Starts Digital" },
          },
        ],
      };
    }) as any,
    executeAdminAction: async (actionId, params) => {
      executedActions.push(actionId);
      if (actionId === "find_personal_contact") {
        return {
          success: true,
          data: {
            contact: {
              contactId: "cnt_starts_01",
              displayName: "Starts Digital",
              whatsappIdentities: [{ canonicalPhone: "+194019413064", jid: "contact-9da9d2e33299@example.invalid" }],
            },
          },
          message: "Found contact Starts Digital (+923250872796).",
        };
      }
      if (actionId === "start_personal_outbound_mission") {
        return {
          success: true,
          data: {
            missionId: "msn_101",
            targetContactId: "cnt_starts_01",
            targetIdentity: { displayName: "Starts Digital", canonicalPhone: "+194019413064" },
          },
          message: "Outbound message sent to Starts Digital via Personal WhatsApp.",
        };
      }
      return { success: true, message: "OK" };
    },
  });

  const result = await executeGoalDrivenAgentLoop({
    context: testContext,
    userText: "Contact Starts Digital and ask about web development services",
    maxSteps: 4,
  });

  // Critical Assertion: The agent executed find_personal_contact AND chained to start_personal_outbound_mission!
  assert.equal(executedActions.includes("find_personal_contact"), true);
  assert.equal(executedActions.includes("start_personal_outbound_mission"), true);
  assert.equal(result.goal.status, "COMPLETED");
  assert.equal(result.actionsExecuted.length, 2);
  assert.match(result.replyText, /Starts Digital/);
});

// ===========================================================================
// SECTION 2: Partial Success & Blocked Goal Retention
// ===========================================================================

test("Blocked Goal Retention: when line is disconnected, preserves goal state and reports exact blocker", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: (async (params: any) => {
      if (params.purpose === "admin_domain_classification") {
        return {
          requestStatus: "success" as const,
          model: "test-model",
          text: JSON.stringify({ primaryDomain: "operations", secondaryDomain: "general", confidence: 0.99 }),
        };
      }
      return {
        requestStatus: "success" as const,
        model: "test-model",
        text: "",
        toolCalls: [
          {
            id: "call_02",
            type: "function" as const,
            name: "find_personal_contact",
            arguments: { target: "Hamza" },
          },
        ],
      };
    }) as any,
    executeAdminAction: async (actionId) => {
      if (actionId === "find_personal_contact") {
        return {
          success: true,
          data: {
            contact: {
              displayName: "Hamza",
              whatsappIdentities: [{ canonicalPhone: "+149145539352" }],
            },
          },
          message: "Found contact Hamza (+923005556677).",
        };
      }
      if (actionId === "start_personal_outbound_mission") {
        return {
          success: false,
          error: "personal_whatsapp_disconnected",
          message: "Personal WhatsApp instance is not connected.",
        };
      }
      return { success: true, message: "OK" };
    },
  });

  const result = await executeGoalDrivenAgentLoop({
    context: testContext,
    userText: "Message Hamza that quotation is ready",
    maxSteps: 3,
  });

  // Goal must be marked BLOCKED, not discarded!
  assert.equal(result.goal.status, "BLOCKED");
  assert.match(result.replyText, /blocked|Personal WhatsApp|disconnected/i);

  // Stored goal must retain active person and phone
  const storedGoal = getActiveConversationGoal(testAccountId, testAdminJid);
  assert.ok(storedGoal);
  assert.equal(storedGoal.status, "BLOCKED");
  assert.equal(storedGoal.knownEntities.activePersonName, "Hamza");
  assert.equal(storedGoal.knownEntities.activePhone, "+149145539352");
});

// ===========================================================================
// SECTION 3: Capability vs Settings Disambiguation
// ===========================================================================

test("Capability vs Settings: asking what assistant can do routes to get_assistant_capabilities, not settings", async () => {
  const routerResult = await handleAdminBusinessAssistantMessage({
    context: testContext,
    userText: "What can you do as my personal assistant?",
  });

  assert.equal(routerResult.handled, true);
  // Verify it did NOT return the settings menu
  assert.equal(routerResult.actionId !== "get_incoming_personal_assistant_settings", true);
  // Verify it resolved capability inspection
  assert.equal(routerResult.actionId, "get_assistant_capabilities");
  assert.match(routerResult.replyText, /capabilities|personal assistant|orders|leads/i);
});

// ===========================================================================
// SECTION 4: Template Brain Elimination
// ===========================================================================

test("No Template Brain: general capability questions do not return static canned menus", async () => {
  const routerResult = await handleAdminBusinessAssistantMessage({
    context: testContext,
    userText: "What can you do?",
  });

  assert.equal(routerResult.handled, true);
  // Verify no static "Business Assistant capability menu" header
  assert.doesNotMatch(routerResult.replyText, /Business Assistant capability menu/i);
  assert.doesNotMatch(routerResult.replyText, /Personal Assistant Settings/i);
  assert.match(routerResult.replyText, /Business Assistant/i);
});

// ===========================================================================
// SECTION 5: Real Router End-to-End Multi-Step Execution
// ===========================================================================

test("Real Router E2E: message -> router -> planner -> Goal Manager -> tool 1 -> tool 2 -> completion", async () => {
  const executedActions: string[] = [];
  let sentOwnerReply = "";

  const mockSock = {
    sendMessage: async (_to: string, content: { text: string }) => {
      sentOwnerReply = content.text;
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true })) as any,
  });

  __setAdminBusinessAgentTestDeps({
    generateBackendText: (async (params: any) => {
      if (params.purpose === "admin_domain_classification") {
        return {
          requestStatus: "success" as const,
          model: "test-model",
          text: JSON.stringify({ primaryDomain: "operations", secondaryDomain: "general", confidence: 0.99 }),
        };
      }
      return {
        requestStatus: "success" as const,
        model: "test-model",
        text: "",
        toolCalls: [
          {
            id: "call_e2e_01",
            type: "function" as const,
            name: "find_personal_contact",
            arguments: { target: "Starts Digital" },
          },
        ],
      };
    }) as any,
    executeAdminAction: async (actionId, params) => {
      executedActions.push(actionId);
      if (actionId === "find_personal_contact") {
        return {
          success: true,
          data: {
            contact: {
              contactId: "cnt_starts_01",
              displayName: "Starts Digital",
              whatsappIdentities: [{ canonicalPhone: "+194019413064", jid: "contact-9da9d2e33299@example.invalid" }],
            },
          },
          message: "Found contact Starts Digital (+923250872796).",
        };
      }
      if (actionId === "start_personal_outbound_mission") {
        return {
          success: true,
          data: {
            missionId: "msn_e2e_01",
            targetContactId: "cnt_starts_01",
            targetIdentity: { displayName: "Starts Digital", canonicalPhone: "+194019413064" },
          },
          message: "Outbound message sent to Starts Digital via Personal WhatsApp.",
        };
      }
      return { success: true, message: "OK" };
    },
  });

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: testContext,
    userText: "Please contact Starts Digital and ask about web packages",
    rawMessage: {},
    botSentMessageIds: new Set(),
  });

  assert.equal(res.handled, true);
  // Multi-step must execute tool 1 AND tool 2 through the real router path!
  assert.equal(executedActions.includes("find_personal_contact"), true);
  assert.equal(executedActions.includes("start_personal_outbound_mission"), true);
  assert.ok(sentOwnerReply.length > 0);
  assert.match(sentOwnerReply, /Starts Digital/);
});

// ===========================================================================
// SECTION 6: Multilingual Goal Execution with Mid-Goal Language Switch
// ===========================================================================

test("Multilingual Continuity: switches language midway (Urdu -> English) on same unfinished goal", async () => {
  const executedActions: string[] = [];

  __setAdminBusinessAgentTestDeps({
    generateBackendText: (async (params: any) => {
      if (params.purpose === "admin_domain_classification") {
        return {
          requestStatus: "success" as const,
          model: "test-model",
          text: JSON.stringify({ primaryDomain: "operations", secondaryDomain: "general", confidence: 0.99 }),
        };
      }
      // Turn 1: Urdu intent - recipient provided, message missing
      return {
        requestStatus: "success" as const,
        model: "test-model",
        text: "",
        toolCalls: [
          {
            id: "call_lang_01",
            type: "function" as const,
            name: "find_personal_contact",
            arguments: { target: "Starts Digital" },
          },
        ],
      };
    }) as any,
    executeAdminAction: async (actionId, params) => {
      executedActions.push(actionId);
      if (actionId === "find_personal_contact") {
        return {
          success: true,
          data: {
            contact: {
              contactId: "cnt_starts_01",
              displayName: "Starts Digital",
              whatsappIdentities: [{ canonicalPhone: "+194019413064" }],
            },
          },
          message: "Found contact Starts Digital.",
        };
      }
      if (actionId === "start_personal_outbound_mission") {
        return {
          success: true,
          data: { missionId: "msn_switched" },
          message: "Message sent to Starts Digital via Personal line.",
        };
      }
      return { success: true, message: "OK" };
    },
  });

  // Turn 1: Urdu command with missing message content
  const turn1 = await executeGoalDrivenAgentLoop({
    context: testContext,
    userText: "اسٹارٹس ڈیجیٹل سے رابطہ کرو",
    maxSteps: 4,
  });

  assert.equal(turn1.goal.status, "WAITING_FOR_USER");
  assert.equal(turn1.goal.knownEntities.activePerson, "Starts Digital");
  assert.equal(turn1.goal.missingArguments.includes("messageContent"), true);

  // Turn 2: User switches language to English to provide the message content!
  const turn2 = await executeGoalDrivenAgentLoop({
    context: testContext,
    userText: "Ask them if they can build an ecommerce store",
    maxSteps: 4,
  });

  // Goal must stay the SAME and complete!
  assert.equal(turn2.goal.status, "COMPLETED");
  assert.equal(turn2.goal.knownEntities.activePerson, "Starts Digital");
  assert.equal(turn2.actionsExecuted.includes("start_personal_outbound_mission"), true);
});

// ===========================================================================
// SECTION 7: Specific Settings vs Capability Semantic Routing
// ===========================================================================

test("Settings vs Capabilities: explicit settings inquiry routes to settings tool", async () => {
  const routerResult = await handleAdminBusinessAssistantMessage({
    context: testContext,
    userText: "Show my personal assistant settings and config",
  });

  assert.equal(routerResult.handled, true);
  assert.equal(routerResult.actionId, "get_incoming_personal_assistant_settings");
  assert.match(routerResult.replyText, /Personal Assistant Settings/i);
});
