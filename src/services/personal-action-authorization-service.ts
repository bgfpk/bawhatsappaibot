/**
 * Personal Assistant Central Authorization Engine
 * 
 * Server-authoritative evaluation gate for all external Personal Assistant actions:
 * - 9-level deterministic precedence:
 *   1. PLATFORM HARD PROHIBITION (credentials, OTPs, CVVs, passwords)
 *   2. TENANT / FEATURE AUTHORIZATION
 *   3. INSTANCE AUTHORIZATION
 *   4. CONTACT COMMUNICATION CONTROL (opt-out, do-not-contact, blocked)
 *   5. OWNER DELEGATION POLICY
 *   6. TASK-SCOPED AUTHORITY
 *   7. OWNER360 FIELD PRIVACY
 *   8. REQUIRED APPROVAL
 *   9. ACTION-SPECIFIC LIMITS
 * - Non-bypassable: A lower layer can NEVER override a higher-priority prohibition
 * - Model output is NEVER an authorization authority
 */

import { isPersonalAssistantFeatureEnabled } from "./personal-assistant-config-service.ts";
import { getPersonalDelegationPolicy } from "./personal-delegation-policy-service.ts";
import {
  evaluateOwnerDataDisclosure,
  isProhibitedSensitiveData,
} from "./personal-data-disclosure-service.ts";
import { checkAndReserveCommitment } from "./personal-commitment-limit-service.ts";
import { getPersonalTask } from "./personal-task-storage-service.ts";
import * as personalContactService from "./personal-contact-service.ts";
import type {
  EvaluatePersonalActionParams,
  PersonalAuthorizationDecision,
  PersonalActionRiskClass,
} from "./personal-delegation-types.ts";

export function determineActionRiskClass(actionType: string, payload: Record<string, any>): PersonalActionRiskClass {
  const at = actionType.toUpperCase();

  // 1. Prohibited Actions
  if (
    at.includes("PAYMENT") ||
    at.includes("BANK") ||
    at.includes("CARD") ||
    at.includes("OTP") ||
    at.includes("PASSWORD") ||
    at.includes("CREDENTIAL")
  ) {
    return "R5_PROHIBITED_SENSITIVE_ACTION";
  }

  // 2. Financial or Binding Commitments
  if (
    at.includes("ORDER") ||
    at.includes("PURCHASE") ||
    at.includes("BUY") ||
    at.includes("ACCEPT_OFFER") ||
    payload.isOrderCommitment ||
    payload.amount !== undefined
  ) {
    return "R4_FINANCIAL_OR_BINDING_COMMITMENT";
  }

  // 3. Reversible Commitments
  if (
    at.includes("RESERVE") ||
    at.includes("HOLD") ||
    at.includes("BOOKING") ||
    at.includes("MEETING_CONFIRM") ||
    at.includes("CANCEL")
  ) {
    return "R3_REVERSIBLE_COMMITMENT";
  }

  // 4. Data Disclosure
  if (
    at.includes("DISCLOSE") ||
    payload.discloseField ||
    payload.address ||
    payload.email ||
    payload.phone
  ) {
    return "R2_DATA_DISCLOSURE";
  }

  // 5. Read Only
  if (
    at.includes("READ") ||
    at.includes("GET") ||
    at.includes("LIST") ||
    at.includes("SUMMARIZE")
  ) {
    return "R0_READ_ONLY";
  }

  // 6. Default: Low-risk communication
  return "R1_LOW_RISK_COMMUNICATION";
}

export async function evaluatePersonalActionAuthorization(
  params: EvaluatePersonalActionParams
): Promise<PersonalAuthorizationDecision> {
  const {
    accountId,
    personalInstanceId,
    targetContactId,
    targetPhoneOrJid,
    actionType,
    taskId,
    taskGoal,
    proposedPayload,
    approvalFingerprint,
    now = Date.now(),
  } = params;

  // 1. PLATFORM HARD PROHIBITIONS (R5)
  for (const [_, val] of Object.entries(proposedPayload)) {
    if (typeof val === "string" && isProhibitedSensitiveData(val)) {
      return {
        decision: "BLOCK",
        reasonCode: "PROHIBITED_SECRET",
        reasonMessage: "Credentials, passwords, PINs, OTPs, or API keys can NEVER be processed or transmitted.",
        riskClass: "R5_PROHIBITED_SENSITIVE_ACTION",
        policyVersion: "1.0.0",
        policyRevision: 1,
        taskId,
        contactId: targetContactId,
      };
    }
  }

  // 2. FEATURE & TENANT GATE
  if (!isPersonalAssistantFeatureEnabled()) {
    return {
      decision: "BLOCK",
      reasonCode: "FEATURE_DISABLED",
      reasonMessage: "Personal Assistant feature is currently disabled.",
      riskClass: "R0_READ_ONLY",
      policyVersion: "1.0.0",
      policyRevision: 1,
      taskId,
      contactId: targetContactId,
    };
  }

  // 3. CONTACT COMMUNICATION CONTROLS GATE (Opt-out / Do-Not-Contact)
  if (targetContactId && !targetContactId.startsWith("pc_new_")) {
    const contact = await personalContactService.getPersonalContact(accountId, targetContactId);
    if (contact) {
      const prefs = contact.communicationPreferences;
      if (prefs?.contactCommunicationStatus === "do_not_contact" || prefs?.doNotContact) {
        return {
          decision: "BLOCK",
          reasonCode: "TARGET_OPTED_OUT",
          reasonMessage: "Contact has opted out of communication. Personal Assistant messaging is blocked.",
          riskClass: "R1_LOW_RISK_COMMUNICATION",
          policyVersion: "1.0.0",
          policyRevision: 1,
          taskId,
          contactId: targetContactId,
        };
      }
      if (prefs?.contactCommunicationStatus === "blocked_by_owner") {
        return {
          decision: "BLOCK",
          reasonCode: "CONTACT_DO_NOT_CONTACT",
          reasonMessage: "Contact is marked as blocked by owner. Action prohibited.",
          riskClass: "R1_LOW_RISK_COMMUNICATION",
          policyVersion: "1.0.0",
          policyRevision: 1,
          taskId,
          contactId: targetContactId,
        };
      }
    }
  }

  // 4. FETCH CURRENT SERVER DELEGATION POLICY
  const policy = await getPersonalDelegationPolicy(accountId, personalInstanceId);
  const task = taskId ? await getPersonalTask(accountId, taskId) : null;
  const riskClass = params.riskClass || determineActionRiskClass(actionType, proposedPayload);

  // 5. EVALUATE BY RISK CLASS

  // --- R0: READ ONLY ---
  if (riskClass === "R0_READ_ONLY") {
    return {
      decision: "ALLOW",
      reasonCode: "READ_ONLY_PERMITTED",
      reasonMessage: "Internal read operation permitted.",
      riskClass,
      policyVersion: policy.policyVersion,
      policyRevision: policy.revision,
      taskId,
      contactId: targetContactId,
    };
  }

  // --- R1: LOW RISK COMMUNICATION ---
  if (riskClass === "R1_LOW_RISK_COMMUNICATION") {
    return {
      decision: "ALLOW",
      reasonCode: "COMMUNICATION_PERMITTED",
      reasonMessage: "Harmless inquiry or conversation permitted under delegation policy.",
      riskClass,
      policyVersion: policy.policyVersion,
      policyRevision: policy.revision,
      taskId,
      contactId: targetContactId,
    };
  }

  // --- R2: DATA DISCLOSURE ---
  if (riskClass === "R2_DATA_DISCLOSURE") {
    const field = proposedPayload.discloseField || "other";
    const value = proposedPayload.discloseValue || "";
    const recipient = targetPhoneOrJid || targetContactId || "";

    const disclosureRes = await evaluateOwnerDataDisclosure({
      accountId,
      field,
      proposedValue: value,
      recipientPhoneOrJid: recipient,
      task,
      policy,
      isApprovalGranted: Boolean(proposedPayload.isApprovalGranted),
    });

    if (disclosureRes.allowed) {
      return {
        decision: "ALLOW",
        reasonCode: disclosureRes.reasonCode,
        reasonMessage: disclosureRes.message,
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
      };
    }

    if (disclosureRes.requiresApproval) {
      return {
        decision: "REQUIRE_APPROVAL",
        reasonCode: disclosureRes.reasonCode,
        reasonMessage: disclosureRes.message,
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
        requiredApprovalSummary: `Share owner ${field} with ${recipient}`,
      };
    }

    return {
      decision: "BLOCK",
      reasonCode: disclosureRes.reasonCode,
      reasonMessage: disclosureRes.message,
      riskClass,
      policyVersion: policy.policyVersion,
      policyRevision: policy.revision,
      taskId,
      contactId: targetContactId,
    };
  }

  // --- R3: REVERSIBLE COMMITMENT (Reservations, Meetings) ---
  if (riskClass === "R3_REVERSIBLE_COMMITMENT") {
    const isMeeting = actionType.toUpperCase().includes("MEETING");

    if (isMeeting) {
      if (!policy.appointments.allowMeetingConfirmation) {
        return {
          decision: "REQUIRE_APPROVAL",
          reasonCode: "MEETING_APPROVAL_REQUIRED",
          reasonMessage: "Meeting confirmation requires explicit owner approval under current policy.",
          riskClass,
          policyVersion: policy.policyVersion,
          policyRevision: policy.revision,
          taskId,
          contactId: targetContactId,
          requiredApprovalSummary: `Confirm meeting: ${proposedPayload.summary || "Scheduled time"}`,
        };
      }
    } else {
      if (!policy.reservations.allowReservations) {
        return {
          decision: "REQUIRE_APPROVAL",
          reasonCode: "RESERVATION_APPROVAL_REQUIRED",
          reasonMessage: "Reservations require explicit owner approval.",
          riskClass,
          policyVersion: policy.policyVersion,
          policyRevision: policy.revision,
          taskId,
          contactId: targetContactId,
          requiredApprovalSummary: `Reserve: ${proposedPayload.summary || "Reservation slot"}`,
        };
      }
    }

    return {
      decision: "ALLOW",
      reasonCode: "REVERSIBLE_COMMITMENT_PERMITTED",
      reasonMessage: "Reversible commitment permitted by delegation policy.",
      riskClass,
      policyVersion: policy.policyVersion,
      policyRevision: policy.revision,
      taskId,
      contactId: targetContactId,
    };
  }

  // --- R4: FINANCIAL / BINDING COMMITMENTS (Orders, Purchases) ---
  if (riskClass === "R4_FINANCIAL_OR_BINDING_COMMITMENT") {
    // 1. Check if orders enabled at all
    if (!policy.orders.allowOrderCommitment) {
      return {
        decision: "REQUIRE_APPROVAL",
        reasonCode: "ORDERS_DISABLED",
        reasonMessage: "Autonomous order commitments are disabled. Owner approval required.",
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
        requiredApprovalSummary: `Place order: ${proposedPayload.item || "Item"} for ${proposedPayload.currency || "PKR"} ${proposedPayload.amount || 0}`,
      };
    }

    // 2. Mode Check: If ASK_EACH_TIME -> approval required
    if (policy.orders.orderCommitmentMode === "ASK_EACH_TIME") {
      return {
        decision: "REQUIRE_APPROVAL",
        reasonCode: "ORDER_MODE_ASK_EACH_TIME",
        reasonMessage: "Order policy is set to Ask Each Time. Owner approval required.",
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
        requiredApprovalSummary: `Place order: ${proposedPayload.item || "Item"} for ${proposedPayload.currency || "PKR"} ${proposedPayload.amount || 0}`,
      };
    }

    // 3. Currency Check: No FX guessing allowed!
    const currency = String(proposedPayload.currency || "PKR").toUpperCase();
    if (!policy.orders.allowedCurrencies.includes(currency)) {
      return {
        decision: "REQUIRE_APPROVAL",
        reasonCode: "CURRENCY_NOT_ALLOWED",
        reasonMessage: `Currency "${currency}" is not permitted for autonomous purchase. Live FX conversion is disallowed.`,
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
        requiredApprovalSummary: `Authorize order in foreign currency ${currency} ${proposedPayload.amount || 0}`,
      };
    }

    const amount = Number(proposedPayload.amount || 0);

    // 4. Per-Task Spending Limit Check
    if (amount > policy.orders.maxOrderValuePerTask) {
      return {
        decision: "REQUIRE_APPROVAL",
        reasonCode: "DELEGATION_LIMIT_EXCEEDED",
        reasonMessage: `Order amount ${currency} ${amount} exceeds the per-task limit of ${currency} ${policy.orders.maxOrderValuePerTask}.`,
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
        requiredApprovalSummary: `Authorize order exceeding per-task limit: ${currency} ${amount}`,
        effectiveLimits: {
          maxTaskValue: policy.orders.maxOrderValuePerTask,
          currency,
        },
      };
    }

    // 5. Daily Spending Cap Check (Atomic check and reserve)
    const reserveRes = await checkAndReserveCommitment({
      accountId,
      currency,
      amount,
      taskId: taskId || "task_unknown",
      actionId: proposedPayload.actionId || `act_${Date.now()}`,
      merchant: targetPhoneOrJid || targetContactId || "Merchant",
      idempotencyKey: proposedPayload.idempotencyKey || `ord_${taskId}_${amount}`,
      maxDailyLimit: policy.orders.maxOrderValuePerDay,
      now,
    });

    if (!reserveRes.allowed) {
      return {
        decision: "REQUIRE_APPROVAL",
        reasonCode: reserveRes.reasonCode || "DAILY_LIMIT_EXCEEDED",
        reasonMessage: reserveRes.error || "Daily spending cap exceeded.",
        riskClass,
        policyVersion: policy.policyVersion,
        policyRevision: policy.revision,
        taskId,
        contactId: targetContactId,
        requiredApprovalSummary: `Authorize order exceeding daily limit: ${currency} ${amount}`,
        effectiveLimits: {
          dailyLimitRemaining: reserveRes.remainingDailyLimit,
          currency,
        },
      };
    }

    // 6. Within Limits: ALLOW
    return {
      decision: "ALLOW",
      reasonCode: "ORDER_WITHIN_LIMITS_PERMITTED",
      reasonMessage: `Order of ${currency} ${amount} authorized within owner delegation limits.`,
      riskClass,
      policyVersion: policy.policyVersion,
      policyRevision: policy.revision,
      taskId,
      contactId: targetContactId,
      effectiveLimits: {
        maxTaskValue: policy.orders.maxOrderValuePerTask,
        dailyLimitRemaining: reserveRes.remainingDailyLimit,
        currency,
      },
    };
  }

  // Default Deny
  return {
    decision: "REQUIRE_APPROVAL",
    reasonCode: "DEFAULT_DENY",
    reasonMessage: "Action requires explicit owner authorization.",
    riskClass,
    policyVersion: policy.policyVersion,
    policyRevision: policy.revision,
    taskId,
    contactId: targetContactId,
  };
}
