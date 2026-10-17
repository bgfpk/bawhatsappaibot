import * as dbService from "./db-service.ts";
import { isBillingNotificationInCooldown } from "./billing-notification-cooldown.ts";
import {
  DASHBOARD_ALERT_PREFERENCES_STORE_KEY,
  getAlertChannelEnabled,
  normalizeDashboardAlertPreferences,
} from "./dashboard-alert-preferences-service.ts";

type BillingNotificationInput = {
  userId: string;
  title: string;
  status: string;
  amount?: string | number;
  action?: string;
  dedupeKey?: string;
  cooldownSeconds?: number;
  stateKey?: string;
  messageMode?: "update" | "reminder";
  alertType?: string;
  billingStatus?: string;
  stateVersion?: string | number;
  stateChangedAt?: number;
  hardSafetyCooldownSeconds?: number;
  whatsAppMessage?: string;
  sendWhatsApp: (phone: string, message: string) => Promise<any>;
  dailyDedupeDate?: string;
};

type BillingAlertRecord = {
  alertType: string;
  userId: string;
  billingStatus: string;
  stateVersion: string;
  stateChangedAt: number;
  dedupeKey: string;
  firstSentAt: number;
  lastSentAt: number;
  sentCount: number;
  status: "pending" | "sent" | "suppressed";
  deliveryStatus: "whatsapp_sent" | "destination_missing" | "alerts_disabled" | "global_disabled";
  title: string;
  messageMode: "update" | "reminder";
  recipient?: string;
  lastError?: string;
};

type BillingAlertStateRecord = {
  alertType: string;
  userId: string;
  currentStatus: string;
  billingStatus: string;
  activeDedupeKey: string;
  stateVersion: string;
  stateChangedAt: number;
  firstSentAt: number;
  lastSentAt: number;
  sentCount: number;
  lastDeliveryStatus: string;
  resolvedAt?: number;
};

const BILLING_ALERT_PENDING_STALE_SECONDS = 15 * 60;
const BILLING_ALERT_FALLBACK_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

const billingNotificationDeps = {
  getUser: dbService.getUser,
  loadUserConfig: dbService.loadUserConfig,
  addWalletTransaction: dbService.addWalletTransaction,
  getGlobalSetting: dbService.getGlobalSetting,
  setGlobalSetting: dbService.setGlobalSetting,
  getBillingAlertRecord: dbService.getBillingAlertRecord,
  tryCreateBillingAlertRecord: dbService.tryCreateBillingAlertRecord,
  setBillingAlertRecord: dbService.setBillingAlertRecord,
  deleteBillingAlertRecord: dbService.deleteBillingAlertRecord,
  getUserExtraConfigValue: dbService.getUserExtraConfigValue,
  getDisableBillingWhatsAppRemindersFlag: () => process.env.DISABLE_BILLING_WHATSAPP_REMINDERS,
};

export function __setBillingNotificationTestDeps(overrides: Partial<typeof billingNotificationDeps>) {
  Object.assign(billingNotificationDeps, overrides || {});
}

export function __resetBillingNotificationTestDeps() {
  Object.assign(billingNotificationDeps, {
    getUser: dbService.getUser,
    loadUserConfig: dbService.loadUserConfig,
    addWalletTransaction: dbService.addWalletTransaction,
    getGlobalSetting: dbService.getGlobalSetting,
    setGlobalSetting: dbService.setGlobalSetting,
    getBillingAlertRecord: dbService.getBillingAlertRecord,
    tryCreateBillingAlertRecord: dbService.tryCreateBillingAlertRecord,
    setBillingAlertRecord: dbService.setBillingAlertRecord,
    deleteBillingAlertRecord: dbService.deleteBillingAlertRecord,
    getUserExtraConfigValue: dbService.getUserExtraConfigValue,
    getDisableBillingWhatsAppRemindersFlag: () => process.env.DISABLE_BILLING_WHATSAPP_REMINDERS,
  });
}

function normalizePhone(phone: any) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function compactBusinessName(config: any, user: any) {
  return String(config?.business_name || config?.businessName || user?.name || user?.email || "BlackArrow account").slice(0, 80);
}

function buildNotificationPrefix(mode: BillingNotificationInput["messageMode"]) {
  return mode === "reminder" ? "BlackArrow billing reminder" : "BlackArrow billing update";
}

function isTruthyEnvFlag(value: any) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeStateVersion(value: any) {
  if (value === undefined || value === null || value === "") return "current";
  return String(value).trim() || "current";
}

function buildPersistentDedupeKey(input: BillingNotificationInput) {
  const alertType = String(input.alertType || "").trim();
  if (input.dedupeKey) return String(input.dedupeKey).trim();
  if (!alertType) return "";
  const dailyDate = String(input.dailyDedupeDate || "").trim();
  if (dailyDate) return `billing_alert:${input.userId}:${alertType}:${dailyDate}`;
  return `${alertType}:${input.userId}:${normalizeStateVersion(input.stateVersion)}`;
}

function buildAlertStateScopeKey(input: BillingNotificationInput) {
  return `${String(input.alertType || "").trim()}:${input.userId}`;
}

function buildBillingReminderMessage(input: BillingNotificationInput, user: any, config: any) {
  if (input.whatsAppMessage) return String(input.whatsAppMessage).trim();
  const parts = [
    buildNotificationPrefix(input.messageMode),
    `Account: ${compactBusinessName(config, user)}`,
    input.title ? `Type: ${input.title}` : "",
    input.status ? `Status: ${input.status}` : "",
    input.amount !== undefined && input.amount !== "" ? `Amount: ${input.amount}` : "",
    input.action ? `Action: ${input.action}` : ""
  ].filter(Boolean);
  return parts.join("\n");
}

function parseBillingAlertStateRecord(value: any): BillingAlertStateRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as BillingAlertStateRecord;
}

function buildTerminalAlertRecord(input: BillingNotificationInput, overrides: Partial<BillingAlertRecord>): BillingAlertRecord {
  const sentAt = Math.floor(Date.now() / 1000);
  return {
    alertType: String(input.alertType || "billing_notice"),
    userId: input.userId,
    billingStatus: String(input.billingStatus || input.status || "unknown"),
    stateVersion: normalizeStateVersion(input.stateVersion),
    stateChangedAt: Math.max(0, Number(input.stateChangedAt || 0)),
    dedupeKey: buildPersistentDedupeKey(input),
    firstSentAt: sentAt,
    lastSentAt: sentAt,
    sentCount: 1,
    status: "sent",
    deliveryStatus: "whatsapp_sent",
    title: input.title,
    messageMode: input.messageMode || "update",
    ...overrides,
  };
}

async function updatePersistentAlertState(input: BillingNotificationInput, record: BillingAlertRecord) {
  const stateKey = buildAlertStateScopeKey(input);
  await billingNotificationDeps.setBillingAlertRecord("state", stateKey, {
    alertType: record.alertType,
    userId: record.userId,
    currentStatus: "active",
    billingStatus: record.billingStatus,
    activeDedupeKey: record.dedupeKey,
    stateVersion: record.stateVersion,
    stateChangedAt: record.stateChangedAt,
    firstSentAt: record.firstSentAt,
    lastSentAt: record.lastSentAt,
    sentCount: record.sentCount,
    lastDeliveryStatus: record.deliveryStatus,
  } satisfies BillingAlertStateRecord);
}

async function clearStalePendingAlert(input: BillingNotificationInput, existingRecord: BillingAlertRecord | null, recipient = "") {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!existingRecord || existingRecord.status !== "pending") return false;
  if (nowSeconds - Number(existingRecord.lastSentAt || existingRecord.firstSentAt || 0) < BILLING_ALERT_PENDING_STALE_SECONDS) {
    return false;
  }
  await billingNotificationDeps.deleteBillingAlertRecord("dedupe", buildPersistentDedupeKey(input));
  return true;
}

async function shouldSkipPersistentAlert(input: BillingNotificationInput, recipient = "") {
  const dedupeKey = buildPersistentDedupeKey(input);
  const stateKey = buildAlertStateScopeKey(input);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const hardSafetyCooldownSeconds = Math.max(
    0,
    Number(input.hardSafetyCooldownSeconds || BILLING_ALERT_FALLBACK_COOLDOWN_SECONDS)
  );

  const stateRecord = parseBillingAlertStateRecord(await billingNotificationDeps.getBillingAlertRecord("state", stateKey));
  if (!input.dailyDedupeDate && stateRecord?.activeDedupeKey === dedupeKey && Number(stateRecord.sentCount || 0) > 0) {
    return { skipped: true, reason: "already_sent_for_state" };
  }
  if (
    stateRecord?.activeDedupeKey === dedupeKey &&
    stateRecord?.lastSentAt &&
    hardSafetyCooldownSeconds > 0 &&
    isBillingNotificationInCooldown(stateRecord.lastSentAt * 1000, hardSafetyCooldownSeconds, nowSeconds * 1000)
  ) {
    return { skipped: true, reason: "safety_cooldown" };
  }

  let existingRecord = await billingNotificationDeps.getBillingAlertRecord("dedupe", dedupeKey) as BillingAlertRecord | null;
  if (await clearStalePendingAlert(input, existingRecord, recipient)) {
    existingRecord = await billingNotificationDeps.getBillingAlertRecord("dedupe", dedupeKey) as BillingAlertRecord | null;
  }
  if (existingRecord) {
    if (existingRecord.status === "pending") return { skipped: true, reason: "pending_send" };
    return { skipped: true, reason: "duplicate" };
  }

  return { skipped: false, dedupeKey };
}

async function tryClaimPersistentAlert(input: BillingNotificationInput, dedupeKey: string) {
  const claimedAt = Math.floor(Date.now() / 1000);
  const pendingRecord = buildTerminalAlertRecord(input, {
    dedupeKey,
    status: "pending",
    deliveryStatus: "destination_missing",
    firstSentAt: claimedAt,
    lastSentAt: claimedAt,
    sentCount: 0,
  });
  const createResult = await billingNotificationDeps.tryCreateBillingAlertRecord("dedupe", dedupeKey, pendingRecord);
  return Boolean(createResult.created);
}

async function finalizePersistentAlert(
  input: BillingNotificationInput,
  record: BillingAlertRecord,
  options: { preserveState?: boolean } = {}
) {
  await billingNotificationDeps.setBillingAlertRecord("dedupe", record.dedupeKey, record);
  if (!options.preserveState) {
    await updatePersistentAlertState(input, record);
  }
}

function buildDisableLogLabel(input: BillingNotificationInput) {
  return `[Billing Notice] ${String(input.alertType || input.title || "billing_notice")} suppressed for user ${input.userId}`;
}

export async function markBillingNotificationStateResolved(input: {
  userId: string;
  alertType: string;
  currentStatus: string;
  billingStatus?: string;
  stateVersion?: string | number;
  stateChangedAt?: number;
}) {
  const stateKey = `${input.alertType}:${input.userId}`;
  const existing = parseBillingAlertStateRecord(await billingNotificationDeps.getBillingAlertRecord("state", stateKey));
  const nowSeconds = Math.floor(Date.now() / 1000);
  await billingNotificationDeps.setBillingAlertRecord("state", stateKey, {
    alertType: input.alertType,
    userId: input.userId,
    currentStatus: input.currentStatus,
    billingStatus: String(input.billingStatus || input.currentStatus || "resolved"),
    activeDedupeKey: "",
    stateVersion: normalizeStateVersion(input.stateVersion || existing?.stateVersion),
    stateChangedAt: Math.max(0, Number(input.stateChangedAt || existing?.stateChangedAt || 0)),
    firstSentAt: Number(existing?.firstSentAt || 0),
    lastSentAt: Number(existing?.lastSentAt || 0),
    sentCount: Number(existing?.sentCount || 0),
    lastDeliveryStatus: String(existing?.lastDeliveryStatus || "resolved"),
    resolvedAt: nowSeconds,
  } satisfies BillingAlertStateRecord);
}

export async function sendBillingNotification(input: BillingNotificationInput) {
  const markerKey = input.dedupeKey ? `billing_notice_${input.dedupeKey}` : "";
  const persistentAlertEnabled = Boolean(input.alertType);
  if (!persistentAlertEnabled && markerKey && await billingNotificationDeps.getGlobalSetting(markerKey)) {
    return { skipped: true, reason: "duplicate" };
  }

  const cooldownSeconds = Math.max(0, Number(input.cooldownSeconds || 0));
  const stateKey = !persistentAlertEnabled && input.stateKey ? `billing_notice_state_${input.stateKey}` : "";
  const nowMs = Date.now();
  if (!persistentAlertEnabled && stateKey && cooldownSeconds > 0) {
    const rawState = await billingNotificationDeps.getGlobalSetting(stateKey).catch(() => "");
    if (rawState) {
      try {
        const parsed = JSON.parse(String(rawState || "{}"));
        const lastSentAt = Number(parsed?.lastSentAt || 0);
        if (isBillingNotificationInCooldown(lastSentAt, cooldownSeconds, nowMs)) {
          return { skipped: true, reason: "cooldown" };
        }
      } catch {}
    }
  }

  const user = await billingNotificationDeps.getUser(input.userId).catch(() => null) as any;
  const config = await billingNotificationDeps.loadUserConfig(input.userId).catch(() => null) as any;
  const adminDestination = normalizePhone(config?.admin_number);
  const fallbackDestination = normalizePhone(user?.whatsapp_number);
  const destination = adminDestination || fallbackDestination;
  const message = buildBillingReminderMessage(input, user, config);
  const persistentDedupeKey = persistentAlertEnabled ? buildPersistentDedupeKey(input) : "";

  if (persistentAlertEnabled) {
    const skipResult = await shouldSkipPersistentAlert(input, destination);
    if (skipResult.skipped) {
      console.info(`[Billing Notice] billing_notification_skipped_duplicate_daily user=${input.userId} type=${input.alertType || input.title}`);
      await billingNotificationDeps.addWalletTransaction(
        input.userId,
        0,
        "billing_notification_skipped",
        `${message}\nStatus: billing_notification_skipped_duplicate_daily`
      ).catch(() => {});
      return { ...skipResult, reason: "billing_notification_skipped_duplicate_daily" };
    }
    const claimed = await tryClaimPersistentAlert(input, persistentDedupeKey);
    if (!claimed) return { skipped: true, reason: "pending_send" };
  }
  const globalDisableFlag = isTruthyEnvFlag(billingNotificationDeps.getDisableBillingWhatsAppRemindersFlag());
  const accountAlertsEnabled = config?.billing_alerts_enabled !== false;
  const alertPreferences = normalizeDashboardAlertPreferences(
    await billingNotificationDeps.getUserExtraConfigValue(input.userId, DASHBOARD_ALERT_PREFERENCES_STORE_KEY).catch(() => null)
  );
  const billingWhatsAppEnabled = getAlertChannelEnabled(alertPreferences, "billing_wallet", "whatsapp");

  let sent = false;
  let deliveryStatus: BillingAlertRecord["deliveryStatus"] = "destination_missing";
  if (globalDisableFlag) {
    deliveryStatus = "global_disabled";
    console.warn(`${buildDisableLogLabel(input)} because DISABLE_BILLING_WHATSAPP_REMINDERS is enabled.`);
  } else if (!accountAlertsEnabled || !billingWhatsAppEnabled) {
    deliveryStatus = "alerts_disabled";
  } else if (destination) {
    sent = Boolean(await input.sendWhatsApp(destination, message).catch(() => false));
    deliveryStatus = sent ? "whatsapp_sent" : "destination_missing";
  }

  await billingNotificationDeps.addWalletTransaction(input.userId, 0, sent ? "billing_notification" : "billing_notification_logged", message);

  if (persistentAlertEnabled) {
    if (globalDisableFlag) {
      const suppressedRecord = buildTerminalAlertRecord(input, {
        dedupeKey: persistentDedupeKey,
        status: "suppressed",
        deliveryStatus: "global_disabled",
        sentCount: 1,
        recipient: destination,
      });
      await finalizePersistentAlert(input, suppressedRecord);
      return { skipped: true, reason: "disabled" };
    }
    if (!sent && deliveryStatus === "destination_missing" && destination) {
      await billingNotificationDeps.deleteBillingAlertRecord("dedupe", persistentDedupeKey).catch(() => {});
      return { sent: false, destination: "", failed: true, reason: "send_failed" };
    }
    const terminalRecord = buildTerminalAlertRecord(input, {
      dedupeKey: persistentDedupeKey,
      status: "sent",
      deliveryStatus,
      firstSentAt: Math.floor(Date.now() / 1000),
      lastSentAt: Math.floor(Date.now() / 1000),
      sentCount: 1,
      recipient: destination,
    });
    await finalizePersistentAlert(input, terminalRecord);
    console.info(`[Billing Notice] billing_notification_sent user=${input.userId} type=${input.alertType || input.title} delivery=${deliveryStatus}`);
    return {
      sent,
      skipped: false,
      destination: sent ? destination : "",
      deliveryStatus,
      usedAdminDestination: Boolean(adminDestination && destination === adminDestination),
      usedFallbackDestination: Boolean(fallbackDestination && destination === fallbackDestination && !adminDestination)
    };
  }

  if (markerKey) {
    await billingNotificationDeps.setGlobalSetting(markerKey, JSON.stringify({ userId: input.userId, title: input.title, sent, createdAt: nowMs }));
  }
  if (stateKey) {
    await billingNotificationDeps.setGlobalSetting(stateKey, JSON.stringify({
      userId: input.userId,
      title: input.title,
      status: input.status,
      sent,
      lastSentAt: nowMs,
      cooldownSeconds,
      mode: input.messageMode || "update",
    }));
  }
  return {
    sent,
    destination: sent ? destination : "",
    usedAdminDestination: Boolean(adminDestination && destination === adminDestination),
    usedFallbackDestination: Boolean(fallbackDestination && destination === fallbackDestination && !adminDestination)
  };
}
