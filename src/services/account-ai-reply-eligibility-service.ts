import { isAccountAiReplyAllowed } from "../config/billing-access.ts";
import { getRequiredAiReplyCostForPurpose } from "../config/ai-reply-required-cost.ts";
import type { BillableUsageAction } from "../config/pricing.ts";
import * as dbService from "./db-service.ts";

export type AccountAiReplyEligibilityReason =
  | "eligible"
  | "wallet_empty"
  | "insufficient_wallet"
  | "trial_ended"
  | "subscription_inactive"
  | "subscription_expired"
  | "reply_limit_exhausted"
  | "unknown_plan"
  | "account_suspended"
  | "missing_user"
  | "user_not_found";

export type AccountAiReplyEligibility = {
  eligible: boolean;
  reason: AccountAiReplyEligibilityReason;
  accountId: string;
  botId: string;
  walletBalance: number;
  minimumRequiredUsd: number;
  access?: any;
};

const eligibilityDeps = {
  getUser: dbService.getUser,
  getTrialAiReplyUsage: dbService.getTrialAiReplyUsage,
  hasPaidAccessEvidence: dbService.hasPaidAccessEvidence,
};

export function __setAccountAiReplyEligibilityTestDeps(overrides: Partial<typeof eligibilityDeps>) {
  Object.assign(eligibilityDeps, overrides || {});
}

export function __resetAccountAiReplyEligibilityTestDeps() {
  Object.assign(eligibilityDeps, {
    getUser: dbService.getUser,
    getTrialAiReplyUsage: dbService.getTrialAiReplyUsage,
    hasPaidAccessEvidence: dbService.hasPaidAccessEvidence,
  });
}

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeReason(user: any, decision: ReturnType<typeof isAccountAiReplyAllowed>): AccountAiReplyEligibilityReason {
  const decisionReason = decision.reason;
  const status = String(user?.plan_status || user?.account_status || user?.status || user?.billing_status || "").toLowerCase();
  if (user?.is_suspended === true || user?.suspended === true || ["suspended", "blocked", "disabled"].includes(status)) return "account_suspended";
  if (decisionReason === "unknown_plan") return "unknown_plan";
  if (status === "inactive") return "subscription_inactive";
  if (decisionReason === "insufficient_wallet_balance") return "insufficient_wallet";
  if (decisionReason === "account_trial_expired") return "trial_ended";
  if (decisionReason === "trial_free_reply_limit_reached" || decisionReason === "trial_free_ai_replies_used") return "reply_limit_exhausted";
  if (Number(decision.access?.planExpiry || 0) > 0 && decision.access?.paidActive === false) return "subscription_expired";
  if (decisionReason === "account_trial_expiry_missing") return "subscription_inactive";
  if (decisionReason === "subscription_required") return "subscription_expired";
  return "subscription_inactive";
}

export function buildAiReplyBlockedAlertMessage(reason: AccountAiReplyEligibilityReason) {
  if (reason === "wallet_empty") return "BlackArrow bot paused: wallet is empty. Please top up or renew subscription to resume automatic replies.";
  if (reason === "insufficient_wallet") return "BlackArrow bot paused: wallet balance is too low. Please top up Billing to resume automatic replies.";
  if (reason === "trial_ended") return "BlackArrow bot paused: trial has ended. Please subscribe or renew access to resume automatic replies.";
  if (reason === "reply_limit_exhausted") return "BlackArrow bot paused: trial free AI reply limit is exhausted. Please subscribe to a paid plan or renew subscription to resume automatic replies.";
  if (reason === "subscription_expired") return "BlackArrow bot paused: subscription is expired or inactive. Please renew to resume automatic replies.";
  if (reason === "unknown_plan") return "BlackArrow bot paused: subscription plan is unrecognized or invalid. Please choose a valid plan in Billing to resume automatic replies.";
  if (reason === "account_suspended") return "BlackArrow bot paused: account access is suspended. Please contact support to resume automatic replies.";
  return "BlackArrow bot paused: account is not eligible for automatic AI replies. Please check Billing to resume.";
}

export function shouldSendAiReplyBlockedAlert(input: {
  cache: Map<string, number>;
  key: string;
  nowMs?: number;
  cooldownMs?: number;
}) {
  const nowMs = Number(input.nowMs || Date.now());
  const cooldownMs = Math.max(0, Number(input.cooldownMs || 0));
  const key = clean(input.key) || "unknown";
  if (!input.cache.has(key)) {
    input.cache.set(key, nowMs);
    return true;
  }
  const last = input.cache.get(key) || 0;
  if (cooldownMs > 0 && nowMs - last < cooldownMs) return false;
  input.cache.set(key, nowMs);
  return true;
}

export async function canAccountUseBotForAiReply(input: {
  accountId?: string;
  botId?: string;
  minimumWalletBalanceUsd?: number;
  purpose?: string;
  billingAction?: BillableUsageAction | string;
  usageAction?: BillableUsageAction | string;
  usageActions?: Array<BillableUsageAction | string>;
  hasIncomingImage?: boolean;
  hasIncomingAudio?: boolean;
  sendsTextReply?: boolean;
  sendsVoiceReply?: boolean;
  nowSeconds?: number;
}): Promise<AccountAiReplyEligibility> {
  const accountId = clean(input.accountId);
  const botId = clean(input.botId);
  const purposeRequiredUsd = getRequiredAiReplyCostForPurpose(input);
  const minimumRequiredUsd = Math.max(0, Number(input.minimumWalletBalanceUsd ?? purposeRequiredUsd));
  if (!accountId) {
    return { eligible: false, reason: "missing_user", accountId, botId, walletBalance: 0, minimumRequiredUsd };
  }

  const user = await eligibilityDeps.getUser(accountId).catch(() => null) as any;
  if (!user) {
    return { eligible: false, reason: "user_not_found", accountId, botId, walletBalance: 0, minimumRequiredUsd };
  }

  const userId = clean(user.$id || user.id || accountId);
  const status = String(user?.account_status || user?.status || user?.billing_status || "").toLowerCase();
  if (user?.is_suspended === true || user?.suspended === true || ["suspended", "blocked", "disabled"].includes(status)) {
    return { eligible: false, reason: "account_suspended", accountId: userId, botId, walletBalance: Math.max(0, Number(user.wallet_balance || 0)), minimumRequiredUsd };
  }

  const trialAiRepliesUsed = await eligibilityDeps.getTrialAiReplyUsage(userId).catch(() => 0);
  const walletBalance = Math.max(0, Number(user.wallet_balance || 0));
  const decision = isAccountAiReplyAllowed(
    { ...user, trial_ai_replies_used: trialAiRepliesUsed },
    { minimumWalletBalanceUsd: minimumRequiredUsd, nowSeconds: input.nowSeconds },
  );

  if (!decision.allowed) {
    const reason = walletBalance <= 0 && decision.reason === "insufficient_wallet_balance"
      ? "wallet_empty"
      : normalizeReason(user, decision);
    return { eligible: false, reason, accountId: userId, botId, walletBalance, minimumRequiredUsd, access: decision.access };
  }

  return { eligible: true, reason: "eligible", accountId: userId, botId, walletBalance, minimumRequiredUsd, access: decision.access };
}
