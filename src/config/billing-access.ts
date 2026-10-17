import { PLANS, type ProductPlan } from "../types.ts";

export const APP_TRIAL_DAYS = 7;
export const APP_TRIAL_SECONDS = APP_TRIAL_DAYS * 24 * 60 * 60;
export const APP_TRIAL_AI_CREDIT_USD = 1;
export const APP_TRIAL_FREE_AI_REPLIES = 100;

export const TRIAL_LIMITS: ProductPlan & {
  media_groups: number;
  sequence_groups: number;
  courier_integration: boolean;
  add_ons_allowed: boolean;
} = {
  id: "app_trial",
  price: 0,
  name: "7-day free trial",
  included_instances: 1,
  max_instances: 1,
  included_products: 5,
  max_products: 5,
  customers: 100,
  orders_per_month: 50,
  media_templates: 25,
  media_groups: 1,
  sequence_groups: 1,
  courier_integration: false,
  add_ons_allowed: false
};

export type BillingAccessStatus = "paid" | "trial" | "trial_replies_used" | "trial_expired" | "inactive";

export function normalizeEpochSeconds(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const str = String(value).trim();
  if (!str) return 0;
  const num = Number(str);
  if (Number.isFinite(num) && num > 0) {
    return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
  }
  const parsedMs = Date.parse(str);
  if (Number.isFinite(parsedMs) && parsedMs > 0) {
    return Math.floor(parsedMs / 1000);
  }
  return 0;
}

export function isAdminRole(role: any) {
  const normalized = String(role || "user").toLowerCase();
  return normalized === "admin" || normalized === "super_admin" || normalized === "superadmin";
}

export function isKnownPlanId(planId: any): boolean {
  const cleanId = String(planId || "").trim();
  return Boolean(cleanId && PLANS[cleanId]);
}

export function hasPaidAccessEvidence(user: any) {
  return Boolean(String(user?.creem_subscription_id || user?.subscription_id || user?.payment_id || user?.creem_customer_id || "").trim() || user?.paid_access_confirmed === true);
}

export function hasActivePaidEntitlement(user: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (isAdminRole(user?.role)) return true;
  const status = String(user?.plan_status || user?.account_status || user?.status || user?.billing_status || "").toLowerCase();
  if (
    user?.is_suspended === true ||
    user?.suspended === true ||
    ["expired", "inactive", "suspended", "canceled", "cancelled", "blocked", "disabled", "past_due", "pastdue"].includes(status)
  ) {
    return false;
  }
  // Unknown or unresolved plan IDs must fail closed
  if (!isKnownPlanId(user?.plan_id)) {
    return false;
  }
  // For normal clients, active paid entitlement strictly requires a valid future plan_expiry timestamp.
  const planExpiry = normalizeEpochSeconds(
    user?.plan_expiry ??
    user?.planExpiry ??
    user?.plan_expires_at ??
    user?.planExpiresAt ??
    user?.subscription_expiry ??
    user?.subscriptionExpiresAt ??
    user?.subscription_expires_at
  );
  return planExpiry > nowSeconds;
}

export function hasPaidAccess(user: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  return hasActivePaidEntitlement(user, nowSeconds);
}

export function getBillingAccess(user: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  const planExpiry = normalizeEpochSeconds(
    user?.plan_expiry ??
    user?.planExpiry ??
    user?.plan_expires_at ??
    user?.planExpiresAt ??
    user?.subscription_expiry ??
    user?.subscriptionExpiresAt ??
    user?.subscription_expires_at
  );
  const trialExpiry = normalizeEpochSeconds(
    user?.trial_expires_at ??
    user?.trial_end ??
    user?.trial_ends_at ??
    user?.trialEndsAt ??
    user?.trialEnd ??
    user?.trialExpiry ??
    user?.trialExpiresAt
  );
  const trialAiRepliesUsed = Math.max(0, Number(user?.trial_ai_replies_used || user?.trialAiRepliesUsed || 0));
  const trialAiRepliesRemaining = Math.max(0, APP_TRIAL_FREE_AI_REPLIES - trialAiRepliesUsed);
  const isAdmin = isAdminRole(user?.role);
  const paidActive = hasActivePaidEntitlement(user, nowSeconds);
  const paidAccessActive = paidActive;

  const trialStatusRaw = String(
    user?.trial_status ??
    user?.trialStatus ??
    user?.trial_state ??
    user?.trialState ??
    ""
  ).trim().toLowerCase();

  const isTrialStatusExplicitlyExpired = [
    "expired",
    "ended",
    "canceled",
    "cancelled",
    "inactive",
    "disabled",
    "exhausted"
  ].includes(trialStatusRaw);

  // CANONICAL TRIAL EXPIRATION RULE:
  // trial active AND current time < trial end -> free trial entitlement applies
  // trial end <= current time -> trial entitlement does NOT suppress billable usage
  // A trial CANNOT be active if trialExpiry <= nowSeconds (regardless of trial_status: "active")
  const trialDateActive = !paidActive && !isAdmin && !isTrialStatusExplicitlyExpired && trialExpiry > nowSeconds;
  const trialRepliesUsed = !paidActive && !isAdmin && trialDateActive && trialAiRepliesUsed >= APP_TRIAL_FREE_AI_REPLIES;
  const trialActive = trialDateActive && !trialRepliesUsed;
  const trialExpired = !paidActive && !isAdmin && (
    isTrialStatusExplicitlyExpired ||
    (trialExpiry > 0 && trialExpiry <= nowSeconds)
  );
  const status: BillingAccessStatus = (paidActive || isAdmin)
    ? "paid"
    : trialActive
      ? "trial"
      : trialRepliesUsed
        ? "trial_replies_used"
        : trialExpired
          ? "trial_expired"
          : "inactive";
  return {
    status,
    paidActive: paidActive || isAdmin,
    paidAccessActive: paidAccessActive || isAdmin,
    trialActive,
    trialDateActive,
    trialRepliesUsed,
    trialExpired,
    canUsePaidFeatures: paidAccessActive || trialActive || isAdmin,
    canBuyAddons: paidAccessActive || isAdmin,
    planExpiry,
    trialExpiry,
    trialAiRepliesUsed,
    trialAiRepliesLimit: APP_TRIAL_FREE_AI_REPLIES,
    trialAiRepliesRemaining,
  };
}

export function isAccountAiReplyAllowed(user: any, options: { minimumWalletBalanceUsd?: number; nowSeconds?: number } = {}) {
  const nowSec = options.nowSeconds || Math.floor(Date.now() / 1000);
  const access = getBillingAccess(user, nowSec);
  if (isAdminRole(user?.role)) {
    return { allowed: true, reason: "admin_role", access };
  }
  if (!access.paidActive && !access.trialActive) {
    const status = String(user?.plan_status || user?.account_status || user?.status || user?.billing_status || "").toLowerCase();
    const hasExpiredPlan = (access.planExpiry > 0 && access.planExpiry <= nowSec) || status === "expired";
    const reason = hasExpiredPlan
      ? "subscription_expired"
      : access.trialRepliesUsed
        ? "trial_free_reply_limit_reached"
        : access.trialExpired
        ? "account_trial_expired"
        : status === "inactive"
        ? "subscription_inactive"
        : !isKnownPlanId(user?.plan_id) && Boolean(user?.plan_id)
        ? "unknown_plan"
        : "subscription_required";
    return { allowed: false, reason, access };
  }

  // Active paid subscriptions require non-zero wallet balance to cover token charges
  if (access.paidActive) {
    const minimumWalletBalanceUsd = Math.max(0, Number(options.minimumWalletBalanceUsd || 0));
    const balance = Number(user?.wallet_balance || 0);
    if (minimumWalletBalanceUsd > 0 && balance < minimumWalletBalanceUsd) {
      return { allowed: false, reason: "insufficient_wallet_balance", access };
    }
  }

  return { allowed: true, reason: access.paidActive ? "active_subscription" : "active_trial", access };
}

export function getBaseLimitsForUser(user: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  const access = getBillingAccess(user, nowSeconds);
  if (access.trialActive) return { planId: "app_trial", plan: TRIAL_LIMITS, access };
  const planId = isKnownPlanId(user?.plan_id) ? user.plan_id : "starter_plan";
  return { planId, plan: PLANS[planId] || PLANS.starter_plan, access };
}

export function buildAccessBlockedMessage(access: ReturnType<typeof getBillingAccess>) {
  if (access.trialRepliesUsed) {
    return "Your trial's 100 free AI replies are used. Choose a paid plan in Billing to continue hosted AI replies.";
  }
  if (access.trialExpired) {
    return "Your 7-day trial has ended. Choose a paid plan in Billing to continue using this feature.";
  }
  return "Choose a paid plan in Billing to continue using this feature.";
}
