import * as dbService from "./db-service.ts";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
export const TRIAL_EXTENSION_USED_KEY = "trial_extension_used";
export const TRIAL_EXTENSION_USED_AT_KEY = "trial_extension_used_at";
export const TRIAL_EXTENSION_LEGACY_STATUS_KEY = "trial_extension_legacy_status";

export type TrialExtensionStatus = "USED" | "ELIGIBLE" | "UNKNOWN";

const defaultDeps = {
  getUser: dbService.getUser,
  updateUser: dbService.updateUser,
  getUserExtraConfigValue: dbService.getUserExtraConfigValue,
  saveUserExtraConfigPatch: dbService.saveUserExtraConfigPatch,
  hasHistoricalAuditRecord: async (_userId: string): Promise<boolean> => false,
  now: () => Math.floor(Date.now() / 1000),
};

const trialExtensionDeps = { ...defaultDeps };

export function __setAdminTrialExtensionTestDeps(overrides: Partial<typeof defaultDeps>) {
  Object.assign(trialExtensionDeps, overrides || {});
}

export function __resetAdminTrialExtensionTestDeps() {
  Object.assign(trialExtensionDeps, defaultDeps);
}

export function calculateThirtyDayTrialExtension(currentTrialExpiresAt: any, nowSeconds = Math.floor(Date.now() / 1000)) {
  const current = Number(currentTrialExpiresAt || 0);
  const normalizedCurrent = Number.isFinite(current)
    ? (current > 100000000000 ? Math.floor(current / 1000) : Math.floor(current))
    : 0;
  const requestedExpiry = Math.floor(nowSeconds) + THIRTY_DAYS_SECONDS;
  return Math.max(normalizedCurrent, requestedExpiry);
}

export async function evaluateTrialExtensionStatus(
  userId: string,
  user?: any,
  extraConfig?: any
): Promise<{ status: TrialExtensionStatus; reason?: string; usedAt?: number | null }> {
  const targetId = String(userId || user?.$id || user?.id || "").trim();
  if (!targetId) return { status: "UNKNOWN", reason: "missing_user_id" };

  // 1. Explicit true flag on user document
  if (user?.trial_extension_used === true || user?.trial_extension_used === 1 || String(user?.trial_extension_used).toLowerCase() === "true") {
    return { status: "USED", reason: "trial_extension_used_user_flag", usedAt: user?.trial_extension_used_at || null };
  }

  // 2. Explicit true flag on extraConfig
  if (extraConfig?.[TRIAL_EXTENSION_USED_KEY] === true || extraConfig?.[TRIAL_EXTENSION_USED_KEY] === 1 || String(extraConfig?.[TRIAL_EXTENSION_USED_KEY]).toLowerCase() === "true") {
    return { status: "USED", reason: "trial_extension_used_extra_config", usedAt: extraConfig?.[TRIAL_EXTENSION_USED_AT_KEY] || null };
  }

  // 3. Check legacy resolved status
  if (user?.trial_extension_legacy_status === "resolved_used" || extraConfig?.[TRIAL_EXTENSION_LEGACY_STATUS_KEY] === "resolved_used") {
    return { status: "USED", reason: "legacy_resolved_used" };
  }
  if (user?.trial_extension_legacy_status === "resolved_eligible" || extraConfig?.[TRIAL_EXTENSION_LEGACY_STATUS_KEY] === "resolved_eligible") {
    return { status: "ELIGIBLE", reason: "legacy_resolved_eligible" };
  }

  // 4. Check DB extra config directly
  const extraVal = await trialExtensionDeps.getUserExtraConfigValue(targetId, TRIAL_EXTENSION_USED_KEY).catch(() => null);
  if (extraVal === true || extraVal === 1 || String(extraVal).toLowerCase() === "true") {
    return { status: "USED", reason: "durable_extra_config_true" };
  }
  if (extraVal === false || String(extraVal).toLowerCase() === "false") {
    return { status: "ELIGIBLE", reason: "durable_extra_config_false" };
  }

  // 5. Check durable audit logs
  const hasAudit = await trialExtensionDeps.hasHistoricalAuditRecord(targetId).catch(() => false);
  if (hasAudit) {
    return { status: "USED", reason: "historical_audit_record_proven" };
  }

  // 6. Fetch target user if not passed
  const targetUser = user || await trialExtensionDeps.getUser(targetId).catch(() => null);
  if (targetUser?.trial_extension_used === true || targetUser?.trial_extension_used === 1 || String(targetUser?.trial_extension_used).toLowerCase() === "true") {
    return { status: "USED", reason: "fetched_user_flag_true", usedAt: targetUser?.trial_extension_used_at || null };
  }
  if (targetUser?.trial_extension_used === false || String(targetUser?.trial_extension_used).toLowerCase() === "false") {
    return { status: "ELIGIBLE", reason: "fetched_user_flag_false" };
  }
  if (targetUser?.trial_extension_legacy_status === "resolved_used") {
    return { status: "USED", reason: "fetched_legacy_resolved_used" };
  }
  if (targetUser?.trial_extension_legacy_status === "resolved_eligible") {
    return { status: "ELIGIBLE", reason: "fetched_legacy_resolved_eligible" };
  }

  // 7. If account was explicitly created under modern system with trial_extension_used undefined vs explicit false:
  // For accounts with no durable marker and no audit log, classify strictly as UNKNOWN
  return { status: "UNKNOWN", reason: "legacy_account_no_durable_marker" };
}

export async function hasUsedTrialExtension(userId: string, user?: any, extraConfig?: any): Promise<boolean> {
  const result = await evaluateTrialExtensionStatus(userId, user, extraConfig);
  return result.status === "USED";
}

export async function extendTrialForUser(targetUserId: string, _requesterUserId?: string) {
  const targetId = String(targetUserId || "").trim();
  if (!targetId) {
    throw new Error("Target user ID is required to extend trial.");
  }

  const targetUser = (await trialExtensionDeps.getUser(targetId)) as any;
  if (!targetUser) {
    throw new Error("Target user not found.");
  }

  const evaluation = await evaluateTrialExtensionStatus(targetId, targetUser);
  if (evaluation.status === "USED") {
    throw new Error("Trial extension has already been used for this account. Only one trial extension is permitted per account lifetime.");
  }
  if (evaluation.status === "UNKNOWN") {
    throw new Error("Legacy account trial extension status is UNKNOWN. Super Admin manual resolution required before extending.");
  }

  const nowSeconds = trialExtensionDeps.now();
  const newTrialExpiresAt = calculateThirtyDayTrialExtension(targetUser.trial_expires_at, nowSeconds);

  await Promise.all([
    trialExtensionDeps.updateUser(targetId, {
      trial_expires_at: newTrialExpiresAt,
      trial_extension_used: true,
      trial_extension_used_at: nowSeconds,
      trial_extension_legacy_status: "extended",
    }),
    trialExtensionDeps.saveUserExtraConfigPatch(targetId, {
      [TRIAL_EXTENSION_USED_KEY]: true,
      [TRIAL_EXTENSION_USED_AT_KEY]: nowSeconds,
      [TRIAL_EXTENSION_LEGACY_STATUS_KEY]: "extended",
    }),
  ]);

  return {
    success: true,
    trial_expires_at: newTrialExpiresAt,
    trial_extension_used: true,
    trial_extension_used_at: nowSeconds,
    targetUserId: targetId,
  };
}

export async function resolveLegacyTrialExtension(
  targetUserId: string,
  resolution: "eligible" | "used",
  adminUserId?: string
) {
  const targetId = String(targetUserId || "").trim();
  if (!targetId) throw new Error("Target user ID is required.");

  const nowSeconds = trialExtensionDeps.now();
  if (resolution === "used") {
    await Promise.all([
      trialExtensionDeps.updateUser(targetId, {
        trial_extension_used: true,
        trial_extension_used_at: nowSeconds,
        trial_extension_legacy_status: "resolved_used",
      }),
      trialExtensionDeps.saveUserExtraConfigPatch(targetId, {
        [TRIAL_EXTENSION_USED_KEY]: true,
        [TRIAL_EXTENSION_USED_AT_KEY]: nowSeconds,
        [TRIAL_EXTENSION_LEGACY_STATUS_KEY]: "resolved_used",
      }),
    ]);
    return {
      success: true,
      targetUserId: targetId,
      status: "USED",
      trial_extension_used: true,
      resolvedBy: adminUserId,
    };
  } else {
    await Promise.all([
      trialExtensionDeps.updateUser(targetId, {
        trial_extension_used: false,
        trial_extension_legacy_status: "resolved_eligible",
      }),
      trialExtensionDeps.saveUserExtraConfigPatch(targetId, {
        [TRIAL_EXTENSION_USED_KEY]: false,
        [TRIAL_EXTENSION_LEGACY_STATUS_KEY]: "resolved_eligible",
      }),
    ]);
    return {
      success: true,
      targetUserId: targetId,
      status: "ELIGIBLE",
      trial_extension_used: false,
      resolvedBy: adminUserId,
    };
  }
}
