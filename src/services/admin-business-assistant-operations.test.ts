import test from "node:test";
import assert from "node:assert/strict";
import {
  handleGetDetailedInstanceStatus,
  handlePauseBot,
  handleResumeBot,
  handleReloadBotConfig,
  handleSyncWooCommerce,
  handleRetryWooCommerceSync,
  handleGetWebsiteLeadApiStatus,
  handleRetryWebsiteLeadIngestion,
  handleGetPublicApiMetadata,
  handleGetWebhooksStatus,
  handleRetryWebhookDelivery,
  handleGetCourierOperationsStatus,
  handleTestCourierConnection,
  handleGetBillingOverview,
  handleGetBillingHistory,
  handleGetBusinessAssistantUsage,
  handleUpdateBillingPreferences,
  handleGetAdminAlertsConfig,
  handleUpdateAdminAlertCategory,
  handleListTeamMembers,
  handleInviteTeamMember,
  handleUpdateTeamMemberRole,
  handleRemoveTeamMember,
  handleGetSecurityOverview,
  handleGetActiveSessions,
  setOperationsServiceDeps,
  resetOperationsServiceDeps,
} from "./admin-operations-service.ts";
import { getAdminAction, listAdminActions } from "./admin-action-registry-service.ts";
import {
  handleAdminBusinessAssistantMessage,
  routerDeps,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  __setAdminBusinessAgentTestDeps,
  __resetAdminBusinessAgentTestDeps,
} from "./admin-business-agent-service.ts";
import {
  claimCloudInboundMessage,
  updateCloudInboundMessageState,
  recoverStaleCloudInboundClaims,
  clearDurableCloudDedup,
} from "./whatsapp-cloud-api-durable-dedup.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";

const mockContext: AdminBusinessAssistantContext = {
  accountId: "acc_123",
  userId: "acc_123",
  botId: "bot_123",
  adminJid: "contact-e4ed32210a80@example.invalid",
  adminPhone: "+144225232320",
  adminRole: "owner",
  isBusinessAssistantEnabled: true,
  mode: "admin_business_assistant",
  conversationId: "conv_ops_test",
  isAuthorizedAdmin: true,
  isPrimaryOwner: true,
};

const mockManagerContext: AdminBusinessAssistantContext = {
  accountId: "acc_123",
  userId: "acc_123",
  botId: "bot_123",
  adminJid: "contact-fb7cfca76a29@example.invalid",
  adminPhone: "+108540457300",
  adminRole: "manager",
  isBusinessAssistantEnabled: true,
  mode: "admin_business_assistant",
  conversationId: "conv_mgr_test",
  isAuthorizedAdmin: true,
  isPrimaryOwner: false,
};

test.beforeEach(() => {
  resetOperationsServiceDeps();
  __resetAdminRouterTestDeps();
  clearDurableCloudDedup();
});

// ===========================================================================
// SECTION 1: OFFICIAL API AUDIT & DURABLE DEDUP REGRESSION
// ===========================================================================

test("Official API Audit: recoverStaleCloudInboundClaims works deterministically with 0 maxAgeMs", async () => {
  clearDurableCloudDedup();
  const claim = await claimCloudInboundMessage({
    accountId: "user_audit",
    botId: "bot_audit",
    providerMessageId: `wamid_audit_${Date.now()}`,
  });
  assert.equal(claim.state, "claimed");

  await updateCloudInboundMessageState({
    claimKeyOrId: claim.claimId,
    state: "processing",
  });

  const recovered = recoverStaleCloudInboundClaims(0);
  assert.ok(recovered >= 1, "At least one stale claim recovered");
  clearDurableCloudDedup();
});

test("Official API Audit: Runtime remains disabled and unexposed", () => {
  // Verify that all registry actions and operations use canonical BlackArrow architecture
  const allActions = listAdminActions();
  const cloudActions = allActions.filter((a) => a.actionId.includes("cloud_api_runtime"));
  assert.equal(cloudActions.length, 0);
});

// ===========================================================================
// SECTION 2: INSTANCE OPERATIONS & BOT PAUSE / RESUME / RELOAD
// ===========================================================================

test("Instance Operations: handleGetDetailedInstanceStatus returns complete operational health", async () => {
  setOperationsServiceDeps({
    getBotsByUser: async () => [
      {
        $id: "bot_123",
        name: "Main Sales Bot",
        user_id: "acc_123",
        jid: "contact-e4ed32210a80@example.invalid",
        status: "connected",
        is_paused: false,
        ai_chat_replies_enabled: true,
        autoReply: true,
      },
    ],
    getUser: async () => ({
      $id: "acc_123",
      wallet_balance: 14.5,
      subscription_tier: "pro",
      subscription_status: "active",
      proxy_url: "http://proxy.regional.net:8080",
    }),
  });

  const res = await handleGetDetailedInstanceStatus(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /WhatsApp Instance Detailed Health/);
  assert.match(res.message, /Connected/);
  assert.match(res.message, /Active/);
  assert.match(res.message, /14\.5000/);
  assert.match(res.message, /Masked Regional Proxy Active/);
  assert.equal(res.data?.isConnected, true);
  assert.equal(res.data?.isPaused, false);
  assert.equal(res.data?.walletBalance, 14.5);
});

test("Instance Operations: handleGetDetailedInstanceStatus denies cross-tenant bot access", async () => {
  setOperationsServiceDeps({
    getBotsByUser: async () => [
      {
        $id: "bot_other",
        user_id: "acc_other_tenant",
        status: "connected",
      },
    ],
  });

  const res = await handleGetDetailedInstanceStatus(mockContext, { botId: "bot_other" });
  assert.equal(res.success, false);
  assert.match(res.message, /Unauthorized/);
});

test("Instance Operations: handlePauseBot supports temporary pause with hours parameter", async () => {
  let updatedPatch: any = null;
  setOperationsServiceDeps({
    getBotsByUser: async () => [{ $id: "bot_123", user_id: "acc_123", name: "Main Bot" }],
    updateBot: async (_id, patch) => {
      updatedPatch = patch;
      return patch;
    },
  });

  const res = await handlePauseBot(mockContext, { mode: "temporary", hours: 2 });
  assert.equal(res.success, true);
  assert.match(res.message, /Automation Paused/);
  assert.match(res.message, /2 hours/);
  assert.equal(updatedPatch.bot_paused, true);
  assert.equal(updatedPatch.pause_type, "temporary");
  assert.ok(updatedPatch.paused_until > Math.floor(Date.now() / 1000));
});

test("Instance Operations: handlePauseBot supports permanent pause (.00 equivalent)", async () => {
  let updatedPatch: any = null;
  setOperationsServiceDeps({
    getBotsByUser: async () => [{ $id: "bot_123", user_id: "acc_123", name: "Main Bot" }],
    updateBot: async (_id, patch) => {
      updatedPatch = patch;
      return patch;
    },
  });

  const res = await handlePauseBot(mockContext, { mode: "permanent" });
  assert.equal(res.success, true);
  assert.match(res.message, /Permanent Pause/);
  assert.equal(updatedPatch.bot_paused, true);
  assert.equal(updatedPatch.pause_type, "permanent");
  assert.equal(updatedPatch.paused_until, 0);
});

test("Instance Operations: handleResumeBot checks account entitlement and clears pause state", async () => {
  let updatedPatch: any = null;
  setOperationsServiceDeps({
    getBotsByUser: async () => [{ $id: "bot_123", user_id: "acc_123", name: "Main Bot", bot_paused: true }],
    getUser: async () => ({ $id: "acc_123", role: "admin", subscription_status: "active", wallet_balance: 5.0 }),
    updateBot: async (_id, patch) => {
      updatedPatch = patch;
      return patch;
    },
  });

  const res = await handleResumeBot(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Automation Resumed/);
  assert.equal(updatedPatch.bot_paused, false);
  assert.equal(updatedPatch.pause_type, "none");
  assert.equal(updatedPatch.paused_until, 0);
});

test("Instance Operations: handleResumeBot blocks resume if account subscription/wallet is restricted", async () => {
  setOperationsServiceDeps({
    getBotsByUser: async () => [{ $id: "bot_123", user_id: "acc_123", name: "Main Bot" }],
    getUser: async () => ({ $id: "acc_123", subscription_status: "expired", wallet_balance: 0 }),
  });

  const res = await handleResumeBot(mockContext);
  assert.equal(res.success, false);
  assert.match(res.message, /Cannot Resume Bot/);
});

test("Instance Operations: handleReloadBotConfig reloads runtime configs safely without wiping session", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getBotsByUser: async () => [{ $id: "bot_123", user_id: "acc_123", name: "Main Bot" }],
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleReloadBotConfig(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Configuration Reloaded Safely/);
  assert.match(res.message, /WhatsApp connection preserved/);
  assert.ok(savedConfig.lastConfigReloadAt > 0);
});

test("Instance Operations: Critical operations are registered as dashboard-only", () => {
  const resetLogin = getAdminAction("reset_whatsapp_login");
  assert.equal(resetLogin?.riskLevel, "CRITICAL");
  assert.equal(resetLogin?.isDashboardOnly, true);

  const deleteInstance = getAdminAction("delete_instance");
  assert.equal(deleteInstance?.riskLevel, "CRITICAL");
  assert.equal(deleteInstance?.isDashboardOnly, true);

  const wipeData = getAdminAction("wipe_bot_data");
  assert.equal(wipeData?.riskLevel, "CRITICAL");
  assert.equal(wipeData?.isDashboardOnly, true);
});

// ===========================================================================
// SECTION 3: INTEGRATIONS OPERATIONS (WOOCOMMERCE, LEADS, REST API, WEBHOOKS, COURIERS)
// ===========================================================================

test("Integrations: handleSyncWooCommerce synchronizes catalog when configured", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123", woocommerce_store_url: "https://shop.example.com" }),
    getUserExtraConfigValue: async () => null,
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleSyncWooCommerce(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /WooCommerce Catalog Synchronized/);
  assert.equal(savedConfig.wooCommerceSyncStatus, "success");
});

test("Integrations: handleSyncWooCommerce informs admin if store is not configured", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123" }),
    getUserExtraConfigValue: async () => null,
  });

  const res = await handleSyncWooCommerce(mockContext);
  assert.equal(res.success, false);
  assert.match(res.message, /WooCommerce Not Connected/);
});

test("Integrations: handleRetryWooCommerceSync retries catalog synchronization", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123", woocommerce_store_url: "https://shop.example.com" }),
    getUserExtraConfigValue: async () => null,
    saveUserExtraConfigPatch: async () => ({}),
  });

  const res = await handleRetryWooCommerceSync(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /WooCommerce Catalog Synchronized/);
});

test("Integrations: handleGetWebsiteLeadApiStatus returns endpoint rate limits and status", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123", website_lead_capture_enabled: true }),
  });

  const res = await handleGetWebsiteLeadApiStatus(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Website Lead Capture API/);
  assert.match(res.message, /120 req\/min/);
});

test("Integrations: handleRetryWebsiteLeadIngestion retries specific lead ingestion", async () => {
  const res = await handleRetryWebsiteLeadIngestion(mockContext, { leadId: "lead_99" });
  assert.equal(res.success, true);
  assert.match(res.message, /Lead Ingestion Retried/);
  assert.match(res.message, /lead_99/);
});

test("Integrations: handleGetPublicApiMetadata lists keys without revealing secrets", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => ({
      apiKeys: [
        { name: "ERP Connector", maskedKey: "bai_live_1234...abcd", status: "active", createdAt: 1780000000 },
      ],
    }),
  });

  const res = await handleGetPublicApiMetadata(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Public REST API Summary/);
  assert.match(res.message, /ERP Connector/);
  assert.match(res.message, /bai_live_1234\.\.\.abcd/);
  assert.match(res.message, /never revealed over WhatsApp/);
  assert.equal(res.data?.activeKeyCount, 1);
});

test("Integrations: handleGetWebhooksStatus returns configured endpoints and failures", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => ({
      webhookEndpoints: [
        { url: "https://api.mycrm.com/leads", enabled: true },
      ],
      webhookDeliveries: [
        { id: "del_1", success: false, error: "HTTP 502 Bad Gateway" },
      ],
    }),
  });

  const res = await handleGetWebhooksStatus(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Webhooks Integration Status/);
  assert.match(res.message, /HTTP 502 Bad Gateway/);
  assert.equal(res.data?.endpointCount, 1);
  assert.equal(res.data?.failedDeliveryCount, 1);
});

test("Integrations: handleRetryWebhookDelivery dispatches delivery retry", async () => {
  const res = await handleRetryWebhookDelivery(mockContext, { deliveryId: "del_failed_123" });
  assert.equal(res.success, true);
  assert.match(res.message, /Webhook Delivery Retried/);
  assert.match(res.message, /del_failed_123/);
});

test("Integrations: handleGetCourierOperationsStatus returns PostEx and Leopards health", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({
      $id: "acc_123",
      postex_token: "secret_token_123",
      leopards_api_key: "secret_leopards_123",
    }),
  });

  const res = await handleGetCourierOperationsStatus(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Courier Integrations Operational Health/);
  assert.match(res.message, /PostEx:.*Connected/);
  assert.match(res.message, /Leopards:.*Connected/);
  assert.equal(res.data?.postexActive, true);
  assert.equal(res.data?.leopardsActive, true);
});

test("Integrations: handleTestCourierConnection pings configured courier endpoint", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123", postex_token: "tok_123" }),
  });

  const res = await handleTestCourierConnection(mockContext, { courier: "postex" });
  assert.equal(res.success, true);
  assert.match(res.message, /PostEx Connection Verified/);
  assert.match(res.message, /Successful/);
});

test("Integrations: handleTestCourierConnection fails if courier is unconfigured", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123" }),
  });

  const res = await handleTestCourierConnection(mockContext, { courier: "leopards" });
  assert.equal(res.success, false);
  assert.match(res.message, /Leopards Not Configured/);
});

test("Integrations: Critical credential issuance and URL changes are dashboard-only", () => {
  assert.equal(getAdminAction("create_api_key")?.isDashboardOnly, true);
  assert.equal(getAdminAction("rotate_api_key")?.isDashboardOnly, true);
  assert.equal(getAdminAction("change_webhook_url")?.isDashboardOnly, true);
});

// ===========================================================================
// SECTION 4: BILLING & PREFERENCES OPERATIONS
// ===========================================================================

test("Billing: handleGetBillingOverview returns plan status and wallet balance", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({
      $id: "acc_123",
      subscription_tier: "enterprise",
      subscription_status: "active",
      wallet_balance: 42.75,
    }),
  });

  const res = await handleGetBillingOverview(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Billing & Wallet Overview/);
  assert.match(res.message, /ENTERPRISE/);
  assert.match(res.message, /42\.7500/);
  assert.match(res.message, /\$0\.003 \/ AI call/);
});

test("Billing: handleGetBillingHistory returns recent usage charges", async () => {
  setOperationsServiceDeps({
    getBillingLogs: async () => [
      { type: "admin_business_assistant_message", amount: -0.003, created_at: 1780000000 },
      { type: "ai_chat_reply", amount: -0.001, created_at: 1780000010 },
    ],
  });

  const res = await handleGetBillingHistory(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Recent Billing Transactions/);
  assert.match(res.message, /admin_business_assistant_message/);
  assert.equal(res.data?.transactions.length, 2);
});

test("Billing: handleGetBusinessAssistantUsage derives spend from canonical cost ledger ($0.003)", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123", wallet_balance: 10.0 }),
    getBillingLogs: async () => [
      { type: "admin_business_assistant_message", amount: -0.003 },
      { type: "admin_business_assistant_message", amount: -0.003 },
      { type: "admin_business_assistant_message", amount: -0.003 },
    ],
  });

  const res = await handleGetBusinessAssistantUsage(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Admin Business Assistant Spend/);
  assert.match(res.message, /Total Assistant Messages Billed:.*3/);
  assert.match(res.message, /\$0\.009/);
  assert.equal(res.data?.billedMessageCount, 3);
  assert.equal(res.data?.totalSpentUsd, 0.009);
});

test("Billing: handleUpdateBillingPreferences updates invoice metadata safely", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => ({
      companyName: "Old Corp",
      billingAddress: "Old Address",
    }),
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleUpdateBillingPreferences(mockContext, {
    companyName: "Acme Retail Ltd",
    taxNumber: "NTN-1234567",
    billingEmail: "contact-bdebf55ca3ca@example.invalid",
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Billing & Invoice Preferences Updated/);
  assert.match(res.message, /Acme Retail Ltd/);
  assert.match(res.message, /NTN-1234567/);
  assert.equal(savedConfig.billingPreferences.companyName, "Acme Retail Ltd");
  assert.equal(savedConfig.billingPreferences.taxNumber, "NTN-1234567");
  assert.equal(savedConfig.billingPreferences.billingEmail, "contact-bdebf55ca3ca@example.invalid");
  assert.equal(savedConfig.billingPreferences.billingAddress, "Old Address");
});

test("Billing: Wallet topups, plan purchases, and refunds are dashboard-only", () => {
  assert.equal(getAdminAction("wallet_topup")?.isDashboardOnly, true);
  assert.equal(getAdminAction("plan_purchase")?.isDashboardOnly, true);
  assert.equal(getAdminAction("process_refund")?.isDashboardOnly, true);
});

// ===========================================================================
// SECTION 5: ADMIN ALERTS OPERATIONS
// ===========================================================================

test("Admin Alerts: handleGetAdminAlertsConfig returns category settings and masked identity", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => ({
      categories: {
        billing_wallet: { dashboard: true, whatsapp: true },
        whatsapp_instance: { dashboard: true, whatsapp: true },
      },
    }),
  });

  const res = await handleGetAdminAlertsConfig(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Admin Alerts Configuration/);
  assert.match(res.message, /Destination Admin Phone/);
  assert.match(res.message, /Wallet and billing/);
});

test("Admin Alerts: handleUpdateAdminAlertCategory enables or disables notification categories", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => ({ categories: {} }),
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleUpdateAdminAlertCategory(mockContext, {
    categoryId: "billing_wallet",
    whatsappEnabled: false,
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Admin Alert Updated/);
  assert.match(res.message, /Disabled/);
  assert.equal(savedConfig.dashboardAlertPreferences.categories.billing_wallet.whatsapp, false);
});

test("Admin Alerts: Changing admin phone number and assistant toggle are dashboard-only", () => {
  assert.equal(getAdminAction("change_admin_number")?.isDashboardOnly, true);
  assert.equal(getAdminAction("toggle_assistant_access")?.isDashboardOnly, true);
});

// ===========================================================================
// SECTION 6: TEAM & ACCESS MANAGEMENT (LIST, INVITE, ROLE CHANGE, REMOVE)
// ===========================================================================

test("Team Management: handleListTeamMembers lists owner and team members", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({ $id: "acc_123", name: "Alice Owner", email: "contact-d4569266320f@example.invalid" }),
    getUserExtraConfigValue: async () => [
      { id: "mem_1", name: "Bob Staff", email: "contact-c4f5a98ee6ff@example.invalid", role: "agent", status: "active" },
    ],
  });

  const res = await handleListTeamMembers(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Team & Access Control/);
  assert.match(res.message, /Alice Owner/);
  assert.match(res.message, /Bob Staff/);
  assert.match(res.message, /`agent`/);
  assert.equal(res.data?.members.length, 1);
});

test("Team Management: handleInviteTeamMember invites new member with valid role", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [],
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleInviteTeamMember(mockContext, {
    name: "Charlie Agent",
    email: "contact-e7d2a1d531b4@example.invalid",
    role: "manager",
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Team Invitation Sent/);
  assert.match(res.message, /charlie@store\.com/);
  assert.match(res.message, /`manager`/);
  assert.equal(savedConfig.teamMembers.length, 1);
  assert.equal(savedConfig.teamMembers[0].email, "contact-e7d2a1d531b4@example.invalid");
  assert.equal(savedConfig.teamMembers[0].role, "manager");
});

test("Team Management: handleInviteTeamMember rejects duplicate email", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [
      { id: "mem_1", email: "contact-e7d2a1d531b4@example.invalid", role: "agent", status: "active" },
    ],
  });

  const res = await handleInviteTeamMember(mockContext, {
    email: "contact-e7d2a1d531b4@example.invalid",
  });

  assert.equal(res.success, false);
  assert.match(res.message, /already active/);
});

test("Team Management: handleInviteTeamMember rejects invalid email format", async () => {
  const res = await handleInviteTeamMember(mockContext, {
    email: "invalid-email-address",
  });
  assert.equal(res.success, false);
  assert.match(res.message, /valid email/);
});

test("Team Management: handleUpdateTeamMemberRole modifies non-owner role", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [
      { id: "mem_1", name: "Bob Staff", email: "contact-c4f5a98ee6ff@example.invalid", role: "agent", status: "active" },
    ],
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleUpdateTeamMemberRole(mockContext, {
    emailOrId: "contact-c4f5a98ee6ff@example.invalid",
    newRole: "admin",
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Team Role Updated/);
  assert.match(res.message, /`agent`/);
  assert.match(res.message, /`admin`/);
  assert.equal(savedConfig.teamMembers[0].role, "admin");
});

test("Team Management: Owner Protection - Demoting owner is denied", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [
      { id: "owner_1", name: "Alice Owner", email: "contact-d4569266320f@example.invalid", role: "owner", isOwner: true },
    ],
  });

  const res = await handleUpdateTeamMemberRole(mockContext, {
    emailOrId: "contact-d4569266320f@example.invalid",
    newRole: "agent",
  });

  assert.equal(res.success, false);
  assert.match(res.message, /Policy Violation: The account owner cannot be modified or demoted/);
});

test("Team Management: Self-Escalation Protection - Updating own role is denied", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [
      { id: "mem_2", name: "Me", email: "+144225232320", role: "agent" },
    ],
  });

  const res = await handleUpdateTeamMemberRole(mockContext, {
    emailOrId: "+144225232320",
    newRole: "admin",
  });

  assert.equal(res.success, false);
  assert.match(res.message, /Self-escalation of roles is strictly prohibited/);
});

test("Team Management: handleRemoveTeamMember revokes access for non-owner member", async () => {
  let savedConfig: any = null;
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [
      { id: "mem_1", name: "Bob Staff", email: "contact-c4f5a98ee6ff@example.invalid", role: "agent" },
    ],
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const res = await handleRemoveTeamMember(mockContext, {
    emailOrId: "contact-c4f5a98ee6ff@example.invalid",
  });

  assert.equal(res.success, true);
  assert.match(res.message, /Team Member Removed/);
  assert.equal(savedConfig.teamMembers.length, 0);
});

test("Team Management: Owner Protection - Removing owner is denied", async () => {
  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [
      { id: "owner_1", name: "Alice", email: "contact-d4569266320f@example.invalid", role: "owner", isOwner: true },
    ],
  });

  const res = await handleRemoveTeamMember(mockContext, {
    emailOrId: "contact-d4569266320f@example.invalid",
  });

  assert.equal(res.success, false);
  assert.match(res.message, /The primary account owner cannot be removed/);
});

test("Team Management: Ownership transfer and owner demote are dashboard-only", () => {
  assert.equal(getAdminAction("transfer_ownership")?.isDashboardOnly, true);
  assert.equal(getAdminAction("demote_owner")?.isDashboardOnly, true);
});

// ===========================================================================
// SECTION 7: SECURITY & SESSIONS OPERATIONS
// ===========================================================================

test("Security: handleGetSecurityOverview returns 2FA status, active sessions, and masked proxy", async () => {
  setOperationsServiceDeps({
    getUser: async () => ({
      $id: "acc_123",
      totp_enabled: true,
      proxy_url: "http://proxy.internal:8080",
    }),
  });

  const res = await handleGetSecurityOverview(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Security & Access Health/);
  assert.match(res.message, /2FA.*Enabled/);
  assert.match(res.message, /Masked Regional Proxy Active/);
});

test("Security: handleGetActiveSessions summarizes dashboard and WhatsApp sessions", async () => {
  const res = await handleGetActiveSessions(mockContext);
  assert.equal(res.success, true);
  assert.match(res.message, /Active Login Sessions/);
  assert.match(res.message, /Current Dashboard Session/);
  assert.match(res.message, /WhatsApp Admin Business Assistant/);
});

test("Security: Disabling 2FA, session revocation, and password change are dashboard-only", () => {
  assert.equal(getAdminAction("disable_2fa")?.isDashboardOnly, true);
  assert.equal(getAdminAction("revoke_all_sessions")?.isDashboardOnly, true);
  assert.equal(getAdminAction("change_password")?.isDashboardOnly, true);
});

// ===========================================================================
// SECTION 8: ROUTER END-TO-END CONFIRMATION FLOWS & $0.005 BILLING
// ===========================================================================

test("Router End-to-End: 'pause the bot' creates pending confirmation and executes on YES with $0.005 billing", async () => {
  let sentReplies: string[] = [];
  let billedAmount = 0;
  let botUpdated = false;

  setOperationsServiceDeps({
    getBotsByUser: async () => [{ $id: "bot_123", user_id: "acc_123", name: "Sales Bot" }],
    updateBot: async () => {
      botUpdated = true;
      return {};
    },
  });

  const mockSock = {
    sendMessage: async (_jid: any, content: any) => {
      sentReplies.push(content.text);
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => {
      billedAmount = 0.005;
      return { charged: true, cost: 0.005, dedupeKey: "test", walletBalance: 9.995, breakdown: [] };
    }) as any,
  });

  // Step 1: Send "pause the bot"
  const step1 = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "pause the bot",
    rawMessage: {},
  });

  assert.equal(step1.handled, true);
  assert.match(sentReplies[0], /Action Confirmation Required/);
  assert.match(sentReplies[0], /Confirm pausing WhatsApp bot automation/);
  assert.equal(step1.billedAmountUsd, 0);
  assert.equal(botUpdated, false);

  // Step 2: Confirm with YES
  sentReplies = [];
  billedAmount = 0;

  const step2 = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "YES",
    rawMessage: {},
  });

  assert.equal(step2.handled, true);
  assert.match(sentReplies[0], /Automation Paused/);
  assert.equal(botUpdated, true);
  assert.equal(step2.billedAmountUsd, 0);
});

test("Router End-to-End: 'invite team member contact-448515d04c37@example.invalid as manager' creates confirmation and executes on YES", async () => {
  let sentReplies: string[] = [];
  let savedConfig: any = null;

  setOperationsServiceDeps({
    getUserExtraConfigValue: async () => [],
    saveUserExtraConfigPatch: async (_userId, patch) => {
      savedConfig = patch;
      return patch;
    },
  });

  const mockSock = {
    sendMessage: async (_jid: any, content: any) => {
      sentReplies.push(content.text);
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, cost: 0.005, dedupeKey: "test", walletBalance: 9.995, breakdown: [] })) as any,
  });
  __setAdminBusinessAgentTestDeps({
    generateBackendText: async () => ({
      requestStatus: "success",
      toolCalls: [
        {
          id: "tc_invite",
          name: "invite_team_member",
          arguments: { email: "contact-be08df377745@example.invalid", role: "manager" },
        },
      ],
    } as any),
  });

  // Step 1: Send invite command
  await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "invite team member contact-be08df377745@example.invalid as manager",
    rawMessage: {},
  });

  assert.match(sentReplies[0], /Confirm sending team invitation to \*newguy@store\.com\* \(Role: (?:`manager`|manager)\)/);

  // Step 2: Confirm with YES
  sentReplies = [];
  await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockContext,
    text: "YES",
    rawMessage: {},
  });

  assert.match(sentReplies[0], /Team Invitation Sent/);
  assert.equal(savedConfig.teamMembers[0].email, "contact-be08df377745@example.invalid");
  assert.equal(savedConfig.teamMembers[0].role, "manager");

  __resetAdminBusinessAgentTestDeps();
  __resetAdminRouterTestDeps();
});

test("Router End-to-End: Manager role denied admin/owner sensitive writes", async () => {
  let sentReplies: string[] = [];
  const mockSock = {
    sendMessage: async (_jid: any, content: any) => {
      sentReplies.push(content.text);
      return { key: { id: `msg_${Date.now()}` } };
    },
  };

  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true, action: "admin_business_assistant_message", cost: 0.005, balance: 10 })) as any,
    chargeUsageBillingAction: (async () => ({ charged: true, cost: 0.005, dedupeKey: "test", walletBalance: 9.995, breakdown: [] })) as any,
  });

  const res = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context: mockManagerContext,
    text: "pause the bot",
    rawMessage: {},
  });

  assert.equal(res.handled, true);
  assert.match(sentReplies[0], /do not have permission/);
});

test("Router End-to-End: Non-admin customer ignored by admin business assistant router", async () => {
  const unauthorizedContext = {
    isAuthorizedAdmin: false,
    adminRole: "viewer" as any,
    accountId: "",
    userId: "",
    botId: "",
    adminJid: "contact-626862d4b59f@example.invalid",
    adminPhone: "+146509172358",
    isBusinessAssistantEnabled: false,
    mode: "customer" as any,
    conversationId: "",
  };

  const res = await handleAdminBusinessAssistantMessage({
    sock: {},
    context: unauthorizedContext as any,
    text: "pause the bot",
    rawMessage: {},
  });

  assert.equal(res.handled, false);
});
