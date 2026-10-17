import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetWalletBillingPurchaseTestDeps,
  __setWalletBillingPurchaseTestDeps,
  getWalletBillingPurchasesEnabled,
  purchaseAddonWithWallet,
  purchasePlanWithWallet,
  purchaseSetupWithWallet,
  setWalletBillingPurchasesEnabled,
  WALLET_SUBSCRIPTION_REFUND_TYPE,
} from "./wallet-billing-purchase-service.ts";

function createMarkerDeps() {
  const markers = new Map<string, any>();
  return {
    markers,
    startWalletPurchaseMarker: async ({ userId, purchaseType, target, amount, idempotencyKey }: any) => {
      const key = `${userId}|${purchaseType}|${target}|${idempotencyKey}`;
      const existing = markers.get(key);
      if (existing) return { fresh: false, marker: existing };
      const marker = {
        key,
        status: "started",
        userId,
        purchaseType,
        target,
        amount,
        idempotencyKeyHash: `hash_${idempotencyKey}`,
        transactionRef: `ref_${markers.size + 1}`,
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
        resultSummary: {},
      };
      markers.set(key, marker);
      return { fresh: true, marker };
    },
    updateWalletPurchaseMarker: async (key: string, patch: any) => {
      const current = markers.get(key) || { key, resultSummary: {} };
      const next = {
        ...current,
        ...patch,
        resultSummary: typeof patch?.resultSummary === "object" && patch.resultSummary
          ? patch.resultSummary
          : current.resultSummary,
      };
      markers.set(key, next);
      return next;
    },
  };
}

function installCommonDeps(overrides: Record<string, any> = {}) {
  const markerDeps = createMarkerDeps();
  const debits: any[] = [];
  const credits: any[] = [];
  const planUpdates: any[] = [];
  const createdSubscriptions: any[] = [];
  const fallbackSubscriptions: any[] = [];
  const updatedUsers: any[] = [];

  __setWalletBillingPurchaseTestDeps({
    now: () => 1_800_000_000,
    getUserExtraConfigValue: async () => true,
    getUser: async () => ({ $id: "user_1", wallet_balance: 100 }),
    getSubscriptions: async () => [],
    getBotsByUser: async () => [],
    listProducts: async () => [],
    getSavedBillingCapacityUsageForUser: async () => ({ mediaGroups: 0, sequenceGroups: 0, mediaTemplates: 0 }),
    getBillingAccess: () => ({ canBuyAddons: true }),
    debitWalletBalance: async (_userId: string, amount: number) => {
      debits.push(amount);
      return { success: true, newBalance: Number((100 - amount).toFixed(2)) };
    },
    creditWalletBalance: async (_userId: string, amount: number, type: string, description: string) => {
      credits.push({ amount, type, description });
      return { success: true, newBalance: 100 };
    },
    updateUserPlan: async (_userId: string, planId: string, planExpiry: number) => {
      planUpdates.push({ planId, planExpiry });
      return true;
    },
    updateUser: async (_userId: string, patch: any) => {
      updatedUsers.push(patch);
      return true;
    },
    createSubscription: async (payload: any) => {
      createdSubscriptions.push(payload);
      return { $id: `sub_${createdSubscriptions.length}` };
    },
    addSubscription: async (_userId: string, type: string, quantity: number, expiry: number, autoRenew: boolean) => {
      fallbackSubscriptions.push({ type, quantity, expiry, autoRenew });
      return `sub_fallback_${fallbackSubscriptions.length}`;
    },
    ...markerDeps,
    ...overrides,
  } as any);

  return {
    markers: markerDeps.markers,
    debits,
    credits,
    planUpdates,
    createdSubscriptions,
    fallbackSubscriptions,
    updatedUsers,
  };
}

test.afterEach(() => {
  __resetWalletBillingPurchaseTestDeps();
});

test("wallet billing toggle defaults OFF when config is missing", async () => {
  __setWalletBillingPurchaseTestDeps({
    getUserExtraConfigValue: async () => null,
  } as any);

  const enabled = await getWalletBillingPurchasesEnabled("user_1");
  assert.equal(enabled, false);
});

test("wallet billing toggle persists ON and OFF values", async () => {
  const patches: any[] = [];
  __setWalletBillingPurchaseTestDeps({
    saveUserExtraConfigPatch: async (_userId: string, patch: any) => {
      patches.push(patch);
      return patch;
    },
  } as any);

  const enabled = await setWalletBillingPurchasesEnabled("user_1", true);
  const disabled = await setWalletBillingPurchasesEnabled("user_1", false);

  assert.equal(enabled.enabled, true);
  assert.equal(disabled.enabled, false);
  assert.deepEqual(patches, [
    { wallet_billing_purchases_enabled: true },
    { wallet_billing_purchases_enabled: false },
  ]);
});

test("wallet plan purchase debits once and applies plan entitlement", async () => {
  const state = installCommonDeps();

  const result: any = await purchasePlanWithWallet(
    { $id: "user_1", plan_expiry: 0 },
    { planId: "starter_plan", billingCycle: "monthly", idempotencyKey: "plan:key:1" },
  );

  assert.equal(result.type, "plan");
  assert.equal(result.charged, 9);
  assert.equal(result.walletBalanceAfter, 91);
  assert.equal(state.debits.length, 1);
  assert.equal(state.planUpdates.length, 1);
  assert.equal(state.updatedUsers.length, 1);
  assert.equal(state.credits.length, 0);
});

test("wallet plan purchase requires enabled flag and ignores client amount", async () => {
  __setWalletBillingPurchaseTestDeps({
    getUserExtraConfigValue: async () => false,
  } as any);

  await assert.rejects(
    purchasePlanWithWallet(
      { $id: "user_1", plan_expiry: 0 },
      { planId: "starter_plan", billingCycle: "monthly", idempotencyKey: "plan:key:disabled", amount: 999 } as any,
    ),
    /Wallet billing for plans, add-ons, and setup is disabled for this account\./,
  );

  const enabledState = installCommonDeps();
  const result: any = await purchasePlanWithWallet(
    { $id: "user_1", plan_expiry: 0 },
    { planId: "starter_plan", billingCycle: "monthly", idempotencyKey: "plan:key:server-amount", amount: 999 } as any,
  );
  assert.equal(result.charged, 9);
  assert.equal(enabledState.debits[0], 9);
});

test("wallet add-on purchase debits once and creates entitlement", async () => {
  const state = installCommonDeps();

  const result: any = await purchaseAddonWithWallet(
    { $id: "user_1", role: "user" },
    { addonType: "extra_instance", quantity: 2, idempotencyKey: "addon:key:1" },
  );

  assert.equal(result.type, "addon");
  assert.equal(result.charged, 20);
  assert.equal(state.debits.length, 1);
  assert.equal(state.createdSubscriptions.length, 1);
  assert.equal(state.createdSubscriptions[0].type, "instance");
  assert.equal(state.credits.length, 0);
});

test("wallet add-on purchase requires enabled flag", async () => {
  __setWalletBillingPurchaseTestDeps({
    getUserExtraConfigValue: async () => false,
  } as any);

  await assert.rejects(
    purchaseAddonWithWallet(
      { $id: "user_1", role: "user" },
      { addonType: "extra_instance", quantity: 1, idempotencyKey: "addon:key:disabled" },
    ),
    /Wallet billing for plans, add-ons, and setup is disabled for this account\./,
  );
});

test("wallet setup purchase debits once and creates entitlement", async () => {
  const state = installCommonDeps();

  const result: any = await purchaseSetupWithWallet(
    { $id: "user_1" },
    { idempotencyKey: "setup:key:1" },
  );

  assert.equal(result.type, "setup");
  assert.equal(result.charged, 49);
  assert.equal(state.debits.length, 1);
  assert.equal(state.createdSubscriptions.length, 1);
  assert.equal(state.createdSubscriptions[0].type, "setup_service");
  assert.equal(state.credits.length, 0);
});

test("wallet setup purchase requires enabled flag", async () => {
  __setWalletBillingPurchaseTestDeps({
    getUserExtraConfigValue: async () => false,
  } as any);

  await assert.rejects(
    purchaseSetupWithWallet(
      { $id: "user_1" },
      { idempotencyKey: "setup:key:disabled" },
    ),
    /Wallet billing for plans, add-ons, and setup is disabled for this account\./,
  );
});

test("insufficient balance blocks wallet purchase before entitlement write", async () => {
  const state = installCommonDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 5 }),
  });

  await assert.rejects(
    purchaseAddonWithWallet(
      { $id: "user_1", role: "user" },
      { addonType: "extra_instance", quantity: 1, idempotencyKey: "addon:key:low-balance" },
    ),
    /Insufficient wallet balance/,
  );

  assert.equal(state.debits.length, 0);
  assert.equal(state.createdSubscriptions.length, 0);
  const marker = Array.from(state.markers.values())[0];
  assert.equal(marker?.status, "failed_no_debit");
});

test("same wallet idempotency key returns prior result without double debit", async () => {
  const state = installCommonDeps();

  const first: any = await purchasePlanWithWallet(
    { $id: "user_1", plan_expiry: 0 },
    { planId: "starter_plan", billingCycle: "monthly", idempotencyKey: "plan:key:dup" },
  );
  const second: any = await purchasePlanWithWallet(
    { $id: "user_1", plan_expiry: 0 },
    { planId: "starter_plan", billingCycle: "monthly", idempotencyKey: "plan:key:dup" },
  );

  assert.equal(first.transactionRef, second.transactionRef);
  assert.equal(second.duplicate, true);
  assert.equal(state.debits.length, 1);
  assert.equal(state.planUpdates.length, 1);
});

test("wallet plan purchase refunds after entitlement failure", async () => {
  const state = installCommonDeps({
    updateUserPlan: async () => false,
  });

  await assert.rejects(
    purchasePlanWithWallet(
      { $id: "user_1", plan_expiry: 0 },
      { planId: "starter_plan", billingCycle: "monthly", idempotencyKey: "plan:key:refund" },
    ),
    /Wallet charge was refunded/,
  );

  assert.equal(state.debits.length, 1);
  assert.equal(state.credits.length, 1);
  assert.equal(state.credits[0].type, WALLET_SUBSCRIPTION_REFUND_TYPE);
});

test("wallet add-on purchase refunds after entitlement failure", async () => {
  const state = installCommonDeps({
    createSubscription: async () => { throw new Error("create_failed"); },
    addSubscription: async () => { throw new Error("fallback_failed"); },
  });

  await assert.rejects(
    purchaseAddonWithWallet(
      { $id: "user_1", role: "user" },
      { addonType: "extra_30_products", quantity: 1, idempotencyKey: "addon:key:refund" },
    ),
    /Wallet charge was refunded/,
  );

  assert.equal(state.debits.length, 1);
  assert.equal(state.credits.length, 1);
  assert.equal(state.credits[0].type, WALLET_SUBSCRIPTION_REFUND_TYPE);
});

test("wallet setup purchase refunds after entitlement failure", async () => {
  const state = installCommonDeps({
    createSubscription: async () => { throw new Error("create_failed"); },
    addSubscription: async () => { throw new Error("fallback_failed"); },
  });

  await assert.rejects(
    purchaseSetupWithWallet(
      { $id: "user_1" },
      { idempotencyKey: "setup:key:refund" },
    ),
    /Wallet charge was refunded/,
  );

  assert.equal(state.debits.length, 1);
  assert.equal(state.credits.length, 1);
  assert.equal(state.credits[0].type, WALLET_SUBSCRIPTION_REFUND_TYPE);
});
