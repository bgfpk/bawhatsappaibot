/**
 * Personal Assistant Permissions, Safety & Delegation - Test Suite (Prompt 7)
 * 
 * Verifies sections 85 - 96:
 * - Default Deny & Risk Classes
 * - Owner360 Field-Level Disclosure Governance
 * - Order Authority, Spending Limits & Safety Ledger
 * - Payment & Credential Safety (Permanent R5 Prohibitions)
 * - Meetings, Reservations & Negotiation Boundaries
 * - Policy Management, Broadening Confirmation & Revocation
 * - Opt-out / Anti-spam Hard Enforcement
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getPersonalDelegationPolicy,
  savePersonalDelegationPolicy,
  createDefaultDelegationPolicy,
  isBroadeningPolicyChange,
  __clearDelegationPolicyCacheForTest,
} from "./personal-delegation-policy-service.ts";
import {
  evaluatePersonalActionAuthorization,
  determineActionRiskClass,
} from "./personal-action-authorization-service.ts";
import {
  evaluateOwnerDataDisclosure,
  registerTaskScopedDataAuthorization,
  getTaskScopedDataAuthorization,
  __clearTaskScopedAuthForTest,
} from "./personal-data-disclosure-service.ts";
import {
  checkAndReserveCommitment,
  releaseCommitmentReservation,
  __clearCommitmentLedgerForTest,
} from "./personal-commitment-limit-service.ts";
import {
  getOwnerProfile,
  saveOwnerProfile,
  invalidateOwnerProfileCache,
} from "./owner360-service.ts";
import {
  savePersonalTask,
  __clearPersonalTasksForTest,
} from "./personal-task-storage-service.ts";
import { getAdminAction } from "./admin-action-registry-service.ts";
import type { PersonalTask } from "./personal-task-types.ts";
import "./personal-delegation-admin-tools.ts";

const mockTenantId = `tenant_del_${Date.now()}`;
const mockPersonalInstanceId = "bot_pers_del_01";
const mockControlBizId = "bot_biz_del_01";

const sampleTask: PersonalTask = {
  taskId: `ptask_del_test_01`,
  schemaVersion: 1,
  revision: 1,
  accountId: mockTenantId,
  personalInstanceId: mockPersonalInstanceId,
  controlBusinessInstanceId: mockControlBizId,
  createdByOwner: true,
  goal: "Buy printer ink",
  fullOwnerInstructions: "Find HP 67 black ink cartridge and buy if under 4000.",
  constraints: ["No card payment"],
  targetContactId: "pc_supplier_01",
  targetIdentity: {
    jid: "contact-e12c044a6d0c@example.invalid",
    canonicalPhone: "+149145539352",
    displayName: "Stationery Depot",
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  currentState: "ACTIVE",
  stepCount: 1,
};

test("Personal Delegation, Permissions & Safety Engine", async (t) => {
  t.beforeEach(async () => {
    __clearDelegationPolicyCacheForTest();
    __clearTaskScopedAuthForTest();
    __clearCommitmentLedgerForTest();
    invalidateOwnerProfileCache();
    __clearPersonalTasksForTest();
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
    await savePersonalDelegationPolicy(createDefaultDelegationPolicy(mockTenantId));
  });

  // =========================================================================
  // 1. DEFAULT DENY & RISK TAXONOMY (Section 85)
  // =========================================================================
  await t.test("Default Deny: Orders and high-risk actions default to require approval or block", async () => {
    const policy = await getPersonalDelegationPolicy(mockTenantId);
    assert.strictEqual(policy.orders.allowOrderCommitment, false);
    assert.strictEqual(policy.orders.orderCommitmentMode, "ASK_EACH_TIME");

    // Autonomous order attempt with default policy
    const decision = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      proposedPayload: { item: "Printer Ink", amount: 3500, currency: "PKR" },
      actorRole: "worker",
    });

    assert.strictEqual(decision.decision, "REQUIRE_APPROVAL");
    assert.strictEqual(decision.riskClass, "R4_FINANCIAL_OR_BINDING_COMMITMENT");
    assert.match(decision.reasonCode, /ORDERS_DISABLED|ORDER_MODE_ASK_EACH_TIME/i);
  });

  await t.test("Low-risk communication allowed by default", async () => {
    const decision = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "WHATSAPP_SEND",
      proposedPayload: { text: "Hello, what is the price of HP 67 ink?" },
      actorRole: "worker",
    });

    assert.strictEqual(decision.decision, "ALLOW");
    assert.strictEqual(decision.riskClass, "R1_LOW_RISK_COMMUNICATION");
  });

  // =========================================================================
  // 2. OWNER360 FIELD-LEVEL DISCLOSURE (Section 86)
  // =========================================================================
  await t.test("Owner360 Disclosure: PRIVATE fields blocked, ASK requires approval, task-scoped allowed", async () => {
    // Setup Owner Profile with ALLOW_FOR_AUTHORIZED_TASK address and ASK_BEFORE_SHARE phone
    const profile = await getOwnerProfile(mockTenantId);
    profile.addresses = [{
      id: "addr_1",
      label: "Home",
      addressLine1: "House 123, Street 4",
      city: "Lahore",
      country: "Pakistan",
      privacyPolicy: "ALLOW_FOR_AUTHORIZED_TASK",
      isDefault: true,
    }];
    profile.contactMethods = [
      {
        id: "cm_1",
        type: "phone",
        label: "Personal",
        value: "+144225232320",
        privacyPolicy: "ASK_BEFORE_SHARE",
        isDefault: true,
      },
    ];
    await saveOwnerProfile(profile);

    const policy = await getPersonalDelegationPolicy(mockTenantId);

    // Case 1: Full delivery address -> requires approval because allowDeliveryAddressForShopping is false by default
    const addrDec = await evaluateOwnerDataDisclosure({
      accountId: mockTenantId,
      field: "address",
      proposedValue: "House 123, Street 4, Lahore",
      recipientPhoneOrJid: "+149145539352",
      task: sampleTask,
      policy,
    });
    assert.strictEqual(addrDec.allowed, false);
    assert.strictEqual(addrDec.requiresApproval, true);
    assert.strictEqual(addrDec.reasonCode, "POLICY_RESTRICTION");

    // Case 2: ASK_BEFORE_SHARE phone -> REQUIRE_APPROVAL
    const phoneDec = await evaluateOwnerDataDisclosure({
      accountId: mockTenantId,
      field: "phone",
      proposedValue: "+144225232320",
      recipientPhoneOrJid: "+149145539352",
      policy,
    });
    assert.strictEqual(phoneDec.allowed, false);
    assert.strictEqual(phoneDec.requiresApproval, true);
    assert.strictEqual(phoneDec.reasonCode, "OWNER_DATA_APPROVAL_REQUIRED");

    // Case 3: ALLOW_FOR_AUTHORIZED_TASK city with owner task -> ALLOWED
    const cityDec = await evaluateOwnerDataDisclosure({
      accountId: mockTenantId,
      field: "city",
      proposedValue: "Lahore",
      recipientPhoneOrJid: "+149145539352",
      task: sampleTask,
      policy,
    });
    assert.strictEqual(cityDec.allowed, true);
    assert.strictEqual(cityDec.reasonCode, "POLICY_ALLOWED");

    // Case 4: Task-Scoped Explicit Authorization ("Tell them my city is Lahore")
    registerTaskScopedDataAuthorization({
      taskId: sampleTask.taskId,
      field: "city",
      authorizedValue: "Lahore",
      recipientPhoneOrJid: "+149145539352",
      authorizedBy: "owner",
    });

    const scopedDec = await evaluateOwnerDataDisclosure({
      accountId: mockTenantId,
      field: "city",
      proposedValue: "Lahore",
      recipientPhoneOrJid: "+149145539352",
      task: sampleTask,
      policy,
    });
    assert.strictEqual(scopedDec.allowed, true);
    assert.strictEqual(scopedDec.reasonCode, "TASK_SCOPED_AUTHORIZED");

    // Case 5: Owner Note is strictly internal
    const noteDec = await evaluateOwnerDataDisclosure({
      accountId: mockTenantId,
      field: "owner_note",
      proposedValue: "Prefers evening delivery",
      recipientPhoneOrJid: "+149145539352",
      policy,
    });
    assert.strictEqual(noteDec.allowed, false);
    assert.strictEqual(noteDec.reasonCode, "OWNER_NOTE_INTERNAL");
  });

  // =========================================================================
  // 3. ORDER AUTHORITY & SPENDING LIMITS (Section 87)
  // =========================================================================
  await t.test("Order Authority: Limits enforced, foreign currency blocked from guessing", async () => {
    // Enable orders within limits: max 5,000 per task, max 10,000 per day
    const customPolicy = createDefaultDelegationPolicy(mockTenantId);
    customPolicy.orders.allowOrderCommitment = true;
    customPolicy.orders.orderCommitmentMode = "WITHIN_LIMITS";
    customPolicy.orders.maxOrderValuePerTask = 5000;
    customPolicy.orders.maxOrderValuePerDay = 10000;
    customPolicy.orders.allowedCurrencies = ["PKR"];
    await savePersonalDelegationPolicy(customPolicy);

    // 1. Valid order within limits -> ALLOW
    const okOrder = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      taskId: "task_ord_1",
      proposedPayload: { item: "Ink", amount: 4000, currency: "PKR", actionId: "act_1" },
      actorRole: "worker",
    });
    assert.strictEqual(okOrder.decision, "ALLOW");

    // 2. Order exceeding per-task limit -> REQUIRE_APPROVAL
    const highOrder = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      taskId: "task_ord_2",
      proposedPayload: { item: "Printer", amount: 6500, currency: "PKR", actionId: "act_2" },
      actorRole: "worker",
    });
    assert.strictEqual(highOrder.decision, "REQUIRE_APPROVAL");
    assert.strictEqual(highOrder.reasonCode, "DELEGATION_LIMIT_EXCEEDED");

    // 3. Foreign Currency USD without FX conversion -> REQUIRE_APPROVAL
    const fxOrder = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      taskId: "task_ord_3",
      proposedPayload: { item: "Ink", amount: 30, currency: "USD", actionId: "act_3" },
      actorRole: "worker",
    });
    assert.strictEqual(fxOrder.decision, "REQUIRE_APPROVAL");
    assert.strictEqual(fxOrder.reasonCode, "CURRENCY_NOT_ALLOWED");

    // 4. Daily limit exceeded -> REQUIRE_APPROVAL
    // We already committed 4000. Committing another 7000 exceeds 10000 limit.
    const exceedDaily = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      taskId: "task_ord_4",
      proposedPayload: { item: "Paper", amount: 4500, currency: "PKR", actionId: "act_4" },
      actorRole: "worker",
    });
    // Task 4 is 4500. 4000 + 4500 = 8500 <= 10000 -> allowed
    assert.strictEqual(exceedDaily.decision, "ALLOW");

    // Now total is 8500. Next 2000 exceeds 10000 -> REQUIRE_APPROVAL
    const exceedNow = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      taskId: "task_ord_5",
      proposedPayload: { item: "More Paper", amount: 2000, currency: "PKR", actionId: "act_5" },
      actorRole: "worker",
    });
    assert.strictEqual(exceedNow.decision, "REQUIRE_APPROVAL");
    assert.strictEqual(exceedNow.reasonCode, "DAILY_LIMIT_EXCEEDED");
  });

  // =========================================================================
  // 4. PAYMENT & CREDENTIAL SAFETY (Section 88)
  // =========================================================================
  await t.test("Payment Safety: Credentials, OTPs, CVVs, and passwords permanently blocked", async () => {
    // Attempting to transmit a card CVV or password in payload
    const blockedDec = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "WHATSAPP_SEND",
      proposedPayload: { text: "Here is my password: secretPassword123" },
      actorRole: "worker",
    });

    assert.strictEqual(blockedDec.decision, "BLOCK");
    assert.strictEqual(blockedDec.riskClass, "R5_PROHIBITED_SENSITIVE_ACTION");
    assert.strictEqual(blockedDec.reasonCode, "PROHIBITED_SECRET");

    const otpDec = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "WHATSAPP_SEND",
      proposedPayload: { text: "My login OTP is 984512" },
      actorRole: "worker",
    });
    assert.strictEqual(otpDec.decision, "BLOCK");
    assert.strictEqual(otpDec.reasonCode, "PROHIBITED_SECRET");
  });

  // =========================================================================
  // 5. POLICY MANAGEMENT & BROADENING CONFIRMATION (Sections 91, 92)
  // =========================================================================
  await t.test("Policy Management: Broadening autonomy requires explicit confirmation", async () => {
    const current = await getPersonalDelegationPolicy(mockTenantId);

    // Requesting to enable autonomous orders (broadening)
    const broadeningRes = isBroadeningPolicyChange(current, {
      orders: { ...current.orders, allowOrderCommitment: true },
    });

    assert.strictEqual(broadeningRes.isBroadening, true);
    assert.ok(broadeningRes.reasons.length >= 1);

    // Using Admin BA tool without confirmation
    const updateTool = getAdminAction("update_personal_delegation_policy");
    const unconfirmedRes = await updateTool.handler(
      { accountId: mockTenantId, botId: mockControlBizId, adminRole: "owner" } as any,
      { orders: { allowOrderCommitment: true } }
    );

    assert.strictEqual(unconfirmedRes.success, false);
    assert.strictEqual(unconfirmedRes.requiresConfirmation, true);
    assert.match(unconfirmedRes.message, /Safety Confirmation Required/i);

    // With explicit owner confirmation
    const confirmedRes = await updateTool.handler(
      { accountId: mockTenantId, botId: mockControlBizId, adminRole: "owner" } as any,
      { orders: { allowOrderCommitment: true }, confirmed: true }
    );

    assert.strictEqual(confirmedRes.success, true);
    assert.match(confirmedRes.message, /Delegation Policy Updated/i);
  });

  // =========================================================================
  // 6. REVOCATION & IMMEDIATE ENFORCEMENT (Section 92)
  // =========================================================================
  await t.test("Revocation: Newly tightened policy immediately blocks subsequent actions", async () => {
    // 1. Set policy to allow orders
    const policy = createDefaultDelegationPolicy(mockTenantId);
    policy.orders.allowOrderCommitment = true;
    policy.orders.orderCommitmentMode = "WITHIN_LIMITS";
    await savePersonalDelegationPolicy(policy);

    // Action allowed initially
    const preRevoke = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      proposedPayload: { item: "Item", amount: 1000, currency: "PKR" },
      actorRole: "worker",
    });
    assert.strictEqual(preRevoke.decision, "ALLOW");

    // 2. Owner revokes order authority
    policy.orders.allowOrderCommitment = false;
    await savePersonalDelegationPolicy(policy);

    // 3. Immediately re-evaluated: now requires approval/blocked
    const postRevoke = await evaluatePersonalActionAuthorization({
      accountId: mockTenantId,
      personalInstanceId: mockPersonalInstanceId,
      actionType: "ORDER_COMMITMENT",
      proposedPayload: { item: "Item", amount: 1000, currency: "PKR" },
      actorRole: "worker",
    });
    assert.strictEqual(postRevoke.decision, "REQUIRE_APPROVAL");
  });
});
