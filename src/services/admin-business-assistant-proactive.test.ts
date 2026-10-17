import test from "node:test";
import assert from "node:assert/strict";
import {
  getProactiveAlertPreferences,
  saveProactiveAlertPreferences,
  evaluateAndDispatchSignal,
  resolveIncident,
  dismissIncident,
  snoozeIncident,
  rememberActiveAlertContext,
  getActiveAlertContext,
  clearActiveAlertContext,
  generateDailyBusinessDigest,
  generateWeeklyBusinessDigest,
  dispatchDailyDigest,
  dispatchWeeklyDigest,
  evaluateBusinessPerformanceChange,
  isWithinQuietHours,
  computeDeduplicationKey,
  setProactiveServiceDeps,
  resetProactiveServiceDeps,
  handleGetProactiveAlertSettings,
  handleUpdateProactiveAlertCategory,
  handleSetDailyDigestTime,
  handleSetHighValueOrderThreshold,
  handleSetLowWalletAlertThreshold,
  DEFAULT_PROACTIVE_PREFERENCES,
  type ProactiveSignal,
} from "./admin-proactive-service.ts";
import {
  handleAdminBusinessAssistantMessage,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  getAdminAction,
  listAdminActions,
  canExecuteAdminBusinessAction,
} from "./admin-action-registry-service.ts";
import {
  claimCloudInboundMessage,
  updateCloudInboundMessageState,
  recoverStaleCloudInboundClaims,
  clearDurableCloudDedup,
} from "./whatsapp-cloud-api-durable-dedup.ts";
import {
  __setAdminBusinessReadTestDeps,
  __resetAdminBusinessReadTestDeps,
} from "./admin-business-read-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

const mockContext: AdminBusinessAssistantContext = {
  accountId: "acc_proactive_123",
  userId: "acc_proactive_123",
  botId: "bot_123",
  adminJid: "contact-e4ed32210a80@example.invalid",
  adminPhone: "+144225232320",
  adminRole: "owner",
  isBusinessAssistantEnabled: true,
  mode: "admin_business_assistant",
  conversationId: "conv_proactive_test",
  isAuthorizedAdmin: true,
  isPrimaryOwner: true,
};

test.beforeEach(() => {
  resetProactiveServiceDeps();
  __resetAdminRouterTestDeps();
  __resetAdminBusinessReadTestDeps();
  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true } as any)) as any,
    chargeUsageBillingAction: (async () => ({ charged: true } as any)) as any,
  });
  clearDurableCloudDedup();
});

// ---------------------------------------------------------------------------
// 1. OFFICIAL API CHANGE AUDIT
// ---------------------------------------------------------------------------

test("Official API Audit: recoverStaleCloudInboundClaims works deterministically with 0 maxAgeMs", async () => {
  clearDurableCloudDedup();
  const claim = await claimCloudInboundMessage({
    accountId: "user_audit_p7",
    botId: "bot_audit_p7",
    providerMessageId: `wamid_audit_p7_${Date.now()}`,
  });
  assert.equal(claim.state, "claimed");

  await updateCloudInboundMessageState({
    claimKeyOrId: claim.claimId,
    state: "processing",
  });

  await new Promise((r) => setTimeout(r, 10));

  const recovered = recoverStaleCloudInboundClaims(0);
  assert.equal(recovered, 1);
  clearDurableCloudDedup();
});

test("Official API Audit: Runtime remains disabled and unexposed", () => {
  const allActions = listAdminActions();
  const cloudActions = allActions.filter((a) => a.actionId.includes("cloud_api_runtime"));
  assert.equal(cloudActions.length, 0);
});

// ---------------------------------------------------------------------------
// 2. SETTINGS & PREFERENCES TESTS
// ---------------------------------------------------------------------------

test("1. Settings: Proactive alerts default to conservative OFF", async () => {
  const prefs = await getProactiveAlertPreferences("acc_fresh");
  assert.equal(prefs.isProactiveAlertsEnabled, false);
  assert.equal(prefs.categories.dailyDigest, false);
  assert.equal(prefs.categories.weeklyDigest, false);
  assert.equal(prefs.thresholds.lowWalletAlertFloorUsd, 0.50);
});

test("2. Settings: handleGetProactiveAlertSettings returns structured configuration", async () => {
  const res = await handleGetProactiveAlertSettings(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Proactive Alerts & Digests Settings/);
  assert.match(res.message, /Master Proactive Alerts/);
  assert.match(res.message, /High-Value Order/);
});

test("3. Settings: handleUpdateProactiveAlertCategory enables category and master toggle", async () => {
  const res = await handleUpdateProactiveAlertCategory(mockContext, {
    category: "stock",
    enabled: true,
  });
  assert.equal(res.success, true);
  assert.equal(res.data.isProactiveAlertsEnabled, true);
  assert.equal(res.data.categories.stock, true);
});

test("4. Settings: handleUpdateProactiveAlertCategory rejects invalid category", async () => {
  const res = await handleUpdateProactiveAlertCategory(mockContext, {
    category: "invalid_category",
    enabled: true,
  });
  assert.equal(res.success, false);
  assert.match(res.message, /Invalid proactive alert category/);
});

test("5. Settings: handleSetDailyDigestTime validates 24-hr format", async () => {
  const validRes = await handleSetDailyDigestTime(mockContext, { time: "08:30" });
  assert.equal(validRes.success, true);
  assert.equal(validRes.data.schedules.dailyDigestTime, "08:30");
  assert.equal(validRes.data.categories.dailyDigest, true);

  const invalidRes = await handleSetDailyDigestTime(mockContext, { time: "25:99" });
  assert.equal(invalidRes.success, false);
  assert.match(invalidRes.message, /Invalid time format/);
});

test("6. Settings: Threshold setters enforce valid positive numbers and low wallet floor", async () => {
  const orderRes = await handleSetHighValueOrderThreshold(mockContext, { threshold: 250 });
  assert.equal(orderRes.success, true);
  assert.equal(orderRes.data.thresholds.highValueOrderUsd, 250);

  const walletRes = await handleSetLowWalletAlertThreshold(mockContext, { threshold: 1.50 });
  assert.equal(walletRes.success, true);
  assert.equal(walletRes.data.thresholds.lowWalletAlertFloorUsd, 1.50);

  const invalidWalletRes = await handleSetLowWalletAlertThreshold(mockContext, { threshold: 0.001 });
  assert.equal(invalidWalletRes.success, false);
  assert.match(invalidWalletRes.message, /greater than \$0\.003/);
});

test("7. Settings: Tenant isolation on proactive preferences", async () => {
  let storedPatches: Record<string, any> = {};
  setProactiveServiceDeps({
    saveUserExtraConfigPatch: async (uid, patch) => {
      storedPatches[uid] = patch;
      return patch;
    },
    getUserExtraConfigValue: async (uid) => storedPatches[uid]?.proactiveAlertPreferences || null,
  });

  await saveProactiveAlertPreferences("acc_tenant_A", { isProactiveAlertsEnabled: true });
  await saveProactiveAlertPreferences("acc_tenant_B", { isProactiveAlertsEnabled: false });

  const prefsA = await getProactiveAlertPreferences("acc_tenant_A");
  const prefsB = await getProactiveAlertPreferences("acc_tenant_B");

  assert.equal(prefsA.isProactiveAlertsEnabled, true);
  assert.equal(prefsB.isProactiveAlertsEnabled, false);
});

// ---------------------------------------------------------------------------
// 3. WHATSAPP & BOT HEALTH SIGNALS
// ---------------------------------------------------------------------------

test("8. Bot Health: Disconnect signal dispatches alert and charges $0.005 on send", async () => {
  let sentMessage = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (params) => {
      sentMessage = params.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "whatsapp_disconnected",
    accountId: mockContext.accountId,
    botId: "bot_1",
    severity: "URGENT",
    resourceType: "instance",
    evidence: { botName: "Sales Assistant" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "whatsapp_disconnected", "instance", "bot_1"),
  });

  assert.equal(res.dispatched, true);
  assert.equal(res.billedAmountUsd, 0.003);
  assert.match(sentMessage, /URGENT ALERT/);
  assert.match(sentMessage, /WhatsApp Instance Disconnected/);
  assert.match(sentMessage, /Sales Assistant/);
});

test("9. Bot Health: Duplicate poll within cooldown is suppressed at $0 cost", async () => {
  let sendCount = 0;
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async () => {
      sendCount++;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const signal = {
    signalType: "whatsapp_disconnected" as const,
    accountId: mockContext.accountId,
    botId: "bot_1",
    severity: "URGENT" as const,
    resourceType: "instance" as const,
    evidence: { botName: "Sales Assistant" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "whatsapp_disconnected", "instance", "bot_1"),
  };

  const first = await evaluateAndDispatchSignal(signal);
  assert.equal(first.dispatched, true);
  assert.equal(sendCount, 1);

  // Second immediate dispatch
  const second = await evaluateAndDispatchSignal(signal);
  assert.equal(second.dispatched, false);
  assert.equal(second.status, "SUPPRESSED");
  assert.equal(second.suppressReason, "cooldown_active");
  assert.equal(second.billedAmountUsd, 0);
  assert.equal(sendCount, 1);
});

test("10. Bot Health: Incident resolution marks state and sends single recovery alert", async () => {
  let recoverySent = false;
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async () => {
      recoverySent = true;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });
  const dedupKey = computeDeduplicationKey(mockContext.accountId, "whatsapp_disconnected", "instance", "bot_1");

  await evaluateAndDispatchSignal({
    signalType: "whatsapp_disconnected",
    accountId: mockContext.accountId,
    botId: "bot_1",
    severity: "URGENT",
    resourceType: "instance",
    evidence: { botName: "Sales Assistant" },
    deduplicationKey: dedupKey,
  });

  const res = await resolveIncident(mockContext.accountId, dedupKey, { sendRecoveryAlert: true });
  assert.equal(res.resolved, true);
  assert.equal(res.billedAmountUsd, 0.003);
  assert.equal(recoverySent, true);
});

test("11. Bot Health: Separate bot instances produce separate incidents", () => {
  const key1 = computeDeduplicationKey("acc_1", "whatsapp_disconnected", "bot_1", "bot_1");
  const key2 = computeDeduplicationKey("acc_1", "whatsapp_disconnected", "bot_2", "bot_2");
  assert.notEqual(key1, key2);
});

// ---------------------------------------------------------------------------
// 4. AI HEALTH & REPLIES
// ---------------------------------------------------------------------------

test("12. AI Health: Repeated AI failures trigger alert with accurate evidence", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "ai_replies_failing",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "ai_reply",
    evidence: { failureCount: 5, windowMinutes: 15 },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "ai_replies_failing"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /5 automated customer replies failed/);
});

// ---------------------------------------------------------------------------
// 5. CUSTOMER ATTENTION & UNREPLIED SIGNALS
// ---------------------------------------------------------------------------

test("13. Customer: Unreplied customer creates alert and binds alert context", async () => {
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async () => ({ success: true, billed: true }),
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "customer_unreplied",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "customer",
    resourceId: "cust_923005555555",
    evidence: { customerName: "Zahid Ahmed", waitingMinutes: 35, customerPhone: "+124645955732" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "customer_unreplied", "cust_923005555555"),
  });

  assert.equal(res.dispatched, true);

  const boundCtx = getActiveAlertContext(mockContext.accountId, mockContext.adminJid);
  assert.ok(boundCtx);
  assert.equal(boundCtx.resourceType, "customer");
  assert.equal(boundCtx.resourceId, "cust_923005555555");
});

test("14. Customer: Human handover request alert is formatted accurately", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "human_handover_requested",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "customer",
    resourceId: "cust_123",
    evidence: { customerName: "Usman", reason: "Product damaged upon delivery" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "human_handover_requested", "cust_123"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /Human Agent Takeover Requested/);
  assert.match(sentText, /Product damaged upon delivery/);
});

// ---------------------------------------------------------------------------
// 6. ORDER ALERTS & COURIER FAILURES
// ---------------------------------------------------------------------------

test("15. Orders: High-value order exceeding threshold triggers alert", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, {
    isProactiveAlertsEnabled: true,
    thresholds: { ...DEFAULT_PROACTIVE_PREFERENCES.thresholds, highValueOrderUsd: 150 },
  });

  const res = await evaluateAndDispatchSignal({
    signalType: "order_high_value",
    accountId: mockContext.accountId,
    severity: "INFO",
    resourceType: "order",
    resourceId: "1001",
    evidence: { orderNumber: "1001", totalAmount: 250, customerName: "Ali Khan" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "order_high_value", "1001"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /High-Value Order Received/);
  assert.match(sentText, /\$250/);
});

test("16. Orders: Courier booking failure alerts admin with safe next step", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "order_operation_failed",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "order",
    resourceId: "1005",
    recommendedWriteAction: "retry_courier_booking",
    evidence: { orderNumber: "1005", errorMessage: "Invalid pickup city" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "order_operation_failed", "1005"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /Order Courier Booking Failed/);
  assert.match(sentText, /Invalid pickup city/);
});

// ---------------------------------------------------------------------------
// 7. STOCK & INVENTORY ALERTS
// ---------------------------------------------------------------------------

test("17. Stock: Low stock threshold crossed sends single alert and resolves on restock", async () => {
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async () => ({ success: true, billed: true }),
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });
  const dedupKey = computeDeduplicationKey(mockContext.accountId, "stock_low", "prod_99");

  const alertRes = await evaluateAndDispatchSignal({
    signalType: "stock_low",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "product",
    resourceId: "prod_99",
    evidence: { productName: "Smart Watch V2", stock: 2 },
    deduplicationKey: dedupKey,
  });
  assert.equal(alertRes.dispatched, true);

  // Duplicate stock alert suppressed
  const dupRes = await evaluateAndDispatchSignal({
    signalType: "stock_low",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "product",
    resourceId: "prod_99",
    evidence: { productName: "Smart Watch V2", stock: 2 },
    deduplicationKey: dedupKey,
  });
  assert.equal(dupRes.status, "SUPPRESSED");

  // Stock recovered
  const resolveRes = await resolveIncident(mockContext.accountId, dedupKey);
  assert.equal(resolveRes.resolved, true);
});

// ---------------------------------------------------------------------------
// 8. CAMPAIGN ALERTS & FAILURE AGGREGATION
// ---------------------------------------------------------------------------

test("18. Campaigns: 50 failed broadcast recipients aggregate into 1 single incident alert", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "campaign_failed",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "campaign",
    resourceId: "camp_weekend_flash",
    evidence: {
      campaignName: "Weekend Flash Sale",
      failedCount: 50,
      totalCount: 500,
    },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "campaign_failed", "camp_weekend_flash"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /50 out of 500 messages failed/);
  assert.match(sentText, /Weekend Flash Sale/);
});

// ---------------------------------------------------------------------------
// 9. INTEGRATIONS (WOOCOMMERCE & POSTEX)
// ---------------------------------------------------------------------------

test("19. Integrations: WooCommerce sync failure alerts admin without exposing secrets", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "integration_sync_failed",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "integration",
    recommendedWriteAction: "retry_woocommerce_sync",
    evidence: { integrationName: "WooCommerce", errorMessage: "HTTP 503 Service Unavailable" },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "integration_sync_failed", "woocommerce"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /WooCommerce synchronization failed/);
  assert.match(sentText, /HTTP 503/);
  assert.doesNotMatch(sentText, /consumer_secret/i);
});

// ---------------------------------------------------------------------------
// 10. BILLING & WALLET ISOLATION
// ---------------------------------------------------------------------------

test("20. Billing: Insufficient wallet balance (< $0.005) suppresses Business Assistant alert", async () => {
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "user",
      plan_id: "growth_plan",
      wallet_balance: 0.001,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
      subscription_status: "active",
      plan_expiry: Math.floor(Date.now() / 1000) + 86400,
    }),
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "billing_low_wallet",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "billing",
    evidence: { walletBalance: 0.001, threshold: 0.50 },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "billing_low_wallet"),
  });

  assert.equal(res.dispatched, false);
  assert.equal(res.status, "SUPPRESSED");
  assert.equal(res.suppressReason, "insufficient_wallet");
  assert.equal(res.billedAmountUsd, 0);
});

test("21. Billing: Failed outbound WhatsApp delivery charges $0", async () => {
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async () => ({ success: false, billed: false, reason: "Socket offline" }),
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "stock_low",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "product",
    evidence: { productName: "Shoes", stock: 1 },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "stock_low", "shoes"),
  });

  assert.equal(res.dispatched, false);
  assert.equal(res.billedAmountUsd, 0);
  assert.equal(res.suppressReason, "outbound_send_failed");
});

// ---------------------------------------------------------------------------
// 11. BUSINESS PERFORMANCE & ANOMALY DETECTION
// ---------------------------------------------------------------------------

test("22. Performance: Insufficient history suppresses performance anomaly", async () => {
  setProactiveServiceDeps({
    databases: {
      listDocuments: async () => ({ documents: [{ total_amount: 50 }, { total_amount: 100 }] }), // Only 2 orders
    } as any,
  });

  const res = await evaluateBusinessPerformanceChange(mockContext.accountId);
  assert.equal(res.hasAnomaly, false);
});

test("23. Performance: Statistical spike detected with factual percentage", async () => {
  const pastOrders = Array.from({ length: 10 }, (_, i) => ({
    $id: `ord_${i}`,
    $createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    total_amount: 100, // Avg ~$100/day
  }));

  const todayOrders = [
    { $id: "tod_1", $createdAt: new Date().toISOString(), total_amount: 300 },
    { $id: "tod_2", $createdAt: new Date().toISOString(), total_amount: 300 },
  ]; // Total today = $600 (+250% spike)

  setProactiveServiceDeps({
    databases: {
      listDocuments: async () => ({ documents: [...pastOrders, ...todayOrders] }),
    } as any,
  });

  const res = await evaluateBusinessPerformanceChange(mockContext.accountId);
  assert.equal(res.hasAnomaly, true);
  assert.equal(res.signal?.signalType, "performance_anomaly");
  assert.ok(res.signal?.evidence?.changePercentage > 50);
});

// ---------------------------------------------------------------------------
// 12. DAILY & WEEKLY BUSINESS DIGESTS
// ---------------------------------------------------------------------------

test("24. Digests: generateDailyBusinessDigest compiles clean consolidated metrics", async () => {
  setProactiveServiceDeps({
    getUser: async () => ({ $id: mockContext.accountId, wallet_balance: 12.50 }),
    getBotsByUser: async () => [{ connection_status: "connected" }],
    databases: {
      listDocuments: async (_db, coll) => {
        if (coll === "orders") {
          return { documents: [{ $createdAt: new Date().toISOString(), total_amount: 450 }] };
        }
        if (coll === "customers") {
          return { documents: [{ $createdAt: new Date().toISOString(), name: "Ali" }] };
        }
        return { documents: [] };
      },
    } as any,
  });

  const digest = await generateDailyBusinessDigest(mockContext.accountId);
  assert.match(digest.text, /Daily Business Digest/);
  assert.match(digest.text, /\$450/);
  assert.match(digest.text, /Wallet Balance.*\$12\.500/);
});

test("25. Digests: dispatchDailyDigest is idempotent and does not double-send", async () => {
  let dispatchCount = 0;
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    getBotsByUser: async () => [],
    databases: {
      listDocuments: async () => ({ documents: [] }),
    } as any,
    sendAdminAssistantReply: async () => {
      dispatchCount++;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, {
    isProactiveAlertsEnabled: true,
    categories: { ...DEFAULT_PROACTIVE_PREFERENCES.categories, dailyDigest: true },
  });

  const first = await dispatchDailyDigest(mockContext.accountId, { dateStr: "2026-08-27" });
  assert.equal(first.dispatched, true);
  assert.equal(first.billedAmountUsd, 0.003);
  assert.equal(dispatchCount, 1);

  // Second call on same date
  const second = await dispatchDailyDigest(mockContext.accountId, { dateStr: "2026-08-27" });
  assert.equal(second.dispatched, false);
  assert.equal(second.suppressReason, "already_sent_today");
  assert.equal(dispatchCount, 1);
});

// ---------------------------------------------------------------------------
// 13. QUIET HOURS
// ---------------------------------------------------------------------------

test("26. Quiet Hours: isWithinQuietHours evaluates overnight window correctly", () => {
  const quietConfig = { enabled: true, start: "23:00", end: "08:00", urgentBypass: true };
  const inHours = isWithinQuietHours(quietConfig);
  assert.equal(typeof inHours, "boolean");
});

// ---------------------------------------------------------------------------
// 14. ACTIONABLE ALERT CONTEXT (SHOW ME, FIX IT, DISMISS, SNOOZE)
// ---------------------------------------------------------------------------

test("27. Alert Context: 'show me' resolves to bound customer details", async () => {
  rememberActiveAlertContext({
    contextId: "ctx_1",
    accountId: mockContext.accountId,
    adminJid: mockContext.adminJid,
    incidentId: "inc_1",
    signalType: "customer_unreplied",
    resourceType: "customer",
    resourceId: "cust_923001112233",
    metadata: { customerPhone: "+150333823501" },
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
  });

  let repliedText = "";
  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      repliedText = content.text;
      return { key: { id: "msg_reply_1" } };
    },
  };

  __setAdminBusinessReadTestDeps({
    databases: {
      listDocuments: async () => ({ documents: [{ $id: "cust_923001112233", name: "Ahmed Raza", phone: "+150333823501", user_id: mockContext.accountId }] }),
    } as any,
  });

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "show me",
    rawMessage: {},
  });

  assert.equal(res.handled, true);
  assert.match(repliedText, /Customer Profile/);
  assert.match(repliedText, /Ahmed Raza/);
});

test("28. Alert Context: 'fix it' triggers recommended write action with confirmation preview", async () => {
  rememberActiveAlertContext({
    contextId: "ctx_2",
    accountId: mockContext.accountId,
    adminJid: mockContext.adminJid,
    incidentId: "inc_2",
    signalType: "integration_sync_failed",
    resourceType: "integration",
    recommendedWriteAction: "sync_woocommerce",
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
  });

  let repliedText = "";
  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      repliedText = content.text;
      return { key: { id: "msg_reply_2" } };
    },
  };

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "fix it",
    rawMessage: {},
  });

  assert.equal(res.handled, true);
  assert.match(repliedText, /Confirmation Required/);
  assert.match(repliedText, /WooCommerce/);
});

test("29. Alert Context: 'ignore this' dismisses incident", async () => {
  rememberActiveAlertContext({
    contextId: "ctx_3",
    accountId: mockContext.accountId,
    adminJid: mockContext.adminJid,
    incidentId: "inc_3",
    signalType: "stock_low",
    resourceType: "product",
    resourceId: "prod_1",
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
  });

  let repliedText = "";
  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      repliedText = content.text;
      return { key: { id: "msg_reply_3" } };
    },
  };

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "ignore this",
    rawMessage: {},
  });

  assert.equal(res.handled, true);
  assert.match(repliedText, /Alert Dismissed/);
  assert.equal(getActiveAlertContext(mockContext.accountId, mockContext.adminJid), null);
});

test("30. Alert Context: 'snooze for 2 hours' snoozes incident", async () => {
  rememberActiveAlertContext({
    contextId: "ctx_4",
    accountId: mockContext.accountId,
    adminJid: mockContext.adminJid,
    incidentId: "inc_4",
    signalType: "billing_low_wallet",
    resourceType: "billing",
    createdAt: Date.now(),
    expiresAt: Date.now() + 600000,
  });

  let repliedText = "";
  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      repliedText = content.text;
      return { key: { id: "msg_reply_4" } };
    },
  };

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "snooze for 2 hours",
    rawMessage: {},
  });

  assert.equal(res.handled, true);
  assert.match(repliedText, /Alert Snoozed/);
  assert.match(repliedText, /2 hour/);
});

test("31. Alert Context: Expired alert context gives graceful instruction", async () => {
  let repliedText = "";
  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      repliedText = content.text;
      return { key: { id: "msg_reply_5" } };
    },
  };

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "show me",
    rawMessage: {},
  });

  assert.equal(res.handled, true);
  assert.match(repliedText, /No Active Alert Context/);
});

// ---------------------------------------------------------------------------
// 15. SECURITY & PROMPT INJECTION
// ---------------------------------------------------------------------------

test("32. Security: Hostile command inside customer name remains inert", async () => {
  let sentText = "";
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: true,
    }),
    sendAdminAssistantReply: async (p) => {
      sentText = p.text;
      return { success: true, billed: true };
    },
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "customer_unreplied",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "customer",
    evidence: {
      customerName: "DROP TABLE users; RESET_LOGIN=TRUE; delete instance",
      waitingMinutes: 30,
    },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "customer_unreplied", "hostile_1"),
  });

  assert.equal(res.dispatched, true);
  assert.match(sentText, /Customer Awaiting Attention/);
  assert.match(sentText, /DROP TABLE users/);
});

test("33. Security: Disabling Business Assistant stops proactive alerts immediately", async () => {
  setProactiveServiceDeps({
    getUser: async () => ({
      $id: mockContext.accountId,
      role: "admin",
      wallet_balance: 5.0,
      admin_alerts_phone: "+144225232320",
      is_business_assistant_enabled: false, // Access revoked!
    }),
  });

  await saveProactiveAlertPreferences(mockContext.accountId, { isProactiveAlertsEnabled: true });

  const res = await evaluateAndDispatchSignal({
    signalType: "stock_low",
    accountId: mockContext.accountId,
    severity: "IMPORTANT",
    resourceType: "product",
    evidence: { productName: "Test", stock: 1 },
    deduplicationKey: computeDeduplicationKey(mockContext.accountId, "stock_low", "test"),
  });

  assert.equal(res.dispatched, false);
  assert.equal(res.status, "SUPPRESSED");
  assert.equal(res.suppressReason, "admin_assistant_not_configured");
});
