import crypto from "node:crypto";
import {
  getCanonicalAdminPhone,
  normalizeAdminWhatsAppIdentity,
  extractBotPhoneNumber,
} from "./admin-identity-service.ts";
import { normalizePhoneDigits } from "../utils/whatsapp-jid.ts";

export interface BillingAdminAlertState {
  accountId: string;
  botId: string;
  reason: string;
  adminPhone: string;
  adminJid: string;
  lastSentAt: number; // Unix timestamp in seconds
  sendCount: number;
}

export interface BillingAdminAlertDeps {
  getSystemConfig: (key: string) => Promise<string | null>;
  setSystemConfig: (key: string, value: string) => Promise<void>;
  getUser: (userId: string) => Promise<any>;
  getUserExtraConfig: (userId: string) => Promise<any>;
}

let testDeps: Partial<BillingAdminAlertDeps> | null = null;

export const DEFAULT_BILLING_ALERT_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours

export function __setBillingAdminAlertTestDeps(overrides: Partial<BillingAdminAlertDeps>) {
  testDeps = { ...(testDeps || {}), ...(overrides || {}) };
}

export function __resetBillingAdminAlertTestDeps() {
  testDeps = null;
}

async function resolveDeps(): Promise<BillingAdminAlertDeps> {
  if (
    testDeps?.getSystemConfig &&
    testDeps?.setSystemConfig &&
    testDeps?.getUser &&
    testDeps?.getUserExtraConfig
  ) {
    return testDeps as BillingAdminAlertDeps;
  }

  const dbService = await import("./db-service.ts");
  return {
    getSystemConfig: testDeps?.getSystemConfig || dbService.getSystemConfig,
    setSystemConfig: testDeps?.setSystemConfig || dbService.setSystemConfig,
    getUser: testDeps?.getUser || dbService.getUser,
    getUserExtraConfig: testDeps?.getUserExtraConfig || dbService.getUserExtraConfig,
  };
}

export function maskPhone(phone: string): string {
  const clean = String(phone || "").replace(/[^0-9]/g, "");
  if (!clean) return "unknown";
  if (clean.length <= 6) return clean.slice(0, 2) + "***" + clean.slice(-2);
  return clean.slice(0, 4) + "***" + clean.slice(-4);
}

export function maskIdentifier(id: string): string {
  const clean = String(id || "").trim();
  if (!clean) return "n/a";
  if (clean.length <= 8) return clean;
  return clean.slice(0, 4) + "..." + clean.slice(-4);
}

export function buildBillingAlertStorageKey(botId: string): string {
  const cleanBotId = String(botId || "unknown").trim();
  const hash = crypto.createHash("sha1").update(cleanBotId).digest("hex").slice(0, 20);
  return `billing_alert_${hash}`;
}

export function buildBillingAdminAlertMessage(params: {
  instanceName: string;
  connectedPhone: string;
  reason: string;
}): string {
  const instanceName = String(params.instanceName || "WhatsApp Instance").trim() || "WhatsApp Instance";
  const rawDigits = normalizePhoneDigits(params.connectedPhone);
  const displayPhone = rawDigits ? `+${rawDigits}` : "Connected WhatsApp";

  const reason = String(params.reason || "").trim();

  let reasonText: string;
  let impactText: string;
  let actionText: string;

  switch (reason) {
    case "trial_ended":
      reasonText = "Your trial has ended.";
      impactText = "Customers will not receive automatic AI replies until access is renewed.";
      actionText = "Renew or upgrade your BlackArrow plan.";
      break;

    case "subscription_expired":
      reasonText = "Your subscription has ended.";
      impactText = "Customers will not receive automatic AI replies until access is renewed.";
      actionText = "Renew or upgrade your BlackArrow plan.";
      break;

    case "subscription_inactive":
      reasonText = "Your subscription is currently inactive.";
      impactText = "Customers will not receive automatic AI replies until access is renewed.";
      actionText = "Renew or activate your BlackArrow plan.";
      break;

    case "reply_limit_exhausted":
      reasonText = "Trial free AI reply limit has been reached.";
      impactText = "Customers will not receive automatic AI replies until access is upgraded.";
      actionText = "Upgrade to a paid BlackArrow plan.";
      break;

    case "insufficient_wallet":
      reasonText = "Insufficient wallet balance.";
      impactText = "Customers will not receive automatic AI replies until sufficient balance is available.";
      actionText = "Add wallet balance in BlackArrow.";
      break;

    case "wallet_empty":
      reasonText = "Wallet balance is empty.";
      impactText = "Customers will not receive automatic AI replies until sufficient balance is available.";
      actionText = "Add wallet balance in BlackArrow.";
      break;

    case "account_suspended":
      reasonText = "Account access is suspended.";
      impactText = "Customers will not receive automatic AI replies until your account is reinstated.";
      actionText = "Contact BlackArrow support to review your account access.";
      break;

    case "unknown_plan":
      reasonText = "Subscription plan is unrecognized.";
      impactText = "Customers will not receive automatic AI replies until access is configured.";
      actionText = "Open BlackArrow to review your account access/billing status.";
      break;

    case "missing_user":
    case "user_not_found":
      reasonText = "Account profile could not be verified.";
      impactText = "Customers will not receive automatic AI replies until your account is active.";
      actionText = "Open BlackArrow to review your account access/billing status.";
      break;

    default:
      reasonText = "Automatic AI replies are paused due to account billing status.";
      impactText = "Customers will not receive automatic AI replies until account access is active.";
      actionText = "Open BlackArrow to review your account access/billing status.";
      break;
  }

  return (
    `⚠️ BlackArrow AI Replies Paused\n\n` +
    `Instance: ${instanceName}\n` +
    `WhatsApp: ${displayPhone}\n\n` +
    `Reason: ${reasonText}\n\n` +
    `${impactText}\n\n` +
    `Action: ${actionText}`
  );
}

export function shouldSendBillingAdminAlert(params: {
  currentState: BillingAdminAlertState | null;
  newReason: string;
  newAdminPhone: string;
  nowSeconds?: number;
  cooldownSeconds?: number;
}): { shouldSend: boolean; why: string } {
  const { currentState, newReason, newAdminPhone } = params;
  const now = Number(params.nowSeconds || Math.floor(Date.now() / 1000));
  const cooldown = Number(params.cooldownSeconds ?? DEFAULT_BILLING_ALERT_COOLDOWN_SECONDS);

  if (!currentState || !currentState.lastSentAt) {
    return { shouldSend: true, why: "first_hard_block" };
  }

  // Reason materially changed (e.g. trial_ended -> insufficient_wallet)
  if (currentState.reason !== newReason) {
    return { shouldSend: true, why: "reason_changed" };
  }

  // Admin recipient changed (new admin gets immediate alert)
  if (currentState.adminPhone !== newAdminPhone) {
    return { shouldSend: true, why: "admin_changed" };
  }

  // Cooldown elapsed
  const elapsed = now - currentState.lastSentAt;
  if (elapsed >= cooldown) {
    return { shouldSend: true, why: "cooldown_elapsed" };
  }

  return { shouldSend: false, why: "cooldown_active" };
}

export async function loadBillingAdminAlertState(botId: string): Promise<BillingAdminAlertState | null> {
  const deps = await resolveDeps();
  const key = buildBillingAlertStorageKey(botId);
  const raw = await deps.getSystemConfig(key).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.botId && parsed.reason) {
      return parsed as BillingAdminAlertState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveBillingAdminAlertState(
  botId: string,
  state: BillingAdminAlertState
): Promise<void> {
  const deps = await resolveDeps();
  const key = buildBillingAlertStorageKey(botId);
  await deps.setSystemConfig(key, JSON.stringify(state));
}

export async function clearBillingAdminAlertState(botId: string): Promise<void> {
  const deps = await resolveDeps();
  const key = buildBillingAlertStorageKey(botId);
  // Clear persistent state by setting empty string or null record
  await deps.setSystemConfig(key, "").catch(() => {});
}

// In-flight concurrency lock to prevent simultaneous customer messages from racing
const inFlightAlerts = new Map<string, Promise<{ sent: boolean; reason?: string; messageId?: string }>>();

export async function processBillingBlockedAdminAlert(params: {
  accountId: string;
  botId: string;
  reason: string;
  botConfig?: any;
  sendText: (adminJid: string, text: string) => Promise<{ messageId: string }>;
  nowSeconds?: number;
  cooldownSeconds?: number;
}): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
  const { accountId, botId, reason, botConfig, sendText } = params;
  if (!accountId || !botId || !reason) {
    return { sent: false, reason: "invalid_parameters" };
  }

  // Mutex per botId to guarantee single in-flight evaluation and send
  const existingInFlight = inFlightAlerts.get(botId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const executionPromise = (async () => {
    try {
      const deps = await resolveDeps();

      // Resolve admin phone from user, userExtraConfig, and botConfig
      const user = await deps.getUser(accountId).catch(() => null);
      const userConfig = await deps.getUserExtraConfig(accountId).catch(() => null);

      const rawAdmin = getCanonicalAdminPhone(user, userConfig, botConfig);
      const adminIdentity = normalizeAdminWhatsAppIdentity(rawAdmin);

      if (!adminIdentity.phone || !adminIdentity.jid) {
        console.warn(
          `[BillingAdminAlert] billing_admin_alert_skipped_no_admin reason=${reason} account=${maskIdentifier(accountId)} bot=${maskIdentifier(botId)}`
        );
        return { sent: false, reason: "billing_admin_alert_skipped_no_admin" };
      }

      // Check persistent alert state
      const currentState = await loadBillingAdminAlertState(botId);
      const decision = shouldSendBillingAdminAlert({
        currentState,
        newReason: reason,
        newAdminPhone: adminIdentity.phone,
        nowSeconds: params.nowSeconds,
        cooldownSeconds: params.cooldownSeconds,
      });

      if (!decision.shouldSend) {
        console.info(
          `[BillingAdminAlert] billing_admin_alert_suppressed_cooldown reason=${reason} admin=${maskPhone(adminIdentity.phone)} bot=${maskIdentifier(botId)} lastSent=${currentState?.lastSentAt}`
        );
        return { sent: false, reason: "billing_admin_alert_suppressed_cooldown" };
      }

      // Format reason-specific alert message
      const instanceName = String(
        botConfig?.name || botConfig?.bot_name || botConfig?.displayName || "WhatsApp Instance"
      ).trim() || "WhatsApp Instance";

      const connectedPhone = extractBotPhoneNumber(botConfig);
      const alertMessage = buildBillingAdminAlertMessage({
        instanceName,
        connectedPhone,
        reason,
      });

      // Send alert through the instance's active WhatsApp provider
      let sendResult: { messageId: string };
      try {
        sendResult = await sendText(adminIdentity.jid, alertMessage);
        if (!sendResult || !sendResult.messageId) {
          throw new Error("Missing messageId from outbound WhatsApp sender.");
        }
      } catch (sendError: any) {
        console.error(
          `[BillingAdminAlert] billing_admin_alert_failed reason=${reason} admin=${maskPhone(adminIdentity.phone)} bot=${maskIdentifier(botId)} error=${sendError?.message || sendError}`
        );
        return { sent: false, reason: "billing_admin_alert_failed" };
      }

      // Record successful alert and start cooldown ONLY on confirmed send success
      const now = Number(params.nowSeconds || Math.floor(Date.now() / 1000));
      const nextState: BillingAdminAlertState = {
        accountId,
        botId,
        reason,
        adminPhone: adminIdentity.phone,
        adminJid: adminIdentity.jid,
        lastSentAt: now,
        sendCount: (currentState?.sendCount || 0) + 1,
      };

      await saveBillingAdminAlertState(botId, nextState);

      console.info(
        `[BillingAdminAlert] billing_admin_alert_sent reason=${reason} admin=${maskPhone(adminIdentity.phone)} bot=${maskIdentifier(botId)} msgId=${sendResult.messageId} trigger=${decision.why}`
      );

      return {
        sent: true,
        reason: "billing_admin_alert_sent",
        messageId: sendResult.messageId,
      };
    } finally {
      inFlightAlerts.delete(botId);
    }
  })();

  inFlightAlerts.set(botId, executionPromise);
  return executionPromise;
}
