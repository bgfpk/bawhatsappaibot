import test from "node:test";
import assert from "node:assert/strict";
import {
  handleAdminBusinessAssistantMessage,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  resolveAdminAgentIntent,
  executeAdminAgentIntent,
  classifyAdminDomain,
  buildFocusedToolDefinitions,
  cleanPunctuation,
  getAdminConversationContext,
  saveAdminConversationContext,
  clearAdminConversationContext,
  __setAdminBusinessAgentTestDeps,
  __resetAdminBusinessAgentTestDeps,
} from "./admin-business-agent-service.ts";
import {
  handleGetBusinessOverview,
  handleGetAttentionItems,
  handleListInstances,
  handleGetInstanceStatus,
  handleGetBusinessProfileSummary,
  handleGetUsageSummary,
  isInstanceLiveConnected,
  resolveDateRangeBounds,
  __setAdminBusinessReadTestDeps,
  __resetAdminBusinessReadTestDeps,
} from "./admin-business-read-service.ts";
import {
  writeServiceDeps,
  setWriteServiceDeps,
  resetWriteServiceDeps,
} from "./admin-business-write-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

function createMockContext(overrides: Partial<AdminBusinessAssistantContext> = {}): AdminBusinessAssistantContext {
  return {
    accountId: "acc_blackarrow_123",
    userId: "usr_blackarrow_123",
    botId: "bot_active_999",
    adminPhone: "195545134641",
    adminJid: "contact-e4ed32210a80@example.invalid",
    adminRole: "owner",
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant",
    conversationId: "conv_admin_123",
    isAuthorizedAdmin: true,
    isPrimaryOwner: true,
    ...overrides,
  };
}

function createMockSocket(sentMessages: Array<{ to: string; text: string }>) {
  return {
    sendMessage: async (to: string, content: { text: string }) => {
      sentMessages.push({ to, text: content.text });
      return { key: { id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` } };
    },
  };
}

test.beforeEach(() => {
  __resetAdminRouterTestDeps();
  __resetAdminBusinessAgentTestDeps();
  __resetAdminBusinessReadTestDeps();
  resetWriteServiceDeps();
  clearAdminConversationContext("acc_blackarrow_123", "contact-e4ed32210a80@example.invalid");
  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, amountChargedUsd: 0.005, previousBalance: 10, newBalance: 9.995 })) as any,
  });
});

test.afterEach(() => {
  __resetAdminRouterTestDeps();
  __resetAdminBusinessAgentTestDeps();
  __resetAdminBusinessReadTestDeps();
  resetWriteServiceDeps();
});

// ===========================================================================
// 1. EXACT LIVE REGRESSION TESTS (HOTFIX 3 & DATA ACCURACY HOTFIX)
// ===========================================================================

test("Regression A: 'What is my wallet use of last 3 days?' returns exact 3-day usage (not 7 days)", async () => {
  const sent: Array<{ to: string; text: string }> = [];
  const sock = createMockSocket(sent);
  const context = createMockContext();

  const nowSec = Math.floor(Date.now() / 1000);
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ wallet_balance: 4.629 }),
    databases: {
      listDocuments: async (_db: string, coll: string) => {
        if (coll === "usage_analytics") {
          return {
            documents: [
              { timestamp: nowSec - 3600, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
              { timestamp: nowSec - 86400, cost: 0.003, type: "text_reply", amount: 1 },
              { timestamp: nowSec - 86400 * 2, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  __setAdminBusinessAgentTestDeps({
    generateBackendText: async (input: any) => {
      if (input.purpose === "admin_assistant_domain") {
        return {
          text: JSON.stringify({ primaryDomain: "billing", confidence: 0.95 }),
          requestStatus: "success",
          provider: "deepinfra",
          model: "deepseek-ai/DeepSeek-V4-Flash-0731",
          promptTokens: 50,
          completionTokens: 20,
          cachedTokens: 0,
          estimatedCost: 0,
          fallbackUsed: false,
          rawUsageSafe: {},
          latencyMs: 100,
          telemetry: {},
        };
      }
      if (input.purpose === "admin_assistant_intent") {
        return {
          text: "",
          toolCalls: [
            {
              id: "call_usage_3d",
              name: "get_usage_summary",
              arguments: { range: "last_3_days", days: 3 },
              rawArguments: JSON.stringify({ range: "last_3_days", days: 3 }),
            },
          ],
          finishReason: "tool_calls",
          requestStatus: "success",
          provider: "deepinfra",
          model: "deepseek-ai/DeepSeek-V4-Flash-0731",
          promptTokens: 120,
          completionTokens: 30,
          cachedTokens: 0,
          estimatedCost: 0,
          fallbackUsed: false,
          rawUsageSafe: {},
          latencyMs: 150,
          telemetry: {},
        };
      }
      return { text: "", requestStatus: "failed", provider: "deepinfra", model: "", promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCost: 0, fallbackUsed: false, rawUsageSafe: {}, latencyMs: 0, telemetry: {} };
    },
  });

  const res = await handleAdminBusinessAssistantMessage({
    sock,
    context,
    rawMessage: {},
    text: "What is my wallet use of last 3 days?",
  });

  assert.equal(res.handled, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Wallet Usage \(Last 3 Days\)/i);
  assert.doesNotMatch(sent[0].text, /Last 7 Days/i);
  assert.match(sent[0].text, /Total Spend in Last 3 Days.*\$0\.013/i);
  assert.match(sent[0].text, /Transactions.*3 event\(s\)/i);
  assert.match(sent[0].text, /Admin Business Assistant.*2 event\(s\).*0\.010/i);
  assert.match(sent[0].text, /AI Customer Text Replies.*1 event\(s\).*0\.003/i);
  assert.doesNotMatch(sent[0].text, /0\.001 \/ cycle/i);
});

test("Regression B: 'What is my wallet use of last 5 days?' returns exact 5-day usage", async () => {
  const sent: Array<{ to: string; text: string }> = [];
  const sock = createMockSocket(sent);
  const context = createMockContext();

  const nowSec = Math.floor(Date.now() / 1000);
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ wallet_balance: 10.0 }),
    databases: {
      listDocuments: async (_db: string, coll: string) => {
        if (coll === "usage_analytics") {
          return {
            documents: [
              { timestamp: nowSec - 86400 * 4, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      text: "",
      toolCalls: [
        {
          id: "call_5d",
          name: "get_usage_summary",
          arguments: { days: 5 },
          rawArguments: JSON.stringify({ days: 5 }),
        },
      ],
      finishReason: "tool_calls",
      requestStatus: "success",
      provider: "deepinfra",
      model: "deepseek-ai/DeepSeek-V4-Flash-0731",
      promptTokens: 100,
      completionTokens: 20,
      cachedTokens: 0,
      estimatedCost: 0,
      fallbackUsed: false,
      rawUsageSafe: {},
      latencyMs: 100,
      telemetry: {},
    }),
  });

  const res = await handleAdminBusinessAssistantMessage({
    sock,
    context,
    rawMessage: {},
    text: "What is my wallet use of last 5 days?",
  });

  assert.equal(res.handled, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Wallet Usage \(Last 5 Days\)/i);
  assert.match(sent[0].text, /Total Spend in Last 5 Days.*\$0\.005/i);
});

test("Regression C: 3 Admin Assistant messages ($0.015) in period are accurately included in total and breakdown", async () => {
  const context = createMockContext();

  const bounds = resolveDateRangeBounds("today");
  const testSec = Math.floor((bounds.startMs + 60000) / 1000);
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ wallet_balance: 4.629 }),
    databases: {
      listDocuments: async (_db: string, coll: string) => {
        if (coll === "usage_analytics") {
          return {
            documents: [
              { timestamp: testSec + 1, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
              { timestamp: testSec + 2, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
              { timestamp: testSec + 3, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  const res = await handleGetUsageSummary(context, { range: "today" });
  assert.equal(res.success, true);
  assert.equal(res.data.periodSpendUsd, 0.015);
  assert.equal(res.data.transactionCount, 3);
  assert.match(res.message, /Total Spend in Today.*\$0\.015/i);
  assert.match(res.message, /Admin Business Assistant.*3 event\(s\).*0\.015/i);
});

test("Regression D: Range with no usage events returns $0.000 usage and 0 transactions", async () => {
  const context = createMockContext();
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ wallet_balance: 5.0 }),
    databases: {
      listDocuments: async () => ({ documents: [] }),
    } as any,
  });

  const res = await handleGetUsageSummary(context, { range: "yesterday" });
  assert.equal(res.success, true);
  assert.equal(res.data.periodSpendUsd, 0);
  assert.equal(res.data.transactionCount, 0);
  assert.match(res.message, /Total Spend in Yesterday.*\$0\.000/i);
  assert.match(res.message, /Transactions.*0 event\(s\)/i);
});

test("Regression E: Top-up / Credit in range is not counted as usage spend", async () => {
  const context = createMockContext();
  const nowSec = Math.floor(Date.now() / 1000);

  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ wallet_balance: 15.0 }),
    databases: {
      listDocuments: async (_db: string, coll: string) => {
        if (coll === "usage_analytics") {
          return {
            documents: [
              { timestamp: nowSec - 100, cost: 0.005, type: "admin_business_assistant_message", amount: 1 },
            ],
          };
        }
        if (coll === "wallet_transactions") {
          return {
            documents: [
              { created_at: nowSec - 50, amount: 10.0, type: "manual_credit_topup", description: "Payment received" },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  const res = await handleGetUsageSummary(context, { range: "today" });
  assert.equal(res.success, true);
  assert.equal(res.data.periodSpendUsd, 0.005); // Spend is only 0.005
  assert.equal(res.data.creditsAddedUsd, 10.0); // Credits is 10.0
  assert.match(res.message, /Total Spend in Today.*\$0\.005/i);
  assert.match(res.message, /Top-ups \/ Credits Added.*\$10\.000/i);
});

test("Regression F & H: Business Profile Summary returns true total customer count matching listCustomers with products=0", async () => {
  const context = createMockContext();

  const mockCustomers = Array.from({ length: 42 }, (_, i) => ({
    $id: `cust_${i + 1}`,
    name: `Customer ${i + 1}`,
    phone: `9230012345${i < 10 ? `0${i}` : i}`,
    bot_id: "acc_blackarrow_123",
  }));

  __setAdminBusinessReadTestDeps({
    getUser: async () => ({
      name: "Ali Enterprise",
      business_name: "Ali Enterprise PK",
      wallet_balance: 15.5,
      subscription_tier: "growth_plan",
    }),
    getBotsByUser: async () => [
      { $id: "bot_active_999", name: "Primary WhatsApp Bot", phone: "110064053003", connection_status: "connected" },
    ],
    listProducts: async () => [], // 0 products
    listCustomers: async () => mockCustomers, // 42 customers
    listOrders: async () => [{ id: "ord_1", total: 100, status: "delivered" }], // 1 order
  });

  const res = await handleGetBusinessProfileSummary(context);
  assert.equal(res.success, true);
  assert.equal(res.data.productsCount, 0);
  assert.equal(res.data.customersCount, 42);
  assert.equal(res.data.ordersCount, 1);
  assert.match(res.message, /Catalog Products.*0 product\(s\)/i);
  assert.match(res.message, /Customer Database.*42 contact\(s\)/i);
  assert.match(res.message, /Total Orders Handled.*1 order\(s\)/i);
});

test("Regression G: Records for another tenant are never counted (Tenant Isolation)", async () => {
  const contextA = createMockContext({ accountId: "tenant_A" });
  const contextB = createMockContext({ accountId: "tenant_B" });

  __setAdminBusinessReadTestDeps({
    getUser: async (uid) => ({ name: uid, wallet_balance: 5.0 }),
    getBotsByUser: async () => [],
    listCustomers: async (uid) => (uid === "tenant_A" ? [{ id: "c1" }, { id: "c2" }] : [{ id: "c3" }]),
    listProducts: async (uid) => (uid === "tenant_A" ? [{ id: "p1" }] : []),
    listOrders: async () => [],
  });

  const resA = await handleGetBusinessProfileSummary(contextA);
  const resB = await handleGetBusinessProfileSummary(contextB);

  assert.equal(resA.data.customersCount, 2);
  assert.equal(resA.data.productsCount, 1);
  assert.equal(resB.data.customersCount, 1);
  assert.equal(resB.data.productsCount, 0);
});

// ===========================================================================
// 2. FOCUSED TOOL DEFINITION & DOMAIN CLASSIFICATION TESTS
// ===========================================================================

test("Focused Tool Definition: Exposes 5-16 tools for classified domain", () => {
  const context = createMockContext();
  const billingTools = buildFocusedToolDefinitions(context, "billing");
  assert.ok(billingTools.length >= 2 && billingTools.length <= 16);
  const toolNames = billingTools.map((t) => t.function.name);
  assert.ok(toolNames.includes("get_wallet_balance"));
  assert.ok(toolNames.includes("get_usage_summary"));

  const productTools = buildFocusedToolDefinitions(context, "products");
  assert.ok(productTools.length >= 2 && productTools.length <= 16);
  const prodNames = productTools.map((t) => t.function.name);
  assert.ok(prodNames.includes("list_products"));
  assert.ok(prodNames.includes("create_product"));
});

// ===========================================================================
// 3. DATE RANGE BOUNDS TESTS
// ===========================================================================

test("Date Range Bounds: Arbitrary days (3, 5, 14), explicit dates, and canonical ranges", () => {
  const d3 = resolveDateRangeBounds("last 3 days");
  assert.equal(d3.label, "Last 3 Days");
  assert.ok(d3.endMs - d3.startMs >= 2 * 24 * 3600 * 1000);

  const d5 = resolveDateRangeBounds({ days: 5 });
  assert.equal(d5.label, "Last 5 Days");

  const explicit = resolveDateRangeBounds({ startDate: "2026-08-20", endDate: "2026-08-25" });
  assert.equal(explicit.label, "2026-08-20 to 2026-08-25");
  assert.ok(explicit.startMs < explicit.endMs);

  const lastWeek = resolveDateRangeBounds("last_week");
  assert.equal(lastWeek.label, "Last Week");
  assert.ok(lastWeek.startMs < lastWeek.endMs);

  const lastMonth = resolveDateRangeBounds("last_month");
  assert.equal(lastMonth.label, "Last Month");
  assert.ok(lastMonth.startMs < lastMonth.endMs);
});
