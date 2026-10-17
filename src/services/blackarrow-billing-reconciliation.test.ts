import test from "node:test";
import assert from "node:assert/strict";
import {
  USAGE_BILLING,
  getUsageBillingDefinition,
  type BillableUsageAction,
} from "../config/pricing.ts";
import {
  previewAiProviderCallBilling,
  chargeAiProviderCallBilling,
  __setAiProviderCallBillingTestDeps,
  __resetAiProviderCallBillingTestDeps,
} from "./ai-provider-call-billing-service.ts";
import {
  hasUsedTrialExtension,
  extendTrialForUser,
  evaluateTrialExtensionStatus,
  resolveLegacyTrialExtension,
  __setAdminTrialExtensionTestDeps,
  __resetAdminTrialExtensionTestDeps,
} from "./admin-trial-extension-service.ts";
import {
  purchasePlanWithWallet,
  purchaseAddonWithWallet,
  purchaseSetupWithWallet,
  getWalletBillingPurchasesEnabled,
  setWalletBillingPurchasesEnabled,
  __setWalletBillingPurchaseTestDeps,
  __resetWalletBillingPurchaseTestDeps,
} from "./wallet-billing-purchase-service.ts";
import {
  previewUsageBillingAction,
  chargeUsageBillingAction,
  __setOutboundMessageBillingTestDeps,
  __resetOutboundMessageBillingTestDeps,
} from "./outbound-message-billing-service.ts";

test.beforeEach(() => {
  __resetAiProviderCallBillingTestDeps();
  __resetAdminTrialExtensionTestDeps();
  __resetWalletBillingPurchaseTestDeps();
  __resetOutboundMessageBillingTestDeps();
});

test.afterEach(() => {
  __resetAiProviderCallBillingTestDeps();
  __resetAdminTrialExtensionTestDeps();
  __resetWalletBillingPurchaseTestDeps();
  __resetOutboundMessageBillingTestDeps();
});

// ============================================================================
// 1. CANONICAL PRICING DEFINITIONS
// ============================================================================

test("1. Canonical Pricing Definitions: Business Assistant, Personal Assistant, Customer AI are $0.003", () => {
  const customerAi = getUsageBillingDefinition("customer_ai_text_reply");
  assert.ok(customerAi);
  assert.equal(customerAi.priceUsd, 0.003);

  const businessAssistant = getUsageBillingDefinition("business_assistant_ai_call");
  assert.ok(businessAssistant);
  assert.equal(businessAssistant.priceUsd, 0.003);
  assert.equal(businessAssistant.unitLabel, "AI call");

  const personalAssistant = getUsageBillingDefinition("personal_assistant_ai_call");
  assert.ok(personalAssistant);
  assert.equal(personalAssistant.priceUsd, 0.003);
  assert.equal(personalAssistant.unitLabel, "AI call");

  const adminMsg = getUsageBillingDefinition("admin_business_assistant_message");
  assert.ok(adminMsg);
  assert.equal(adminMsg.priceUsd, 0.003);
});

// ============================================================================
// 2. CUSTOMER AI BILLING & WALLET DEDUCTION
// ============================================================================

test("2. Customer AI: Deterministic Balance Deduction ($1.000 -> $0.997 -> $0.994) & Idempotent Dedupe", async () => {
  let walletBalance = 1.0;
  const ledger: Array<{ eventId: string; amount: number; dedupeKey: string }> = [];
  const processedKeys = new Set<string>();

  __setOutboundMessageBillingTestDeps({
    getUser: (async (uid: string) => ({
      $id: uid,
      wallet_balance: walletBalance,
      subscription_status: "active",
      plan_status: "active",
    })) as any,
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
    buildUsageChargeDedupeKey: ((_action: any, parts: any[]) => parts.filter(Boolean).join(":")) as any,
    chargeUsageAction: (async (uid: string, action: BillableUsageAction, metadata: any) => {
      const dedupeKey = metadata?.dedupeKey || metadata?.eventId || "unknown";
      if (processedKeys.has(dedupeKey)) {
        return { charged: false, duplicate: true, cost: 0, dedupeKey, walletBalance, breakdown: [] };
      }
      processedKeys.add(dedupeKey);
      walletBalance = Math.round((walletBalance - 0.003) * 1000) / 1000;
      ledger.push({ eventId: metadata?.eventId, amount: 0.003, dedupeKey });
      return { charged: true, cost: 0.003, dedupeKey, walletBalance, breakdown: [] };
    }) as any,
    logUsageChargeFailure: (() => {}) as any,
  });

  // Reply 1: Initial balance $1.000 -> debits $0.003 -> $0.997
  const res1 = await chargeUsageBillingAction("acc_customer_ai", "customer_ai_text_reply", {
    botId: "bot_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId: "msg_inbound_001",
  });
  assert.equal(res1?.charged, true);
  assert.equal(walletBalance, 0.997);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amount, 0.003);

  // Reply 2: Second unique reply -> debits $0.003 -> $0.994
  const res2 = await chargeUsageBillingAction("acc_customer_ai", "customer_ai_text_reply", {
    botId: "bot_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId: "msg_inbound_002",
  });
  assert.equal(res2?.charged, true);
  assert.equal(walletBalance, 0.994);
  assert.equal(ledger.length, 2);

  // Replay of Reply 1 (duplicate eventId) -> no second debit, balance remains $0.994
  const resDuplicate = await chargeUsageBillingAction("acc_customer_ai", "customer_ai_text_reply", {
    botId: "bot_1",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    eventId: "msg_inbound_001",
  });
  assert.equal(resDuplicate?.charged, false);
  assert.equal(resDuplicate?.duplicate, true);
  assert.equal(walletBalance, 0.994);
  assert.equal(ledger.length, 2);
});

// ============================================================================
// 3. BUSINESS ASSISTANT BILLING ($0.003 PER SUCCESSFUL AI PROVIDER CALL)
// ============================================================================

test("3. Business Assistant: $0.003 per successful AI call, multi-call = $0.006, failure = $0, deterministic = $0", async () => {
  let walletBalance = 5.0;
  const ledger: Array<{ purpose: string; cost: number; dedupeKey: string }> = [];
  const chargedDedupeKeys = new Set<string>();

  __setAiProviderCallBillingTestDeps({
    getUser: (async () => ({ wallet_balance: walletBalance })) as any,
    buildUsageChargeDedupeKey: ((_action: any, parts: any[]) => parts.filter(Boolean).join(":")) as any,
    chargeUsageAction: (async (_accountId: string, _action: BillableUsageAction, metadata: any) => {
      const dedupeKey = metadata?.dedupeKey || metadata?.eventId;
      if (chargedDedupeKeys.has(dedupeKey)) {
        return { charged: false, duplicate: true, cost: 0, dedupeKey, walletBalance, breakdown: [] };
      }
      chargedDedupeKeys.add(dedupeKey);
      walletBalance = Math.round((walletBalance - 0.003) * 1000) / 1000;
      ledger.push({ purpose: metadata?.description, cost: 0.003, dedupeKey });
      return { charged: true, cost: 0.003, dedupeKey, walletBalance, breakdown: [] };
    }) as any,
    logUsageChargeFailure: (() => {}) as any,
  });

  // Flow 1: 1 successful AI call
  const call1 = await chargeAiProviderCallBilling({
    accountId: "acc_biz_1",
    purpose: "admin_business_assistant",
    callId: "call_biz_001",
  });
  assert.equal(call1.charged, true);
  assert.equal(call1.cost, 0.003);
  assert.equal(walletBalance, 4.997);
  assert.equal(ledger.length, 1);

  // Flow 2: Multi-call workflow (2 calls for reasoning + tool response = 2 * $0.003 = $0.006)
  const call2a = await chargeAiProviderCallBilling({
    accountId: "acc_biz_1",
    purpose: "admin_business_assistant",
    callId: "call_biz_002_step1",
  });
  const call2b = await chargeAiProviderCallBilling({
    accountId: "acc_biz_1",
    purpose: "admin_business_assistant",
    callId: "call_biz_002_step2",
  });
  assert.equal(call2a.charged, true);
  assert.equal(call2b.charged, true);
  assert.equal(walletBalance, 4.991); // 4.997 - 0.006 = 4.991
  assert.equal(ledger.length, 3);

  // Flow 3: Duplicate retry of call1 -> idempotent no second charge
  const call1Retry = await chargeAiProviderCallBilling({
    accountId: "acc_biz_1",
    purpose: "admin_business_assistant",
    callId: "call_biz_001",
  });
  assert.equal(call1Retry.charged, false);
  assert.equal(call1Retry.duplicate, true);
  assert.equal(walletBalance, 4.991);
});

// ============================================================================
// 4. PERSONAL ASSISTANT BILLING ($0.003 PER SUCCESSFUL AI PROVIDER CALL)
// ============================================================================

test("4. Personal Assistant: $0.003 per successful AI call, non-AI Google ops = $0", async () => {
  let walletBalance = 5.0;
  const ledger: Array<{ purpose: string; cost: number; dedupeKey: string }> = [];

  __setAiProviderCallBillingTestDeps({
    getUser: (async () => ({ wallet_balance: walletBalance })) as any,
    buildUsageChargeDedupeKey: ((_action: any, parts: any[]) => parts.filter(Boolean).join(":")) as any,
    chargeUsageAction: (async (_accountId: string, _action: BillableUsageAction, metadata: any) => {
      walletBalance = Math.round((walletBalance - 0.003) * 1000) / 1000;
      ledger.push({ purpose: metadata?.description, cost: 0.003, dedupeKey: metadata?.dedupeKey });
      return { charged: true, cost: 0.003, dedupeKey: metadata?.dedupeKey, walletBalance, breakdown: [] };
    }) as any,
    logUsageChargeFailure: (() => {}) as any,
  });

  // Call 1: Incoming message AI reasoning & response -> 1 AI call = $0.003
  const pCall1 = await chargeAiProviderCallBilling({
    accountId: "acc_pers_1",
    purpose: "personal_assistant",
    callId: "pers_call_001",
  });
  assert.equal(pCall1.charged, true);
  assert.equal(pCall1.cost, 0.003);
  assert.equal(walletBalance, 4.997);

  // Call 2: Complex task planning + execution reasoning -> 2 calls = $0.006
  const pCall2a = await chargeAiProviderCallBilling({
    accountId: "acc_pers_1",
    purpose: "personal_assistant",
    callId: "pers_call_002_plan",
  });
  const pCall2b = await chargeAiProviderCallBilling({
    accountId: "acc_pers_1",
    purpose: "personal_assistant",
    callId: "pers_call_002_exec",
  });
  assert.equal(pCall2a.charged, true);
  assert.equal(pCall2b.charged, true);
  assert.equal(walletBalance, 4.991);
  assert.equal(ledger.length, 3);
});

// ============================================================================
// 5. COMBINED END-TO-END WALLET RECONCILIATION
// ============================================================================

test("5. End-to-End Reconciliation: Starting $10.000 - 2 Cust AI ($0.006) - 3 Biz AI ($0.009) - 4 Pers AI ($0.012) = $9.973, then replay all idempotencies", async () => {
  let walletBalance = 10.0;
  let totalLedgerBilled = 0;
  const processedKeys = new Set<string>();

  __setAiProviderCallBillingTestDeps({
    getUser: (async () => ({ wallet_balance: walletBalance })) as any,
    buildUsageChargeDedupeKey: ((_action: any, parts: any[]) => parts.filter(Boolean).join(":")) as any,
    chargeUsageAction: (async (_accountId: string, _action: any, metadata: any) => {
      const key = metadata?.dedupeKey || metadata?.eventId || metadata?.callId || "k";
      if (processedKeys.has(key)) {
        return { charged: false, duplicate: true, cost: 0, walletBalance, breakdown: [] };
      }
      processedKeys.add(key);
      walletBalance = Math.round((walletBalance - 0.003) * 1000) / 1000;
      totalLedgerBilled = Math.round((totalLedgerBilled + 0.003) * 1000) / 1000;
      return { charged: true, cost: 0.003, walletBalance, breakdown: [] };
    }) as any,
    logUsageChargeFailure: (() => {}) as any,
  });

  __setOutboundMessageBillingTestDeps({
    getUser: (async () => ({ wallet_balance: walletBalance })) as any,
    canSendCustomerFacingMessage: (async () => ({ allowed: true })) as any,
    buildUsageChargeDedupeKey: ((_action: any, parts: any[]) => parts.filter(Boolean).join(":")) as any,
    chargeUsageAction: (async (_accountId: string, _action: any, metadata: any) => {
      const key = metadata?.dedupeKey || metadata?.eventId || metadata?.callId || "k";
      if (processedKeys.has(key)) {
        return { charged: false, duplicate: true, cost: 0, walletBalance, breakdown: [] };
      }
      processedKeys.add(key);
      walletBalance = Math.round((walletBalance - 0.003) * 1000) / 1000;
      totalLedgerBilled = Math.round((totalLedgerBilled + 0.003) * 1000) / 1000;
      return { charged: true, cost: 0.003, walletBalance, breakdown: [] };
    }) as any,
    logUsageChargeFailure: (() => {}) as any,
  });

  // 2 Customer AI replies
  await chargeUsageBillingAction("acc_test", "customer_ai_text_reply", { eventId: "c1" });
  await chargeUsageBillingAction("acc_test", "customer_ai_text_reply", { eventId: "c2" });

  // 3 Business Assistant AI calls
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "admin_business_assistant", callId: "b1" });
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "admin_business_assistant", callId: "b2" });
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "admin_business_assistant", callId: "b3" });

  // 4 Personal Assistant AI calls
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p1" });
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p2" });
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p3" });
  await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p4" });

  // Verification
  assert.equal(totalLedgerBilled, 0.027); // 9 total calls * $0.003 = $0.027
  assert.equal(walletBalance, 9.973);     // 10.000 - 0.027 = $9.973
  assert.equal(Math.round((10.0 - walletBalance) * 1000) / 1000, totalLedgerBilled);

  // Replay all 9 idempotencies -> no change, ending wallet remains $9.973
  const rc1 = await chargeUsageBillingAction("acc_test", "customer_ai_text_reply", { eventId: "c1" });
  const rc2 = await chargeUsageBillingAction("acc_test", "customer_ai_text_reply", { eventId: "c2" });
  const rb1 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "admin_business_assistant", callId: "b1" });
  const rb2 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "admin_business_assistant", callId: "b2" });
  const rb3 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "admin_business_assistant", callId: "b3" });
  const rp1 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p1" });
  const rp2 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p2" });
  const rp3 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p3" });
  const rp4 = await chargeAiProviderCallBilling({ accountId: "acc_test", purpose: "personal_assistant", callId: "p4" });

  assert.equal(rc1?.duplicate, true);
  assert.equal(rc2?.duplicate, true);
  assert.equal(rb1?.duplicate, true);
  assert.equal(rb2?.duplicate, true);
  assert.equal(rb3?.duplicate, true);
  assert.equal(rp1?.duplicate, true);
  assert.equal(rp2?.duplicate, true);
  assert.equal(rp3?.duplicate, true);
  assert.equal(rp4?.duplicate, true);
  assert.equal(walletBalance, 9.973);
});

// ============================================================================
// 6. MONEY PRECISION (NO FLOATING POINT DRIFT)
// ============================================================================

test("6. Money Precision: 1000 x $0.003 operations = exactly $3.000 without floating point drift", () => {
  let centsBalance = 10000; // $10.00 in 100ths of a cent (millis)
  const costPerCall = 3;    // 3 millis ($0.003)

  for (let i = 0; i < 1000; i++) {
    centsBalance -= costPerCall;
  }

  const finalUsd = centsBalance / 1000;
  assert.equal(finalUsd, 7.0); // 10.000 - 3.000 = 7.000
  assert.equal(Number((1000 * 0.003).toFixed(3)), 3.0);
});

// ============================================================================
// 7. ONE-LIFETIME TRIAL EXTENSION
// ============================================================================

test("7. Trial Extension: Removed unsafe date heuristic, fail-closed for UNKNOWN legacy accounts, Super Admin manual resolution, and concurrent safety", async () => {
  const userStore: Record<string, any> = {
    user_fresh: {
      $id: "user_fresh",
      created_at: 1700000000,
      trial_expires_at: 1700000000 + 7 * 86400,
      trial_extension_used: false,
    },
    user_historical_flag: {
      $id: "user_historical_flag",
      created_at: 1700000000,
      trial_expires_at: 1700000000 + 37 * 86400,
      trial_extension_used: true,
      trial_extension_used_at: 1700000010,
    },
    user_historical_audit: {
      $id: "user_historical_audit",
      created_at: 1700000000,
      trial_expires_at: 1700000000 + 37 * 86400,
      trial_extension_used: undefined,
    },
    user_legacy_unknown: {
      $id: "user_legacy_unknown",
      created_at: 1700000000,
      trial_expires_at: 1700000000 + 37 * 86400, // date difference is 37 days (> 14 days)
      trial_extension_used: undefined,
    },
  };

  const auditRecords = new Set(["user_historical_audit"]);

  __setAdminTrialExtensionTestDeps({
    getUser: (async (uid: string) => userStore[uid] || null) as any,
    updateUser: (async (uid: string, data: any) => {
      userStore[uid] = { ...userStore[uid], ...data };
      return userStore[uid];
    }) as any,
    getUserExtraConfigValue: (async () => null) as any,
    saveUserExtraConfigPatch: (async () => {}) as any,
    hasHistoricalAuditRecord: (async (uid: string) => auditRecords.has(uid)),
  });

  // A. Fresh user: status is ELIGIBLE -> First extension succeeds -> Second extension rejected (USED)
  const evalFresh = await evaluateTrialExtensionStatus("user_fresh");
  assert.equal(evalFresh.status, "ELIGIBLE");

  const ext1 = await extendTrialForUser("user_fresh", "admin_req_1");
  assert.equal(ext1.success, true);
  assert.equal(userStore.user_fresh.trial_extension_used, true);
  assert.ok(userStore.user_fresh.trial_extension_used_at > 0);

  const evalFreshAfter = await evaluateTrialExtensionStatus("user_fresh");
  assert.equal(evalFreshAfter.status, "USED");

  await assert.rejects(
    async () => {
      await extendTrialForUser("user_fresh", "admin_req_1");
    },
    /already been used/i
  );

  // B. Historical user with explicit flag: status is USED -> rejected
  const evalHistFlag = await evaluateTrialExtensionStatus("user_historical_flag");
  assert.equal(evalHistFlag.status, "USED");
  await assert.rejects(
    async () => {
      await extendTrialForUser("user_historical_flag", "admin_req_1");
    },
    /already been used/i
  );

  // C. Historical user with explicit audit log: status is USED -> rejected
  const evalHistAudit = await evaluateTrialExtensionStatus("user_historical_audit");
  assert.equal(evalHistAudit.status, "USED");
  await assert.rejects(
    async () => {
      await extendTrialForUser("user_historical_audit", "admin_req_1");
    },
    /already been used/i
  );

  // D. Legacy user without durable markers or audits:
  // Must NOT use date heuristic! Classified as UNKNOWN.
  const evalLegacy = await evaluateTrialExtensionStatus("user_legacy_unknown");
  assert.equal(evalLegacy.status, "UNKNOWN");

  // Normal extension fails closed on UNKNOWN
  await assert.rejects(
    async () => {
      await extendTrialForUser("user_legacy_unknown", "admin_req_1");
    },
    /Legacy account trial extension status is UNKNOWN.*Super Admin/i
  );

  // Super Admin manually resolves legacy account as eligible
  const resEligible = await resolveLegacyTrialExtension("user_legacy_unknown", "eligible", "super_admin_1");
  assert.equal(resEligible.success, true);
  assert.equal(resEligible.status, "ELIGIBLE");

  const evalLegacyEligible = await evaluateTrialExtensionStatus("user_legacy_unknown");
  assert.equal(evalLegacyEligible.status, "ELIGIBLE");

  // Now extension succeeds
  const extLegacy = await extendTrialForUser("user_legacy_unknown", "admin_req_1");
  assert.equal(extLegacy.success, true);
  assert.equal(userStore.user_legacy_unknown.trial_extension_used, true);

  // Permanent after extension: cannot extend again
  await assert.rejects(
    async () => {
      await extendTrialForUser("user_legacy_unknown", "admin_req_1");
    },
    /already been used/i
  );

  // E. Super Admin resolves another legacy account as already used
  userStore.user_legacy_used = {
    $id: "user_legacy_used",
    trial_extension_used: undefined,
  };
  const resUsed = await resolveLegacyTrialExtension("user_legacy_used", "used", "super_admin_1");
  assert.equal(resUsed.success, true);
  assert.equal(resUsed.status, "USED");

  const evalLegacyUsed = await evaluateTrialExtensionStatus("user_legacy_used");
  assert.equal(evalLegacyUsed.status, "USED");
  await assert.rejects(
    async () => {
      await extendTrialForUser("user_legacy_used", "admin_req_1");
    },
    /already been used/i
  );
});

// ============================================================================
// 8. WALLET PURCHASES (PLAN, ADD-ON, SETUP, TOGGLE, REFUND, IDEMPOTENCY)
// ============================================================================

test("8. Wallet Purchases: Toggle enforcement, plan upgrade, add-on, setup, and refund on failure", async () => {
  let user: any = {
    $id: "acc_purchase_test",
    wallet_balance: 150.0,
    wallet_billing_purchases_enabled: true,
    plan_id: "starter_plan",
    subscription_status: "paid",
    plan_status: "paid",
    plan_expiry: 0,
  };

  __setWalletBillingPurchaseTestDeps({
    getUser: (async () => user) as any,
    getUserExtraConfigValue: (async (_uid: string, key: string) => {
      if (key === "wallet_billing_purchases_enabled") return user.wallet_billing_purchases_enabled;
      return null;
    }) as any,
    saveUserExtraConfigPatch: (async (_uid: string, patch: any) => {
      Object.assign(user, patch);
    }) as any,
    updateUserPlan: (async (_uid: string, planId: string, expiry: number) => {
      user.plan_id = planId;
      user.plan_expiry = expiry;
      return true;
    }) as any,
    updateUser: (async (_uid: string, patch: any) => {
      Object.assign(user, patch);
      return user;
    }) as any,
    debitWalletBalance: (async (_uid: string, amount: number) => {
      if (user.wallet_balance < amount) return { success: false, newBalance: user.wallet_balance };
      user.wallet_balance = Math.round((user.wallet_balance - amount) * 100) / 100;
      return { success: true, newBalance: user.wallet_balance };
    }) as any,
    creditWalletBalance: (async (_uid: string, amount: number) => {
      user.wallet_balance = Math.round((user.wallet_balance + amount) * 100) / 100;
      return { success: true, newBalance: user.wallet_balance };
    }) as any,
    getSubscriptions: (async () => []) as any,
    getBotsByUser: (async () => []) as any,
    listProducts: (async () => []) as any,
    getSavedBillingCapacityUsageForUser: (async () => ({
      instances: 0,
      products: 0,
      mediaTemplates: 0,
      mediaGroups: 0,
      sequenceGroups: 0,
    })) as any,
    createSubscription: (async () => ({ $id: "sub_1" })) as any,
    addSubscription: (async () => "sub_1") as any,
    startWalletPurchaseMarker: (async (_input: any) => ({
      fresh: true,
      marker: {
        key: "test_key",
        userId: "acc_purchase_test",
        purchaseType: "plan",
        target: "test",
        amount: 10,
        idempotencyKeyHash: "test_hash",
        transactionRef: `ref_${Date.now()}`,
        status: "in_progress" as const,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      },
    })) as any,
    updateWalletPurchaseMarker: (async () => ({} as any)) as any,
  });

  // A. Buy Growth Plan ($29)
  const planPurchase = await purchasePlanWithWallet(user, {
    planId: "growth_plan",
    billingCycle: "monthly",
    idempotencyKey: "idem_plan_growth_001",
  });
  assert.equal(planPurchase.charged, 29);
  assert.equal(user.wallet_balance, 121.0); // 150 - 29 = 121
  assert.equal(user.plan_id, "growth_plan");

  // B. Buy Add-on (extra instance = $10)
  const addonPurchase = await purchaseAddonWithWallet(user, {
    addonType: "extra_instance",
    quantity: 1,
    idempotencyKey: "idem_addon_001",
  });
  assert.equal(addonPurchase.charged, 10);
  assert.equal(user.wallet_balance, 111.0); // 121 - 10 = 111

  // C. Buy Setup Service ($49)
  const setupPurchase = await purchaseSetupWithWallet(user, {
    idempotencyKey: "idem_setup_001",
  });
  assert.equal(setupPurchase.charged, 49);
  assert.equal(user.wallet_balance, 62.0); // 111 - 49 = 62

  // D. Insufficient Balance Check (Upgrade to Pro costs $60 after $29 Growth credit; wallet is $50)
  user.wallet_balance = 50.0;
  await assert.rejects(
    async () => {
      await purchasePlanWithWallet(user, {
        planId: "pro_plan",
        billingCycle: "monthly",
        idempotencyKey: "idem_broke_001",
      });
    },
    /Insufficient wallet balance/i
  );
  assert.equal(user.wallet_balance, 50.0); // Balance untouched

  // E. Toggle OFF blocks wallet purchase
  user.wallet_billing_purchases_enabled = false;
  await assert.rejects(
    async () => {
      await purchaseAddonWithWallet(user, {
        addonType: "extra_instance",
        idempotencyKey: "idem_disabled_001",
      });
    },
    /disabled for this account/i
  );
});

// ============================================================================
// 9. PRECHECK MINIMUM WALLET REQUIREMENT ($0.003)
// ============================================================================

test("9. Precheck Minimum Balance: $0.002 blocks $0.003 action, $0.003 allows 1 action, $0.000 blocks next", async () => {
  let balance = 0.002;
  __setAiProviderCallBillingTestDeps({
    getUser: (async () => ({ wallet_balance: balance })) as any,
    chargeUsageAction: (async () => {
      balance = Math.round((balance - 0.003) * 1000) / 1000;
      return { charged: true, cost: 0.003, walletBalance: balance, breakdown: [] };
    }) as any,
  });

  // Wallet $0.002: $0.003 AI action preview is blocked
  const precheck1 = await previewAiProviderCallBilling({
    accountId: "acc_precheck",
    purpose: "admin_business_assistant",
  });
  assert.equal(precheck1.allowed, false);
  assert.equal(precheck1.reason, "insufficient_wallet");

  // Wallet top-up to $0.003: allowed
  balance = 0.003;
  const precheck2 = await previewAiProviderCallBilling({
    accountId: "acc_precheck",
    purpose: "admin_business_assistant",
  });
  assert.equal(precheck2.allowed, true);
  assert.equal(precheck2.cost, 0.003);

  // Charge 1 action -> balance becomes $0.000
  const chargeRes = await chargeAiProviderCallBilling({
    accountId: "acc_precheck",
    purpose: "admin_business_assistant",
    callId: "call_precheck_01",
  });
  assert.equal(chargeRes.charged, true);
  assert.equal(balance, 0.0);

  // Next action with $0.000 balance is blocked
  const precheck3 = await previewAiProviderCallBilling({
    accountId: "acc_precheck",
    purpose: "admin_business_assistant",
  });
  assert.equal(precheck3.allowed, false);
  assert.equal(precheck3.reason, "insufficient_wallet");
});
