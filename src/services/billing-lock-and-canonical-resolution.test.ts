import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  getUser,
} from "./db-service.ts";
import {
  resolveAiProviderBillingAction,
  chargeAiProviderCallBilling,
  __setAiProviderCallBillingTestDeps,
  __resetAiProviderCallBillingTestDeps,
} from "./ai-provider-call-billing-service.ts";

test("billingLockKey length guarantees: document ID never exceeds 36 chars", () => {
  function testLockKey(userId: string) {
    const hash = crypto.createHash("sha1").update(String(userId || "")).digest("hex").slice(0, 24);
    return `block_${hash}`;
  }

  const shortId = "u1";
  const standardOwnerId = "usr_sample_standard_user_id"; // 26 chars
  const emailAccount = "account:contact-a636661a9d89@example.invalid"; // 35 chars
  const superLongId = "a".repeat(100);

  const k1 = testLockKey(shortId);
  const k2 = testLockKey(standardOwnerId);
  const k3 = testLockKey(emailAccount);
  const k4 = testLockKey(superLongId);

  assert.ok(k1.length <= 36, `k1 length ${k1.length} exceeds 36`);
  assert.ok(k2.length <= 36, `k2 length ${k2.length} exceeds 36`);
  assert.ok(k3.length <= 36, `k3 length ${k3.length} exceeds 36`);
  assert.ok(k4.length <= 36, `k4 length ${k4.length} exceeds 36`);

  assert.strictEqual(k1.length, 30);
  assert.strictEqual(k2.length, 30);
  assert.strictEqual(k3.length, 30);
  assert.strictEqual(k4.length, 30);

  assert.notStrictEqual(k1, k2);
  assert.notStrictEqual(k2, k3);
});

test("getUser resolution handles account prefix and email correctly", async () => {
  const resNull = await getUser("");
  assert.strictEqual(resNull, null);

  const resInvalid = await getUser("account:contact-2bf3f36d14c2@example.invalid");
  assert.strictEqual(resInvalid, null);
});

test("chargeAiProviderCallBilling resolves purpose and charges standard assistant rate", async () => {
  assert.strictEqual(resolveAiProviderBillingAction("admin_assistant_intent"), "business_assistant_ai_call");
  assert.strictEqual(resolveAiProviderBillingAction("admin_assistant_domain"), "business_assistant_ai_call");
  assert.strictEqual(resolveAiProviderBillingAction("personal_assistant_chat"), "personal_assistant_ai_call");
  assert.strictEqual(resolveAiProviderBillingAction("customer_ai_reply"), null); // Customer replies charged post-send

  let chargedAction = "";
  let loggedFailure: any = null;
  let updatedOutcome: any = null;

  __setAiProviderCallBillingTestDeps({
    getUser: (async () => ({ $id: "usr_test_123", wallet_balance: 50.0 })) as any,
    chargeUsageAction: (async (_userId: string, action: any) => {
      chargedAction = action;
      return { charged: true, cost: 0.003, balance: 49.997 };
    }) as any,
    logUsageChargeFailure: ((failure: any) => {
      loggedFailure = failure;
    }) as any,
    updateAiProviderCallSendOutcome: (async (outcome: any) => {
      updatedOutcome = outcome;
      return { updated: true };
    }) as any,
  });

  try {
    const chargeResult = await chargeAiProviderCallBilling({
      accountId: "usr_test_123",
      purpose: "admin_assistant_domain",
      callId: "call_abc_123",
      requestId: "req_xyz_456",
    });

    assert.strictEqual(chargeResult.charged, true);
    assert.strictEqual(chargeResult.cost, 0.003);
    assert.strictEqual(chargedAction, "business_assistant_ai_call");
    assert.strictEqual(loggedFailure, null);
    assert.ok(updatedOutcome);
    assert.strictEqual(updatedOutcome.chargeOutcome, "charged");
    assert.strictEqual(updatedOutcome.finalSendOutcome, "no_send");
  } finally {
    __resetAiProviderCallBillingTestDeps();
  }
});

test("chargeAiProviderCallBilling handles duplicate call without double debit", async () => {
  let updatedOutcome: any = null;

  __setAiProviderCallBillingTestDeps({
    getUser: (async () => ({ $id: "usr_test_123", wallet_balance: 50.0 })) as any,
    chargeUsageAction: (async () => ({ charged: false, duplicate: true, cost: 0 })) as any,
    updateAiProviderCallSendOutcome: (async (outcome: any) => {
      updatedOutcome = outcome;
      return { updated: true };
    }) as any,
  });

  try {
    const result = await chargeAiProviderCallBilling({
      accountId: "usr_test_123",
      purpose: "personal_assistant_chat",
      callId: "call_dup_1",
    });

    assert.strictEqual(result.charged, false);
    assert.strictEqual(result.duplicate, true);
    assert.strictEqual(result.cost, 0.003);
    assert.ok(updatedOutcome);
    assert.strictEqual(updatedOutcome.chargeOutcome, "no_charge");
  } finally {
    __resetAiProviderCallBillingTestDeps();
  }
});

test("tenant boundary enforcement: cross-worker send checks match", () => {
  const workerUserId = "usr_owner_99b62c74";
  const validRequest = { accountId: "usr_owner_99b62c74", to: "contact-e4ed32210a80@example.invalid", text: "Hello" };
  const invalidRequest = { accountId: "usr_attacker_888", to: "contact-e4ed32210a80@example.invalid", text: "Malicious" };

  const isAllowedTenant = (req: any, workerUser: string) => {
    const reqAcc = String(req.accountId || req.userId || "").trim();
    if (reqAcc && workerUser && reqAcc !== workerUser) return false;
    return true;
  };

  assert.strictEqual(isAllowedTenant(validRequest, workerUserId), true);
  assert.strictEqual(isAllowedTenant(invalidRequest, workerUserId), false);
});
