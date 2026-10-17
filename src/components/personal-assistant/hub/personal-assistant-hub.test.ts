/**
 * Personal Assistant Hub Unit Tests
 * 
 * Tests deterministic attention sorting, safe phone normalization,
 * relative time formatting, and policy broadening checks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  sortAttentionQueue,
  formatSafePhone,
  formatRelativeTime,
  ATTENTION_PRIORITY_MAP,
} from "./hub-utils.ts";
import type { AttentionItem } from "./hub-types.ts";
import { isBroadeningPolicyChange } from "../../../services/personal-delegation-policy-utils.ts";
import type { PersonalDelegationPolicy } from "../../../services/personal-delegation-types.ts";
import {
  removeSelectedDriveFile,
  __clearSelectedDriveFilesForTest,
} from "../../../services/google-drive-file-service.ts";

test("Attention Queue: deterministic priority ordering (P1 to P6)", () => {
  const items: AttentionItem[] = [
    {
      id: "item_notice",
      priority: 6,
      type: "notice",
      title: "Notice",
      description: "Low priority",
      timestamp: 1000,
    },
    {
      id: "item_approval",
      priority: 1,
      type: "approval_required",
      title: "Approval",
      description: "Action needs approval",
      timestamp: 3000,
    },
    {
      id: "item_google",
      priority: 4,
      type: "google_issue",
      title: "Google Issue",
      description: "Reauth needed",
      timestamp: 2000,
    },
    {
      id: "item_question",
      priority: 2,
      type: "owner_question_required",
      title: "Question",
      description: "Owner input needed",
      timestamp: 4000,
    },
    {
      id: "item_takeover",
      priority: 5,
      type: "manual_takeover",
      title: "Takeover",
      description: "Owner took over",
      timestamp: 1500,
    },
    {
      id: "item_failed",
      priority: 3,
      type: "failed_task",
      title: "Task Failed",
      description: "Retryable error",
      timestamp: 2500,
    },
  ];

  const sorted = sortAttentionQueue(items);

  assert.strictEqual(sorted[0].type, "approval_required");
  assert.strictEqual(sorted[1].type, "owner_question_required");
  assert.strictEqual(sorted[2].type, "failed_task");
  assert.strictEqual(sorted[3].type, "google_issue");
  assert.strictEqual(sorted[4].type, "manual_takeover");
  assert.strictEqual(sorted[5].type, "notice");
});

test("Attention Queue: oldest unresolved item first within same priority", () => {
  const items: AttentionItem[] = [
    {
      id: "appr_newer",
      priority: 1,
      type: "approval_required",
      title: "Newer Approval",
      description: "Requested 10m ago",
      timestamp: 20000,
    },
    {
      id: "appr_oldest",
      priority: 1,
      type: "approval_required",
      title: "Oldest Approval",
      description: "Requested 1h ago",
      timestamp: 5000,
    },
    {
      id: "appr_middle",
      priority: 1,
      type: "approval_required",
      title: "Middle Approval",
      description: "Requested 30m ago",
      timestamp: 10000,
    },
  ];

  const sorted = sortAttentionQueue(items);

  assert.strictEqual(sorted[0].id, "appr_oldest");
  assert.strictEqual(sorted[1].id, "appr_middle");
  assert.strictEqual(sorted[2].id, "appr_newer");
});

test("Safe Phone Normalization: NEVER outputs raw LID as phone number", () => {
  // WhatsApp LID JID without canonical phone
  const lidResult = formatSafePhone("12345678901234@lid");
  assert.strictEqual(lidResult, "WhatsApp Identity (LID)");
  assert.ok(!lidResult.includes("12172025519434"));

  // WhatsApp Phone JID
  const pnResult = formatSafePhone("contact-e4ed32210a80@example.invalid");
  assert.strictEqual(pnResult, "+92 300 1234567");

  // Fallback explicit phone if LID provided with trusted phone
  const lidWithPhone = formatSafePhone("12345678901234@lid", "135351162196");
  assert.strictEqual(lidWithPhone, "+92 300 7654321");

  // No phone / empty
  assert.strictEqual(formatSafePhone(""), "Unknown Contact");
});

test("Relative Time Formatter: returns clean human time intervals", () => {
  const now = Date.now();

  assert.strictEqual(formatRelativeTime(0), "Never");
  assert.strictEqual(formatRelativeTime(now - 10 * 1000), "10s ago");
  assert.strictEqual(formatRelativeTime(now - 5 * 60 * 1000), "5m ago");
  assert.strictEqual(formatRelativeTime(now - 3 * 3600 * 1000), "3h ago");
  assert.strictEqual(formatRelativeTime(now - 2 * 86400 * 1000), "2d ago");
});

test("Policy Broadening Checks: detects risk escalation", () => {
  const basePolicy: PersonalDelegationPolicy = {
    policyId: "pol_test",
    schemaVersion: 1,
    revision: 1,
    policyVersion: "1.0",
    accountId: "acc_test",
    updatedAt: Date.now(),
    updatedBy: "owner",
    communication: {
      allowAnswerKnownContacts: true,
      allowAnswerUnknownContacts: false,
      allowOutboundOwnerTasks: true,
      allowTaskFollowUps: true,
      maxFollowUpsPerTask: 1,
    },
    dataDisclosure: {
      allowCitySharingForTasks: true,
      allowDeliveryAddressForShopping: false,
      allowEmailSharing: "NEVER",
      allowPhoneSharing: "NEVER",
      prohibitOwnerNotesDisclosure: true,
    },
    orders: {
      allowOrderCommitment: false,
      orderCommitmentMode: "ASK_EACH_TIME",
      maxOrderValuePerTask: 2000,
      maxOrderValuePerDay: 5000,
      allowedCurrencies: ["PKR"],
      allowedPaymentCommitmentTypes: ["COD"],
      newMerchantRequiresApproval: true,
    },
    reservations: {
      allowReservations: false,
      reservationMode: "ASK_EACH_TIME",
      newProviderRequiresApproval: true,
    },
    appointments: {
      allowMeetingNegotiation: false,
      allowMeetingConfirmation: false,
      meetingConfirmationMode: "ASK_EACH_TIME",
    },
    negotiation: {
      allowPriceNegotiation: false,
      allowAcceptFinalOffer: false,
    },
  };

  // 1. Enabling order commitment is broadening
  const res1 = isBroadeningPolicyChange(basePolicy, {
    orders: { ...basePolicy.orders, allowOrderCommitment: true },
  });
  assert.strictEqual(res1.isBroadening, true);
  assert.ok(res1.reasons.some((r) => r.includes("autonomous order commitments")));

  // 2. Increasing daily limit is broadening
  const res2 = isBroadeningPolicyChange(basePolicy, {
    orders: { ...basePolicy.orders, maxOrderValuePerDay: 15000 },
  });
  assert.strictEqual(res2.isBroadening, true);
  assert.ok(res2.reasons.some((r) => r.includes("daily order limit")));

  // 3. Decreasing limits is NOT broadening
  const res3 = isBroadeningPolicyChange(basePolicy, {
    orders: { ...basePolicy.orders, maxOrderValuePerDay: 3000 },
  });
  assert.strictEqual(res3.isBroadening, false);
});

test("Google Drive File Service: removeSelectedDriveFile unlinks file authorization", () => {
  __clearSelectedDriveFilesForTest();

  // Non-existent file returns false
  assert.strictEqual(removeSelectedDriveFile("acc_user_1", "file_nonexistent"), false);
});
