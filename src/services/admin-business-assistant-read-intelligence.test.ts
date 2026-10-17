import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdminAction,
  listAdminActions,
  canExecuteAdminBusinessAction,
} from "./admin-action-registry-service.ts";
import {
  matchAdminActionFromText,
  handleAdminBusinessAssistantMessage,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  resolveAdminAgentIntent,
  __setAdminBusinessAgentTestDeps,
  __resetAdminBusinessAgentTestDeps,
} from "./admin-business-agent-service.ts";
import {
  resolveDateRangeBounds,
  __setAdminBusinessReadTestDeps,
  __resetAdminBusinessReadTestDeps,
  handleGetBusinessOverview,
  handleGetTodayBusinessSummary,
  handleGetBusinessMetrics,
  handleGetAttentionItems,
  handleGetAccountStatus,
  handleGetPlanStatus,
  handleGetWalletBalance,
  handleGetUsageSummary,
  handleListInstances,
  handleGetInstanceStatus,
  handleGetAiReplyStatus,
  handleGetConnectionHealth,
  handleSearchCustomers,
  handleGetCustomerSummary,
  handleGetRecentCustomers,
  handleSearchOrders,
  handleGetOrder,
  handleListRecentOrders,
  handleListPendingOrders,
  handleGetOrderCounts,
  handleGetCourierTrackingStatus,
  handleSearchProducts,
  handleGetProduct,
  handleListProducts,
  handleGetProductStock,
  handleListLowStockProducts,
  handleListUnavailableProducts,
  handleListFollowups,
  handleGetFollowupStatusSummary,
  handleListBroadcasts,
  handleGetBroadcastStatusSummary,
  handleListCustomerUpdates,
  handleGetCustomerUpdateStatusSummary,
  handleGetIntegrationsStatus,
  handleGetWooCommerceStatus,
  handleGetPostExStatus,
  handleGetLeopardsStatus,
  handleGetWebsiteLeadIntegrationStatus,
  handleGetPublicApiStatus,
  handleGetWebhookStatus,
  handleGetRecentIntegrationErrors,
  handleGetRecentSafeEvents,
  handleGetRecentAiDecisions,
  handleGetRecentBlockedReasons,
  handleGetRecentOperationalErrors,
  handleGetPerformanceSummary,
  handleGetUsageReport,
  handleGetOrderPerformance,
  handleGetCustomerActivityReport,
  handleGetTeamSummary,
  handleGetActiveSessionSummary,
  handleGet2faStatus,
} from "./admin-business-read-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

const mockContext: AdminBusinessAssistantContext = {
  accountId: "acc_prompt2_test",
  userId: "acc_prompt2_test",
  adminJid: "contact-e4ed32210a80@example.invalid",
  adminPhone: "195545134641",
  adminRole: "owner",
  botId: "bot_prompt2_test",
  mode: "admin_business_assistant",
  isBusinessAssistantEnabled: true,
  conversationId: "conv_prompt2_test",
};

// ---------------------------------------------------------------------------
// 1. ACTION REGISTRY VERIFICATION
// ---------------------------------------------------------------------------

test("1. Registry contains all 35+ Prompt 2 registered read actions", () => {
  const actions = listAdminActions();
  const actionIds = actions.map((a) => a.actionId);

  const required = [
    "get_business_overview",
    "get_today_business_summary",
    "get_business_metrics",
    "get_attention_items",
    "get_account_status",
    "get_plan_status",
    "get_wallet_balance",
    "get_usage_summary",
    "list_instances",
    "get_instance_status",
    "get_selected_instance_status",
    "get_ai_reply_status",
    "get_connection_health",
    "search_customers",
    "get_customer",
    "get_customer_summary",
    "get_customer_orders",
    "get_recent_customers",
    "get_customer_activity_summary",
    "search_orders",
    "get_order",
    "list_recent_orders",
    "list_pending_orders",
    "get_order_counts",
    "get_order_summary",
    "get_courier_tracking_status",
    "search_products",
    "get_product",
    "list_products",
    "get_product_stock",
    "list_low_stock_products",
    "list_unavailable_products",
    "list_followups",
    "get_followup",
    "get_followup_status_summary",
    "list_broadcasts",
    "get_broadcast",
    "get_broadcast_status_summary",
    "list_customer_updates",
    "get_customer_update",
    "get_customer_update_status_summary",
    "get_integrations_status",
    "get_woocommerce_status",
    "get_postex_status",
    "get_leopards_status",
    "get_website_lead_integration_status",
    "get_public_api_status",
    "get_webhook_status",
    "get_recent_integration_errors",
    "get_recent_safe_events",
    "get_recent_ai_decisions",
    "get_recent_blocked_reasons",
    "get_recent_operational_errors",
    "get_performance_summary",
    "get_usage_report",
    "get_order_performance",
    "get_customer_activity_report",
    "get_team_summary",
    "get_active_session_summary",
    "get_2fa_status",
  ];

  for (const req of required) {
    assert.ok(actionIds.includes(req), `Missing registered action: ${req}`);
    const def = getAdminAction(req);
    assert.equal(def?.riskLevel, "READ");
    assert.equal(def?.requiresConfirmation, false);
    assert.equal(typeof def?.handler, "function");
  }
});

// ---------------------------------------------------------------------------
// 2. DATE RANGE NORMALIZATION
// ---------------------------------------------------------------------------

test("2. Date range resolver handles natural terms accurately", () => {
  const today = resolveDateRangeBounds("today");
  assert.equal(today.label, "Today");

  const yesterday = resolveDateRangeBounds("yesterday");
  assert.equal(yesterday.label, "Yesterday");

  const last7Days = resolveDateRangeBounds("last_7_days");
  assert.equal(last7Days.label, "Last 7 Days");

  const thisWeek = resolveDateRangeBounds("this_week");
  assert.equal(thisWeek.label, "This Week");

  const lastWeek = resolveDateRangeBounds("last_week");
  assert.equal(lastWeek.label, "Last Week");

  const thisMonth = resolveDateRangeBounds("this_month");
  assert.equal(thisMonth.label, "This Month");

  const last30Days = resolveDateRangeBounds("last_30_days");
  assert.equal(last30Days.label, "Last 30 Days");
});

// ---------------------------------------------------------------------------
// 3. BUSINESS OVERVIEW & ATTENTION ITEMS
// ---------------------------------------------------------------------------

test("3. Business overview handler calculates metrics, revenue, and attention items", async () => {
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({
      name: "Ahmed Store",
      wallet_balance: 15.5,
    }),
    getBotsByUser: async () => [
      { $id: "bot_1", bot_name: "Sales Bot", connection_status: "connected", is_active: true },
    ],
    databases: {
      listDocuments: async (_dbId: string, collId: string) => {
        if (collId === "orders") {
          return {
            documents: [
              { $id: "ord_1", order_id: "101", total_amount: 150, status: "delivered", $createdAt: new Date().toISOString() },
              { $id: "ord_2", order_id: "102", total_amount: 80, status: "pending", $createdAt: new Date().toISOString() },
            ],
          };
        }
        if (collId === "products") {
          return {
            documents: [
              { $id: "prod_1", name: "Shirt", stock: 2, price: 40 },
              { $id: "prod_2", name: "Pants", stock: 0, price: 60 },
            ],
          };
        }
        return { documents: [] };
      },
    } as any,
  });

  const res = await handleGetBusinessOverview(mockContext, { range: "today" });
  assert.equal(res.success, true);
  assert.equal(res.data.ordersCount, 2);
  assert.equal(res.data.revenue, 230);
  assert.equal(res.data.pendingOrdersCount, 1);
  assert.ok(res.message.includes("Business Overview"));

  const attRes = await handleGetAttentionItems(mockContext);
  assert.equal(attRes.success, true);
  assert.ok(attRes.message.includes("Attention Required"));

  __resetAdminBusinessReadTestDeps();
});

test("4. Business overview returns healthy state when no alerts exist", async () => {
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({ name: "Healthy Store", wallet_balance: 50.0 }),
    getBotsByUser: async () => [{ $id: "bot_1", connection_status: "connected" }],
    databases: {
      listDocuments: async () => ({ documents: [] }),
    } as any,
  });

  const attRes = await handleGetAttentionItems(mockContext);
  assert.equal(attRes.success, true);
  assert.ok(attRes.message.includes("No Urgent Attention Items"));

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 4. ACCOUNT, PLAN & WALLET
// ---------------------------------------------------------------------------

test("5. Account and wallet queries return accurate balances and credit details", async () => {
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({
      name: "BlackArrow Store",
      email: "contact-396ba8bdecc7@example.invalid",
      wallet_balance: 24.5,
      subscription_plan: "pro",
      subscription_status: "active",
    }),
    databases: {
      listDocuments: async () => ({
        documents: [
          { amount: -0.005, description: "Admin Business Assistant Message", type: "usage_debit" },
        ],
      }),
    } as any,
  });

  const accRes = await handleGetAccountStatus(mockContext);
  assert.equal(accRes.success, true);
  assert.ok(accRes.message.includes("BlackArrow Store"));
  assert.ok(accRes.message.includes("PRO"));

  const planRes = await handleGetPlanStatus(mockContext);
  assert.equal(planRes.success, true);
  assert.ok(planRes.message.includes("Subscription & Plan Status"));

  const walletRes = await handleGetWalletBalance(mockContext);
  assert.equal(walletRes.success, true);
  assert.equal(walletRes.data.walletBalance, 24.5);
  assert.ok(walletRes.message.includes("$24.500"));

  const usageRes = await handleGetUsageSummary(mockContext);
  assert.equal(usageRes.success, true);
  assert.ok(usageRes.message.includes("Usage Summary"));

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 5. WHATSAPP & BOT INSTANCES
// ---------------------------------------------------------------------------

test("6. WhatsApp instances and AI status handlers list connected bots", async () => {
  __setAdminBusinessReadTestDeps({
    getBotsByUser: async () => [
      { $id: "bot_1", bot_name: "Karachi Instance", connection_status: "connected", is_active: true, phone: "110064053003" },
      { $id: "bot_2", bot_name: "Lahore Instance", connection_status: "disconnected", is_active: false, phone: "111275114403" },
    ],
  });

  const listRes = await handleListInstances(mockContext);
  assert.equal(listRes.success, true);
  assert.equal(listRes.data.instances.length, 2);
  assert.ok(listRes.message.includes("Karachi Instance"));
  assert.ok(listRes.message.includes("Lahore Instance"));

  const statusRes = await handleGetInstanceStatus(mockContext, { botId: "bot_1" });
  assert.equal(statusRes.success, true);
  assert.ok(statusRes.message.includes("Karachi Instance"));

  const aiRes = await handleGetAiReplyStatus(mockContext);
  assert.equal(aiRes.success, true);
  assert.equal(aiRes.data.activeAiBots, 1);

  const healthRes = await handleGetConnectionHealth(mockContext);
  assert.equal(healthRes.success, true);

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 6. CUSTOMERS & LEADS
// ---------------------------------------------------------------------------

test("7. Customer search disambiguates multiple results and shows detail for single result", async () => {
  __setAdminBusinessReadTestDeps({
    databases: {
      listDocuments: async () => ({
        documents: [
          { $id: "c1", name: "Ali Khan", phone: "195545134641", city: "Lahore", customer_jid: "contact-e4ed32210a80@example.invalid" },
          { $id: "c2", name: "Ali Raza", phone: "157189850060", city: "Karachi", customer_jid: "contact-b3c6be38212e@example.invalid" },
        ],
      }),
    } as any,
  });

  // Ambiguous search -> lists options
  const ambigRes = await handleSearchCustomers(mockContext, { query: "Ali" });
  assert.equal(ambigRes.success, true);
  assert.equal((ambigRes.data as any)?.matches?.length, 2);
  assert.ok(ambigRes.message.includes("Multiple Customers Found"));

  // Exact single match -> shows customer profile
  const exactRes = await handleSearchCustomers(mockContext, { query: "Ali Khan" });
  assert.equal(exactRes.success, true);
  assert.equal((exactRes.data as any)?.name, "Ali Khan");
  assert.ok(exactRes.message.includes("Customer Profile: Ali Khan"));

  // Recent customers list
  const recentRes = await handleGetRecentCustomers(mockContext);
  assert.equal(recentRes.success, true);
  assert.equal((recentRes.data as any)?.customers?.length, 2);

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 7. ORDERS & COURIERS
// ---------------------------------------------------------------------------

test("8. Order handlers retrieve orders, filter pending, and compute status counts", async () => {
  __setAdminBusinessReadTestDeps({
    databases: {
      listDocuments: async () => ({
        documents: [
          { $id: "ord_1", order_id: "ORD-9901", customer_name: "Usman", total_amount: 120, status: "pending" },
          { $id: "ord_2", order_id: "ORD-9902", customer_name: "Bilal", total_amount: 300, status: "delivered" },
        ],
      }),
    } as any,
  });

  const searchRes = await handleSearchOrders(mockContext, { query: "ORD-9901" });
  assert.equal(searchRes.success, true);
  assert.ok(searchRes.message.includes("ORD-9901"));
  assert.ok(searchRes.message.includes("Usman"));

  const pendingRes = await handleListPendingOrders(mockContext);
  assert.equal(pendingRes.success, true);
  assert.equal(pendingRes.data.orders.length, 1);

  const countsRes = await handleGetOrderCounts(mockContext);
  assert.equal(countsRes.success, true);
  assert.equal(countsRes.data.total, 2);
  assert.equal(countsRes.data.pending, 1);
  assert.equal(countsRes.data.completed, 1);

  const trackRes = await handleGetCourierTrackingStatus(mockContext, { trackingNumber: "POSTEX-12345" });
  assert.equal(trackRes.success, true);
  assert.ok(trackRes.message.includes("POSTEX-12345"));

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 8. PRODUCTS & INVENTORY
// ---------------------------------------------------------------------------

test("9. Product and stock handlers identify low stock and out-of-stock items", async () => {
  __setAdminBusinessReadTestDeps({
    databases: {
      listDocuments: async () => ({
        documents: [
          { $id: "p1", name: "Leather Shoes", price: 150, stock: 3, sku: "SHOE-01" },
          { $id: "p2", name: "Silk Tie", price: 30, stock: 0, sku: "TIE-01" },
          { $id: "p3", name: "Cotton Socks", price: 10, stock: 50, sku: "SOCK-01" },
        ],
      }),
    } as any,
  });

  const lowStockRes = await handleListLowStockProducts(mockContext);
  assert.equal(lowStockRes.success, true);
  assert.equal(lowStockRes.data.products.length, 1);
  assert.equal(lowStockRes.data.products[0].name, "Leather Shoes");

  const outOfStockRes = await handleListUnavailableProducts(mockContext);
  assert.equal(outOfStockRes.success, true);
  assert.equal(outOfStockRes.data.products.length, 1);
  assert.equal(outOfStockRes.data.products[0].name, "Silk Tie");

  const searchProdRes = await handleSearchProducts(mockContext, { query: "Shoes" });
  assert.equal(searchProdRes.success, true);
  assert.ok(searchProdRes.message.includes("Leather Shoes"));

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 9. MULTI-LINGUAL INTENT MATCHING
// ---------------------------------------------------------------------------

test("10. Multi-lingual intent: conversational phrases bypass regex matcher and resolve semantically via AI planner", async () => {
  // Conversational phrases MUST return NO action from matchAdminActionFromText (no regex shortcuts)
  const conversationalPhrases = [
    "business overview",
    "today sales",
    "wallet balance",
    "aaj ki report",
    "aaj ka hisab",
    "kitne paise hain",
    "masla",
    "kal",
  ];
  for (const phrase of conversationalPhrases) {
    const matched = matchAdminActionFromText(phrase);
    assert.equal(matched.action, undefined, `Conversational phrase "${phrase}" must not be intercepted by regex matcher`);
  }

  // Exact registered Category A action commands ARE matched deterministically
  const directId = matchAdminActionFromText("get_business_overview");
  assert.equal(directId.action?.actionId, "get_business_overview");

  const systemCmd = matchAdminActionFromText(".0");
  assert.equal(systemCmd.action?.actionId, "pause_bot");

  // Semantic AI planner resolves multilingual conversational intents accurately
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async (params: any) => {
      const userText = params.messages[params.messages.length - 1]?.content || "";
      if (userText.includes("business overview") || userText.includes("aaj ki report")) {
        return {
          requestStatus: "success",
          toolCalls: [{ id: "tc_1", name: "get_business_overview", arguments: { range: "today" } }],
        } as any;
      }
      if (userText.includes("today sales") || userText.includes("aaj ka hisab")) {
        return {
          requestStatus: "success",
          toolCalls: [{ id: "tc_2", name: "get_today_business_summary", arguments: {} }],
        } as any;
      }
      if (userText.includes("wallet balance") || userText.includes("kitne paise hain")) {
        return {
          requestStatus: "success",
          toolCalls: [{ id: "tc_3", name: "get_wallet_balance", arguments: {} }],
        } as any;
      }
      return {
        requestStatus: "success",
        toolCalls: [{ id: "tc_def", name: "get_business_overview", arguments: {} }],
      } as any;
    },
  });

  const resEn = await resolveAdminAgentIntent({ text: "business overview", context: mockContext });
  assert.equal(resEn.mode, "tool");
  assert.equal(resEn.actionId, "get_business_overview");

  const resRoman = await resolveAdminAgentIntent({ text: "aaj ki report", context: mockContext });
  assert.equal(resRoman.mode, "tool");
  assert.equal(resRoman.actionId, "get_business_overview");

  const resWallet = await resolveAdminAgentIntent({ text: "kitne paise hain", context: mockContext });
  assert.equal(resWallet.mode, "tool");
  assert.equal(resWallet.actionId, "get_wallet_balance");

  __resetAdminBusinessAgentTestDeps();
});

// ---------------------------------------------------------------------------
// 10. WRITE / MUTATION SAFETY & REJECTION
// ---------------------------------------------------------------------------

test("11. Write / mutation intents are detected and safely rejected", async () => {
  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, amountChargedUsd: 0.005, previousBalance: 10, newBalance: 9.995 })) as any,
  });

  const unsupportedWriteIntents = [
    "turn off bot",
    "destroy account",
    "bot band karo",
    "change password",
    "reset password",
    "edit setting",
  ];

  for (const intent of unsupportedWriteIntents) {
    const matched = matchAdminActionFromText(intent);
    assert.ok(matched.isWriteAction, `Intent should be flagged as write action: "${intent}"`);

    // Verify router handles write intent with safe rejection message
    let sentText = "";
    const fakeSock = {
      sendMessage: async (_jid: string, content: { text: string }) => {
        sentText = content.text;
        return { key: { id: "test_msg_id" } };
      },
    };

    const res = await handleAdminBusinessAssistantMessage({
      sock: fakeSock,
      context: mockContext,
      rawMessage: {},
      text: intent,
    });

    assert.equal(res.handled, true);
    assert.ok(sentText.includes("Action Not Supported via WhatsApp"));
    assert.ok(sentText.includes("blackarrow-source.offline.invalid/dashboard"));
  }

  __resetAdminRouterTestDeps();
});

// ---------------------------------------------------------------------------
// 11. INTEGRATIONS & SECURITY SECRET MASKING
// ---------------------------------------------------------------------------

test("12. Integration queries return status with all credentials securely masked", async () => {
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({
      woocommerce_url: "https://myshop.com",
      woocommerce_consumer_key: "ck_secret_key_12345",
      postex_token: "postex_super_secret_token",
      leopards_api_key: "leopards_private_api_key",
      public_api_key: "capk_live_99999",
    }),
  });

  const intRes = await handleGetIntegrationsStatus(mockContext);
  assert.equal(intRes.success, true);
  assert.ok(!intRes.message.includes("ck_secret_key_12345"));
  assert.ok(!intRes.message.includes("postex_super_secret_token"));
  assert.ok(!intRes.message.includes("leopards_private_api_key"));

  const wooRes = await handleGetWooCommerceStatus(mockContext);
  assert.equal(wooRes.success, true);
  assert.ok(wooRes.message.includes("https://myshop.com"));
  assert.ok(!wooRes.message.includes("ck_secret_key_12345"));

  const postexRes = await handleGetPostExStatus(mockContext);
  assert.equal(postexRes.success, true);
  assert.ok(!postexRes.message.includes("postex_super_secret_token"));

  const leopardsRes = await handleGetLeopardsStatus(mockContext);
  assert.equal(leopardsRes.success, true);
  assert.ok(!leopardsRes.message.includes("leopards_private_api_key"));

  __resetAdminBusinessReadTestDeps();
});

// ---------------------------------------------------------------------------
// 12. AUTOMATIONS, BROADCASTS & LIVE MONITOR
// ---------------------------------------------------------------------------

test("13. Automations, broadcasts, and live monitor queries return structured status", async () => {
  __setAdminBusinessReadTestDeps({
    getUser: async () => ({
      followup_campaigns: JSON.stringify([
        { name: "Follow up message 1", hours: 24 },
        { name: "Follow up message 2", hours: 48 },
      ]),
    }),
  });

  const followRes = await handleListFollowups(mockContext);
  assert.equal(followRes.success, true);
  assert.equal(followRes.data.followups.length, 2);

  const bcastRes = await handleListBroadcasts(mockContext);
  assert.equal(bcastRes.success, true);

  const safeEventsRes = await handleGetRecentSafeEvents();
  assert.equal(safeEventsRes.success, true);

  const blockedRes = await handleGetRecentBlockedReasons();
  assert.equal(blockedRes.success, true);

  const teamRes = await handleGetTeamSummary(mockContext);
  assert.equal(teamRes.success, true);
  assert.ok(teamRes.message.includes("Team & Access Summary"));

  const sec2faRes = await handleGet2faStatus(mockContext);
  assert.equal(sec2faRes.success, true);
  assert.ok(sec2faRes.message.includes("2FA"));

  __resetAdminBusinessReadTestDeps();
});
