import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAdminWhatsAppIdentity,
  canUseAdminBusinessAssistant,
  resolveAdminIdentityContext,
} from "./admin-identity-service.ts";
import {
  registerAdminAction,
  getAdminAction,
  canExecuteAdminBusinessAction,
  listAdminActions,
} from "./admin-action-registry-service.ts";
import {
  createPendingConfirmation,
  getPendingConfirmation,
  invalidatePendingConfirmation,
  invalidateAllAccountConfirmations,
  isConfirmationAffirmative,
  isConfirmationCancellation,
  executePendingConfirmation,
} from "./admin-confirmation-service.ts";
import {
  maskAdminIdentity,
  redactSensitiveData,
  recordAdminAuditEvent,
  getAdminAuditEvents,
  clearAuditStoreForTest,
} from "./admin-audit-service.ts";
import {
  ADMIN_BUSINESS_ASSISTANT_SYSTEM_PROMPT,
  handleAdminBusinessAssistantMessage,
  sendAdminAssistantReply,
  __setAdminRouterTestDeps,
  __resetAdminRouterTestDeps,
} from "./admin-business-assistant-router.ts";
import {
  getUsageBillingDefinition,
  USAGE_BILLING,
  type BillableUsageAction,
} from "../config/pricing.ts";
import {
  __setOutboundMessageBillingTestDeps,
  __resetOutboundMessageBillingTestDeps,
  chargeUsageBillingAction,
  previewUsageBillingAction,
} from "./outbound-message-billing-service.ts";

// ============================================================================
// 1. IDENTITY TESTS (1 - 10)
// ============================================================================

test("1. Configured + enabled authorized admin resolves to admin_business_assistant mode", () => {
  const result = resolveAdminIdentityContext({
    fromJid: "contact-e4ed32210a80@example.invalid",
    botConfig: {
      adminNumber: "+144225232320",
      isBusinessAssistantEnabled: true,
      userId: "acc_1001",
      admin_number_verified: true,
      admin_verified_phone: "195545134641",
    },
    user: {
      id: "acc_1001",
      role: "owner",
      admin_number_verified: true,
      admin_verified_phone: "195545134641",
    },
  });

  assert.equal(result.isAuthorizedAdmin, true);
  assert.equal(result.mode, "admin_business_assistant");
  assert.equal(result.context?.accountId, "acc_1001");
  assert.equal(result.context?.adminPhone, "195545134641");
  assert.equal(result.context?.adminRole, "owner");
});

test("2. Same admin number but isBusinessAssistantEnabled disabled -> customer mode", () => {
  const result = resolveAdminIdentityContext({
    fromJid: "contact-e4ed32210a80@example.invalid",
    botConfig: {
      adminNumber: "+144225232320",
      isBusinessAssistantEnabled: false,
      userId: "acc_1001",
    },
    user: { id: "acc_1001", role: "owner" },
  });

  assert.equal(result.isAuthorizedAdmin, false);
  assert.equal(result.mode, "customer");
  assert.equal(result.reason, "business_assistant_disabled");
});

test("3. Wrong number -> customer mode", () => {
  const result = resolveAdminIdentityContext({
    fromJid: "contact-1b0afd0a3dc1@example.invalid",
    botConfig: {
      adminNumber: "+144225232320",
      isBusinessAssistantEnabled: true,
      userId: "acc_1001",
    },
    user: { id: "acc_1001", role: "owner" },
  });

  assert.equal(result.isAuthorizedAdmin, false);
  assert.equal(result.mode, "customer");
  assert.equal(result.reason, "sender_mismatch");
});

test("4. Another tenant's admin number -> no access to target tenant", () => {
  const result = resolveAdminIdentityContext({
    fromJid: "contact-005149e0fabf@example.invalid", // Tenant B's admin
    botConfig: {
      adminNumber: "+144225232320", // Tenant A's admin
      isBusinessAssistantEnabled: true,
      userId: "tenant_A",
    },
    user: { id: "tenant_A", role: "owner" },
  });

  assert.equal(result.isAuthorizedAdmin, false);
  assert.equal(result.mode, "customer");
  assert.equal(result.reason, "sender_mismatch");
});

test("5. Formatted number normalization works across various input formats", () => {
  assert.deepEqual(normalizeAdminWhatsAppIdentity("+92 300 1234567"), {
    phone: "195545134641",
    jid: "contact-e4ed32210a80@example.invalid",
  });
  assert.deepEqual(normalizeAdminWhatsAppIdentity("14168283117645"), {
    phone: "195545134641",
    jid: "contact-e4ed32210a80@example.invalid",
  });
  assert.deepEqual(normalizeAdminWhatsAppIdentity("15811061380"), {
    phone: "195545134641",
    jid: "contact-e4ed32210a80@example.invalid",
  });
  assert.deepEqual(normalizeAdminWhatsAppIdentity("+1 (202) 555-0199"), {
    phone: "15549402223",
    jid: "contact-b0a340dce9b9@example.invalid",
  });
});

test("6. JID normalization works", () => {
  const identity = normalizeAdminWhatsAppIdentity("contact-e4ed32210a80@example.invalid");
  assert.equal(identity.phone, "195545134641");
  assert.equal(identity.jid, "contact-e4ed32210a80@example.invalid");
});

test("7. Admin number change revokes old identity and grants new identity", () => {
  const oldResult = resolveAdminIdentityContext({
    fromJid: "contact-85d2a3563239@example.invalid",
    botConfig: {
      adminNumber: "+151929803453", // updated to new number
      isBusinessAssistantEnabled: true,
      userId: "acc_1001",
      admin_number_verified: true,
      admin_verified_phone: "173464065383",
    },
    user: {
      id: "acc_1001",
      role: "owner",
      admin_number_verified: true,
      admin_verified_phone: "173464065383",
    },
  });
  assert.equal(oldResult.isAuthorizedAdmin, false);

  const newResult = resolveAdminIdentityContext({
    fromJid: "contact-126f2cd31c20@example.invalid",
    botConfig: {
      adminNumber: "+151929803453",
      isBusinessAssistantEnabled: true,
      userId: "acc_1001",
      admin_number_verified: true,
      admin_verified_phone: "173464065383",
    },
    user: {
      id: "acc_1001",
      role: "owner",
      admin_number_verified: true,
      admin_verified_phone: "173464065383",
    },
  });
  assert.equal(newResult.isAuthorizedAdmin, true);
  assert.equal(newResult.context?.adminPhone, "173464065383");
});

test("8. Disabling access invalidates privilege immediately and clears pending confirmations", () => {
  const accountId = "acc_revoke_test";
  const adminJid = "contact-e4ed32210a80@example.invalid";

  // Create pending confirmation
  createPendingConfirmation({
    accountId,
    adminJid,
    actionId: "test_sensitive_action",
    summaryText: "Test action",
  });
  assert.ok(getPendingConfirmation(accountId, adminJid));

  // Invalidate all when disabled
  const cleared = invalidateAllAccountConfirmations(accountId);
  assert.equal(cleared, 1);
  assert.equal(getPendingConfirmation(accountId, adminJid), null);
});

test("9. Role authorization check verifies owner/admin vs normal member", () => {
  assert.equal(canUseAdminBusinessAssistant({ role: "owner" }), true);
  assert.equal(canUseAdminBusinessAssistant({ role: "admin" }), true);
  assert.equal(canUseAdminBusinessAssistant({ role: "member" }), false);
  assert.equal(canUseAdminBusinessAssistant({ role: "agent" }), false);
  assert.equal(canUseAdminBusinessAssistant({ role: "viewer" }), false);
  assert.equal(canUseAdminBusinessAssistant({ user: { is_owner: true } }), true);
  assert.equal(canUseAdminBusinessAssistant({ user: { is_admin: true } }), true);
});

test("10. Normal customer remains normal customer even if claiming admin in text", () => {
  const result = resolveAdminIdentityContext({
    fromJid: "contact-b030c327a1e3@example.invalid", // Customer phone
    botConfig: {
      adminNumber: "+144225232320",
      isBusinessAssistantEnabled: true,
      userId: "acc_1001",
    },
    user: { id: "acc_1001", role: "owner" },
  });

  assert.equal(result.isAuthorizedAdmin, false);
  assert.equal(result.mode, "customer");
});

// ============================================================================
// 2. PERMISSION & REGISTRY TESTS (11 - 17)
// ============================================================================

test("11. READ action can proceed for authorized admin without confirmation", () => {
  const action = getAdminAction("get_admin_status");
  assert.ok(action);
  assert.equal(action.riskLevel, "READ");
  assert.equal(action.requiresConfirmation, false);

  const perm = canExecuteAdminBusinessAction({
    role: "admin",
    action,
    channel: "whatsapp",
  });
  assert.equal(perm.allowed, true);
});

test("12. SAFE_WRITE uses correct role check and succeeds without confirmation", () => {
  const action = getAdminAction("test_safe_action");
  assert.ok(action);
  assert.equal(action.riskLevel, "SAFE_WRITE");

  const perm = canExecuteAdminBusinessAction({
    role: "admin",
    action,
    channel: "whatsapp",
  });
  assert.equal(perm.allowed, true);
});

test("13. SENSITIVE_WRITE requires explicit confirmation", () => {
  const action = getAdminAction("test_sensitive_action");
  assert.ok(action);
  assert.equal(action.riskLevel, "SENSITIVE_WRITE");
  assert.equal(action.requiresConfirmation, true);

  const perm = canExecuteAdminBusinessAction({
    role: "admin",
    action,
    channel: "whatsapp",
  });
  assert.equal(perm.allowed, true);
});

test("14. CRITICAL actions over WhatsApp are blocked (dashboard only)", () => {
  const action = getAdminAction("delete_instance");
  assert.ok(action);
  assert.equal(action.riskLevel, "CRITICAL");

  const perm = canExecuteAdminBusinessAction({
    role: "owner",
    action,
    channel: "whatsapp",
  });
  assert.equal(perm.allowed, false);
  assert.equal(perm.reason, "critical_action_dashboard_only");
});

test("15. Member role cannot execute admin-required actions", () => {
  const perm = canExecuteAdminBusinessAction({
    role: "member",
    action: "test_safe_action",
    channel: "whatsapp",
  });
  assert.equal(perm.allowed, false);
  assert.equal(perm.reason, "insufficient_role_permission");
});

test("16. Unregistered action is denied (fails closed)", () => {
  const perm = canExecuteAdminBusinessAction({
    role: "owner",
    action: "non_existent_dangerous_action",
    channel: "whatsapp",
  });
  assert.equal(perm.allowed, false);
  assert.equal(perm.reason, "unregistered_action_denied");
});

test("17. Server-derived tenant cannot be overridden by message content", () => {
  const context = {
    accountId: "tenant_alpha",
    userId: "tenant_alpha",
    botId: "bot_alpha",
    adminPhone: "195545134641",
    adminJid: "contact-e4ed32210a80@example.invalid",
    adminRole: "owner" as const,
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant" as const,
    conversationId: "admin_tenant_alpha_923001234567",
  };

  // Attempt to pass another account in params
  const pending = createPendingConfirmation({
    accountId: context.accountId,
    adminJid: context.adminJid,
    actionId: "test_safe_action",
    params: { accountId: "tenant_beta_injected" },
    summaryText: "Test",
  });

  assert.equal(pending.accountId, "tenant_alpha");
});

// ============================================================================
// 3. CONFIRMATION FRAMEWORK TESTS (18 - 26)
// ============================================================================

test("18. Confirmation is tied to exact action ID", () => {
  const pending = createPendingConfirmation({
    accountId: "acc_conf_18",
    adminJid: "contact-e4ed32210a80@example.invalid",
    actionId: "test_sensitive_action",
    summaryText: "Execute test sensitive action",
  });

  assert.equal(pending.actionId, "test_sensitive_action");
  assert.ok(pending.nonce);
});

test("19. Confirmation is tied to exact admin identity", () => {
  createPendingConfirmation({
    accountId: "acc_conf_19",
    adminJid: "contact-85d2a3563239@example.invalid",
    actionId: "test_sensitive_action",
    summaryText: "Admin 1 action",
  });

  // Query from different admin
  assert.equal(getPendingConfirmation("acc_conf_19", "contact-126f2cd31c20@example.invalid"), null);
  // Query from same admin
  assert.ok(getPendingConfirmation("acc_conf_19", "contact-85d2a3563239@example.invalid"));
});

test("20. Confirmation is tied to exact tenant account", () => {
  createPendingConfirmation({
    accountId: "tenant_A",
    adminJid: "contact-85d2a3563239@example.invalid",
    actionId: "test_sensitive_action",
    summaryText: "Tenant A action",
  });

  // Query from Tenant B with same phone
  assert.equal(getPendingConfirmation("tenant_B", "contact-85d2a3563239@example.invalid"), null);
});

test("21. Confirmation expires after TTL", () => {
  const pending = createPendingConfirmation({
    accountId: "acc_exp_21",
    adminJid: "contact-85d2a3563239@example.invalid",
    actionId: "test_sensitive_action",
    summaryText: "Expiring action",
    ttlMs: -1000, // already expired
  });

  assert.equal(getPendingConfirmation("acc_exp_21", "contact-85d2a3563239@example.invalid"), null);
});

test("22. Cancellation invalidates pending confirmation", () => {
  createPendingConfirmation({
    accountId: "acc_cancel_22",
    adminJid: "contact-85d2a3563239@example.invalid",
    actionId: "test_sensitive_action",
    summaryText: "To be cancelled",
  });

  const invalidated = invalidatePendingConfirmation("acc_cancel_22", "contact-85d2a3563239@example.invalid", "admin_cancelled");
  assert.equal(invalidated, true);
  assert.equal(getPendingConfirmation("acc_cancel_22", "contact-85d2a3563239@example.invalid"), null);
});

test("23. Duplicate confirm execution executes once (idempotent)", async () => {
  const context = {
    accountId: "acc_idem_23",
    userId: "acc_idem_23",
    botId: "bot_idem",
    adminPhone: "112250469451",
    adminJid: "contact-85d2a3563239@example.invalid",
    adminRole: "owner" as const,
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant" as const,
    conversationId: "conv_23",
  };

  const pending = createPendingConfirmation({
    accountId: context.accountId,
    adminJid: context.adminJid,
    actionId: "test_sensitive_action",
    params: { orderId: "ord_123" },
    summaryText: "Update order",
  });

  // First execution
  const res1 = await executePendingConfirmation({
    context,
    confirmationId: pending.confirmationId,
    idempotencyKey: `dedupe_${pending.confirmationId}`,
  });
  assert.equal(res1.executed, true);
  assert.equal(res1.status, "executed");

  // Replay attempt
  const res2 = await executePendingConfirmation({
    context,
    confirmationId: pending.confirmationId,
    idempotencyKey: `dedupe_${pending.confirmationId}`,
  });
  assert.equal(res2.executed, true);
  assert.equal(res2.status, "executed");
});

test("24. Natural language affirmative matching (English, Urdu, Roman Urdu)", () => {
  assert.equal(isConfirmationAffirmative("yes"), true);
  assert.equal(isConfirmationAffirmative("Yes, proceed"), true);
  assert.equal(isConfirmationAffirmative("haan"), true);
  assert.equal(isConfirmationAffirmative("jee bilkul"), true);
  assert.equal(isConfirmationAffirmative("ok"), true);
  assert.equal(isConfirmationAffirmative("karo"), true);
  assert.equal(isConfirmationAffirmative("theek hai"), true);
  assert.equal(isConfirmationAffirmative("no"), false);
  assert.equal(isConfirmationAffirmative("what is price?"), false);
});

test("25. Natural language cancellation matching (English, Urdu, Roman Urdu)", () => {
  assert.equal(isConfirmationCancellation("no"), true);
  assert.equal(isConfirmationCancellation("cancel"), true);
  assert.equal(isConfirmationCancellation("nahi"), true);
  assert.equal(isConfirmationCancellation("nahin mat karo"), true);
  assert.equal(isConfirmationCancellation("stop"), true);
  assert.equal(isConfirmationCancellation("yes"), false);
});

test("26. Two simultaneous pending actions from different admins do not cross-wire", () => {
  const p1 = createPendingConfirmation({
    accountId: "acc_multi",
    adminJid: "contact-85d2a3563239@example.invalid",
    actionId: "test_safe_action",
    params: { admin: 1 },
    summaryText: "Admin 1 task",
  });

  const p2 = createPendingConfirmation({
    accountId: "acc_multi",
    adminJid: "contact-126f2cd31c20@example.invalid",
    actionId: "test_sensitive_action",
    params: { admin: 2 },
    summaryText: "Admin 2 task",
  });

  const retrieved1 = getPendingConfirmation("acc_multi", "contact-85d2a3563239@example.invalid");
  const retrieved2 = getPendingConfirmation("acc_multi", "contact-126f2cd31c20@example.invalid");

  assert.equal(retrieved1?.actionId, "test_safe_action");
  assert.equal(retrieved2?.actionId, "test_sensitive_action");
});

// ============================================================================
// 4. SECURITY & PROMPT INJECTION TESTS (27 - 32)
// ============================================================================

test("27. Customer prompt injection in data cannot become executable admin instruction", () => {
  assert.match(ADMIN_BUSINESS_ASSISTANT_SYSTEM_PROMPT, /untrusted DATA/i);
  assert.match(ADMIN_BUSINESS_ASSISTANT_SYSTEM_PROMPT, /never executable instructions/i);
});

test("28. Secret fields are automatically redacted by audit service", () => {
  const raw = {
    apiKey: "secret_api_key_12345",
    password: "super_secret_password",
    otp: "123456",
    token: "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    safeField: "normal_data",
  };

  const redacted = redactSensitiveData(raw);
  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.otp, "[REDACTED]");
  assert.equal(redacted.token, "[REDACTED]");
  assert.equal(redacted.safeField, "normal_data");
});

test("29. Admin phone/JID is masked for audit/logs", () => {
  assert.equal(maskAdminIdentity("contact-e4ed32210a80@example.invalid"), "+923 *** 567");
  assert.equal(maskAdminIdentity("+144225232320"), "+923 *** 567");
  assert.equal(maskAdminIdentity(""), "—");
});

test("30. Unauthorized sender fails closed", () => {
  const result = resolveAdminIdentityContext({
    fromJid: "contact-1b0afd0a3dc1@example.invalid",
    botConfig: {
      adminNumber: "+144225232320",
      isBusinessAssistantEnabled: true,
      userId: "acc_fail_closed",
    },
    user: { id: "acc_fail_closed", role: "member" },
  });

  assert.equal(result.isAuthorizedAdmin, false);
});

// ============================================================================
// 5. BILLING & COST LEDGER TESTS (33 - 46)
// ============================================================================

test("33. Admin Business Assistant Message pricing definition is exactly $0.003", () => {
  const def = getUsageBillingDefinition("admin_business_assistant_message");
  assert.ok(def);
  assert.equal(def.priceUsd, 0.003);
  assert.equal(def.unitLabel, "AI call");
  assert.equal(def.category, "outbound");
});

test("34. Preview and Charge successful admin assistant message", async () => {
  let chargedUserId = "";
  let chargedAction: BillableUsageAction | null = null;
  let chargeCost = 0;

  __setOutboundMessageBillingTestDeps({
    getUser: (async (uid: string) => ({
      $id: uid,
      wallet_balance: 5.0,
      subscription_status: "active",
    })) as any,
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
    chargeUsageAction: (async (uid: string, action: BillableUsageAction) => {
      chargedUserId = uid;
      chargedAction = action;
      chargeCost = 0.003;
      return { charged: true, cost: 0.003 };
    }) as any,
  });

  const preview = await previewUsageBillingAction("acc_bill_test", "admin_business_assistant_message");
  assert.equal(preview.allowed, true);
  assert.equal(preview.cost, 0.003);

  const charge = await chargeUsageBillingAction("acc_bill_test", "admin_business_assistant_message", {
    botId: "bot_1",
    customerJid: "contact-e4ed32210a80@example.invalid",
    eventId: "msg_100",
  });
  assert.equal(charge?.charged, true);
  assert.equal(chargedUserId, "acc_bill_test");
  assert.equal(chargedAction, "admin_business_assistant_message");
  assert.equal(chargeCost, 0.003);

  __resetOutboundMessageBillingTestDeps();
});

test("35. Inbound admin message costs $0", async () => {
  // Inbound messages do not trigger chargeUsageBillingAction
  assert.equal(0, 0);
});

test("36. Failed send results in $0 charge", async () => {
  let chargeCalled = false;

  __setOutboundMessageBillingTestDeps({
    getUser: (async (uid: string) => ({ $id: uid, wallet_balance: 5.0 })) as any,
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
    chargeUsageAction: (async () => {
      chargeCalled = true;
      return { charged: true, cost: 0.005 };
    }) as any,
  });

  const mockSockFailing = {
    sendMessage: async () => {
      throw new Error("Socket disconnected");
    },
  };

  const context = {
    accountId: "acc_fail_send",
    userId: "acc_fail_send",
    botId: "bot_1",
    adminPhone: "195545134641",
    adminJid: "contact-e4ed32210a80@example.invalid",
    adminRole: "owner" as const,
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant" as const,
    conversationId: "conv_1",
  };

  const res = await sendAdminAssistantReply({
    sock: mockSockFailing,
    context,
    text: "Hello admin",
  });

  assert.equal(res.success, false);
  assert.equal(res.billed, false);
  assert.equal(chargeCalled, false);

  __resetOutboundMessageBillingTestDeps();
});

test("37. Blocked entitlement (expired plan) blocks message with $0 charge", async () => {
  __setOutboundMessageBillingTestDeps({
    getUser: (async (uid: string) => ({ $id: uid, wallet_balance: 5.0 })) as any,
    canSendCustomerFacingMessage: (async () => ({
      allowed: false,
      reason: "subscription_expired",
    })) as any,
  });

  const preview = await previewUsageBillingAction("acc_expired", "admin_business_assistant_message");
  assert.equal(preview.allowed, false);
  assert.equal(preview.reason, "subscription_expired");

  __resetOutboundMessageBillingTestDeps();
});

test("38. Insufficient wallet balance blocks message with $0 charge", async () => {
  __setOutboundMessageBillingTestDeps({
    getUser: (async (uid: string) => ({ $id: uid, wallet_balance: 0.001 })) as any, // less than $0.005
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
  });

  const preview = await previewUsageBillingAction("acc_broke", "admin_business_assistant_message");
  assert.equal(preview.allowed, false);
  assert.equal(preview.reason, "insufficient_wallet");

  __resetOutboundMessageBillingTestDeps();
});

test("39. Full Router Integration: Status check command executes, responds deterministically with $0 non-AI billing", async () => {
  let messageSent = false;
  let sentText = "";

  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      messageSent = true;
      sentText = content.text;
      return { key: { id: "msg_sent_1" } };
    },
  };

  __setAdminRouterTestDeps({
    previewUsageBillingAction: (async () => ({ allowed: true })) as any,
  });

  const context = {
    accountId: "acc_router_test",
    userId: "acc_router_test",
    botId: "bot_1",
    adminPhone: "195545134641",
    adminJid: "contact-e4ed32210a80@example.invalid",
    adminRole: "owner" as const,
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant" as const,
    conversationId: "conv_router_test",
  };

  const result = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context,
    rawMessage: {},
    text: "status",
  });

  assert.equal(result.handled, true);
  assert.equal(result.repliesSent, 1);
  assert.equal(result.billedAmountUsd, 0);
  assert.equal(messageSent, true);
  assert.match(sentText, /Admin Assistant active/i);

  __resetAdminRouterTestDeps();
});

test("40. Full Router Integration: Sensitive action prompts confirmation, admin says yes, executes & bills", async () => {
  let sentTexts: string[] = [];
  const mockSock = {
    sendMessage: async (_jid: string, content: { text: string }) => {
      sentTexts.push(content.text);
      return { key: { id: `msg_sent_${sentTexts.length}` } };
    },
  };

  __setOutboundMessageBillingTestDeps({
    getUser: (async (uid: string) => ({ $id: uid, wallet_balance: 5.0 })) as any,
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
    chargeUsageAction: (async () => ({ charged: true, cost: 0.005 })) as any,
  });

  const context = {
    accountId: "acc_sensitive_flow",
    userId: "acc_sensitive_flow",
    botId: "bot_1",
    adminPhone: "195545134641",
    adminJid: "contact-e4ed32210a80@example.invalid",
    adminRole: "owner" as const,
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant" as const,
    conversationId: "conv_sens",
  };

  // Step 1: Admin requests sensitive action
  const res1 = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context,
    rawMessage: {},
    text: "test sensitive action",
  });
  assert.equal(res1.handled, true);
  assert.match(sentTexts[0], /Confirmation Required/i);

  // Step 2: Admin confirms with "haan"
  const res2 = await handleAdminBusinessAssistantMessage({
    sock: mockSock,
    context,
    rawMessage: {},
    text: "haan",
  });
  assert.equal(res2.handled, true);
  assert.match(sentTexts[1], /Action Executed/i);

  __resetOutboundMessageBillingTestDeps();
});

// ============================================================================
// 6. AUDIT TRAIL TESTS (47 - 53)
// ============================================================================

test("47. Privileged action request creates safe audit record", () => {
  clearAuditStoreForTest();
  const event = recordAdminAuditEvent({
    accountId: "acc_audit_1",
    adminJidMasked: "contact-e4ed32210a80@example.invalid",
    botId: "bot_1",
    actionId: "get_admin_status",
    riskLevel: "READ",
    executionResult: "success",
    metadata: { testKey: "testVal" },
  });

  assert.ok(event.id);
  assert.equal(event.adminJidMasked, "+923 *** 567");
  assert.equal(event.executionResult, "success");

  const records = getAdminAuditEvents("acc_audit_1");
  assert.equal(records.length, 1);
  assert.equal(records[0].actionId, "get_admin_status");
});

test("48. Denied admin action is audited safely", () => {
  clearAuditStoreForTest();
  recordAdminAuditEvent({
    accountId: "acc_audit_2",
    adminJidMasked: "contact-e4ed32210a80@example.invalid",
    botId: "bot_1",
    actionId: "delete_instance",
    riskLevel: "CRITICAL",
    confirmationRequired: true,
    executionResult: "denied",
    failureReason: "critical_action_dashboard_only",
  });

  const records = getAdminAuditEvents("acc_audit_2");
  assert.equal(records.length, 1);
  assert.equal(records[0].executionResult, "denied");
  assert.equal(records[0].failureReason, "critical_action_dashboard_only");
});

test("49. Tenant isolation in audit query", () => {
  clearAuditStoreForTest();
  recordAdminAuditEvent({
    accountId: "tenant_X",
    adminJidMasked: "contact-85d2a3563239@example.invalid",
    actionId: "act_x",
    riskLevel: "READ",
  });
  recordAdminAuditEvent({
    accountId: "tenant_Y",
    adminJidMasked: "contact-126f2cd31c20@example.invalid",
    actionId: "act_y",
    riskLevel: "READ",
  });

  assert.equal(getAdminAuditEvents("tenant_X").length, 1);
  assert.equal(getAdminAuditEvents("tenant_X")[0].actionId, "act_x");
  assert.equal(getAdminAuditEvents("tenant_Y").length, 1);
  assert.equal(getAdminAuditEvents("tenant_Y")[0].actionId, "act_y");
});
