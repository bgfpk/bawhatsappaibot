import {
  getAlertChannelEnabled,
  getDashboardNotificationCategory,
  normalizeDashboardAlertPreferences,
  type DashboardAlertPreferences,
} from "./dashboard-alert-preferences-service.ts";

export type DashboardWhatsAppAlertStatus = "sent" | "failed" | "skipped" | "throttled" | "disabled";

export type DashboardWhatsAppAlertLog = {
  notificationId: string;
  category: string;
  accountId: string;
  recipientMasked: string;
  status: DashboardWhatsAppAlertStatus;
  reason: string;
  timestamp: number;
};

export type DashboardWhatsAppAlertState = {
  sentByKey?: Record<string, number>;
  lastByCategory?: Record<string, number>;
  logs?: DashboardWhatsAppAlertLog[];
};

export type DashboardWhatsAppAlertDeps = {
  getState: (accountId: string) => Promise<DashboardWhatsAppAlertState | null>;
  saveState: (accountId: string, state: DashboardWhatsAppAlertState) => Promise<void>;
  sendWhatsApp?: (phone: string, message: string) => Promise<any>;
};

export const DASHBOARD_WHATSAPP_ALERT_DELIVERY_STORE_KEY = "dashboardWhatsAppAlertDelivery";
export const DASHBOARD_WHATSAPP_ALERT_COOLDOWN_SECONDS = 30 * 60;
export const DASHBOARD_WHATSAPP_ALERT_DEDUPE_SECONDS = 7 * 24 * 60 * 60;

const ELIGIBLE_CATEGORIES = new Set([
  "billing_wallet",
  "whatsapp_instance",
  "overdue_followups",
  "hot_leads",
  "needs_human_reply",
  "agent_mode_actions",
  "agent_mode_failures",
  "integration_sync",
]);

function clean(value: any, max = 600) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeDashboardAlertRecipient(value: any) {
  let phone = String(value || "").replace(/@s\.whatsapp\.net$/i, "").replace(/[^0-9]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `92${phone.slice(1)}`;
  if (phone.length === 10 && phone.startsWith("3")) phone = `92${phone}`;
  return phone;
}

export function maskDashboardAlertRecipient(value: any) {
  const phone = normalizeDashboardAlertRecipient(value);
  if (!phone) return "";
  if (phone.length <= 4) return "****";
  return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
}

function nowSeconds(input?: number) {
  return Math.floor(Number(input || Date.now() / 1000));
}

function notificationMessage(notification: any) {
  return clean(notification?.description || notification?.message || notification?.reason || "Review this BlackArrow alert.", 500);
}

function notificationTitle(notification: any) {
  return clean(notification?.title || "BlackArrow alert", 120);
}

function stableNotificationId(notification: any) {
  return clean(notification?.id || `${notification?.source || "alert"}:${notification?.type || "unknown"}:${notificationTitle(notification)}`, 180);
}

function buildDedupeKey(accountId: string, notification: any, category: string) {
  return `${clean(accountId, 80)}:${category}:${stableNotificationId(notification)}`;
}

function isEligibleMajorAlert(notification: any, category: string) {
  if (!ELIGIBLE_CATEGORIES.has(category)) return false;
  const type = clean(notification?.type, 80).toLowerCase();
  const severity = clean(notification?.severity, 20).toLowerCase();
  if (category === "billing_wallet") return ["danger", "warn"].includes(severity) || /wallet|limit|trial|subscription|billing/.test(type);
  if (category === "whatsapp_instance") return ["danger", "warn"].includes(severity) || /whatsapp|instance|qr|disconnect|retry|error/.test(type);
  if (category === "overdue_followups") return type.includes("overdue");
  if (category === "agent_mode_actions" || category === "agent_mode_failures") return type.includes("agent");
  if (category === "integration_sync") return ["danger", "warn"].includes(severity) || /fail|error|sync/.test(type);
  return category === "hot_leads" || category === "needs_human_reply";
}

function appendLog(state: DashboardWhatsAppAlertState, log: DashboardWhatsAppAlertLog) {
  return {
    ...state,
    logs: [log, ...(state.logs || [])].slice(0, 80),
  };
}

function pruneState(state: DashboardWhatsAppAlertState, timestamp: number, dedupeSeconds: number) {
  const cutoff = timestamp - Math.max(dedupeSeconds, DASHBOARD_WHATSAPP_ALERT_DEDUPE_SECONDS);
  const sentByKey = Object.fromEntries(
    Object.entries(state.sentByKey || {}).filter(([, sentAt]) => Number(sentAt || 0) >= cutoff)
  );
  return {
    ...state,
    sentByKey,
    logs: (state.logs || []).slice(0, 80),
  };
}

function buildLog(input: {
  accountId: string;
  notificationId: string;
  category: string;
  recipient?: string;
  status: DashboardWhatsAppAlertStatus;
  reason: string;
  timestamp: number;
}): DashboardWhatsAppAlertLog {
  return {
    notificationId: input.notificationId,
    category: input.category,
    accountId: input.accountId,
    recipientMasked: maskDashboardAlertRecipient(input.recipient),
    status: input.status,
    reason: input.reason,
    timestamp: input.timestamp,
  };
}

export function buildDashboardWhatsAppAlertMessage(notification: any, category: string) {
  return [
    "BlackArrow alert",
    `Category: ${category.replace(/_/g, " ")}`,
    `Type: ${clean(notification?.type || "dashboard_alert", 80).replace(/_/g, " ")}`,
    `Title: ${notificationTitle(notification)}`,
    `Details: ${notificationMessage(notification)}`,
    "Open BlackArrow dashboard to review.",
  ].join("\n");
}

function sendSucceeded(result: any) {
  if (result === true) return true;
  if (result?.sent === true || result?.success === true) return true;
  if (result?.messageId || result?.key?.id) return true;
  return false;
}

export async function deliverDashboardWhatsAppAlert(input: {
  accountId: string;
  notification: any;
  preferences?: DashboardAlertPreferences | null;
  recipient?: string;
  deps: DashboardWhatsAppAlertDeps;
  now?: number;
  cooldownSeconds?: number;
  dedupeSeconds?: number;
}) {
  const accountId = clean(input.accountId, 80);
  const notificationId = stableNotificationId(input.notification);
  const category = getDashboardNotificationCategory(input.notification);
  const preferences = normalizeDashboardAlertPreferences(input.preferences);
  const timestamp = nowSeconds(input.now);
  const cooldownSeconds = Math.max(0, Number(input.cooldownSeconds ?? DASHBOARD_WHATSAPP_ALERT_COOLDOWN_SECONDS));
  const dedupeSeconds = Math.max(0, Number(input.dedupeSeconds ?? DASHBOARD_WHATSAPP_ALERT_DEDUPE_SECONDS));
  const recipient = normalizeDashboardAlertRecipient(input.recipient);
  let state: DashboardWhatsAppAlertState = pruneState(await input.deps.getState(accountId).catch(() => null) || {}, timestamp, dedupeSeconds);

  const finish = async (status: DashboardWhatsAppAlertStatus, reason: string) => {
    state = appendLog(state, buildLog({ accountId, notificationId, category, recipient, status, reason, timestamp }));
    await input.deps.saveState(accountId, state);
    return { sent: status === "sent", status, reason, category, notificationId };
  };

  if (!getAlertChannelEnabled(preferences, category, "whatsapp")) {
    return finish("disabled", "whatsapp_preference_disabled");
  }
  if (!isEligibleMajorAlert(input.notification, category)) {
    return finish("skipped", "not_major_account_alert");
  }
  if (!recipient) {
    return finish("skipped", "missing_admin_recipient");
  }
  if (!input.deps.sendWhatsApp) {
    return finish("skipped", "missing_safe_send_helper");
  }

  const dedupeKey = buildDedupeKey(accountId, input.notification, category);
  const sentAt = Number(state.sentByKey?.[dedupeKey] || 0);
  if (sentAt > 0 && timestamp - sentAt < dedupeSeconds) {
    return finish("skipped", "duplicate");
  }

  const categoryLastAt = Number(state.lastByCategory?.[category] || 0);
  if (categoryLastAt > 0 && timestamp - categoryLastAt < cooldownSeconds) {
    return finish("throttled", "category_cooldown");
  }

  const result = await input.deps.sendWhatsApp(recipient, buildDashboardWhatsAppAlertMessage(input.notification, category)).catch(() => false);
  if (!sendSucceeded(result)) {
    return finish("failed", "send_failed");
  }

  state = {
    ...state,
    sentByKey: {
      ...(state.sentByKey || {}),
      [dedupeKey]: timestamp,
    },
    lastByCategory: {
      ...(state.lastByCategory || {}),
      [category]: timestamp,
    },
  };
  return finish("sent", "sent");
}

export async function deliverDashboardWhatsAppAlerts(input: {
  accountId: string;
  notifications: any[];
  preferences?: DashboardAlertPreferences | null;
  recipient?: string;
  deps: DashboardWhatsAppAlertDeps;
  now?: number;
}) {
  const results = [];
  for (const notification of input.notifications || []) {
    results.push(await deliverDashboardWhatsAppAlert({
      accountId: input.accountId,
      notification,
      preferences: input.preferences,
      recipient: input.recipient,
      deps: input.deps,
      now: input.now,
    }));
  }
  return results;
}
