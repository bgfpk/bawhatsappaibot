import test from "node:test";
import assert from "node:assert/strict";
import { APP_TRIAL_FREE_AI_REPLIES, getBillingAccess, isAccountAiReplyAllowed } from "./billing-access.ts";

const nowSeconds = 1_800_000_000;

test("future trial expiry allows AI replies when wallet has minimum balance", () => {
  const decision = isAccountAiReplyAllowed(
    { trial_expires_at: nowSeconds + 86400, wallet_balance: 1 },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.access.status, "trial");
});

test("expired trial blocks AI replies before generation or send", () => {
  const decision = isAccountAiReplyAllowed(
    { trial_expires_at: nowSeconds - 1, wallet_balance: 1 },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "account_trial_expired");
  assert.equal(decision.access.status, "trial_expired");
});

test("missing trial expiry is inactive and not unlimited free access", () => {
  const decision = isAccountAiReplyAllowed(
    { wallet_balance: 1 },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "subscription_required");
  assert.equal(decision.access.status, "inactive");
});

test("paid active user can receive AI replies", () => {
  const decision = isAccountAiReplyAllowed(
    { plan_id: "growth_plan", plan_expiry: nowSeconds + 86400, trial_expires_at: nowSeconds - 1, wallet_balance: 1 },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.access.status, "paid");
});

test("trial hosted AI stops when 100 free replies are used even if days remain", () => {
  const decision = isAccountAiReplyAllowed(
    { trial_expires_at: nowSeconds + 86400, trial_ai_replies_used: APP_TRIAL_FREE_AI_REPLIES, wallet_balance: 1 },
    { nowSeconds, minimumWalletBalanceUsd: 0 },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "trial_free_reply_limit_reached");
  assert.equal(decision.access.status, "trial_replies_used");
  assert.equal(decision.access.trialAiRepliesRemaining, 0);
});

test("paid active user is not blocked by trial reply cap", () => {
  const decision = isAccountAiReplyAllowed(
    { plan_id: "growth_plan", plan_expiry: nowSeconds + 86400, trial_expires_at: nowSeconds + 86400, trial_ai_replies_used: 1000, wallet_balance: 1 },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.access.status, "paid");
});

test("wallet top-up user is not blocked by old trial reply cap", () => {
  const decision = isAccountAiReplyAllowed(
    { plan_id: "starter_plan", plan_expiry: nowSeconds + 86400, trial_expires_at: nowSeconds + 86400, trial_ai_replies_used: 1000, wallet_balance: 0.5, paid_access_confirmed: true },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.access.status, "paid");
  assert.equal(decision.access.trialRepliesUsed, false);
});

test("wallet top-up user still needs enough wallet balance", () => {
  const decision = isAccountAiReplyAllowed(
    { plan_id: "starter_plan", plan_expiry: nowSeconds + 86400, trial_expires_at: nowSeconds + 86400, trial_ai_replies_used: 1000, wallet_balance: 0, paid_access_confirmed: true },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "insufficient_wallet_balance");
  assert.equal(decision.access.status, "paid");
});

test("trial access reports reply usage totals for billing UI", () => {
  const access = getBillingAccess({ trial_expires_at: nowSeconds + 86400, trial_ai_replies_used: 25 }, nowSeconds);
  assert.equal(access.trialActive, true);
  assert.equal(access.trialAiRepliesUsed, 25);
  assert.equal(access.trialAiRepliesLimit, 100);
  assert.equal(access.trialAiRepliesRemaining, 75);
});

test("super-admin role bypasses customer-facing AI reply billing access requirement", () => {
  const decision = isAccountAiReplyAllowed(
    { role: "super_admin", wallet_balance: 0 },
    { nowSeconds, minimumWalletBalanceUsd: 0.001 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "admin_role");
});

test("newly created account with active trial and $0 wallet balance is ALLOWED to reply", () => {
  const decision = isAccountAiReplyAllowed(
    { trial_expires_at: nowSeconds + 7 * 86400, wallet_balance: 0, trial_ai_replies_used: 0 },
    { nowSeconds, minimumWalletBalanceUsd: 0.003 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.access.status, "trial");
  assert.equal(decision.access.trialActive, true);
});

test("expired paid account with positive wallet balance is BLOCKED from replying", () => {
  const decision = isAccountAiReplyAllowed(
    { plan_id: "growth_plan", plan_expiry: nowSeconds - 3600, trial_expires_at: nowSeconds - 86400, wallet_balance: 15.0 },
    { nowSeconds, minimumWalletBalanceUsd: 0.003 },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "subscription_expired");
  assert.equal(decision.access.status, "trial_expired");
});
