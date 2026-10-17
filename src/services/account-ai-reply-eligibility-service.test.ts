import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetAccountAiReplyEligibilityTestDeps,
  __setAccountAiReplyEligibilityTestDeps,
  buildAiReplyBlockedAlertMessage,
  canAccountUseBotForAiReply,
  shouldSendAiReplyBlockedAlert,
} from "./account-ai-reply-eligibility-service.ts";
import { APP_TRIAL_FREE_AI_REPLIES } from "../config/billing-access.ts";

const NOW = 1_800_000_000;

test.afterEach(() => {
  __resetAccountAiReplyEligibilityTestDeps();
});

function depsForUser(user: any, trialAiRepliesUsed = 0, paidAccessEvidence = false) {
  __setAccountAiReplyEligibilityTestDeps({
    getUser: async () => user,
    getTrialAiReplyUsage: async () => trialAiRepliesUsed,
    hasPaidAccessEvidence: async () => paidAccessEvidence,
  });
}

test("empty wallet blocks AI reply for paid account before AI call", async () => {
  depsForUser({ $id: "acct_1", plan_id: "growth_plan", plan_expiry: NOW + 86400, wallet_balance: 0 });

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "wallet_empty");
  assert.equal(decision.minimumRequiredUsd, 0.003);
});

test("newly created trial account with 0 wallet is ELIGIBLE for AI reply", async () => {
  depsForUser({ $id: "acct_1", trial_expires_at: NOW + 7 * 86400, wallet_balance: 0 });

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "eligible");
});

test("low wallet below hosted AI text reply price blocks paid account Gemini generation", async () => {
  depsForUser({ $id: "acct_1", plan_id: "growth_plan", plan_expiry: NOW + 86400, wallet_balance: 0.002 });

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "insufficient_wallet");
  assert.equal(decision.minimumRequiredUsd, 0.003);
});

test("AI reply eligibility can require media-specific customer reply costs for paid account", async () => {
  depsForUser({ $id: "acct_1", plan_id: "growth_plan", plan_expiry: NOW + 86400, wallet_balance: 0.006 });

  const imageDecision = await canAccountUseBotForAiReply({
    accountId: "acct_1",
    botId: "bot_1",
    purpose: "customer_ai_image_understanding",
    nowSeconds: NOW,
  });

  assert.equal(imageDecision.eligible, false);
  assert.equal(imageDecision.reason, "insufficient_wallet");
  assert.equal(imageDecision.minimumRequiredUsd, 0.007);
});

test("expired trial blocks AI reply before AI call", async () => {
  depsForUser({ $id: "acct_1", trial_expires_at: NOW - 1, wallet_balance: 1 });

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "trial_ended");
});

test("inactive subscription blocks AI reply before AI call", async () => {
  depsForUser({ $id: "acct_1", wallet_balance: 1, plan_status: "inactive" });

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "subscription_inactive");
});

test("expired subscription blocks AI reply before AI call", async () => {
  depsForUser({ $id: "acct_1", plan_expiry: NOW - 1, wallet_balance: 1 });
  const expired = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(expired.eligible, false);
  assert.equal(expired.reason, "subscription_expired");
});

test("trial reply limit blocks AI reply before AI call", async () => {
  depsForUser({ $id: "acct_1", trial_expires_at: NOW + 86400, wallet_balance: 1 }, APP_TRIAL_FREE_AI_REPLIES);

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "reply_limit_exhausted");
});

test("eligible account still passes AI reply gate", async () => {
  depsForUser({ $id: "acct_1", trial_expires_at: NOW + 86400, wallet_balance: 1 });

  const decision = await canAccountUseBotForAiReply({ accountId: "acct_1", botId: "bot_1", nowSeconds: NOW });

  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "eligible");
});

test("custom Gemini account access behavior still allows separate wallet rules", async () => {
  depsForUser({ $id: "acct_1", trial_expires_at: NOW + 86400, wallet_balance: 0.001 });

  const decision = await canAccountUseBotForAiReply({
    accountId: "acct_1",
    botId: "bot_1",
    billingAction: "client_gemini_message_cycle",
    nowSeconds: NOW,
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.minimumRequiredUsd, 0.001);
});

test("alert copy is clear and does not include customer data", () => {
  assert.match(buildAiReplyBlockedAlertMessage("wallet_empty"), /wallet is empty/i);
  assert.match(buildAiReplyBlockedAlertMessage("subscription_expired"), /subscription/i);
});

test("blocked AI reply alerts are cooldown protected", () => {
  const cache = new Map<string, number>();
  assert.equal(shouldSendAiReplyBlockedAlert({ cache, key: "acct_1:bot_1:wallet_empty", nowMs: 1_000, cooldownMs: 10_000 }), true);
  assert.equal(shouldSendAiReplyBlockedAlert({ cache, key: "acct_1:bot_1:wallet_empty", nowMs: 5_000, cooldownMs: 10_000 }), false);
  assert.equal(shouldSendAiReplyBlockedAlert({ cache, key: "acct_1:bot_1:wallet_empty", nowMs: 12_000, cooldownMs: 10_000 }), true);
});
