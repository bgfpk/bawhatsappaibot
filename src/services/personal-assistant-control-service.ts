/**
 * Personal Assistant Control Channel Guard Service
 * 
 * Enforces the critical architecture invariant:
 * Owner commands to a Personal Assistant instance MUST ONLY enter via an authorized
 * Admin Business Assistant session on the controlling Business WhatsApp instance.
 * Direct commands arriving on Personal Instances are strictly rejected.
 */

import {
  getInstancePurpose,
  normalizeInstancePurpose,
} from "./instance-purpose-service.ts";

export interface PersonalAssistantCommandAuthorizationInput {
  sourceInstanceId: string;
  sourceInstancePurpose?: string;
  sourceAccountId: string;
  targetPersonalInstanceId: string;
  targetPersonalInstancePurpose?: string;
  targetPersonalControlBusinessInstanceId?: string;
  targetAccountId: string;
  isAdminAuthorized?: boolean;
}

export interface PersonalAssistantCommandAuthorizationResult {
  authorized: boolean;
  reason?: string;
}

/**
 * Authorizes whether an owner command received on a source instance is permitted
 * to execute an action on a target personal assistant instance.
 */
export function authorizePersonalAssistantCommandSource(
  input: PersonalAssistantCommandAuthorizationInput
): PersonalAssistantCommandAuthorizationResult {
  const {
    sourceInstanceId,
    sourceInstancePurpose,
    sourceAccountId,
    targetPersonalInstanceId,
    targetPersonalInstancePurpose,
    targetPersonalControlBusinessInstanceId,
    targetAccountId,
    isAdminAuthorized,
  } = input;

  // 1. Admin must be authorized
  if (!isAdminAuthorized) {
    return {
      authorized: false,
      reason: "Sender is not an authorized administrator for this workspace.",
    };
  }

  // 2. Tenant isolation check
  if (!sourceAccountId || !targetAccountId || String(sourceAccountId).trim() !== String(targetAccountId).trim()) {
    return {
      authorized: false,
      reason: "Cross-tenant personal assistant command execution is strictly forbidden.",
    };
  }

  // 3. Source instance must be a Business instance
  const resolvedSourcePurpose = normalizeInstancePurpose(sourceInstancePurpose);
  if (resolvedSourcePurpose !== "business") {
    return {
      authorized: false,
      reason: "Owner instructions must only originate from a Business WhatsApp instance. Commands directly on Personal instances are not accepted.",
    };
  }

  // 4. Target instance must be a Personal instance
  const resolvedTargetPurpose = normalizeInstancePurpose(targetPersonalInstancePurpose);
  if (resolvedTargetPurpose !== "personal") {
    return {
      authorized: false,
      reason: "Target instance is not configured as a Personal Assistant instance.",
    };
  }

  // 5. Target instance must be linked to the source business instance
  if (!targetPersonalControlBusinessInstanceId || targetPersonalControlBusinessInstanceId.trim() !== sourceInstanceId.trim()) {
    return {
      authorized: false,
      reason: `Target personal instance is not controlled by business instance ${sourceInstanceId}.`,
    };
  }

  return {
    authorized: true,
  };
}

/**
 * Inbound gate check for direct messages arriving on a Personal WhatsApp instance.
 * Direct commands or prompt executions received directly on a Personal instance must fail closed.
 */
export function shouldRejectDirectPersonalInstanceOwnerCommand(instancePurpose?: string): boolean {
  return normalizeInstancePurpose(instancePurpose) === "personal";
}
