import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as dbService from "./db-service.ts";
import { BILLING_ADDONS, BILLING_PLAN_DETAILS, FULL_SETUP_PRICE, calculatePlanUpgradeCost, type BillingCycle, type BillingPlanId } from "../config/pricing.ts";
import { getBillingAccess } from "../config/billing-access.ts";
import { emitLiveConsoleEvent } from "./live-console-event-service.ts";

type PurchaseType = "plan" | "wallet_topup" | "addon" | "setup";

export type CreemCheckoutRequest = {
  userId: string;
  type: PurchaseType;
  planId?: BillingPlanId;
  billingCycle?: BillingCycle;
  addonType?: string;
  quantity?: number;
  amount?: number;
};

type BillingNotificationDescriptor = {
  title: string;
  status: string;
  amount?: string;
  action?: string;
};

const ADDON_ENV: Record<string, string> = {
  extra_instance: "CREEM_ADDON_EXTRA_INSTANCE_PRODUCT_ID",
  extra_30_products: "CREEM_ADDON_EXTRA_30_PRODUCTS_PRODUCT_ID",
  extra_500_media: "CREEM_ADDON_EXTRA_500_MEDIA_PRODUCT_ID",
  extra_5_sequence_groups: "CREEM_ADDON_EXTRA_5_SEQUENCE_GROUPS_PRODUCT_ID",
  extra_10000_customers: "CREEM_ADDON_EXTRA_10000_CUSTOMERS_PRODUCT_ID",
  extra_2000_orders: "CREEM_ADDON_EXTRA_2000_ORDERS_PRODUCT_ID"
};

const TOPUP_ENV: Record<number, string> = {
  5: "CREEM_WALLET_TOPUP_5_PRODUCT_ID",
  10: "CREEM_WALLET_TOPUP_10_PRODUCT_ID",
  25: "CREEM_WALLET_TOPUP_25_PRODUCT_ID",
  50: "CREEM_WALLET_TOPUP_50_PRODUCT_ID",
  100: "CREEM_WALLET_TOPUP_100_PRODUCT_ID"
};

const PLAN_ENV: Record<BillingPlanId, Record<BillingCycle, string>> = {
  starter_plan: {
    monthly: "CREEM_STARTER_MONTHLY_PRODUCT_ID",
    annual: "CREEM_STARTER_ANNUAL_FOUNDING_PRODUCT_ID"
  },
  growth_plan: {
    monthly: "CREEM_GROWTH_MONTHLY_PRODUCT_ID",
    annual: "CREEM_GROWTH_ANNUAL_FOUNDING_PRODUCT_ID"
  },
  pro_plan: {
    monthly: "CREEM_PRO_MONTHLY_PRODUCT_ID",
    annual: "CREEM_PRO_ANNUAL_FOUNDING_PRODUCT_ID"
  }
};

const now = () => Math.floor(Date.now() / 1000);
const oneMonth = 30 * 24 * 60 * 60;
const oneYear = 365 * 24 * 60 * 60;
let parsedDotenvCache: Record<string, string> | null = null;
const PLAN_ORDER: BillingPlanId[] = ["starter_plan", "growth_plan", "pro_plan"];

function getPlanPaymentAmount(planId: BillingPlanId, billingCycle: BillingCycle) {
  const details = BILLING_PLAN_DETAILS[planId];
  if (!details) return 0;
  if (billingCycle === "annual") return Number(details.annualFounding?.display || details.annualFounding?.exact || details.monthlyPrice * 12 || 0);
  return Number(details.monthlyPrice || 0);
}

function getAddonPaymentAmount(addonType: string, quantity: number) {
  const addon = BILLING_ADDONS.find((item) => item.id === addonType);
  const unit = Number(String(addon?.price || "").match(/\$([0-9.]+)/)?.[1] || 0);
  return Number((unit * Math.max(1, Number(quantity || 1))).toFixed(2));
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function creemApiBase() {
  const env = String(getEnvValue("CREEM_ENV") || "test").toLowerCase();
  return env === "production" || env === "live"
    ? "https://api.creem.io"
    : "https://test-api.creem.io";
}

function loadDotenvFallback() {
  if (parsedDotenvCache) return parsedDotenvCache;
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    parsedDotenvCache = {};
    return parsedDotenvCache;
  }

  try {
    parsedDotenvCache = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  } catch {
    parsedDotenvCache = {};
  }
  return parsedDotenvCache;
}

function getEnvValue(name: string) {
  const direct = process.env[name];
  if (direct && String(direct).trim()) return String(direct).trim();
  const fallback = loadDotenvFallback()[name];
  if (fallback && String(fallback).trim()) return String(fallback).trim();
  return "";
}

function requireEnv(name: string) {
  const value = getEnvValue(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function resolveProduct(request: CreemCheckoutRequest) {
  if (request.type === "plan") {
    const planId = request.planId || "starter_plan";
    const billingCycle = request.billingCycle || "monthly";
    const envName = PLAN_ENV[planId]?.[billingCycle];
    if (!envName) throw new Error("Invalid plan checkout request");
    return { productId: requireEnv(envName), envName };
  }

  if (request.type === "wallet_topup") {
    const amount = Number(request.amount || 0);
    const envName = TOPUP_ENV[amount];
    if (!envName) throw new Error("Invalid wallet top-up amount");
    return { productId: requireEnv(envName), envName };
  }

  if (request.type === "addon") {
    const envName = ADDON_ENV[String(request.addonType || "")];
    if (!envName) throw new Error("Invalid add-on checkout request");
    return { productId: requireEnv(envName), envName };
  }

  return { productId: requireEnv("CREEM_FULL_SETUP_PRODUCT_ID"), envName: "CREEM_FULL_SETUP_PRODUCT_ID" };
}

export async function creemFetch(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${creemApiBase()}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requireEnv("CREEM_API_KEY"),
      ...(init.headers || {})
    }
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Creem request failed (${response.status})`);
  }
  return payload;
}

export async function findActiveCreemPlanSubscription(userId: string): Promise<string | null> {
  const user = await dbService.getUser(userId) as any;
  if (user?.creem_subscription_id) return String(user.creem_subscription_id);

  const subscriptions = await dbService.getSubscriptions(userId).catch(() => []) as any[];
  const activeSub = subscriptions.find((sub) =>
    (sub.type?.includes("plan") || sub.type === "starter_plan" || sub.type === "growth_plan" || sub.type === "pro_plan") &&
    sub.creem_subscription_id &&
    Number(sub.expires_at || 0) > now()
  );
  if (activeSub?.creem_subscription_id) return String(activeSub.creem_subscription_id);

  const stored = await dbService.getGlobalSetting(`creem_sub_${userId}`).catch(() => null);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.subscriptionId) return String(parsed.subscriptionId);
    } catch {
      return String(stored);
    }
  }
  return null;
}

export async function upgradeCreemSubscription(userId: string, targetPlanId: BillingPlanId, billingCycle: BillingCycle = "monthly") {
  const user = await dbService.getUser(userId) as any;
  if (!user) throw new Error("User not found");

  const creemSubId = await findActiveCreemPlanSubscription(userId);
  if (!creemSubId) {
    throw new Error("No active Creem subscription found to upgrade.");
  }

  const { productId } = resolveProduct({ userId, type: "plan", planId: targetPlanId, billingCycle });

  const upgradeCalc = calculatePlanUpgradeCost({
    currentPlanId: user.plan_id,
    currentPlanExpiry: user.plan_expiry,
    targetPlanId,
    billingCycle,
  });

  const response = await creemFetch(`/v1/subscriptions/${encodeURIComponent(creemSubId)}/upgrade`, {
    method: "POST",
    body: JSON.stringify({
      product_id: productId,
      update_behavior: "proration-charge-immediately",
    }),
  });

  const expiry = parsePeriodEnd({ object: { subscription: response } }, billingCycle === "annual" ? oneYear : oneMonth);
  await dbService.updateUserPlan(userId, targetPlanId, expiry);
  await dbService.updateUser(userId, { trial_expires_at: now() - 1 });

  const providerChargedAmount = typeof response?.invoice?.amount_due === "number"
    ? response.invoice.amount_due / 100
    : typeof response?.proration?.amount === "number"
    ? response.proration.amount / 100
    : typeof response?.amount_charged === "number"
    ? response.amount_charged / 100
    : upgradeCalc.amountDueNow;
  const amount = providerChargedAmount;
  const transactionRef = `creem_upg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  await dbService.addWalletTransaction(
    userId,
    amount,
    "subscription",
    `Creem subscription upgrade: ${BILLING_PLAN_DETAILS[targetPlanId].name} (${billingCycle}) via provider proration (sub: ${creemSubId})`
  );

  emitLiveConsoleEvent({
    type: "creem_payment_succeeded",
    level: "success",
    scope: "account",
    accountId: userId,
    title: "Plan upgrade confirmed",
    message: `${BILLING_PLAN_DETAILS[targetPlanId].name} confirmed via Creem proration.`,
    status: "subscription",
    metadata: { amount, planId: targetPlanId, billingCycle, creemSubscriptionId: creemSubId },
  });

  return {
    success: true,
    upgraded: true,
    subscriptionId: creemSubId,
    planId: targetPlanId,
    billingCycle,
    amount,
    providerProration: "proration-charge-immediately",
    expiry,
    transactionRef,
  };
}

export async function createCreemCheckout(request: CreemCheckoutRequest, origin: string) {
  const user = await dbService.getUser(request.userId) as any;
  if (!user) throw new Error("User not found");
  const access = getBillingAccess(user);
  if (request.type === "addon" && !access.canBuyAddons) {
    throw new Error("Add-ons are available after choosing a paid plan.");
  }
  if (request.type === "setup") {
    const activeSetup = (await dbService.getSubscriptions(user.$id).catch(() => []) as any[])
      .find((sub) => sub.type === "setup_service" && Number(sub.expires_at || 0) > now());
    if (activeSetup) {
      throw new Error("Full Account Setup is already active for this account. It becomes available again after the current 30-day setup period.");
    }
  }

  let upgradeCalc: any = null;
  if (request.type === "plan") {
    const targetPlanId = (request.planId || "starter_plan") as BillingPlanId;
    upgradeCalc = calculatePlanUpgradeCost({
      currentPlanId: user.plan_id,
      currentPlanExpiry: user.plan_expiry,
      targetPlanId,
      billingCycle: request.billingCycle || "monthly",
    });

    // CASE A: User has an active Creem plan subscription on file.
    // Use Creem's official subscription upgrade endpoint with proration-charge-immediately.
    if (upgradeCalc.isUpgrade) {
      const activeCreemSubId = await findActiveCreemPlanSubscription(user.$id);
      if (activeCreemSubId) {
        return await upgradeCreemSubscription(user.$id, targetPlanId, request.billingCycle || "monthly");
      }
    }
  }

  // CASE B: User does not have an active Creem subscription (e.g. Starter was funded via Wallet).
  // Under approved policy:
  // 1. DO NOT discount Creem checkout.
  // 2. Creem charges FULL target-plan catalog price ($29 + tax).
  // 3. Persist unused current-plan credit in metadata and durable intent.
  // 4. Upon verified payment, applyCheckoutPurchase credits unused credit to customer Wallet.
  const { productId, envName } = resolveProduct(request);
  const transactionRef = `blackarrow_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  const quantity = Math.max(1, Math.min(99, Number(request.quantity || 1)));

  const unusedCredit = upgradeCalc?.isUpgrade ? Number(upgradeCalc.currentPlanCredit || 0) : 0;
  const targetPrice = upgradeCalc?.targetPrice || (request.planId ? getPlanPaymentAmount(request.planId as any, request.billingCycle || "monthly") : 0);

  const metadata: Record<string, string> = {
    userId: user.$id,
    accountId: user.$id,
    purchaseType: request.type,
    planId: request.planId || "",
    billingCycle: request.billingCycle || "",
    addonType: request.addonType || "",
    quantity: String(quantity),
    walletTopupAmount: request.amount ? String(request.amount) : "",
    transactionRef,
    productEnv: envName,
    isUpgrade: upgradeCalc?.isUpgrade ? "true" : "false",
    currentPlanId: String(upgradeCalc?.currentPlanId || ""),
    currentPlanCredit: String(unusedCredit),
    amountDueNow: String(targetPrice),
    planSubtotal: String(targetPrice),
    upgradeIntentId: transactionRef,
    upgradeCredit: String(unusedCredit),
  };

  if (upgradeCalc?.isUpgrade && unusedCredit > 0) {
    const upgradeIntent = {
      upgradeIntentId: transactionRef,
      accountId: user.$id,
      sourcePlanId: String(upgradeCalc.currentPlanId || ""),
      sourcePaymentSource: "wallet",
      targetPlanId: request.planId,
      targetPrice,
      unusedPlanCredit: unusedCredit,
      expectedExternalAmount: targetPrice,
      status: "pending",
      externalTransactionId: "",
      walletCreditStatus: "pending",
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    await dbService.setGlobalSetting(`upgrade_intent_${transactionRef}`, JSON.stringify(upgradeIntent)).catch(() => {});
  }

  // Creem Create Checkout payload strictly conforms to official documented fields:
  // product_id, request_id, units, customer, success_url, metadata
  // custom_price and discount_code are not sent for Wallet -> Creem upgrades.
  const checkoutPayload: any = {
    product_id: productId,
    request_id: transactionRef,
    units: quantity,
    customer: { email: user.email },
    success_url: `${origin.replace(/\/$/, "")}/billing?checkout=pending&ref=${encodeURIComponent(transactionRef)}`,
    metadata
  };

  const response = await fetch(`${creemApiBase()}/v1/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requireEnv("CREEM_API_KEY")
    },
    body: JSON.stringify(checkoutPayload)
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Creem checkout failed (${response.status})`);
  }

  await dbService.addWalletTransaction(
    user.$id,
    0,
    "creem_pending",
    `Creem checkout pending: ${request.type} (${transactionRef})`
  );

  return {
    checkoutUrl: payload.checkout_url || payload.url,
    checkoutId: payload.id,
    transactionRef,
    discountCode: undefined,
    amountDueNow: upgradeCalc ? upgradeCalc.amountDueNow : undefined,
  };
}

export async function createCreemCustomerPortal(userId: string) {
  const user = await dbService.getUser(userId) as any;
  if (!user?.email) throw new Error("User not found");

  const stored = await dbService.getGlobalSetting(creemCustomerKey(user.$id)).catch(() => null);
  let customerId = "";
  if (stored) {
    try {
      customerId = JSON.parse(stored)?.customerId || "";
    } catch {
      customerId = String(stored || "");
    }
  }

  if (!customerId) {
    const customer = await creemFetch(`/v1/customers?email=${encodeURIComponent(user.email)}`, { method: "GET" }).catch(() => null);
    customerId = String(customer?.id || "");
    if (customerId) {
      await dbService.setGlobalSetting(creemCustomerKey(user.$id), JSON.stringify({ customerId, email: user.email, updatedAt: new Date().toISOString() })).catch(() => {});
    }
  }
  if (!customerId) throw new Error("Manage through Creem after your first payment.");

  const portal = await creemFetch("/v1/customers/billing", {
    method: "POST",
    body: JSON.stringify({ customer_id: customerId })
  });
  const url = portal.customer_portal_link || portal.url;
  if (!url) throw new Error("Creem did not return a customer portal link");
  return { url, customerId };
}

export function verifyCreemSignature(rawBody: Buffer, signatureHeader: string | string[] | undefined) {
  const secret = requireEnv("CREEM_WEBHOOK_SECRET");
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = String(signature).includes("=")
    ? String(signature).split(",").map((part) => part.trim()).find((part) => part.startsWith("v1="))?.split("=").pop() || String(signature).split(",").map((part) => part.trim().split("=").pop()).find(Boolean) || ""
    : String(signature).trim();

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function eventKey(event: any, rawBody: Buffer) {
  const id = String(event?.id || "");
  if (id) return `creem_evt_${hashKey(id)}`;
  return `creem_evt_${hashKey(rawBody.toString("utf8"))}`;
}

function purchaseKey(ref: string) {
  return `creem_buy_${hashKey(ref)}`;
}

function creemCustomerKey(userId: string) {
  return `creem_customer_${hashKey(userId)}`;
}

function comparePlanLevel(previousPlanId: string, nextPlanId: BillingPlanId) {
  return PLAN_ORDER.indexOf(nextPlanId) - PLAN_ORDER.indexOf((previousPlanId || "starter_plan") as BillingPlanId);
}

function buildPlanCheckoutNotification(user: any, planId: BillingPlanId, billingCycle: BillingCycle): BillingNotificationDescriptor {
  const hadPaidPlan = Number(user?.plan_expiry || 0) > now();
  const change = comparePlanLevel(String(user?.plan_id || "starter_plan"), planId);
  if (!hadPaidPlan) {
    return {
      title: "Plan subscribed",
      status: `${BILLING_PLAN_DETAILS[planId].name} (${billingCycle})`,
      action: "Plan access activates only after verified Creem webhook confirmation."
    };
  }
  if (change > 0) {
    return { title: "Plan upgraded", status: `${BILLING_PLAN_DETAILS[planId].name} (${billingCycle})` };
  }
  if (change < 0) {
    return { title: "Plan downgraded", status: `${BILLING_PLAN_DETAILS[planId].name} (${billingCycle})` };
  }
  return { title: "Plan updated", status: `${BILLING_PLAN_DETAILS[planId].name} (${billingCycle})` };
}

function buildAddonNotification(addonType: string, quantity: number): BillingNotificationDescriptor {
  return {
    title: "Add-on purchased",
    status: `${addonType} x${quantity}`,
    action: "Add-on capacity updates only after verified Creem webhook confirmation."
  };
}

function buildSubscriptionStatusNotification(eventType: string, metadata: any): BillingNotificationDescriptor {
  const purchaseType = String(metadata?.purchaseType || "").toLowerCase();
  const planName = BILLING_PLAN_DETAILS[(metadata?.planId || "starter_plan") as BillingPlanId]?.name || "Plan";
  const addonType = String(metadata?.addonType || "add-on");

  if (eventType === "subscription.paid") {
    if (purchaseType === "addon") return { title: "Add-on renewed", status: addonType };
    return { title: "Plan renewal successful", status: planName };
  }
  if (eventType === "subscription.past_due") {
    if (purchaseType === "addon") return { title: "Add-on renewal failed", status: addonType, action: "Update payment method in Creem." };
    return { title: "Plan renewal failed", status: planName, action: "Update payment method in Creem." };
  }
  if (eventType === "subscription.expired") {
    if (purchaseType === "addon") return { title: "Add-on expired", status: addonType };
    return { title: "Plan expired", status: planName };
  }
  if (eventType === "subscription.canceled" || eventType === "subscription.scheduled_cancel") {
    if (purchaseType === "addon") return { title: "Add-on cancelled", status: addonType };
    return { title: "Subscription cancelled", status: planName };
  }
  if (eventType === "subscription.paused") {
    if (purchaseType === "addon") return { title: "Add-on paused", status: addonType };
    return { title: "Subscription paused", status: planName };
  }
  return { title: "Subscription updated", status: purchaseType === "addon" ? addonType : planName };
}

function buildPaymentFailureNotification(eventType: string, metadata: any): BillingNotificationDescriptor {
  const purchaseType = String(metadata?.purchaseType || "").toLowerCase();
  if (purchaseType === "addon") {
    return { title: "Add-on renewal failed", status: String(metadata?.addonType || "add-on"), action: "Update payment method in Creem." };
  }
  if (purchaseType === "wallet_topup") {
    return { title: "Payment failed", status: "Wallet top-up failed", action: "Retry the payment in Billing." };
  }
  return { title: "Payment failed", status: eventType, action: "Update payment method in Creem." };
}

function getMetadata(event: any) {
  return event?.object?.metadata || event?.object?.checkout?.metadata || event?.checkout?.metadata || event?.metadata || {};
}

function getProductId(event: any) {
  return event?.object?.product?.id || event?.object?.order?.product || event?.order?.product || event?.product?.id || "";
}

function getSubscription(event: any) {
  return event?.object?.subscription || event?.object || event?.subscription || null;
}

function parsePeriodEnd(event: any, fallbackSeconds: number) {
  const candidates = [
    event?.object?.subscription?.current_period_end_date,
    event?.object?.current_period_end_date,
    event?.subscription?.current_period_end_date
  ];
  const date = candidates.find(Boolean);
  if (!date) return now() + fallbackSeconds;
  const parsed = Math.floor(new Date(date).getTime() / 1000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : now() + fallbackSeconds;
}

async function markOnce(key: string, value: any) {
  const existing = await dbService.getGlobalSetting(key);
  if (existing) return false;
  await dbService.setGlobalSetting(key, JSON.stringify({ ...value, processedAt: new Date().toISOString() }));
  return true;
}

async function hasMarker(key: string) {
  return Boolean(await dbService.getGlobalSetting(key));
}

async function applyCheckoutPurchase(event: any, metadata: any) {
  const userId = String(metadata.userId || metadata.accountId || "");
  const user = userId ? await dbService.getUser(userId).catch(() => null) as any : null;
  if (!user) throw new Error("Creem webhook user not found");

  const transactionRef = String(metadata.transactionRef || event?.object?.request_id || event?.checkout?.request_id || event?.request_id || "");
  if (!transactionRef) throw new Error("Creem webhook missing transaction reference");
  const markerKey = purchaseKey(transactionRef);
  if (await hasMarker(markerKey)) return { duplicate: true, userId };

  const purchaseType = String(metadata.purchaseType || "");
  const productId = getProductId(event);
  const creemCustomerId = event?.object?.customer?.id || event?.object?.order?.customer || event?.customer?.id || "";
  const creemSubscriptionId = event?.object?.subscription?.id || event?.object?.subscription || event?.subscription?.id || event?.subscription || "";
  const creemTransactionId = event?.object?.order?.transaction || event?.object?.last_transaction_id || event?.order?.transaction || "";

  if (creemCustomerId) {
    await dbService.setGlobalSetting(creemCustomerKey(user.$id), JSON.stringify({ customerId: creemCustomerId, email: user.email, updatedAt: new Date().toISOString() })).catch(() => {});
  }

  if (purchaseType === "wallet_topup") {
    const amount = Number(metadata.walletTopupAmount || 0);
    if (!TOPUP_ENV[amount]) throw new Error("Invalid webhook wallet top-up amount");
    await dbService.creditWalletBalance(user.$id, amount, "topup", `Creem wallet top-up $${amount} confirmed (${transactionRef})`);
    emitLiveConsoleEvent({
      type: "creem_payment_succeeded",
      level: "success",
      scope: "account",
      accountId: user.$id,
      title: "Wallet top-up confirmed",
      message: `Wallet top-up confirmed for $${amount}.`,
      status: "wallet_topup",
      metadata: { amount },
    });
    await markOnce(markerKey, { eventId: event?.id, userId, purchaseType });
    return {
      applied: "wallet_topup",
      amount,
      userId,
      purchaseType,
      notification: {
        title: "Wallet top-up successful",
        status: "Confirmed",
        amount: `$${amount}`,
        action: "Wallet funds are used only for AI usage."
      }
    };
  }

  if (purchaseType === "plan") {
    const planId = (metadata.planId || "starter_plan") as BillingPlanId;
    const billingCycle = (metadata.billingCycle || "monthly") as BillingCycle;
    if (!BILLING_PLAN_DETAILS[planId]) throw new Error("Invalid webhook plan");
    const expiry = parsePeriodEnd(event, billingCycle === "annual" ? oneYear : oneMonth);
    const amount = metadata.amountDueNow && !Number.isNaN(Number(metadata.amountDueNow))
      ? Number(metadata.amountDueNow)
      : getPlanPaymentAmount(planId, billingCycle);
    await dbService.updateUserPlan(user.$id, planId, expiry);
    await dbService.updateUser(user.$id, { trial_expires_at: now() - 1 });
    if (creemSubscriptionId) {
      await dbService.updateUser(user.$id, { creem_subscription_id: creemSubscriptionId }).catch(() => {});
      await dbService.setGlobalSetting(`creem_sub_${user.$id}`, JSON.stringify({ subscriptionId: creemSubscriptionId, planId, updatedAt: new Date().toISOString() })).catch(() => {});
      await dbService.createSubscription({
        user_id: user.$id,
        type: planId,
        quantity: 1,
        expires_at: expiry,
        auto_renew: 1,
        creem_product_id: productId,
        creem_subscription_id: creemSubscriptionId,
      }).catch(async () => {
        await dbService.addSubscription(user.$id, planId, 1, expiry, true);
      });
    }
    await dbService.addWalletTransaction(user.$id, amount, "subscription", `Creem ${billingCycle} plan confirmed: ${BILLING_PLAN_DETAILS[planId].name} (${transactionRef})`);

    // Post-Payment Wallet Credit for Wallet-funded plan upgrades
    const isUpgrade = String(metadata.isUpgrade || "").toLowerCase() === "true";
    const upgradeCredit = Number(metadata.upgradeCredit || metadata.currentPlanCredit || 0);
    if (isUpgrade && upgradeCredit > 0) {
      const creditMarkerKey = `creem_upg_credit_${hashKey(transactionRef)}`;
      const settlementKey = `creem_upgrade_settlement_${hashKey(transactionRef)}`;
      const creditAlreadyApplied = await hasMarker(creditMarkerKey);
      if (!creditAlreadyApplied) {
        const settlementRecord = {
          transactionRef,
          userId: user.$id,
          planId,
          upgradeCredit,
          paymentConfirmed: true,
          entitlementApplied: true,
          status: "WALLET_CREDIT_PENDING",
          idempotencyKey: creditMarkerKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dbService.setGlobalSetting(settlementKey, JSON.stringify(settlementRecord)).catch(() => {});

        try {
          await dbService.creditWalletBalance(
            user.$id,
            upgradeCredit,
            "plan_upgrade_credit",
            `Starter plan credit for Creem Growth upgrade [ref ${transactionRef}]`
          );
          await markOnce(creditMarkerKey, {
            status: "COMPLETED",
            userId: user.$id,
            credit: upgradeCredit,
            transactionRef,
            creditedAt: new Date().toISOString(),
          });
          settlementRecord.status = "WALLET_CREDIT_APPLIED";
          settlementRecord.updatedAt = new Date().toISOString();
          await dbService.setGlobalSetting(settlementKey, JSON.stringify(settlementRecord)).catch(() => {});
          emitLiveConsoleEvent({
            type: "creem_payment_succeeded",
            level: "success",
            scope: "account",
            accountId: user.$id,
            title: "Upgrade Wallet Credit applied",
            message: `Credited $${upgradeCredit.toFixed(2)} to wallet for unused plan credit.`,
            status: "plan_upgrade_credit",
            metadata: { upgradeCredit, transactionRef },
          });
        } catch (creditErr: any) {
          console.error("[Creem Upgrade] Failed to credit wallet after plan payment:", creditErr);
          settlementRecord.status = "WALLET_CREDIT_PENDING";
          (settlementRecord as any).lastError = creditErr?.message || String(creditErr);
          settlementRecord.updatedAt = new Date().toISOString();
          await dbService.setGlobalSetting(settlementKey, JSON.stringify(settlementRecord)).catch(() => {});
        }
      }
    }

    emitLiveConsoleEvent({
      type: "creem_payment_succeeded",
      level: "success",
      scope: "account",
      accountId: user.$id,
      title: "Plan payment confirmed",
      message: `${BILLING_PLAN_DETAILS[planId].name} ${billingCycle} plan confirmed.`,
      status: "subscription",
      metadata: { amount, planId, billingCycle },
    });
    await markOnce(markerKey, { eventId: event?.id, userId, purchaseType, planId, billingCycle, amount, upgradeCredit });
    return {
      applied: "plan",
      amount,
      planId,
      billingCycle,
      userId,
      purchaseType,
      notification: buildPlanCheckoutNotification(user, planId, billingCycle)
    };
  }

  if (purchaseType === "addon") {
    const addonType = String(metadata.addonType || "");
    const quantity = Math.max(1, Number(metadata.quantity || 1));
    const amount = getAddonPaymentAmount(addonType, quantity);
    const expiry = parsePeriodEnd(event, oneMonth);
    const storedType = addonType === "extra_30_products" ? "product_bundle" : addonType === "extra_instance" ? "instance" : addonType;
    await dbService.createSubscription({
      user_id: user.$id,
      type: storedType,
      quantity,
      expires_at: expiry,
      auto_renew: 1,
      creem_product_id: productId,
      creem_subscription_id: creemSubscriptionId
    }).catch(async () => {
      await dbService.addSubscription(user.$id, storedType, quantity, expiry, true);
    });
    await dbService.addWalletTransaction(user.$id, amount, "addon", `Creem add-on confirmed: ${addonType} x${quantity} (${transactionRef})`);
    emitLiveConsoleEvent({
      type: "creem_payment_succeeded",
      level: "success",
      scope: "account",
      accountId: user.$id,
      title: "Add-on payment confirmed",
      message: `${addonType} x${quantity} confirmed.`,
      status: "addon",
      metadata: { amount, addonType, quantity },
    });
    await markOnce(markerKey, { eventId: event?.id, userId, purchaseType, addonType, quantity, amount });
    return {
      applied: "addon",
      amount,
      addonType,
      quantity,
      userId,
      purchaseType,
      notification: buildAddonNotification(addonType, quantity)
    };
  }

  if (purchaseType === "setup") {
    const expiry = now() + 30 * 24 * 60 * 60;
    await dbService.createSubscription({
      user_id: user.$id,
      type: "setup_service",
      quantity: 1,
      expires_at: expiry,
      auto_renew: 0,
      creem_product_id: productId,
      creem_subscription_id: creemSubscriptionId
    }).catch(async () => {
      await dbService.addSubscription(user.$id, "setup_service", 1, expiry, false);
    });
    const amount = FULL_SETUP_PRICE;
    await dbService.addWalletTransaction(user.$id, amount, "setup_purchase", `Creem full account setup confirmed (${transactionRef})`);
    emitLiveConsoleEvent({
      type: "creem_payment_succeeded",
      level: "success",
      scope: "account",
      accountId: user.$id,
      title: "Setup payment confirmed",
      message: "Full Account Setup confirmed.",
      status: "setup",
      metadata: { amount },
    });
    await markOnce(markerKey, { eventId: event?.id, userId, purchaseType, amount });
    return {
      applied: "setup",
      amount,
      userId,
      purchaseType,
      notification: {
        title: "Full Account Setup purchased",
        status: "Active for 30 days",
        action: "Full Account Setup can be repurchased after it expires."
      }
    };
  }

  await dbService.addWalletTransaction(user.$id, 0, "creem_payment", `Creem payment confirmed (${transactionRef}, customer ${creemCustomerId}, subscription ${creemSubscriptionId}, transaction ${creemTransactionId})`);
  await markOnce(markerKey, { eventId: event?.id, userId, purchaseType });
  return { applied: "record_only", userId, purchaseType };
}

export async function processCreemWebhook(rawBody: Buffer, signatureHeader: string | string[] | undefined) {
  if (!verifyCreemSignature(rawBody, signatureHeader)) {
    const error = new Error("Invalid Creem webhook signature");
    (error as any).statusCode = 401;
    throw error;
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const key = eventKey(event, rawBody);
  if (await hasMarker(key)) return { duplicate: true, eventType: event?.eventType || event?.type };

  const eventType = String(event?.eventType || event?.type || "");
  const metadata = getMetadata(event);
  let result: any;

  const hasPurchaseMetadata = Boolean(metadata.transactionRef || metadata.purchaseType);
  if ((eventType === "checkout.completed" || eventType === "subscription.active" || eventType === "subscription.update") && hasPurchaseMetadata) {
    result = await applyCheckoutPurchase(event, metadata);
    await markOnce(key, { eventType });
    return result;
  }

  if (["subscription.paid", "subscription.canceled", "subscription.expired", "subscription.past_due", "subscription.paused", "subscription.scheduled_cancel", "subscription.update"].includes(eventType)) {
    const userId = String(metadata.userId || metadata.accountId || "");
    if (userId) {
      await dbService.addWalletTransaction(userId, 0, "subscription_status", `Creem ${eventType} received for ${getSubscription(event)?.id || "subscription"}`);
      emitLiveConsoleEvent({
        type: eventType === "subscription.past_due" || eventType === "subscription.expired" ? "subscription_error" : "creem_webhook_received",
        level: eventType === "subscription.past_due" || eventType === "subscription.expired" ? "warn" : "info",
        scope: "account",
        accountId: userId,
        title: "Subscription status received",
        message: `Creem sent ${eventType}.`,
        status: eventType,
        metadata: { purchaseType: metadata.purchaseType || "" },
      });
    }
    result = {
      applied: "subscription_status",
      eventType,
      userId,
      purchaseType: String(metadata.purchaseType || ""),
      notification: buildSubscriptionStatusNotification(eventType, metadata)
    };
    await markOnce(key, { eventType });
    return result;
  }

  if (eventType.includes("refund") || eventType.includes("chargeback") || eventType.includes("dispute") || eventType.includes("failed")) {
    const userId = String(metadata.userId || metadata.accountId || "");
    if (userId) {
      await dbService.addWalletTransaction(userId, 0, "payment_status", `Creem ${eventType} received. No wallet or plan change applied automatically.`);
      emitLiveConsoleEvent({
        type: "creem_payment_failed",
        level: "warn",
        scope: "account",
        accountId: userId,
        title: "Payment status received",
        message: `Creem sent ${eventType}. No revenue counted.`,
        status: eventType,
        metadata: { purchaseType: metadata.purchaseType || "" },
      });
    }
    result = {
      applied: "payment_status",
      eventType,
      userId,
      purchaseType: String(metadata.purchaseType || ""),
      notification: buildPaymentFailureNotification(eventType, metadata)
    };
    await markOnce(key, { eventType });
    return result;
  }

  result = { ignored: true, eventType };
  await markOnce(key, { eventType });
  return result;
}

export async function reconcileCreemUpgradeWalletCredit(transactionRef: string): Promise<{
  reconciled: boolean;
  status: string;
  creditApplied: number;
}> {
  const creditMarkerKey = `creem_upg_credit_${hashKey(transactionRef)}`;
  const settlementKey = `creem_upgrade_settlement_${hashKey(transactionRef)}`;

  // If already marked as completed, idempotent no-op
  const alreadyMarked = await hasMarker(creditMarkerKey);
  if (alreadyMarked) {
    return { reconciled: true, status: "ALREADY_APPLIED", creditApplied: 0 };
  }

  const raw = await dbService.getGlobalSetting(settlementKey).catch(() => null);
  if (!raw) {
    return { reconciled: false, status: "NOT_FOUND", creditApplied: 0 };
  }

  let settlement: any;
  try {
    settlement = JSON.parse(raw);
  } catch {
    return { reconciled: false, status: "INVALID_RECORD", creditApplied: 0 };
  }

  if (settlement.status === "WALLET_CREDIT_APPLIED") {
    return { reconciled: true, status: "ALREADY_APPLIED", creditApplied: 0 };
  }

  const credit = Number(settlement.upgradeCredit || 0);
  if (credit <= 0 || !settlement.userId) {
    return { reconciled: false, status: "INVALID_CREDIT_AMOUNT", creditApplied: 0 };
  }

  // Attempt credit now
  await dbService.creditWalletBalance(
    settlement.userId,
    credit,
    "plan_upgrade_credit",
    `Starter plan credit for Creem Growth upgrade [reconciled ref ${transactionRef}]`
  );

  await markOnce(creditMarkerKey, {
    status: "COMPLETED",
    userId: settlement.userId,
    credit,
    transactionRef,
    creditedAt: new Date().toISOString(),
  });

  settlement.status = "WALLET_CREDIT_APPLIED";
  settlement.updatedAt = new Date().toISOString();
  delete settlement.lastError;
  await dbService.setGlobalSetting(settlementKey, JSON.stringify(settlement)).catch(() => {});

  return { reconciled: true, status: "WALLET_CREDIT_APPLIED", creditApplied: credit };
}
