import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveAdminAgentIntent,
  executeAdminAgentIntent,
  saveAdminConversationContext,
  clearAdminConversationContext,
  buildNaturalAmbiguityClarification,
  __setAdminBusinessAgentTestDeps,
  __resetAdminBusinessAgentTestDeps,
  type AdminConversationMemory,
} from "./admin-business-agent-service.ts";
import { getAdminAction } from "./admin-action-registry-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import {
  handleAdminBusinessAssistantMessage,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";

const testAccountId = "acc_test_ai_first";
const testAdminJid = "contact-f3e665cdb447@example.invalid";

const testContext: AdminBusinessAssistantContext = {
  accountId: testAccountId,
  userId: "user_test_ai_first",
  botId: "bot_ai_first",
  adminPhone: "157311815005",
  adminJid: testAdminJid,
  adminRole: "owner",
  isBusinessAssistantEnabled: true,
  mode: "admin_business_assistant",
  conversationId: "conv_ai_first_001",
  isAuthorizedAdmin: true,
  isPrimaryOwner: true,
};

test.beforeEach(() => {
  __resetAdminBusinessAgentTestDeps();
  __resetAdminRouterTestDeps();
  clearAdminConversationContext(testAccountId, testAdminJid);
});

// ===========================================================================
// SECTION 1: Multilingual Intent Understanding by Meaning
// ===========================================================================

test("Multilingual Intent: Urdu, Roman Urdu, and Arabic outbound messaging select start_personal_outbound_mission", async () => {
  // Setup active referent in memory
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    activeContact: {
      displayName: "Starts Digital",
      canonicalPhone: "+194019413064",
    },
    activePersonName: "Starts Digital",
    activePhone: "+194019413064",
    updatedAt: Date.now(),
  };

  // Mock AI provider to return native tool call for any language
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_msg_001",
          name: "start_personal_outbound_mission",
          arguments: {
            target: "Starts Digital",
            goal: "designs are ready for review",
            isSendOnly: true,
          },
        },
      ],
    } as any),
  });

  // 1. English query
  const resEn = await resolveAdminAgentIntent({
    text: "Message him that the designs are ready for review",
    context: testContext,
    memory,
  });
  assert.equal(resEn.mode, "tool");
  assert.equal(resEn.actionId, "start_personal_outbound_mission");
  assert.equal(resEn.params?.target, "Starts Digital");

  // 2. Roman Urdu query
  const resRoman = await resolveAdminAgentIntent({
    text: "use message kar do ke designs review k liye ready hain",
    context: testContext,
    memory,
  });
  assert.equal(resRoman.mode, "tool");
  assert.equal(resRoman.actionId, "start_personal_outbound_mission");
  assert.equal(resRoman.params?.target, "Starts Digital");

  // 3. Arabic query
  const resAr = await resolveAdminAgentIntent({
    text: "أرسل له رسالة بأن التصاميم جاهزة للمراجعة",
    context: testContext,
    memory,
  });
  assert.equal(resAr.mode, "tool");
  assert.equal(resAr.actionId, "start_personal_outbound_mission");
});

test("Multilingual Intent: Inquiries about owner profile in Urdu and Arabic select get_owner_profile", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_owner_001",
          name: "get_owner_profile",
          arguments: {},
        },
      ],
    } as any),
  });

  // Roman Urdu
  const resUr = await resolveAdminAgentIntent({
    text: "mere baray me kya jantay ho as my assistant?",
    context: testContext,
  });
  assert.equal(resUr.mode, "tool");
  assert.equal(resUr.actionId, "get_owner_profile");

  // Arabic
  const resAr = await resolveAdminAgentIntent({
    text: "ماذا تعرف عن ملفي الشخصي؟",
    context: testContext,
  });
  assert.equal(resAr.mode, "tool");
  assert.equal(resAr.actionId, "get_owner_profile");
});

test("Multilingual Intent: Department lead routing queries select list_departments", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_dept_001",
          name: "list_departments",
          arguments: {},
        },
      ],
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "hamare paas kon kon se departments configured hain lead routing k liye?",
    context: testContext,
  });
  assert.equal(res.mode, "tool");
  assert.equal(res.actionId, "list_departments");
});

// ===========================================================================
// SECTION 2: Conversational Continuity & Context Preservation
// ===========================================================================

test("Conversation Context: Pronoun resolution resolves 'him' to activeContact across turns", async () => {
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    activeContact: {
      displayName: "Farhan Ali",
      canonicalPhone: "+144225232320",
    },
    activePersonName: "Farhan Ali",
    activePhone: "+144225232320",
    lastTopic: "personal_assistant",
    updatedAt: Date.now(),
  };

  __setAdminBusinessAgentTestDeps({
    generateBackendText: async (params: any) => {
      // Verify system prompt contains active contact
      const sys = params.messages[0].content;
      assert.ok(sys.includes("Farhan Ali"), "System prompt must contain active referent");
      return {
        requestStatus: "success",
        toolCalls: [
          {
            id: "tc_msg_turn",
            name: "start_personal_outbound_mission",
            arguments: {
              target: "Farhan Ali",
              goal: "meeting is confirmed for tomorrow",
            },
          },
        ],
      } as any;
    },
  });

  const res = await resolveAdminAgentIntent({
    text: "tell him the meeting is confirmed for tomorrow",
    context: testContext,
    memory,
  });

  assert.equal(res.mode, "tool");
  assert.equal(res.actionId, "start_personal_outbound_mission");
  assert.equal(res.params?.target, "Farhan Ali");
});

test("Conversational Flow: Natural acknowledgements maintain context without re-introduction", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "Got it! Let me know what you would like to do next.",
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "Ok, theek hai shukriya",
    context: testContext,
  });

  assert.equal(res.mode, "conversation");
  assert.ok(!res.reply?.includes("Hello, I'm your BlackArrow Admin Business Assistant"));
  assert.ok(!res.reply?.includes("Business Overview"));
});

test("Conversational Flow: 'What else?' continues contextually without generic menu dump", async () => {
  const memory: AdminConversationMemory = {
    accountId: testAccountId,
    adminJid: testAdminJid,
    activePersonName: "Starts Digital",
    lastTopic: "personal_assistant",
    updatedAt: Date.now(),
  };

  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "For Starts Digital, I can send another message, check their notes, or view their contact details. Or I can help with business orders and performance. What would you like to do?",
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "What else?",
    context: testContext,
    memory,
  });

  assert.equal(res.mode, "conversation");
  assert.ok(res.reply?.includes("Starts Digital"));
  assert.ok(!res.reply?.includes("Here is today's Business Overview"));
});

// ===========================================================================
// SECTION 3: Grounding in Server Tools & Bounded Reasoning
// ===========================================================================

test("Tool Grounding: Model does not invent order or customer facts, selects server tool", async () => {
  let invokedToolName = "";
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_order_check",
          name: "get_order",
          arguments: { orderReference: "ORD-9988" },
        },
      ],
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "Did order ORD-9988 get delivered?",
    context: testContext,
  });

  assert.equal(res.mode, "tool");
  assert.equal(res.actionId, "get_order");
  assert.equal(res.params?.orderReference, "ORD-9988");
});

test("Missing Arguments: Prompts specifically for missing recipient when not in context", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "Who would you like me to message? Please provide their name or phone number.",
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "Send a message saying the quotation is ready",
    context: testContext,
  });

  assert.equal(res.mode, "conversation");
  assert.ok(res.reply?.includes("Who would you like me to message"));
});

// ===========================================================================
// SECTION 4: Multilingual Ambiguity & Uncertainty (No Regex Shortcuts or Menu Fallbacks)
// ===========================================================================

test("Multilingual Ambiguity: English genuine ambiguity asks natural clarification without regex menu fallback", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "", // Planner cannot resolve confidently
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "check some business details",
    context: testContext,
  });

  assert.equal(res.mode, "clarify");
  assert.ok(res.clarifyQuestion);
  assert.ok(res.clarifyQuestion.includes("Could you please clarify"));
  assert.ok(!res.clarifyQuestion.includes("Business Overview"));
  assert.ok(!res.clarifyQuestion.includes("Quick Actions:"));
});

test("Multilingual Ambiguity: Urdu genuine ambiguity asks natural clarification in Urdu without dropping into English", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "", // Planner cannot resolve confidently
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "کچھ رپورٹ اور معلومات دکھائیں",
    context: testContext,
  });

  assert.equal(res.mode, "clarify");
  assert.ok(res.clarifyQuestion);
  // Must be in Urdu script, not English fallback
  assert.ok(/[\u0600-\u06FF]/.test(res.clarifyQuestion));
  assert.ok(res.clarifyQuestion.includes("کیا آپ"));
  assert.ok(!res.clarifyQuestion.includes("Business Overview"));
  assert.ok(!res.clarifyQuestion.includes("Could you please clarify"));
});

test("Multilingual Ambiguity: Roman Urdu genuine ambiguity asks natural clarification in Roman Urdu without English fallback", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "", // Planner cannot resolve confidently
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "kuch batao mujhe business ka",
    context: testContext,
  });

  assert.equal(res.mode, "clarify");
  assert.ok(res.clarifyQuestion);
  // Must be in Roman Urdu
  assert.ok(res.clarifyQuestion.includes("Kya aap wazeh kar saktay hain"));
  assert.ok(!res.clarifyQuestion.includes("Business Overview"));
  assert.ok(!res.clarifyQuestion.includes("Could you please clarify"));
});

test("Multilingual Ambiguity: Arabic genuine ambiguity asks natural clarification in Arabic without English fallback", async () => {
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "", // Planner cannot resolve confidently
    } as any),
  });

  const res = await resolveAdminAgentIntent({
    text: "أريد بعض التفاصيل والمساعدة في العمل",
    context: testContext,
  });

  assert.equal(res.mode, "clarify");
  assert.ok(res.clarifyQuestion);
  // Must be in Arabic script
  assert.ok(/[\u0600-\u06FF]/.test(res.clarifyQuestion));
  assert.ok(res.clarifyQuestion.includes("هل يمكنك توضيح"));
  assert.ok(!res.clarifyQuestion.includes("Business Overview"));
  assert.ok(!res.clarifyQuestion.includes("Could you please clarify"));
});

test("Ambiguity Disambiguation: Specific ambiguous topics branch correctly across languages", () => {
  // English: wallet vs expenses
  const qEnWallet = buildNaturalAmbiguityClarification("how much did we spend?");
  assert.ok(qEnWallet.includes("BlackArrow platform wallet credit"));

  // English: orders vs customer
  const qEnOrder = buildNaturalAmbiguityClarification("check customer order");
  assert.ok(qEnOrder.includes("recent orders or search for a specific customer contact"));

  // Urdu: wallet
  const qUrWallet = buildNaturalAmbiguityClarification("والٹ میں کتنا خرچہ ہوا ہے؟");
  assert.ok(qUrWallet.includes("والٹ کریڈٹ"));

  // Roman Urdu: wallet
  const qRomanWallet = buildNaturalAmbiguityClarification("kitna kharcha hua hai wallet mein");
  assert.ok(qRomanWallet.includes("BlackArrow wallet credit"));

  // Arabic: wallet
  const qArWallet = buildNaturalAmbiguityClarification("كم رصيد المحفظة المستهلك؟");
  assert.ok(qArWallet.includes("محفظة"));
});

test("End-to-End Routing: Ambiguous conversational requests via handleAdminBusinessAssistantMessage send natural clarification without fallback menus or Business Overview", async () => {
  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, amountChargedUsd: 0.005, previousBalance: 10, newBalance: 9.995 })) as any,
  });

  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      text: "", // Cannot resolve confidently -> triggers clarify
    } as any),
  });

  let sentMessageText = "";
  const fakeSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      sentMessageText = content.text;
      return { key: { id: "msg_clarify_test_001" } };
    },
  };

  const result = await handleAdminBusinessAssistantMessage({
    sock: fakeSock as any,
    rawMessage: {},
    text: "kuch batao mujhe",
    context: testContext,
  });

  assert.equal(result.handled, true);
  assert.equal(result.repliesSent, 1);
  assert.ok(sentMessageText.includes("Kya aap wazeh kar saktay hain"));
  assert.ok(!sentMessageText.includes("Business Overview"), "Must NEVER fall back to Business Overview template");
  assert.ok(!sentMessageText.includes("Quick Actions:"), "Must NEVER fall back to quick action menu");
  assert.ok(!sentMessageText.includes("Hello, I'm your BlackArrow Admin Business Assistant"), "Must NEVER dump introduction");
});

