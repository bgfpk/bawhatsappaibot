import test from "node:test";
import assert from "node:assert/strict";
import {
  hasPaidAccess,
  hasPaidAccessEvidence,
  getBillingAccess,
  isAccountAiReplyAllowed,
  normalizeEpochSeconds,
} from "../config/billing-access.ts";
import { mapBillingAccessToAccountStatus } from "../billing/billing-model.ts";
import { canAccountUseBotForAiReply, __setAccountAiReplyEligibilityTestDeps, __resetAccountAiReplyEligibilityTestDeps } from "./account-ai-reply-eligibility-service.ts";
import { canSendBillableAutomation, __setAutomationSendBillingTestDeps, __resetAutomationSendBillingTestDeps } from "./automation-send-billing-service.ts";
import { previewBillableOutboundText, __setOutboundMessageBillingTestDeps, __resetOutboundMessageBillingTestDeps } from "./outbound-message-billing-service.ts";

test.afterEach(() => {
  __resetAccountAiReplyEligibilityTestDeps();
  __resetAutomationSendBillingTestDeps();
  __resetOutboundMessageBillingTestDeps();
});

test("Account Entitlement Truth Table", async (t) => {
  const nowSec = 1750000000;
  const futureExpiry = nowSec + 86400 * 30;
  const pastExpiry = nowSec - 86400 * 10;

  await t.test("Active paid + sufficient wallet -> allowed", () => {
    const user = {
      plan_id: "growth_plan",
      plan_expiry: futureExpiry,
      wallet_balance: 50.0,
    };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.status, "paid");
    assert.equal(access.paidActive, true);
    assert.equal(access.canUsePaidFeatures, true);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 1.0, nowSeconds: nowSec });
    assert.equal(check.allowed, true);
    assert.equal(check.reason, "active_subscription");
  });

  await t.test("Active paid + insufficient wallet -> entitlement active but send blocked by wallet", () => {
    const user = {
      plan_id: "growth_plan",
      plan_expiry: futureExpiry,
      wallet_balance: 0.1,
    };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.paidActive, true);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 1.0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "insufficient_wallet_balance");
  });

  await t.test("Expired paid + large positive wallet -> BLOCKED (wallet is not subscription entitlement)", () => {
    const user = {
      plan_id: "growth_plan",
      plan_expiry: pastExpiry,
      wallet_balance: 100.0,
    };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.paidActive, false);
    assert.equal(access.canUsePaidFeatures, false);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "subscription_expired");
  });

  await t.test("Expired paid + stale subscription ID -> BLOCKED", () => {
    const user = {
      plan_id: "pro_plan",
      plan_expiry: pastExpiry,
      creem_subscription_id: "sub_stale_12345",
      wallet_balance: 10.0,
    };
    assert.equal(hasPaidAccess(user, nowSec), false);
    assert.equal(hasPaidAccessEvidence(user), true); // Historical evidence preserved

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
  });

  await t.test("Expired paid + stale Creem customer ID -> BLOCKED", () => {
    const user = {
      plan_id: "pro_plan",
      plan_expiry: pastExpiry,
      creem_customer_id: "cust_stale_999",
      wallet_balance: 0,
    };
    assert.equal(hasPaidAccess(user, nowSec), false);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
  });

  await t.test("Expired paid + stale payment ID -> BLOCKED", () => {
    const user = {
      plan_id: "growth_plan",
      plan_expiry: pastExpiry,
      payment_id: "pay_old_555",
    };
    assert.equal(hasPaidAccess(user, nowSec), false);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
  });

  await t.test("Expired paid + paid_access_confirmed / has_paid_access / paidAccessConfirmed -> BLOCKED", () => {
    const user1 = { plan_id: "growth_plan", plan_expiry: pastExpiry, paid_access_confirmed: true };
    const user2 = { plan_id: "growth_plan", plan_expiry: pastExpiry, has_paid_access: true };
    const user3 = { plan_id: "growth_plan", plan_expiry: pastExpiry, paidAccessConfirmed: true };

    assert.equal(hasPaidAccess(user1, nowSec), false);
    assert.equal(hasPaidAccess(user2, nowSec), false);
    assert.equal(hasPaidAccess(user3, nowSec), false);

    assert.equal(isAccountAiReplyAllowed(user1, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec }).allowed, false);
    assert.equal(isAccountAiReplyAllowed(user2, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec }).allowed, false);
    assert.equal(isAccountAiReplyAllowed(user3, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec }).allowed, false);
  });

  await t.test("Active trial + remaining allowance -> ALLOWED", () => {
    const user = {
      plan_id: "starter_plan",
      trial_expires_at: futureExpiry,
      trial_ai_replies_used: 10,
    };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.status, "trial");
    assert.equal(access.trialActive, true);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, true);
    assert.equal(check.reason, "active_trial");
  });

  await t.test("Expired trial + wallet positive -> BLOCKED", () => {
    const user = {
      plan_id: "starter_plan",
      trial_expires_at: pastExpiry,
      wallet_balance: 20.0,
    };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.trialActive, false);
    assert.equal(access.trialExpired, true);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "account_trial_expired");
  });

  await t.test("Trial free reply limit exhausted -> BLOCKED", () => {
    const user = {
      plan_id: "starter_plan",
      trial_expires_at: futureExpiry,
      trial_ai_replies_used: 100,
    };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.trialRepliesUsed, true);

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "trial_free_reply_limit_reached");
  });

  await t.test("Suspended active-plan account -> BLOCKED", async () => {
    const user = {
      $id: "user_suspended_1",
      plan_id: "growth_plan",
      plan_expiry: futureExpiry,
      wallet_balance: 100.0,
      is_suspended: true,
    };

    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => true,
    });

    const result = await canAccountUseBotForAiReply({ accountId: "user_suspended_1", nowSeconds: nowSec });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "account_suspended");
  });

  await t.test("Admin role -> ALLOWED", () => {
    const user = {
      role: "admin",
      plan_expiry: pastExpiry,
    };
    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, true);
    assert.equal(check.reason, "admin_role");
  });

  await t.test("No-expiry (0 / missing / null) with historical flags or balances -> strictly BLOCKED", () => {
    const noExpiry1 = { plan_id: "growth_plan", plan_expiry: 0, paid_access_confirmed: true };
    const noExpiry2 = { plan_id: "growth_plan", plan_expiry: undefined, has_paid_access: true };
    const noExpiry3 = { plan_id: "growth_plan", plan_expiry: null, paidAccessConfirmed: true };
    const noExpiry4 = { plan_id: "growth_plan", subscription_id: "sub_historical_123" };
    const noExpiry5 = { plan_id: "growth_plan", creem_customer_id: "cust_historical_456" };
    const noExpiry6 = { plan_id: "growth_plan", wallet_balance: 100.0 };

    assert.equal(hasPaidAccess(noExpiry1, nowSec), false, "plan_expiry 0 + paid_access_confirmed is BLOCKED");
    assert.equal(hasPaidAccess(noExpiry2, nowSec), false, "plan_expiry missing + has_paid_access is BLOCKED");
    assert.equal(hasPaidAccess(noExpiry3, nowSec), false, "plan_expiry null + paidAccessConfirmed is BLOCKED");
    assert.equal(hasPaidAccess(noExpiry4, nowSec), false, "plan_expiry missing + subscription_id is BLOCKED");
    assert.equal(hasPaidAccess(noExpiry5, nowSec), false, "plan_expiry missing + creem_customer_id is BLOCKED");
    assert.equal(hasPaidAccess(noExpiry6, nowSec), false, "plan_expiry missing + positive wallet is BLOCKED");
  });

  await t.test("Automation send billing guard blocks expired user with positive wallet", async () => {
    const user = {
      $id: "user_expired_wallet",
      plan_expiry: pastExpiry,
      wallet_balance: 50.0,
    };

    __setAutomationSendBillingTestDeps({
      getUser: async () => user as any,
      canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "subscription_expired" }),
    });

    const gate = await canSendBillableAutomation("user_expired_wallet", "sequence_template_send", 1);
    assert.equal(gate.allowed, false);
    assert.equal(gate.reason, "subscription_expired");
  });

  await t.test("mapBillingAccessToAccountStatus maps access status correctly for normal clients", () => {
    assert.equal(mapBillingAccessToAccountStatus("paid"), "active");
    assert.equal(mapBillingAccessToAccountStatus("trial"), "trial");
    assert.equal(mapBillingAccessToAccountStatus("trial_replies_used"), "restricted");
    assert.equal(mapBillingAccessToAccountStatus("trial_expired"), "expired");
    assert.equal(mapBillingAccessToAccountStatus("inactive"), "restricted");
    assert.equal(mapBillingAccessToAccountStatus("paid", { is_suspended: true }), "restricted");
    assert.equal(mapBillingAccessToAccountStatus("paid", { plan_status: "past_due" }), "past_due");
  });

  await t.test("Required Scenario 1: Valid paid plan + wallet balance > minimum -> allowed", async () => {
    const user = { $id: "u1", plan_id: "growth_plan", plan_expiry: futureExpiry, wallet_balance: 25.0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => true,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u1", nowSeconds: nowSec });
    assert.equal(res.eligible, true);
    assert.equal(res.reason, "eligible");
  });

  await t.test("Required Scenario 2: Valid paid plan + wallet balance 0 -> blocked with clear reason", async () => {
    const user = { $id: "u2", plan_id: "growth_plan", plan_expiry: futureExpiry, wallet_balance: 0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => true,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u2", minimumWalletBalanceUsd: 0.003, nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "wallet_empty");
  });

  await t.test("Required Scenario 3: Expired paid plan + positive wallet balance -> strictly BLOCKED", async () => {
    const user = { $id: "u3", plan_id: "growth_plan", plan_expiry: pastExpiry, wallet_balance: 100.0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => false,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u3", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "subscription_expired");
  });

  await t.test("Required Scenario 4: Expired paid plan + stale subscription ID in db -> strictly BLOCKED", async () => {
    const user = { $id: "u4", plan_id: "pro_plan", plan_expiry: pastExpiry, creem_subscription_id: "sub_old_999", wallet_balance: 50.0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => false,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u4", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "subscription_expired");
  });

  await t.test("Required Scenario 5: Active free trial + trial replies remaining -> allowed", async () => {
    const user = { $id: "u5", trial_expires_at: futureExpiry, wallet_balance: 10.0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 45,
      hasPaidAccessEvidence: async () => false,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u5", nowSeconds: nowSec });
    assert.equal(res.eligible, true);
    assert.equal(res.reason, "eligible");
  });

  await t.test("Required Scenario 6: Active free trial + 100 free replies used -> BLOCKED until paid plan", async () => {
    const user = { $id: "u6", trial_expires_at: futureExpiry, wallet_balance: 0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 100,
      hasPaidAccessEvidence: async () => false,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u6", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "reply_limit_exhausted");
  });

  await t.test("Required Scenario 7: Expired free trial + positive wallet balance -> strictly BLOCKED", async () => {
    const user = { $id: "u7", trial_expires_at: pastExpiry, wallet_balance: 20.0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 10,
      hasPaidAccessEvidence: async () => false,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u7", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "trial_ended");
  });

  await t.test("Required Scenario 8: Missed-message worker / retry loop does NOT bypass expired subscription guard", async () => {
    const user = { $id: "u8", plan_expiry: pastExpiry, wallet_balance: 75.0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => false,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u8", purpose: "missed_message_recovery", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "subscription_expired");
  });

  await t.test("Required Scenario 9: Admin/system override explicitly preserved", async () => {
    const user = { $id: "u9", role: "admin", plan_expiry: pastExpiry, wallet_balance: 0 };
    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => true,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u9", nowSeconds: nowSec });
    assert.equal(res.eligible, true);
    assert.equal(res.reason, "eligible");
  });

  await t.test("Required Scenario 10: Proactive automations (fixed/smart follow-ups, sequences, updates) blocked on expired subscription with positive wallet", async () => {
    const user = { $id: "u10", plan_expiry: pastExpiry, wallet_balance: 50.0 };
    __setAutomationSendBillingTestDeps({
      getUser: async () => user as any,
      canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "subscription_expired" }),
    });
    __setOutboundMessageBillingTestDeps({
      getUser: async () => user as any,
      canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "subscription_expired" }),
    });
    const followupCheck = await previewBillableOutboundText("u10", "ai_smart_followup");
    const sequenceCheck = await canSendBillableAutomation("u10", "sequence_template_send", 1);
    const mediaCheck = await canSendBillableAutomation("u10", "media_group_file_send", 1);
    const updateCheck = await previewBillableOutboundText("u10", "customer_update_scheduled");
    assert.equal(followupCheck.allowed, false);
    assert.equal(followupCheck.reason, "subscription_expired");
    assert.equal(sequenceCheck.allowed, false);
    assert.equal(sequenceCheck.reason, "subscription_expired");
    assert.equal(mediaCheck.allowed, false);
    assert.equal(mediaCheck.reason, "subscription_expired");
    assert.equal(updateCheck.allowed, false);
    assert.equal(updateCheck.reason, "subscription_expired");
  });

  await t.test("Required Scenario 11: Unknown / unrecognized plan ID + positive wallet -> FAIL CLOSED", async () => {
    const user = { $id: "u11", plan_id: "unknown_custom_plan", plan_expiry: futureExpiry, wallet_balance: 100.0 };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.status, "inactive");
    assert.equal(access.paidActive, false);
    assert.equal(mapBillingAccessToAccountStatus(access.status, user), "restricted");

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "unknown_plan");

    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => true,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u11", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "unknown_plan");
  });

  await t.test("Required Scenario 12: Inactive/cancelled subscription status + positive wallet -> BLOCKED", async () => {
    const user = { $id: "u12", plan_id: "growth_plan", plan_status: "inactive", plan_expiry: futureExpiry, wallet_balance: 50.0 };
    const access = getBillingAccess(user, nowSec);
    assert.equal(access.status, "inactive");
    assert.equal(access.paidActive, false);
    assert.equal(mapBillingAccessToAccountStatus(access.status, user), "restricted");

    const check = isAccountAiReplyAllowed(user, { minimumWalletBalanceUsd: 0, nowSeconds: nowSec });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "subscription_inactive");

    __setAccountAiReplyEligibilityTestDeps({
      getUser: async () => user as any,
      getTrialAiReplyUsage: async () => 0,
      hasPaidAccessEvidence: async () => true,
    });
    const res = await canAccountUseBotForAiReply({ accountId: "u12", nowSeconds: nowSec });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, "subscription_inactive");
  });

  await t.test("Required Scenario 13: Admin role has consistent UI status ('active') and worker allowed", () => {
    const adminUser = { role: "admin", plan_expiry: 0, wallet_balance: 0 };
    const access = getBillingAccess(adminUser, nowSec);
    assert.equal(access.status, "paid");
    assert.equal(access.paidActive, true);
    assert.equal(mapBillingAccessToAccountStatus(access.status, adminUser), "active");

    const check = isAccountAiReplyAllowed(adminUser, { minimumWalletBalanceUsd: 1.0, nowSeconds: nowSec });
    assert.equal(check.allowed, true);
    assert.equal(check.reason, "admin_role");
  });
});
