import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetCustomerSummaryTestDeps,
  __setCustomerSummaryTestDeps,
  queueCustomerChatSummaryRefresh,
} from "./customer-summary-service.ts";

function message(role: "user" | "model", text: string, timestamp: number) {
  return { role, text, timestamp };
}

function installSummaryDeps(input: {
  profile?: any;
  history?: any[];
  canSend?: any;
  aiSummary?: any;
}) {
  const aiCalls: any[] = [];
  const updates: any[] = [];
  __setCustomerSummaryTestDeps({
    getCustomerProfile: async () => input.profile || {},
    getChatHistory: async () => input.history || [],
    canSendCustomerFacingMessage: async () => input.canSend || { allowed: true, reason: "" },
    buildCustomerChatSummaryWithAiFallback: async (payload: any) => {
      aiCalls.push(payload);
      return input.aiSummary || {
        summary: [
          "Current facts:",
          "- Customer wants delivery in Lahore.",
          "",
          "Timeline:",
          "- Customer shared a delivery city.",
          "",
          "Details:",
          "- City: Lahore",
        ].join("\n"),
        source: "ai",
        reason: "",
      };
    },
    updateCustomerProfile: async (_botId: string, _jid: string, patch: any) => {
      updates.push(patch);
      return patch;
    },
    now: () => 1000,
  } as any);
  return { aiCalls, updates };
}

test("customer summary skips trivial customer messages before AI", async () => {
  const { aiCalls } = installSummaryDeps({
    profile: {
      chatSummary: "Current facts:\n- Customer asked about delivery.",
      chatSummaryLastMessageAt: 100,
      chatSummaryUpdatedAt: 100,
    },
    history: [
      message("user", "Delivery details?", 90),
      message("model", "Please share city.", 95),
      message("user", "ok", 200),
    ],
  });

  await queueCustomerChatSummaryRefresh({ dataOwnerKey: "bot_1", customerJid: "contact-89efd04cbada@example.invalid", userId: "user_1" });

  assert.equal(aiCalls.length, 0);
  __resetCustomerSummaryTestDeps();
});

test("customer summary allows meaningful new customer details", async () => {
  const { aiCalls } = installSummaryDeps({
    profile: {
      chatSummary: "Current facts:\n- Customer asked about delivery.",
      chatSummaryLastMessageAt: 100,
      chatSummaryUpdatedAt: 100,
    },
    history: [
      message("user", "Delivery details?", 90),
      message("model", "Please share city.", 95),
      message("user", "My delivery city is Lahore", 200),
    ],
  });

  await queueCustomerChatSummaryRefresh({ dataOwnerKey: "bot_1", customerJid: "contact-89efd04cbada@example.invalid", userId: "user_1" });

  assert.equal(aiCalls.length, 1);
  __resetCustomerSummaryTestDeps();
});

test("customer summary cooldown blocks repeated non-meaningful refresh", async () => {
  const { aiCalls } = installSummaryDeps({
    profile: {
      chatSummary: "Current facts:\n- Customer asked about delivery.",
      chatSummaryLastMessageAt: 100,
      chatSummaryUpdatedAt: 995,
    },
    history: [
      message("user", "Delivery details?", 90),
      message("model", "Please share city.", 95),
      message("user", "theek", 200),
    ],
  });

  await queueCustomerChatSummaryRefresh({ dataOwnerKey: "bot_1", customerJid: "contact-89efd04cbada@example.invalid", userId: "user_1" });

  assert.equal(aiCalls.length, 0);
  __resetCustomerSummaryTestDeps();
});

test("customer summary skips helper Gemini when account is not eligible", async () => {
  const { aiCalls } = installSummaryDeps({
    canSend: { allowed: false, reason: "account_access_expired" },
    profile: {
      chatSummary: "Current facts:\n- Customer asked about delivery.",
      chatSummaryLastMessageAt: 100,
      chatSummaryUpdatedAt: 100,
    },
    history: [
      message("user", "Delivery details?", 90),
      message("model", "Please share city.", 95),
      message("user", "My delivery city is Lahore", 200),
    ],
  });

  await queueCustomerChatSummaryRefresh({ dataOwnerKey: "bot_1", customerJid: "contact-89efd04cbada@example.invalid", userId: "user_1" });

  assert.equal(aiCalls.length, 0);
  __resetCustomerSummaryTestDeps();
});
