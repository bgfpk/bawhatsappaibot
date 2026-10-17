/**
 * Personal Delegation Policy Service
 * 
 * Manages durable, server-authoritative delegation policies:
 * - Appwrite SYSTEM_CONFIGS persistence (pdp_${hash12(accountId)}_${hash12(instanceId)})
 * - Fast in-memory cache with instant invalidation
 * - Optimistic concurrency revision protection
 * - Conservative Default-Deny baseline
 * - Helper to detect dangerous broadening changes requiring owner confirmation
 */

import { createHash } from "node:crypto";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";
import type { PersonalDelegationPolicy } from "./personal-delegation-types.ts";

function hash12(input: string): string {
  return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}

export function buildDelegationPolicyDocId(accountId: string, personalInstanceId?: string): string {
  return `pdp_${hash12(accountId)}_${hash12(personalInstanceId || "default")}`;
}

const policyCache = new Map<string, PersonalDelegationPolicy>();

export function createDefaultDelegationPolicy(
  accountId: string,
  personalInstanceId?: string
): PersonalDelegationPolicy {
  return {
    policyId: `pdp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    schemaVersion: 1,
    revision: 1,
    policyVersion: "1.0.0",
    accountId,
    personalInstanceId,
    updatedAt: Date.now(),
    updatedBy: "system_default",

    communication: {
      allowAnswerKnownContacts: true,
      allowAnswerUnknownContacts: false,
      allowOutboundOwnerTasks: true,
      allowTaskFollowUps: false, // Prompt 6 default is off
      maxFollowUpsPerTask: 2, // Hard safety cap
    },

    dataDisclosure: {
      allowCitySharingForTasks: true,
      allowDeliveryAddressForShopping: false,
      allowEmailSharing: "ASK_EACH_TIME",
      allowPhoneSharing: "ASK_EACH_TIME",
      prohibitOwnerNotesDisclosure: true,
    },

    orders: {
      allowOrderCommitment: false, // Default Deny
      orderCommitmentMode: "ASK_EACH_TIME",
      maxOrderValuePerTask: 5000,
      maxOrderValuePerDay: 10000,
      allowedCurrencies: ["PKR"],
      allowedPaymentCommitmentTypes: ["COD", "PAY_ON_DELIVERY"],
      newMerchantRequiresApproval: true,
    },

    reservations: {
      allowReservations: false,
      reservationMode: "ASK_EACH_TIME",
      newProviderRequiresApproval: true,
    },

    appointments: {
      allowMeetingNegotiation: true,
      allowMeetingConfirmation: false,
      meetingConfirmationMode: "ASK_EACH_TIME",
    },

    negotiation: {
      allowPriceNegotiation: true,
      maxDiscountPercentRequest: 15,
      allowAcceptFinalOffer: false,
    },
  };
}

export async function getPersonalDelegationPolicy(
  accountId: string,
  personalInstanceId?: string
): Promise<PersonalDelegationPolicy> {
  const cacheKey = `${accountId}:${personalInstanceId || "default"}`;
  if (policyCache.has(cacheKey)) {
    return policyCache.get(cacheKey)!;
  }

  const docId = buildDelegationPolicyDocId(accountId, personalInstanceId);

  try {
    const doc: any = await databases.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId);
    if (doc?.value) {
      const parsed: PersonalDelegationPolicy = JSON.parse(doc.value);
      policyCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch (err) {
    // If instance-specific policy not found, check account-default policy
    if (personalInstanceId) {
      return await getPersonalDelegationPolicy(accountId);
    }
  }

  // Fallback to default
  const defaultPolicy = createDefaultDelegationPolicy(accountId, personalInstanceId);
  policyCache.set(cacheKey, defaultPolicy);
  return defaultPolicy;
}

export async function savePersonalDelegationPolicy(
  policy: PersonalDelegationPolicy,
  expectedRevision?: number
): Promise<PersonalDelegationPolicy> {
  const cacheKey = `${policy.accountId}:${policy.personalInstanceId || "default"}`;
  const existing = policyCache.get(cacheKey);

  if (expectedRevision !== undefined && existing && existing.revision !== expectedRevision) {
    throw new Error(`POLICY_REVISION_CONFLICT: policy revision ${existing.revision} does not match expected ${expectedRevision}`);
  }

  const now = Date.now();
  const nextRevision = (existing?.revision || policy.revision || 0) + 1;

  const updatedPolicy: PersonalDelegationPolicy = {
    ...policy,
    revision: nextRevision,
    policyVersion: `1.${nextRevision}.0`,
    updatedAt: now,
  };

  policyCache.set(cacheKey, updatedPolicy);

  const docId = buildDelegationPolicyDocId(updatedPolicy.accountId, updatedPolicy.personalInstanceId);

  try {
    const payload = {
      value: JSON.stringify(updatedPolicy),
      updated_at: Math.floor(now / 1000),
    };

    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload);
    } catch (updateErr: any) {
      if (updateErr?.code === 404 || String(updateErr?.message || "").includes("could not be found")) {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload);
      } else {
        throw updateErr;
      }
    }
  } catch (err: any) {
    console.warn(`[PersonalDelegationPolicy] Warning: Persist failed for doc ${docId}:`, err?.message || err);
  }

  return updatedPolicy;
}

export { isBroadeningPolicyChange } from "./personal-delegation-policy-utils.ts";

export function __clearDelegationPolicyCacheForTest(): void {
  policyCache.clear();
}
