/**
 * Google Free-Only Usage Guard & Safety Ceilings
 * 
 * Enforces strict zero-dollar, zero-third-party-cost guardrails:
 * - Every Google API call must pass through evaluateGoogleFreeUsage(...)
 * - Enforces conservative account-level daily safety ceilings
 * - Enforces project-level daily safety ceilings
 * - Fails closed if usage accounting is uncertain
 * - Supports emergency environment/config kill-switches
 */

import { getOwnerProfile } from "./owner360-service.ts";
import type {
  GoogleUsageCheckParams,
  GoogleUsageCheckResult,
} from "./google-personal-auth-types.ts";

// Configurable Account Safety Caps
export const DEFAULT_ACCOUNT_SAFETY_CAPS = {
  calendar: 200,      // max 200 calls/day/account
  contacts: 500,      // max 500 reads/day/account
  gmail: 50,          // max 50 sends/day/account
  driveReads: 100,    // max 100 selected-file reads/day/account
  driveEgressMb: 100, // max 100 MB egress/day/account
};

// Project-level Ceilings (all accounts combined)
export const DEFAULT_PROJECT_SAFETY_CAPS = {
  calendar: 5000,
  contacts: 10000,
  gmail: 1000,
  driveReads: 2000,
  driveEgressMb: 2000,
};

interface DailyUsageRecord {
  calls: number;
  egressBytes: number;
}

// In-memory counters keyed by `day_key:accountId:service` and `day_key:__project__:service`
const usageStore = new Map<string, DailyUsageRecord>();

export function isGooglePersonalAssistantGloballyEnabled(): boolean {
  return process.env.GOOGLE_PERSONAL_ASSISTANT_ENABLED !== "false";
}

export function isGoogleServiceEnabled(service: "calendar" | "contacts" | "gmail" | "drive"): boolean {
  if (!isGooglePersonalAssistantGloballyEnabled()) return false;
  switch (service) {
    case "calendar":
      return process.env.GOOGLE_CALENDAR_ENABLED !== "false";
    case "contacts":
      return process.env.GOOGLE_CONTACTS_ENABLED !== "false";
    case "gmail":
      return process.env.GOOGLE_GMAIL_SEND_ENABLED !== "false";
    case "drive":
      return process.env.GOOGLE_DRIVE_FILE_ENABLED !== "false";
    default:
      return false;
  }
}

export async function resolveUsageDateKey(accountId: string, now = Date.now()): Promise<string> {
  let timezone = "UTC";
  try {
    const profile = await getOwnerProfile(accountId);
    if (profile?.locale?.timezone) {
      timezone = profile.locale.timezone;
    }
  } catch {
    timezone = "UTC";
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

export async function evaluateGoogleFreeUsage(
  params: GoogleUsageCheckParams
): Promise<GoogleUsageCheckResult> {
  const { accountId, service, method, estimatedQuotaUnits = 1, egressBytes = 0, now = Date.now() } = params;

  // 1. Service Kill-switch Check
  if (!isGoogleServiceEnabled(service)) {
    return {
      decision: "BLOCK_DISABLED",
      reasonCode: "GOOGLE_SERVICE_DISABLED",
      reasonMessage: `Google ${service} integration is currently disabled by system policy.`,
      dailyAccountUsage: 0,
      accountLimit: 0,
      dailyProjectUsage: 0,
      projectLimit: 0,
    };
  }

  // 2. Date Boundary Resolution
  let dateKey: string;
  try {
    dateKey = await resolveUsageDateKey(accountId, now);
  } catch {
    // Fail closed if date/timezone resolution fails
    return {
      decision: "BLOCK_FREE_ONLY_LIMIT",
      reasonCode: "USAGE_ACCOUNTING_UNCERTAIN",
      reasonMessage: "Unable to verify current billing period safely.",
      dailyAccountUsage: 0,
      accountLimit: 0,
      dailyProjectUsage: 0,
      projectLimit: 0,
    };
  }

  // 3. Resolve Limits
  let accountLimit = DEFAULT_ACCOUNT_SAFETY_CAPS[service] ?? 100;
  let projectLimit = DEFAULT_PROJECT_SAFETY_CAPS[service] ?? 1000;
  if (service === "drive" && method === "download") {
    // Check egress limits
    accountLimit = DEFAULT_ACCOUNT_SAFETY_CAPS.driveEgressMb * 1024 * 1024;
    projectLimit = DEFAULT_PROJECT_SAFETY_CAPS.driveEgressMb * 1024 * 1024;
  }

  const accountKey = `${dateKey}:${accountId}:${service}`;
  const projectKey = `${dateKey}:__project__:${service}`;

  const currentAccount = usageStore.get(accountKey) || { calls: 0, egressBytes: 0 };
  const currentProject = usageStore.get(projectKey) || { calls: 0, egressBytes: 0 };

  const prospectiveAccountCalls = currentAccount.calls + estimatedQuotaUnits;
  const prospectiveProjectCalls = currentProject.calls + estimatedQuotaUnits;

  // 4. Account Daily Ceiling Enforcement
  if (service !== "drive" || method !== "download") {
    if (prospectiveAccountCalls > accountLimit) {
      return {
        decision: "BLOCK_FREE_ONLY_LIMIT",
        reasonCode: "GOOGLE_FREE_ONLY_LIMIT_REACHED",
        reasonMessage: `Daily free safety ceiling for Google ${service} reached (${currentAccount.calls}/${accountLimit}).`,
        dailyAccountUsage: currentAccount.calls,
        accountLimit,
        dailyProjectUsage: currentProject.calls,
        projectLimit,
      };
    }

    // 5. Project Daily Ceiling Enforcement
    if (prospectiveProjectCalls > projectLimit) {
      return {
        decision: "BLOCK_FREE_ONLY_LIMIT",
        reasonCode: "GOOGLE_PROJECT_LIMIT_REACHED",
        reasonMessage: `Daily project-wide safety ceiling for Google ${service} reached.`,
        dailyAccountUsage: currentAccount.calls,
        accountLimit,
        dailyProjectUsage: currentProject.calls,
        projectLimit,
      };
    }
  } else {
    // Egress check for Drive downloads
    const prospectiveAccountEgress = currentAccount.egressBytes + egressBytes;
    if (prospectiveAccountEgress > accountLimit) {
      return {
        decision: "BLOCK_FREE_ONLY_LIMIT",
        reasonCode: "GOOGLE_FREE_ONLY_EGRESS_LIMIT_REACHED",
        reasonMessage: `Daily free safety egress ceiling for Google Drive reached.`,
        dailyAccountUsage: currentAccount.egressBytes,
        accountLimit,
        dailyProjectUsage: currentProject.egressBytes,
        projectLimit,
      };
    }
  }

  return {
    decision: "ALLOW",
    reasonCode: "WITHIN_SAFETY_LIMITS",
    reasonMessage: "Operation is within free-only safety ceilings.",
    dailyAccountUsage: currentAccount.calls,
    accountLimit,
    dailyProjectUsage: currentProject.calls,
    projectLimit,
  };
}

export async function recordGoogleUsageSuccess(
  params: GoogleUsageCheckParams
): Promise<void> {
  const { accountId, service, estimatedQuotaUnits = 1, egressBytes = 0, now = Date.now() } = params;
  const dateKey = await resolveUsageDateKey(accountId, now);
  const accountKey = `${dateKey}:${accountId}:${service}`;
  const projectKey = `${dateKey}:__project__:${service}`;

  const currentAccount = usageStore.get(accountKey) || { calls: 0, egressBytes: 0 };
  currentAccount.calls += estimatedQuotaUnits;
  currentAccount.egressBytes += egressBytes;
  usageStore.set(accountKey, currentAccount);

  const currentProject = usageStore.get(projectKey) || { calls: 0, egressBytes: 0 };
  currentProject.calls += estimatedQuotaUnits;
  currentProject.egressBytes += egressBytes;
  usageStore.set(projectKey, currentProject);
}

export function __clearGoogleUsageCountersForTest(): void {
  usageStore.clear();
}
