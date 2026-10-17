/**
 * Personal Data Disclosure Service
 * 
 * Field-level governance enforcing Owner360 privacy and delegation policy:
 * - PRIVATE: Never externally disclosed
 * - ASK_BEFORE_SHARE: Requires exact owner approval
 * - ALLOW_FOR_AUTHORIZED_TASK: Requires authorized task + policy match + correct recipient
 * - Data minimization: disclose only what the specific task requires
 * - Task-scoped authorization registry (temporary, task-bound, does NOT pollute Owner360)
 * - R5 Prohibited secrets are permanently blocked
 */

import { getOwnerProfile } from "./owner360-service.ts";
import type {
  PersonalOwnerDataCategory,
  PersonalDelegationPolicy,
  TaskScopedDataAuthorization,
} from "./personal-delegation-types.ts";
import type { PersonalTask } from "./personal-task-types.ts";
import type { OwnerDataPrivacyPolicy } from "./owner360-types.ts";

const taskScopedAuthStore = new Map<string, TaskScopedDataAuthorization[]>();

export function isProhibitedSensitiveData(value: string): boolean {
  if (!value) return false;
  const lv = value.toLowerCase();
  // Passwords, PINs, OTPs, CVVs, API tokens, Private keys
  if (
    lv.includes("password") ||
    lv.includes("otp") ||
    lv.includes("cvv") ||
    lv.includes("pin:") ||
    lv.includes("secret_key") ||
    lv.includes("bearer ") ||
    lv.includes("sk_live_")
  ) {
    return true;
  }
  return false;
}

export function registerTaskScopedDataAuthorization(params: {
  taskId: string;
  field: PersonalOwnerDataCategory;
  authorizedValue: string;
  recipientPhoneOrJid: string;
  authorizedBy: string;
  expiryMs?: number;
}): TaskScopedDataAuthorization {
  const { taskId, field, authorizedValue, recipientPhoneOrJid, authorizedBy, expiryMs = 24 * 3600 * 1000 } = params;
  const auth: TaskScopedDataAuthorization = {
    authorizationId: `tsda_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    taskId,
    field,
    authorizedValue: authorizedValue.trim(),
    recipientPhoneOrJid: recipientPhoneOrJid.trim(),
    authorizedAt: Date.now(),
    expiresAt: Date.now() + expiryMs,
    authorizedBy,
    scope: "single_task",
  };

  const list = taskScopedAuthStore.get(taskId) || [];
  list.push(auth);
  taskScopedAuthStore.set(taskId, list);
  return auth;
}

export function getTaskScopedDataAuthorization(
  taskId: string,
  field: PersonalOwnerDataCategory,
  recipientPhoneOrJid: string
): TaskScopedDataAuthorization | null {
  const list = taskScopedAuthStore.get(taskId) || [];
  const now = Date.now();
  for (const auth of list) {
    if (
      auth.field === field &&
      auth.recipientPhoneOrJid === recipientPhoneOrJid &&
      auth.expiresAt > now
    ) {
      return auth;
    }
  }
  return null;
}

export interface EvaluateOwnerDataDisclosureParams {
  accountId: string;
  field: PersonalOwnerDataCategory;
  proposedValue: string;
  recipientPhoneOrJid: string;
  task?: PersonalTask | null;
  policy: PersonalDelegationPolicy;
  isApprovalGranted?: boolean;
}

export interface OwnerDataDisclosureResult {
  allowed: boolean;
  requiresApproval: boolean;
  reasonCode: string;
  message: string;
  sanitizedValue?: string;
}

export async function evaluateOwnerDataDisclosure(
  params: EvaluateOwnerDataDisclosureParams
): Promise<OwnerDataDisclosureResult> {
  const {
    accountId,
    field,
    proposedValue,
    recipientPhoneOrJid,
    task,
    policy,
    isApprovalGranted,
  } = params;

  // 1. Hard Prohibited Secret Gate (R5)
  if (isProhibitedSensitiveData(proposedValue)) {
    return {
      allowed: false,
      requiresApproval: false,
      reasonCode: "PROHIBITED_SECRET",
      message: "Credentials, passwords, OTPs, and private keys can NEVER be disclosed.",
    };
  }

  // 2. Owner Notes Gate: Internal only by default
  if (field === "owner_note") {
    return {
      allowed: false,
      requiresApproval: false,
      reasonCode: "OWNER_NOTE_INTERNAL",
      message: "Owner notes are strictly internal context and cannot be disclosed externally.",
    };
  }

  // 3. Task-Scoped Explicit Authorization Gate
  if (task) {
    const taskAuth = getTaskScopedDataAuthorization(task.taskId, field, recipientPhoneOrJid);
    if (taskAuth && taskAuth.authorizedValue.toLowerCase() === proposedValue.trim().toLowerCase()) {
      return {
        allowed: true,
        requiresApproval: false,
        reasonCode: "TASK_SCOPED_AUTHORIZED",
        message: "Explicitly authorized by owner for this task.",
        sanitizedValue: taskAuth.authorizedValue,
      };
    }
  }

  // 4. Check Owner360 Field Privacy Setting
  let fieldPrivacy: OwnerDataPrivacyPolicy = "PRIVATE";
  try {
    const profile = await getOwnerProfile(accountId);
    if (profile) {
      if (field === "city" || field === "address" || field === "delivery_address" || field === "work_address") {
        const addr = profile.addresses?.find((a) => a.isDefault) || profile.addresses?.[0];
        if (addr?.privacyPolicy) fieldPrivacy = addr.privacyPolicy;
      } else if (field === "email") {
        const em = profile.contactMethods?.find((c) => c.type === "email");
        if (em?.privacyPolicy) fieldPrivacy = em.privacyPolicy;
      } else if (field === "phone") {
        const ph = profile.contactMethods?.find((c) => c.type === "phone");
        if (ph?.privacyPolicy) fieldPrivacy = ph.privacyPolicy;
      } else if (field === "preferred_name" || field === "full_name") {
        if (profile.identity?.privacyPolicy) fieldPrivacy = profile.identity.privacyPolicy;
      }
    }
  } catch {
    fieldPrivacy = "PRIVATE";
  }

  // PRIVATE: never externally disclose
  if (fieldPrivacy === "PRIVATE") {
    return {
      allowed: false,
      requiresApproval: false,
      reasonCode: "OWNER_DATA_PRIVATE",
      message: `Owner data field "${field}" is marked PRIVATE. External disclosure is prohibited.`,
    };
  }

  // ASK_BEFORE_SHARE: requires exact owner approval
  if (fieldPrivacy === "ASK_BEFORE_SHARE") {
    if (isApprovalGranted) {
      return {
        allowed: true,
        requiresApproval: false,
        reasonCode: "APPROVAL_GRANTED",
        message: "Disclosure authorized by owner approval.",
        sanitizedValue: proposedValue,
      };
    }
    return {
      allowed: false,
      requiresApproval: true,
      reasonCode: "OWNER_DATA_APPROVAL_REQUIRED",
      message: `Owner data field "${field}" is set to Ask Before Share. Owner approval is required.`,
    };
  }

  // ALLOW_FOR_AUTHORIZED_TASK: verify task + policy
  if (fieldPrivacy === "ALLOW_FOR_AUTHORIZED_TASK") {
    if (!task || !task.createdByOwner) {
      return {
        allowed: false,
        requiresApproval: false,
        reasonCode: "TASK_NOT_AUTHORIZED",
        message: "Field is allowed only for owner-authorized tasks.",
      };
    }

    // Check specific policy allowances
    if (field === "city" && !policy.dataDisclosure.allowCitySharingForTasks) {
      return {
        allowed: false,
        requiresApproval: true,
        reasonCode: "POLICY_RESTRICTION",
        message: "City sharing is disabled in delegation policy. Approval required.",
      };
    }

    if ((field === "address" || field === "delivery_address") && !policy.dataDisclosure.allowDeliveryAddressForShopping) {
      return {
        allowed: false,
        requiresApproval: true,
        reasonCode: "POLICY_RESTRICTION",
        message: "Delivery address sharing requires owner approval under current policy.",
      };
    }

    if (field === "email" && policy.dataDisclosure.allowEmailSharing !== "AUTHORIZED_TASKS") {
      return {
        allowed: false,
        requiresApproval: true,
        reasonCode: "POLICY_RESTRICTION",
        message: "Email sharing requires owner approval under current policy.",
      };
    }

    if (field === "phone" && policy.dataDisclosure.allowPhoneSharing !== "AUTHORIZED_TASKS") {
      return {
        allowed: false,
        requiresApproval: true,
        reasonCode: "POLICY_RESTRICTION",
        message: "Phone sharing requires owner approval under current policy.",
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      reasonCode: "POLICY_ALLOWED",
      message: "Allowed for authorized task by owner policy.",
      sanitizedValue: proposedValue,
    };
  }

  // Default Deny
  return {
    allowed: false,
    requiresApproval: true,
    reasonCode: "DEFAULT_DENY",
    message: "Data disclosure requires explicit owner authorization.",
  };
}

export function __clearTaskScopedAuthForTest(): void {
  taskScopedAuthStore.clear();
}
