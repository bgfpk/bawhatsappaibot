import * as dbService from "./db-service.ts";
import { getBillingAccess, normalizeEpochSeconds } from "../config/billing-access.ts";
import { BILLING_ADDONS, BILLING_PLAN_DETAILS, FULL_SETUP_PRICE, getPlanMonthlyPriceUsd, getAddonMonthlyPriceUsd, calculatePlanUpgradeCost, type BillingCycle, type BillingPlanId } from "../config/pricing.ts";
import { PLANS } from "../types.ts";
import { addActiveAddonQuantities } from "./account-limit-service.ts";
import { getSavedBillingCapacityUsageForUser } from "./billing-capacity-service.ts";
import {
  startWalletPurchaseMarker,
  updateWalletPurchaseMarker,
  type WalletPurchaseMarker,
} from "./wallet-billing-purchase-idempotency-service.ts";

const now = () => Math.floor(Date.now() / 1000);
const ONE_MONTH_SECONDS = 30 * 24 * 60 * 60;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export const WALLET_BILLING_PURCHASES_ENABLED_KEY = "wallet_billing_purchases_enabled";
export const WALLET_SUBSCRIPTION_REFUND_TYPE = "wallet_subscription_refund";

const defaultDeps = {
  now,
  getBillingAccess,
  getSavedBillingCapacityUsageForUser,
  addActiveAddonQuantities,
  getUser: dbService.getUser,
  getUserExtraConfigValue: dbService.getUserExtraConfigValue,
  saveUserExtraConfigPatch: dbService.saveUserExtraConfigPatch,
  debitWalletBalance: dbService.debitWalletBalance,
  creditWalletBalance: dbService.creditWalletBalance,
  getSubscriptions: dbService.getSubscriptions,
  getBotsByUser: dbService.getBotsByUser,
  listProducts: dbService.listProducts,
  updateUserPlan: dbService.updateUserPlan,
  updateUser: dbService.updateUser,
  createSubscription: dbService.createSubscription,
  addSubscription: dbService.addSubscription,
  startWalletPurchaseMarker,
  updateWalletPurchaseMarker,
};

const walletBillingPurchaseDeps = { ...defaultDeps };

export function __setWalletBillingPurchaseTestDeps(overrides: Partial<typeof defaultDeps>) {
  Object.assign(walletBillingPurchaseDeps, overrides || {});
}

export function __resetWalletBillingPurchaseTestDeps() {
  Object.assign(walletBillingPurchaseDeps, defaultDeps);
}

function normalizeEnabled(value: any) {
  return value === true || value === 1 || String(value || "").trim().toLowerCase() === "true";
}

export function normalizeWalletPurchaseIdempotencyKey(value: any) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 180);
}

function normalizeErrorMessage(error: any) {
  return String(error?.message || error || "Unable to complete wallet purchase").trim();
}

function getAddonStoredType(addonType: string) {
  if (addonType === "extra_30_products") return "product_bundle";
  if (addonType === "extra_instance") return "instance";
  return addonType;
}

function buildPlanScopedLimits(plan: any, addons: any = {}) {
  return {
    instanceLimit: Math.min(Number(plan?.included_instances || 0) + Number(addons?.instances || 0), Number(plan?.max_instances || 0)),
    productLimit: Math.min(Number(plan?.included_products || 0) + (Number(addons?.productBundles || 0) * 30), Number(plan?.max_products || 0)),
    mediaTemplateLimit: Number(plan?.media_templates || 0) + (Number(addons?.mediaTemplateBundles || 0) * 500),
    mediaGroupLimit: Math.max(0, Number(plan?.media_groups || 0)),
    sequenceGroupLimit: Number(plan?.sequence_groups || 0) + (Number(addons?.sequenceGroupBundles || 0) * 5),
  };
}

function getPlanChargeAmount(planId: BillingPlanId, billingCycle: BillingCycle) {
  const planDetails = BILLING_PLAN_DETAILS[planId];
  if (!planDetails) throw new Error("Invalid plan selection.");
  if (billingCycle === "annual") {
    return Number(planDetails.annualFounding?.exact || planDetails.annualFounding?.display || 0);
  }
  const monthlyPrice = getPlanMonthlyPriceUsd(planId);
  if (typeof monthlyPrice !== "number" || monthlyPrice <= 0) {
    throw new Error("Invalid or non-positive plan pricing.");
  }
  return monthlyPrice;
}

function getAddonChargeAmount(addonType: string, quantity: number) {
  const unitAmount = getAddonMonthlyPriceUsd(addonType);
  if (typeof unitAmount !== "number" || unitAmount <= 0) {
    throw new Error("Invalid or non-positive add-on pricing selection.");
  }
  return Number((unitAmount * Math.max(1, quantity)).toFixed(2));
}

async function ensureWalletPurchaseEnabled(userId: string) {
  if (!(await getWalletBillingPurchasesEnabled(userId))) {
    throw new Error("Wallet billing for plans, add-ons, and setup is disabled for this account.");
  }
}

async function debitWalletOrThrow(userId: string, amount: number, type: string, description: string) {
  const user = await walletBillingPurchaseDeps.getUser(userId) as any;
  const walletBalance = Number(user?.wallet_balance || 0);
  if (walletBalance < amount) {
    throw new Error(`Insufficient wallet balance. Required $${amount.toFixed(2)}, available $${walletBalance.toFixed(2)}.`);
  }
  const debitResult = await walletBillingPurchaseDeps.debitWalletBalance(userId, amount, type, description);
  if (!debitResult.success) {
    throw new Error(`Insufficient wallet balance. Required $${amount.toFixed(2)}, available $${walletBalance.toFixed(2)}.`);
  }
  return { debitResult, walletBalance };
}

type WalletPurchaseResolvedResult<T extends Record<string, any>> = T & {
  charged: number;
  walletBalanceBefore: number;
  walletBalanceAfter: number;
  transactionRef: string;
  duplicate?: boolean;
};

function getCompletedMarkerResult<T extends Record<string, any>>(marker: WalletPurchaseMarker) {
  return {
    ...(marker.resultSummary || {}),
    duplicate: true,
    transactionRef: marker.transactionRef,
  } as WalletPurchaseResolvedResult<T>;
}

function buildRefundDescription(label: string, marker: WalletPurchaseMarker) {
  return `${label} [ref ${marker.transactionRef}:${marker.idempotencyKeyHash}]`;
}

async function runWalletPurchase<T extends Record<string, any>>(input: {
  userId: string;
  purchaseType: "plan" | "addon" | "setup";
  target: string;
  amount: number;
  idempotencyKey: string;
  debitType: string;
  debitDescription: string;
  refundDescription: string;
  applyEntitlement: (marker: WalletPurchaseMarker) => Promise<T>;
}): Promise<WalletPurchaseResolvedResult<T>> {
  const idempotencyKey = normalizeWalletPurchaseIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) throw new Error("Wallet purchase idempotency key is required.");

  const started = await walletBillingPurchaseDeps.startWalletPurchaseMarker({
    userId: input.userId,
    purchaseType: input.purchaseType,
    target: input.target,
    amount: input.amount,
    idempotencyKey,
  });
  if (!started.fresh) {
    const marker = started.marker;
    if (marker.status === "completed") return getCompletedMarkerResult<T>(marker);
    if (marker.status === "failed_refunded") {
      throw new Error(`This wallet purchase already failed and was refunded. Retry with a new purchase request. Ref ${marker.transactionRef}.`);
    }
    if (marker.status === "failed_no_debit") {
      throw new Error(`This wallet purchase already failed before debit. Retry with a new purchase request. Ref ${marker.transactionRef}.`);
    }
    throw new Error(`This wallet purchase is already in progress. Please wait and refresh Billing. Ref ${marker.transactionRef}.`);
  }

  const marker = started.marker;
  let debitMeta: { debitResult: any; walletBalance: number } | null = null;
  console.log(`[WalletPurchase] wallet_purchase_debit_started key=${marker.key} userId=${input.userId} amount=${input.amount} type=${input.purchaseType}`);
  try {
    debitMeta = await debitWalletOrThrow(
      input.userId,
      input.amount,
      input.debitType,
      `${input.debitDescription} [ref ${marker.transactionRef}]`,
    );
    console.log(`[WalletPurchase] wallet_purchase_debit_succeeded key=${marker.key} userId=${input.userId} newBalance=${debitMeta.debitResult.newBalance}`);
  } catch (error: any) {
    console.error(`[WalletPurchase] wallet_purchase_debit_failed key=${marker.key} error=${error?.message || error}`);
    await walletBillingPurchaseDeps.updateWalletPurchaseMarker(marker.key, {
      status: "failed_no_debit",
      errorMessage: normalizeErrorMessage(error),
      resultSummary: {
        type: input.purchaseType,
        target: input.target,
        charged: input.amount,
        transactionRef: marker.transactionRef,
      },
    }).catch(() => {});
    throw error;
  }

  try {
    const entitlementResult = await input.applyEntitlement(marker);
    console.log(`[WalletPurchase] wallet_purchase_entitlement_succeeded key=${marker.key} target=${input.target}`);
    const result = {
      ...entitlementResult,
      charged: input.amount,
      walletBalanceBefore: debitMeta.walletBalance,
      walletBalanceAfter: debitMeta.debitResult.newBalance,
      transactionRef: marker.transactionRef,
    };
    await walletBillingPurchaseDeps.updateWalletPurchaseMarker(marker.key, {
      status: "completed",
      amount: input.amount,
      errorMessage: "",
      resultSummary: result,
    }).catch(() => {});
    console.log(`[WalletPurchase] wallet_purchase_completed key=${marker.key} ref=${marker.transactionRef}`);
    return result;
  } catch (error: any) {
    console.error(`[WalletPurchase] wallet_purchase_entitlement_failed key=${marker.key} error=${error?.message || error}`);
    let refundApplied = false;
    try {
      await walletBillingPurchaseDeps.creditWalletBalance(
        input.userId,
        input.amount,
        WALLET_SUBSCRIPTION_REFUND_TYPE,
        buildRefundDescription(input.refundDescription, marker),
      );
      refundApplied = true;
      console.log(`[WalletPurchase] wallet_purchase_refunded key=${marker.key} amount=${input.amount} ref=${marker.transactionRef}`);
    } catch (refundErr: any) {
      console.error(`[WalletPurchase] wallet_purchase_refund_failed key=${marker.key} error=${refundErr?.message || refundErr}`);
    }
    await walletBillingPurchaseDeps.updateWalletPurchaseMarker(marker.key, {
      status: "failed_refunded",
      amount: input.amount,
      errorMessage: normalizeErrorMessage(error),
      refundApplied,
      resultSummary: {
        type: input.purchaseType,
        target: input.target,
        charged: input.amount,
        refunded: refundApplied,
        transactionRef: marker.transactionRef,
      },
    }).catch(() => {});
    if (!refundApplied) {
      throw new Error(`Failed to apply entitlement and automatic refund did not complete. Manual review required. Ref ${marker.transactionRef}.`);
    }
    throw new Error(`${normalizeErrorMessage(error)} Wallet charge was refunded. Ref ${marker.transactionRef}.`);
  }
}

export async function getWalletBillingPurchasesEnabled(userId: string) {
  return normalizeEnabled(await walletBillingPurchaseDeps.getUserExtraConfigValue(userId, WALLET_BILLING_PURCHASES_ENABLED_KEY).catch(() => false));
}

export async function setWalletBillingPurchasesEnabled(userId: string, enabled: boolean) {
  await walletBillingPurchaseDeps.saveUserExtraConfigPatch(userId, {
    [WALLET_BILLING_PURCHASES_ENABLED_KEY]: Boolean(enabled),
  });
  return { enabled: Boolean(enabled) };
}

export async function purchasePlanWithWallet(user: any, input: {
  planId: BillingPlanId;
  billingCycle: BillingCycle;
  idempotencyKey: string;
}) {
  const userId = String(user?.$id || user?.id || "");
  await ensureWalletPurchaseEnabled(userId);
  const planId = input.planId;
  const billingCycle = input.billingCycle === "annual" ? "annual" : "monthly";
  const planDetails = BILLING_PLAN_DETAILS[planId];
  const targetPlan = PLANS[planId];
  if (!planDetails || !targetPlan) throw new Error("Invalid plan selection.");

  const subscriptions = await walletBillingPurchaseDeps.getSubscriptions(userId).catch(() => []);
  const activeCreemSub = (user?.creem_subscription_id) ||
    (subscriptions || []).find((s: any) =>
      (s?.type?.includes("plan") || s?.type === "starter_plan" || s?.type === "growth_plan" || s?.type === "pro_plan") &&
      s?.creem_subscription_id &&
      Number(s?.expires_at || 0) > walletBillingPurchaseDeps.now()
    )?.creem_subscription_id;
  if (activeCreemSub) {
    throw new Error("You have an active card subscription managed through Creem. Please use Upgrade with Card to keep your billing synchronized, or cancel your Creem subscription first.");
  }
  const addons = walletBillingPurchaseDeps.addActiveAddonQuantities(subscriptions);
  const targetLimits = buildPlanScopedLimits(targetPlan, addons);
  const [bots, products, savedCapacityUsage] = await Promise.all([
    walletBillingPurchaseDeps.getBotsByUser(userId).catch(() => []),
    walletBillingPurchaseDeps.listProducts(userId).catch(() => []),
    walletBillingPurchaseDeps.getSavedBillingCapacityUsageForUser(userId),
  ]);
  const activeBots = (bots || []).filter((bot: any) => bot?.is_active !== 0).length;
  if (activeBots > targetLimits.instanceLimit) throw new Error(`Cannot switch to ${planDetails.name} while ${activeBots} active instance(s) exceed the allowed ${targetLimits.instanceLimit}.`);
  if ((products || []).length > targetLimits.productLimit) throw new Error(`Cannot switch to ${planDetails.name} while ${(products || []).length} products/services exceed the allowed ${targetLimits.productLimit}.`);
  if (savedCapacityUsage.mediaGroups > targetLimits.mediaGroupLimit) throw new Error(`Cannot switch to ${planDetails.name} while ${savedCapacityUsage.mediaGroups} media group(s) exceed the allowed ${targetLimits.mediaGroupLimit}.`);
  if (savedCapacityUsage.sequenceGroups > targetLimits.sequenceGroupLimit) throw new Error(`Cannot switch to ${planDetails.name} while ${savedCapacityUsage.sequenceGroups} sequence group(s) exceed the allowed ${targetLimits.sequenceGroupLimit}.`);
  if (savedCapacityUsage.mediaTemplates > targetLimits.mediaTemplateLimit) throw new Error(`Cannot switch to ${planDetails.name} while ${savedCapacityUsage.mediaTemplates} synced template(s) exceed the allowed ${targetLimits.mediaTemplateLimit}.`);

  const upgradeCalc = calculatePlanUpgradeCost({
    currentPlanId: user?.plan_id || user?.plan,
    currentPlanExpiry: normalizeEpochSeconds(user?.plan_expiry),
    targetPlanId: planId,
    billingCycle,
    nowTime: walletBillingPurchaseDeps.now(),
  });

  const chargeAmount = upgradeCalc.amountDueNow;
  const nextExpiry = upgradeCalc.isUpgrade
    ? walletBillingPurchaseDeps.now() + (billingCycle === "annual" ? ONE_YEAR_SECONDS : ONE_MONTH_SECONDS)
    : Math.max(walletBillingPurchaseDeps.now(), normalizeEpochSeconds(user?.plan_expiry)) + (billingCycle === "annual" ? ONE_YEAR_SECONDS : ONE_MONTH_SECONDS);

  const debitDescription = upgradeCalc.currentPlanCredit > 0
    ? `Wallet plan upgrade: ${planDetails.name} (${billingCycle}) [Credited $${upgradeCalc.currentPlanCredit.toFixed(2)}]`
    : `Wallet plan purchase: ${planDetails.name} (${billingCycle})`;

  return runWalletPurchase({
    userId,
    purchaseType: "plan",
    target: `${planId}:${billingCycle}`,
    amount: chargeAmount,
    idempotencyKey: input.idempotencyKey,
    debitType: "subscription_wallet",
    debitDescription,
    refundDescription: `Refund after failed wallet plan purchase: ${planDetails.name} (${billingCycle})`,
    applyEntitlement: async () => {
      const planUpdated = await walletBillingPurchaseDeps.updateUserPlan(userId, planId, nextExpiry);
      if (!planUpdated) throw new Error("Failed to update the subscription plan.");
      await walletBillingPurchaseDeps.updateUser(userId, { trial_expires_at: walletBillingPurchaseDeps.now() - 1 });
      return {
        type: "plan" as const,
        planId,
        billingCycle,
        planExpiry: nextExpiry,
        creditApplied: upgradeCalc.currentPlanCredit,
        regularPrice: upgradeCalc.targetPrice,
      };
    },
  });
}

export async function purchaseAddonWithWallet(user: any, input: {
  addonType: string;
  quantity?: number;
  idempotencyKey: string;
}) {
  const userId = String(user?.$id || user?.id || "");
  await ensureWalletPurchaseEnabled(userId);
  const access = walletBillingPurchaseDeps.getBillingAccess(user);
  if (!access.canBuyAddons) throw new Error("Add-ons are available after choosing a paid plan.");

  const addonType = String(input.addonType || "");
  const quantity = Math.max(1, Math.min(99, Number(input.quantity || 1)));
  const chargeAmount = getAddonChargeAmount(addonType, quantity);
  const storedType = getAddonStoredType(addonType);
  const expiry = walletBillingPurchaseDeps.now() + ONE_MONTH_SECONDS;
  return runWalletPurchase({
    userId,
    purchaseType: "addon",
    target: `${addonType}:${quantity}`,
    amount: chargeAmount,
    idempotencyKey: input.idempotencyKey,
    debitType: "addon_wallet",
    debitDescription: `Wallet add-on purchase: ${addonType} x${quantity}`,
    refundDescription: `Refund after failed wallet add-on purchase: ${addonType} x${quantity}`,
    applyEntitlement: async () => {
      try {
        await walletBillingPurchaseDeps.createSubscription({
          user_id: userId,
          type: storedType,
          quantity,
          expires_at: expiry,
          auto_renew: 0,
          creem_product_id: "",
          creem_subscription_id: "",
        });
      } catch {
        await walletBillingPurchaseDeps.addSubscription(userId, storedType, quantity, expiry, false);
      }
      return { type: "addon" as const, addonType, quantity, expiresAt: expiry };
    },
  });
}

export async function purchaseSetupWithWallet(user: any, input: { idempotencyKey: string }) {
  const userId = String(user?.$id || user?.id || "");
  await ensureWalletPurchaseEnabled(userId);
  const activeSetup = (await walletBillingPurchaseDeps.getSubscriptions(userId).catch(() => []) as any[])
    .find((sub) => sub.type === "setup_service" && Number(sub.expires_at || 0) > walletBillingPurchaseDeps.now());
  if (activeSetup) {
    throw new Error("Full Account Setup is already active for this account. It becomes available again after the current 30-day setup period.");
  }

  const expiry = walletBillingPurchaseDeps.now() + ONE_MONTH_SECONDS;
  return runWalletPurchase({
    userId,
    purchaseType: "setup",
    target: "setup_service",
    amount: FULL_SETUP_PRICE,
    idempotencyKey: input.idempotencyKey,
    debitType: "setup_purchase_wallet",
    debitDescription: "Wallet full account setup purchase",
    refundDescription: "Refund after failed wallet full account setup purchase",
    applyEntitlement: async () => {
      try {
        await walletBillingPurchaseDeps.createSubscription({
          user_id: userId,
          type: "setup_service",
          quantity: 1,
          expires_at: expiry,
          auto_renew: 0,
          creem_product_id: "",
          creem_subscription_id: "",
        });
      } catch {
        await walletBillingPurchaseDeps.addSubscription(userId, "setup_service", 1, expiry, false);
      }
      return { type: "setup" as const, expiresAt: expiry };
    },
  });
}
