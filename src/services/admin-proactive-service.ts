import { Query } from "node-appwrite";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";
import * as dbService from "./db-service.ts";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import { getBillingAccess } from "../config/billing-access.ts";
import { USAGE_BILLING } from "../config/pricing.ts";
import { recordAdminAuditEvent, maskAdminIdentity } from "./admin-audit-service.ts";
import { sendAdminAssistantReply } from "./admin-business-assistant-router.ts";
import { resolveDateRangeBounds, isInstanceLiveConnected } from "./admin-business-read-service.ts";

// ---------------------------------------------------------------------------
// 1. SIGNAL & INCIDENT TYPES
// ---------------------------------------------------------------------------

export type ProactiveSignalType =
  | "whatsapp_disconnected"
  | "worker_unhealthy"
  | "ai_replies_failing"
  | "customer_unreplied"
  | "human_handover_requested"
  | "order_high_value"
  | "order_operation_failed"
  | "stock_low"
  | "stock_out"
  | "campaign_failed"
  | "integration_sync_failed"
  | "billing_low_wallet"
  | "billing_subscription_expiring"
  | "security_event"
  | "performance_anomaly"
  | "daily_digest"
  | "weekly_digest";

export type ProactiveSignalSeverity = "URGENT" | "IMPORTANT" | "INFO";
export type ProactiveSignalStatus = "OPEN" | "RESOLVED" | "SUPPRESSED" | "DISMISSED";

export interface ProactiveSignal {
  signalId: string;
  signalType: ProactiveSignalType;
  accountId: string;
  botId?: string;
  severity: ProactiveSignalSeverity;
  resourceType:
    | "instance"
    | "ai_reply"
    | "customer"
    | "order"
    | "product"
    | "campaign"
    | "integration"
    | "billing"
    | "security"
    | "performance"
    | "digest";
  resourceId?: string;
  detectedAt: number;
  evidence: Record<string, any>;
  deduplicationKey: string;
  recommendedReadAction?: string;
  recommendedWriteAction?: string;
  cooldownMinutes?: number;
  resolvedAt?: number;
  status: ProactiveSignalStatus;
}

export interface ProactiveAlertPreferences {
  isProactiveAlertsEnabled: boolean;
  categories: {
    operations: boolean;
    customers: boolean;
    orders: boolean;
    stock: boolean;
    campaigns: boolean;
    integrations: boolean;
    billing: boolean;
    security: boolean;
    dailyDigest: boolean;
    weeklyDigest: boolean;
  };
  schedules: {
    dailyDigestTime: string; // "09:00"
    weeklyDigestDay: number; // 1 (Monday)
    timezone: string; // "Asia/Karachi"
  };
  thresholds: {
    highValueOrderUsd: number; // e.g. 100
    lowWalletAlertFloorUsd: number; // e.g. 0.50 (> $0.003)
    lowStockThreshold: number; // e.g. 5
  };
  quietHours: {
    enabled: boolean;
    start: string; // "23:00"
    end: string; // "08:00"
    urgentBypass: boolean; // true
  };
}

export interface ActiveAlertContext {
  contextId: string;
  accountId: string;
  adminJid: string;
  incidentId: string;
  signalType: ProactiveSignalType;
  resourceType: string;
  resourceId?: string;
  recommendedReadAction?: string;
  recommendedWriteAction?: string;
  metadata?: Record<string, any>;
  createdAt: number;
  expiresAt: number;
}

export interface DispatchSignalResult {
  dispatched: boolean;
  signalId: string;
  incidentId?: string;
  status: ProactiveSignalStatus;
  suppressReason?: string;
  billedAmountUsd: number;
  messageText?: string;
}

export interface ProactiveIncidentRecord {
  incidentId: string;
  deduplicationKey: string;
  accountId: string;
  botId?: string;
  signalType: ProactiveSignalType;
  severity: ProactiveSignalSeverity;
  status: ProactiveSignalStatus;
  firstDetectedAt: number;
  lastAlertedAt: number;
  alertCount: number;
  evidence: Record<string, any>;
  cooldownUntil: number;
  resolvedAt?: number;
}

// ---------------------------------------------------------------------------
// 2. DEFAULT PREFERENCES & STORAGE
// ---------------------------------------------------------------------------

export const DEFAULT_PROACTIVE_PREFERENCES: ProactiveAlertPreferences = {
  isProactiveAlertsEnabled: false, // Conservative default: OFF
  categories: {
    operations: true,
    customers: true,
    orders: true,
    stock: true,
    campaigns: true,
    integrations: true,
    billing: true,
    security: true,
    dailyDigest: false,
    weeklyDigest: false,
  },
  schedules: {
    dailyDigestTime: "09:00",
    weeklyDigestDay: 1, // Monday
    timezone: "Asia/Karachi",
  },
  thresholds: {
    highValueOrderUsd: 100,
    lowWalletAlertFloorUsd: 0.50,
    lowStockThreshold: 5,
  },
  quietHours: {
    enabled: false,
    start: "23:00",
    end: "08:00",
    urgentBypass: true,
  },
};

// In-memory durable incident cache
const inMemoryIncidents = new Map<string, ProactiveIncidentRecord>();

// In-memory active alert contexts for conversational follow-ups
const inMemoryAlertContexts = new Map<string, ActiveAlertContext>();

// In-memory digest dispatch history to guarantee once-per-slot idempotency
const inMemoryDigestHistory = new Set<string>();

// ---------------------------------------------------------------------------
// 3. DEPENDENCY INJECTION FOR TESTABILITY
// ---------------------------------------------------------------------------

export const proactiveServiceDeps = {
  databases,
  dbService,
  getUser: async (userId: string): Promise<any> => dbService.getUser(userId),
  listUsers: async (): Promise<any[]> => dbService.listUsers(),
  getBotsByUser: async (userId: string): Promise<any[]> => dbService.getBotsByUser(userId),
  getUserExtraConfigValue: async (userId: string, key: string): Promise<any> => dbService.getUserExtraConfigValue(userId, key),
  saveUserExtraConfigPatch: async (userId: string, patch: any): Promise<any> => dbService.saveUserExtraConfigPatch(userId, patch),
  sendAdminAssistantReply,
  pricing: USAGE_BILLING,
};

export function setProactiveServiceDeps(overrides: Partial<typeof proactiveServiceDeps>) {
  Object.assign(proactiveServiceDeps, overrides || {});
}

export function resetProactiveServiceDeps() {
  Object.assign(proactiveServiceDeps, {
    databases,
    dbService,
    getUser: async (userId: string): Promise<any> => dbService.getUser(userId),
    listUsers: async (): Promise<any[]> => dbService.listUsers(),
    getBotsByUser: async (userId: string): Promise<any[]> => dbService.getBotsByUser(userId),
    getUserExtraConfigValue: async (userId: string, key: string): Promise<any> => dbService.getUserExtraConfigValue(userId, key),
    saveUserExtraConfigPatch: async (userId: string, patch: any): Promise<any> => dbService.saveUserExtraConfigPatch(userId, patch),
    sendAdminAssistantReply,
    pricing: USAGE_BILLING,
  });
  inMemoryIncidents.clear();
  inMemoryAlertContexts.clear();
  inMemoryDigestHistory.clear();
}

// ---------------------------------------------------------------------------
// 4. PREFERENCES RETRIEVAL & MUTATION
// ---------------------------------------------------------------------------

export async function getProactiveAlertPreferences(
  accountId: string
): Promise<ProactiveAlertPreferences> {
  const store = await proactiveServiceDeps
    .getUserExtraConfigValue(accountId, "proactiveAlertPreferences")
    .catch(() => null);

  if (!store || typeof store !== "object") {
    return { ...DEFAULT_PROACTIVE_PREFERENCES };
  }

  return {
    isProactiveAlertsEnabled: store.isProactiveAlertsEnabled ?? DEFAULT_PROACTIVE_PREFERENCES.isProactiveAlertsEnabled,
    categories: {
      ...DEFAULT_PROACTIVE_PREFERENCES.categories,
      ...(store.categories || {}),
    },
    schedules: {
      ...DEFAULT_PROACTIVE_PREFERENCES.schedules,
      ...(store.schedules || {}),
    },
    thresholds: {
      ...DEFAULT_PROACTIVE_PREFERENCES.thresholds,
      ...(store.thresholds || {}),
    },
    quietHours: {
      ...DEFAULT_PROACTIVE_PREFERENCES.quietHours,
      ...(store.quietHours || {}),
    },
  };
}

export async function saveProactiveAlertPreferences(
  accountId: string,
  patch: Partial<ProactiveAlertPreferences>
): Promise<ProactiveAlertPreferences> {
  const current = await getProactiveAlertPreferences(accountId);
  const updated: ProactiveAlertPreferences = {
    isProactiveAlertsEnabled: patch.isProactiveAlertsEnabled ?? current.isProactiveAlertsEnabled,
    categories: {
      ...current.categories,
      ...(patch.categories || {}),
    },
    schedules: {
      ...current.schedules,
      ...(patch.schedules || {}),
    },
    thresholds: {
      ...current.thresholds,
      ...(patch.thresholds || {}),
    },
    quietHours: {
      ...current.quietHours,
      ...(patch.quietHours || {}),
    },
  };

  await proactiveServiceDeps.saveUserExtraConfigPatch(accountId, {
    proactiveAlertPreferences: updated,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// 5. HELPER LOGIC: TIMEZONES, QUIET HOURS, COOLDOWNS
// ---------------------------------------------------------------------------

export function isWithinQuietHours(
  quietHours: ProactiveAlertPreferences["quietHours"],
  _timezone = "Asia/Karachi"
): boolean {
  if (!quietHours || !quietHours.enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (quietHours.start || "23:00").split(":").map(Number);
  const [endH, endM] = (quietHours.end || "08:00").split(":").map(Number);

  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes > endMinutes) {
    // Overnight window (e.g. 23:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Same day window (e.g. 13:00 to 15:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

export function computeDeduplicationKey(
  accountId: string,
  signalType: ProactiveSignalType,
  resourceId?: string,
  botId?: string
): string {
  const cleanAccount = String(accountId || "").trim();
  const cleanType = String(signalType || "").trim();
  const cleanResource = String(resourceId || "general").trim();
  const cleanBot = String(botId || "all").trim();
  return `${cleanAccount}:${cleanBot}:${cleanType}:${cleanResource}`;
}

export function getDefaultCooldownMinutes(signalType: ProactiveSignalType, severity: ProactiveSignalSeverity): number {
  if (severity === "URGENT") return 60; // 1 hour for urgent
  switch (signalType) {
    case "whatsapp_disconnected":
      return 60;
    case "stock_low":
    case "stock_out":
      return 180; // 3 hours
    case "billing_low_wallet":
      return 240; // 4 hours
    case "ai_replies_failing":
      return 60;
    case "campaign_failed":
      return 120; // 2 hours
    case "integration_sync_failed":
      return 60;
    default:
      return 60;
  }
}

// ---------------------------------------------------------------------------
// 6. ALERT CONTEXT MANAGEMENT (FOR NATURAL REPLIES)
// ---------------------------------------------------------------------------

export function rememberActiveAlertContext(context: ActiveAlertContext): void {
  const key = `${context.accountId}:${context.adminJid}`;
  inMemoryAlertContexts.set(key, context);
}

export function getActiveAlertContext(accountId: string, adminJid: string): ActiveAlertContext | null {
  const key = `${accountId}:${adminJid}`;
  const ctx = inMemoryAlertContexts.get(key);
  if (!ctx) return null;

  if (Date.now() > ctx.expiresAt) {
    inMemoryAlertContexts.delete(key);
    return null;
  }
  return ctx;
}

export function clearActiveAlertContext(accountId: string, adminJid: string): void {
  const key = `${accountId}:${adminJid}`;
  inMemoryAlertContexts.delete(key);
}

// ---------------------------------------------------------------------------
// 7. ALERT MESSAGE COMPOSITION
// ---------------------------------------------------------------------------

export function composeProactiveAlertMessage(signal: ProactiveSignal): string {
  const { signalType, severity, evidence } = signal;

  let header = "";
  if (severity === "URGENT") header = "🚨 *URGENT ALERT*";
  else if (severity === "IMPORTANT") header = "⚠️ *IMPORTANT NOTIFICATION*";
  else header = "ℹ️ *BUSINESS UPDATE*";

  let body = "";
  let impact = "";
  let nextSteps: string[] = [];

  switch (signalType) {
    case "whatsapp_disconnected":
      body = `*WhatsApp Instance Disconnected*\nYour bot instance "${evidence.botName || "BlackArrow Bot"}" has lost connection to WhatsApp.`;
      impact = "Customers will not receive automated AI replies until reconnected.";
      nextSteps = ["Reply *check bot status* to inspect connection.", "Scan QR in BlackArrow Dashboard to relink."];
      break;

    case "worker_unhealthy":
      body = `*Bot Worker Health Alert*\nThe background worker process encountered an operational fault.`;
      impact = "Message processing is temporarily degraded.";
      nextSteps = ["Reply *reload bot* to perform a safe config reload."];
      break;

    case "ai_replies_failing":
      body = `*AI Replies Degraded*\n${evidence.failureCount || 3} automated customer replies failed in the last ${evidence.windowMinutes || 15} minutes.`;
      impact = "Customers are waiting for responses.";
      nextSteps = ["Reply *show attention* to view affected conversations."];
      break;

    case "customer_unreplied":
      body = `*Customer Awaiting Attention*\nCustomer *${evidence.customerName || maskAdminIdentity(evidence.customerPhone || "")}* sent a message ${evidence.waitingMinutes || 30} minutes ago with no bot reply.`;
      impact = "Potential lead or order at risk of loss.";
      nextSteps = ["Reply *show me* to view customer details.", "Reply *add note* to assign to an agent."];
      break;

    case "human_handover_requested":
      body = `*Human Agent Takeover Requested*\nCustomer *${evidence.customerName || maskAdminIdentity(evidence.customerPhone || "")}* asked to speak with a human agent.\nReason: "${evidence.reason || "Customer assistance required"}"`;
      impact = "Bot is paused for this customer waiting for team response.";
      nextSteps = ["Reply *show me* to view conversation summary."];
      break;

    case "order_high_value":
      body = `*High-Value Order Received!*\nOrder *#${evidence.orderNumber || evidence.orderId}* for *$${Number(evidence.totalAmount || 0).toLocaleString()}* was placed by ${evidence.customerName || "Customer"}.`;
      impact = "Items: " + (evidence.itemsSummary || "Product Order");
      nextSteps = ["Reply *show me* to inspect order details.", "Reply *book courier* to prepare shipping."];
      break;

    case "order_operation_failed":
      body = `*Order Courier Booking Failed*\nAutomatic courier booking for Order *#${evidence.orderNumber || evidence.orderId}* failed.\nError: ${evidence.errorMessage || "API connection timeout"}`;
      impact = "Order shipment is delayed.";
      nextSteps = ["Reply *show me* to check order.", "Reply *retry booking* to attempt courier dispatch again."];
      break;

    case "stock_low":
      body = `*Low Stock Warning*\nProduct "*${evidence.productName || "Product"}*" is running low (Remaining: *${evidence.stock}* units).`;
      impact = "May run out of stock soon if orders continue.";
      nextSteps = ["Reply *update stock* to adjust inventory."];
      break;

    case "stock_out":
      body = `*Out of Stock Alert*\nProduct "*${evidence.productName || "Product"}*" is completely OUT OF STOCK (0 units).`;
      impact = "Customers attempting to purchase will be informed product is unavailable.";
      nextSteps = ["Reply *show me* to view product.", "Update inventory in Dashboard."];
      break;

    case "campaign_failed":
      body = `*Campaign Delivery Alert*\nCampaign "*${evidence.campaignName || "Automated Campaign"}*" encountered delivery issues.\n${evidence.failedCount || 1} out of ${evidence.totalCount || 1} messages failed.`;
      impact = "Some recipients did not receive the scheduled update.";
      nextSteps = ["Reply *show me* to check campaign report."];
      break;

    case "integration_sync_failed":
      body = `*Integration Sync Failure*\n${evidence.integrationName || "WooCommerce"} synchronization failed.\nReason: ${evidence.errorMessage || "HTTP 500 Server Error"}`;
      impact = "Product catalog or order statuses may be out of sync.";
      nextSteps = ["Reply *retry sync* to re-synchronize.", "Reply *check integrations* for status."];
      break;

    case "billing_low_wallet":
      body = `*Low Wallet Balance Alert*\nYour BlackArrow wallet balance is *$${Number(evidence.walletBalance || 0).toFixed(3)}* (Threshold: $${Number(evidence.threshold || 0.50).toFixed(2)}).`;
      impact = "Automated WhatsApp AI replies and marketing will pause if wallet reaches $0.";
      nextSteps = ["Visit BlackArrow Dashboard -> Wallet & Billing to top up."];
      break;

    case "billing_subscription_expiring":
      body = `*Subscription Expiring Soon*\nYour ${evidence.planName || "Pro"} plan expires in *${evidence.daysRemaining || 2} days* (${new Date(evidence.expiryDate).toLocaleDateString()}).`;
      impact = "Ensure automatic renewal is active to prevent service interruption.";
      nextSteps = ["Check subscription details in Dashboard."];
      break;

    case "security_event":
      body = `*Security Event Detected*\n${evidence.description || "Unusual administrative activity detected on your account."}`;
      impact = "Please verify that this action was authorized by your team.";
      nextSteps = ["Reply *security overview* to inspect sessions."];
      break;

    case "performance_anomaly":
      body = `*Business Performance Notice*\n${evidence.metricName || "Daily Revenue"} is *${evidence.changePercentage > 0 ? "+" : ""}${evidence.changePercentage}%* compared to ${evidence.comparisonPeriod || "last week's average"} ($${evidence.currentValue} vs $${evidence.comparisonValue}).`;
      impact = "Statistical performance shift detected.";
      nextSteps = ["Reply *today overview* to see full breakdown."];
      break;

    default:
      body = `*Operational Notification*\n${evidence.summary || "A business event occurred that requires your attention."}`;
      nextSteps = ["Reply *status* to inspect system."];
  }

  let text = `${header}\n\n${body}\n\n`;
  if (impact) {
    text += `• *Impact:* ${impact}\n\n`;
  }
  if (nextSteps.length > 0) {
    text += `👉 *Next Steps:*\n` + nextSteps.map((s) => `• ${s}`).join("\n");
  }

  return text.trim();
}

// ---------------------------------------------------------------------------
// 8. CENTRAL EVALUATION & DISPATCH PIPELINE
// ---------------------------------------------------------------------------

export async function evaluateAndDispatchSignal(
  signalInput: Omit<ProactiveSignal, "signalId" | "detectedAt" | "status">,
  options: {
    sock?: any;
    botSentMessageIds?: Set<string>;
    io?: any;
    emitLiveConsoleEvent?: (event: any) => void;
  } = {}
): Promise<DispatchSignalResult> {
  const signalId = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const accountId = signalInput.accountId;

  // 1. Fetch Account & Preferences
  const prefs = await getProactiveAlertPreferences(accountId);
  const user = (await proactiveServiceDeps.getUser(accountId).catch(() => null)) as any;

  // 2. Validate Master Proactive Toggle
  if (!prefs.isProactiveAlertsEnabled) {
    return {
      dispatched: false,
      signalId,
      status: "SUPPRESSED",
      suppressReason: "proactive_alerts_disabled",
      billedAmountUsd: 0,
    };
  }

  // 3. Map Signal Type to Category Toggle
  let categoryKey: keyof typeof prefs.categories = "operations";
  if (["whatsapp_disconnected", "worker_unhealthy", "ai_replies_failing"].includes(signalInput.signalType)) {
    categoryKey = "operations";
  } else if (["customer_unreplied", "human_handover_requested"].includes(signalInput.signalType)) {
    categoryKey = "customers";
  } else if (["order_high_value", "order_operation_failed"].includes(signalInput.signalType)) {
    categoryKey = "orders";
  } else if (["stock_low", "stock_out"].includes(signalInput.signalType)) {
    categoryKey = "stock";
  } else if (["campaign_failed"].includes(signalInput.signalType)) {
    categoryKey = "campaigns";
  } else if (["integration_sync_failed"].includes(signalInput.signalType)) {
    categoryKey = "integrations";
  } else if (["billing_low_wallet", "billing_subscription_expiring"].includes(signalInput.signalType)) {
    categoryKey = "billing";
  } else if (["security_event"].includes(signalInput.signalType)) {
    categoryKey = "security";
  } else if (signalInput.signalType === "daily_digest") {
    categoryKey = "dailyDigest";
  } else if (signalInput.signalType === "weekly_digest") {
    categoryKey = "weeklyDigest";
  }

  if (prefs.categories[categoryKey] === false) {
    return {
      dispatched: false,
      signalId,
      status: "SUPPRESSED",
      suppressReason: `category_${categoryKey}_disabled`,
      billedAmountUsd: 0,
    };
  }

  // 4. Check Deduplication & Cooldown
  const dedupKey = signalInput.deduplicationKey || computeDeduplicationKey(accountId, signalInput.signalType, signalInput.resourceId, signalInput.botId);
  const existingIncident = inMemoryIncidents.get(dedupKey);

  const cooldownMinutes = signalInput.cooldownMinutes || getDefaultCooldownMinutes(signalInput.signalType, signalInput.severity);
  const cooldownMs = cooldownMinutes * 60 * 1000;

  if (existingIncident) {
    if (existingIncident.status === "DISMISSED") {
      return {
        dispatched: false,
        signalId,
        incidentId: existingIncident.incidentId,
        status: "DISMISSED",
        suppressReason: "incident_dismissed_by_admin",
        billedAmountUsd: 0,
      };
    }

    if (existingIncident.status === "OPEN" && now < existingIncident.cooldownUntil) {
      return {
        dispatched: false,
        signalId,
        incidentId: existingIncident.incidentId,
        status: "SUPPRESSED",
        suppressReason: "cooldown_active",
        billedAmountUsd: 0,
      };
    }
  }

  // 5. Check Quiet Hours
  if (prefs.quietHours.enabled && isWithinQuietHours(prefs.quietHours, prefs.schedules.timezone)) {
    const isUrgent = signalInput.severity === "URGENT";
    if (!isUrgent || !prefs.quietHours.urgentBypass) {
      return {
        dispatched: false,
        signalId,
        status: "SUPPRESSED",
        suppressReason: "quiet_hours_active",
        billedAmountUsd: 0,
      };
    }
  }

  // 6. Entitlement & Wallet Check ($0.003 minimum)
  const billing = getBillingAccess(user);
  const hasAccess = Boolean(billing.canUsePaidFeatures || billing.paidActive || billing.status === "paid" || billing.status === "trial" || user?.role === "admin");
  if (!hasAccess) {
    return {
      dispatched: false,
      signalId,
      status: "SUPPRESSED",
      suppressReason: "entitlement_restricted",
      billedAmountUsd: 0,
    };
  }

  const walletBalance = Number(user?.wallet_balance || 0);
  if (walletBalance < 0.003 && user?.role !== "admin") {
    return {
      dispatched: false,
      signalId,
      status: "SUPPRESSED",
      suppressReason: "insufficient_wallet",
      billedAmountUsd: 0,
    };
  }

  // 7. Verify Admin WhatsApp Identity
  const adminPhone = String(user?.admin_alerts_phone || user?.adminPhone || user?.phone || "").trim();
  const isAssistantEnabled = user?.is_business_assistant_enabled !== false && user?.isBusinessAssistantEnabled !== false;

  if (!adminPhone || !isAssistantEnabled) {
    return {
      dispatched: false,
      signalId,
      status: "SUPPRESSED",
      suppressReason: "admin_assistant_not_configured",
      billedAmountUsd: 0,
    };
  }

  const adminDigits = adminPhone.replace(/\D/g, "");
  const adminJid = adminPhone.includes("@s.whatsapp.net") ? adminPhone : `${adminDigits}@s.whatsapp.net`;

  // 8. Build Full Signal Object & Message
  const signal: ProactiveSignal = {
    ...signalInput,
    signalId,
    detectedAt: now,
    deduplicationKey: dedupKey,
    status: "OPEN",
  };

  const messageText = composeProactiveAlertMessage(signal);

  // 9. Send via Canonical Outbound Business Assistant Path
  const context: AdminBusinessAssistantContext = {
    accountId,
    userId: accountId,
    botId: signalInput.botId || "primary",
    adminPhone,
    adminJid,
    adminRole: "owner",
    isBusinessAssistantEnabled: true,
    mode: "admin_business_assistant",
    conversationId: `proactive_${signalId}`,
    isAuthorizedAdmin: true,
    isPrimaryOwner: true,
  };

  const sendRes = await proactiveServiceDeps.sendAdminAssistantReply({
    sock: options.sock || {},
    context,
    text: messageText,
    botSentMessageIds: options.botSentMessageIds,
    io: options.io,
    emitLiveConsoleEvent: options.emitLiveConsoleEvent,
  });

  if (!sendRes.success) {
    recordAdminAuditEvent({
      accountId,
      adminJidMasked: maskAdminIdentity(adminJid),
      botId: signalInput.botId,
      actionId: "proactive_alert_send_failed",
      riskLevel: "READ",
      confirmationRequired: false,
      executionResult: "failed",
      metadata: { signalId, signalType: signal.signalType, reason: (sendRes as any).reason || "send_failed" },
    });

    return {
      dispatched: false,
      signalId,
      status: "SUPPRESSED",
      suppressReason: "outbound_send_failed",
      billedAmountUsd: 0,
      messageText,
    };
  }

  // 10. Update Durable Incident Record
  const incidentId = existingIncident?.incidentId || `inc_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const incidentRecord: ProactiveIncidentRecord = {
    incidentId,
    deduplicationKey: dedupKey,
    accountId,
    botId: signalInput.botId,
    signalType: signalInput.signalType,
    severity: signalInput.severity,
    status: "OPEN",
    firstDetectedAt: existingIncident?.firstDetectedAt || now,
    lastAlertedAt: now,
    alertCount: (existingIncident?.alertCount || 0) + 1,
    evidence: signalInput.evidence,
    cooldownUntil: now + cooldownMs,
  };
  inMemoryIncidents.set(dedupKey, incidentRecord);

  // 11. Remember Active Alert Context for Conversational Follow-up
  const alertContext: ActiveAlertContext = {
    contextId: `ctx_${now}_${Math.random().toString(36).slice(2, 7)}`,
    accountId,
    adminJid,
    incidentId,
    signalType: signalInput.signalType,
    resourceType: signalInput.resourceType,
    resourceId: signalInput.resourceId,
    recommendedReadAction: signalInput.recommendedReadAction,
    recommendedWriteAction: signalInput.recommendedWriteAction,
    metadata: signalInput.evidence,
    createdAt: now,
    expiresAt: now + 30 * 60 * 1000, // 30 mins TTL
  };
  rememberActiveAlertContext(alertContext);

  // 12. Record Audit & Live Console
  recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(adminJid),
    botId: signalInput.botId,
    actionId: "proactive_alert_dispatched",
    riskLevel: "READ",
    confirmationRequired: false,
    executionResult: "success",
    metadata: {
      signalId,
      incidentId,
      signalType: signal.signalType,
      severity: signal.severity,
      billedAmountUsd: 0.003,
    },
  });

  if (options.emitLiveConsoleEvent) {
    options.emitLiveConsoleEvent({
      type: "admin_proactive_alert_sent",
      level: "info",
      scope: "bot",
      accountId,
      botId: signalInput.botId,
      title: "Proactive Alert Sent",
      message: `Proactive notification [${signalInput.signalType}] delivered to admin (${maskAdminIdentity(adminJid)}). Billed $0.003.`,
      metadata: { signalId, incidentId, severity: signalInput.severity },
    });
  }

  return {
    dispatched: true,
    signalId,
    incidentId,
    status: "OPEN",
    billedAmountUsd: 0.003,
    messageText,
  };
}

// ---------------------------------------------------------------------------
// 9. INCIDENT RESOLUTION & RECOVERY ALERTS
// ---------------------------------------------------------------------------

export async function resolveIncident(
  accountId: string,
  dedupKey: string,
  options: {
    sendRecoveryAlert?: boolean;
    recoveryMessage?: string;
    sock?: any;
    io?: any;
    emitLiveConsoleEvent?: (event: any) => void;
  } = {}
): Promise<{ resolved: boolean; billedAmountUsd: number; message?: string }> {
  const incident = inMemoryIncidents.get(dedupKey);
  if (!incident || incident.status === "RESOLVED") {
    return { resolved: false, billedAmountUsd: 0 };
  }

  incident.status = "RESOLVED";
  incident.resolvedAt = Date.now();
  inMemoryIncidents.set(dedupKey, incident);

  let billedAmountUsd = 0;
  let text = "";

  if (options.sendRecoveryAlert) {
    const user = (await proactiveServiceDeps.getUser(accountId).catch(() => null)) as any;
    const adminPhone = String(user?.admin_alerts_phone || user?.adminPhone || user?.phone || "").trim();
    if (adminPhone) {
      const adminDigits = adminPhone.replace(/\D/g, "");
      const adminJid = adminPhone.includes("@s.whatsapp.net") ? adminPhone : `${adminDigits}@s.whatsapp.net`;

      text = options.recoveryMessage || `✅ *Incident Resolved*\n\nThe previous issue regarding "${incident.signalType}" has recovered and returned to normal operational state.`;

      const context: AdminBusinessAssistantContext = {
        accountId,
        userId: accountId,
        botId: incident.botId || "primary",
        adminPhone,
        adminJid,
        adminRole: "owner",
        isBusinessAssistantEnabled: true,
        mode: "admin_business_assistant",
        conversationId: `recovery_${incident.incidentId}`,
        isAuthorizedAdmin: true,
        isPrimaryOwner: true,
      };

      const sendRes = await proactiveServiceDeps.sendAdminAssistantReply({
        sock: options.sock || {},
        context,
        text,
        io: options.io,
        emitLiveConsoleEvent: options.emitLiveConsoleEvent,
      });

      if (sendRes.success) {
        billedAmountUsd = 0.003;
      }
    }
  }

  recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(accountId),
    botId: incident.botId,
    actionId: "proactive_incident_resolved",
    riskLevel: "READ",
    confirmationRequired: false,
    executionResult: "success",
    metadata: { incidentId: incident.incidentId, dedupKey, sendRecoveryAlert: options.sendRecoveryAlert },
  });

  return { resolved: true, billedAmountUsd, message: text };
}

export function dismissIncident(accountId: string, incidentIdOrDedupKey: string): boolean {
  for (const [key, inc] of inMemoryIncidents.entries()) {
    if ((key === incidentIdOrDedupKey || inc.incidentId === incidentIdOrDedupKey) && inc.accountId === accountId) {
      inc.status = "DISMISSED";
      inMemoryIncidents.set(key, inc);

      recordAdminAuditEvent({
        accountId,
        adminJidMasked: maskAdminIdentity(accountId),
        botId: inc.botId,
        actionId: "proactive_incident_dismissed",
        riskLevel: "SAFE_WRITE",
        confirmationRequired: false,
        executionResult: "success",
        metadata: { incidentId: inc.incidentId, dedupKey: key },
      });
      return true;
    }
  }
  return false;
}

export function snoozeIncident(accountId: string, incidentIdOrDedupKey: string, hours = 4): boolean {
  const boundedHours = Math.max(1, Math.min(24, Number(hours || 4)));
  for (const [key, inc] of inMemoryIncidents.entries()) {
    if ((key === incidentIdOrDedupKey || inc.incidentId === incidentIdOrDedupKey) && inc.accountId === accountId) {
      inc.cooldownUntil = Date.now() + boundedHours * 60 * 60 * 1000;
      inMemoryIncidents.set(key, inc);

      recordAdminAuditEvent({
        accountId,
        adminJidMasked: maskAdminIdentity(accountId),
        botId: inc.botId,
        actionId: "proactive_incident_snoozed",
        riskLevel: "SAFE_WRITE",
        confirmationRequired: false,
        executionResult: "success",
        metadata: { incidentId: inc.incidentId, snoozeHours: boundedHours },
      });
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 10. DAILY & WEEKLY BUSINESS DIGEST GENERATION
// ---------------------------------------------------------------------------

export async function generateDailyBusinessDigest(
  accountId: string,
  dateStr?: string
): Promise<{ text: string; data: any }> {
  const user = (await proactiveServiceDeps.getUser(accountId).catch(() => null)) as any;
  const range = resolveDateRangeBounds(dateStr || "today");

  // 1. Orders
  let orders: any[] = [];
  try {
    const res = await proactiveServiceDeps.databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
      Query.equal("user_id", accountId),
      Query.limit(100),
    ]);
    orders = res?.documents || [];
  } catch {}

  const dayOrders = orders.filter((o: any) => {
    const ts = new Date(o.$createdAt || o.created_at || Date.now()).getTime();
    return ts >= range.startMs && ts <= range.endMs;
  });

  const revenue = dayOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || o.total || 0), 0);
  const pendingOrders = orders.filter((o: any) => ["pending", "processing", "unconfirmed"].includes(String(o.status || "").toLowerCase()));

  // 2. Customers
  let customers: any[] = [];
  try {
    const custRes = await proactiveServiceDeps.databases.listDocuments(DATABASE_ID, COLLECTIONS.CUSTOMERS, [
      Query.equal("user_id", accountId),
      Query.limit(100),
    ]);
    customers = custRes?.documents || [];
  } catch {}

  const newCustomers = customers.filter((c: any) => {
    const ts = new Date(c.$createdAt || c.created_at || Date.now()).getTime();
    return ts >= range.startMs && ts <= range.endMs;
  });

  // 3. Products / Stock
  let products: any[] = [];
  try {
    const prodRes = await proactiveServiceDeps.databases.listDocuments(DATABASE_ID, COLLECTIONS.PRODUCTS, [
      Query.equal("user_id", accountId),
      Query.limit(100),
    ]);
    products = prodRes?.documents || [];
  } catch {}

  const lowStockCount = products.filter((p: any) => Number(p.stock ?? 0) > 0 && Number(p.stock ?? 0) <= 5).length;
  const outOfStockCount = products.filter((p: any) => Number(p.stock ?? 0) === 0).length;

  // 4. Connected Bots
  const bots = await proactiveServiceDeps.getBotsByUser(accountId).catch(() => []);
  const activeBots = (bots || []).filter((b: any) => isInstanceLiveConnected(b));

  const walletBalance = Number(user?.wallet_balance || 0);

  let text = `🌅 *Daily Business Digest (${range.label})*\n\n`;
  text += `🛒 *New Orders:* ${dayOrders.length}\n`;
  text += `💰 *Revenue Today:* $${revenue.toLocaleString()}\n`;
  text += `👥 *New Leads / Customers:* ${newCustomers.length}\n`;
  text += `⏳ *Pending Orders Needing Dispatch:* ${pendingOrders.length}\n`;
  text += `🤖 *Connected Bots:* ${activeBots.length}/${(bots || []).length}\n`;
  text += `💳 *Wallet Balance:* $${walletBalance.toFixed(3)}\n\n`;

  const attention: string[] = [];
  if (outOfStockCount > 0) attention.push(`🚫 ${outOfStockCount} product(s) out of stock`);
  if (lowStockCount > 0) attention.push(`📦 ${lowStockCount} product(s) low stock`);
  if (activeBots.length === 0 && (bots || []).length > 0) attention.push(`⚠️ WhatsApp bot is disconnected`);
  if (pendingOrders.length > 3) attention.push(`⏳ ${pendingOrders.length} pending orders waiting`);

  if (attention.length > 0) {
    text += `🚨 *Key Attention Items:*\n` + attention.map((i) => `• ${i}`).join("\n");
  } else {
    text += `✨ *All systems and inventory operating smoothly.*`;
  }

  return {
    text: text.trim(),
    data: {
      date: range.label,
      ordersCount: dayOrders.length,
      revenue,
      newCustomersCount: newCustomers.length,
      pendingOrdersCount: pendingOrders.length,
      walletBalance,
      attention,
    },
  };
}

export async function generateWeeklyBusinessDigest(
  accountId: string,
  weekStr?: string
): Promise<{ text: string; data: any }> {
  const user = (await proactiveServiceDeps.getUser(accountId).catch(() => null)) as any;
  const thisWeek = resolveDateRangeBounds(weekStr || "this_week");
  const lastWeek = resolveDateRangeBounds("last_week");

  let orders: any[] = [];
  try {
    const res = await proactiveServiceDeps.databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
      Query.equal("user_id", accountId),
      Query.limit(200),
    ]);
    orders = res?.documents || [];
  } catch {}

  const thisWeekOrders = orders.filter((o: any) => {
    const ts = new Date(o.$createdAt || o.created_at || Date.now()).getTime();
    return ts >= thisWeek.startMs && ts <= thisWeek.endMs;
  });

  const lastWeekOrders = orders.filter((o: any) => {
    const ts = new Date(o.$createdAt || o.created_at || Date.now()).getTime();
    return ts >= lastWeek.startMs && ts <= lastWeek.endMs;
  });

  const thisWeekRev = thisWeekOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || o.total || 0), 0);
  const lastWeekRev = lastWeekOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || o.total || 0), 0);

  const revGrowth = lastWeekRev > 0 ? Math.round(((thisWeekRev - lastWeekRev) / lastWeekRev) * 100) : 0;
  const orderGrowth = lastWeekOrders.length > 0 ? Math.round(((thisWeekOrders.length - lastWeekOrders.length) / lastWeekOrders.length) * 100) : 0;

  const walletBalance = Number(user?.wallet_balance || 0);

  let text = `📈 *Weekly Business Digest*\n\n`;
  text += `🛒 *Total Orders This Week:* ${thisWeekOrders.length} (${orderGrowth >= 0 ? "+" : ""}${orderGrowth}% vs last week)\n`;
  text += `💰 *Weekly Revenue:* $${thisWeekRev.toLocaleString()} (${revGrowth >= 0 ? "+" : ""}${revGrowth}% vs last week)\n`;
  text += `💳 *Current Wallet Balance:* $${walletBalance.toFixed(3)}\n\n`;
  text += `🎯 *Recommendation:* Review low-stock inventory and prepare upcoming automated campaigns in Dashboard.`;

  return {
    text: text.trim(),
    data: {
      thisWeekOrdersCount: thisWeekOrders.length,
      lastWeekOrdersCount: lastWeekOrders.length,
      thisWeekRevenue: thisWeekRev,
      lastWeekRevenue: lastWeekRev,
      revenueGrowthPercentage: revGrowth,
      orderGrowthPercentage: orderGrowth,
      walletBalance,
    },
  };
}

export async function dispatchDailyDigest(
  accountId: string,
  options: {
    sock?: any;
    force?: boolean;
    dateStr?: string;
    io?: any;
    emitLiveConsoleEvent?: (event: any) => void;
  } = {}
): Promise<DispatchSignalResult> {
  const todayKey = `${accountId}:daily_digest:${options.dateStr || new Date().toISOString().slice(0, 10)}`;
  if (!options.force && inMemoryDigestHistory.has(todayKey)) {
    return {
      dispatched: false,
      signalId: `sig_digest_dup_${Date.now()}`,
      status: "SUPPRESSED",
      suppressReason: "already_sent_today",
      billedAmountUsd: 0,
    };
  }

  const digest = await generateDailyBusinessDigest(accountId, options.dateStr);
  const result = await evaluateAndDispatchSignal(
    {
      signalType: "daily_digest",
      accountId,
      severity: "INFO",
      resourceType: "digest",
      evidence: digest.data,
      deduplicationKey: todayKey,
    },
    options
  );

  if (result.dispatched) {
    inMemoryDigestHistory.add(todayKey);
  }

  return result;
}

export async function dispatchWeeklyDigest(
  accountId: string,
  options: {
    sock?: any;
    force?: boolean;
    weekStr?: string;
    io?: any;
    emitLiveConsoleEvent?: (event: any) => void;
  } = {}
): Promise<DispatchSignalResult> {
  const now = new Date();
  const weekNumber = Math.ceil((now.getDate() - 1 - now.getDay()) / 7);
  const weekKey = `${accountId}:weekly_digest:${now.getFullYear()}_W${weekNumber}`;

  if (!options.force && inMemoryDigestHistory.has(weekKey)) {
    return {
      dispatched: false,
      signalId: `sig_digest_dup_${Date.now()}`,
      status: "SUPPRESSED",
      suppressReason: "already_sent_this_week",
      billedAmountUsd: 0,
    };
  }

  const digest = await generateWeeklyBusinessDigest(accountId, options.weekStr);
  const result = await evaluateAndDispatchSignal(
    {
      signalType: "weekly_digest",
      accountId,
      severity: "INFO",
      resourceType: "digest",
      evidence: digest.data,
      deduplicationKey: weekKey,
    },
    options
  );

  if (result.dispatched) {
    inMemoryDigestHistory.add(weekKey);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 11. DETERMINISTIC BUSINESS PERFORMANCE ANOMALY DETECTION
// ---------------------------------------------------------------------------

export async function evaluateBusinessPerformanceChange(
  accountId: string
): Promise<{ hasAnomaly: boolean; signal?: Partial<ProactiveSignal> }> {
  // Enforce minimum data requirement (minimum 5 orders in recent history)
  let orders: any[] = [];
  try {
    const res = await proactiveServiceDeps.databases.listDocuments(DATABASE_ID, COLLECTIONS.ORDERS, [
      Query.equal("user_id", accountId),
      Query.limit(50),
    ]);
    orders = res?.documents || [];
  } catch {}

  if (orders.length < 5) {
    // Insufficient historical data to produce valid statistical anomalies
    return { hasAnomaly: false };
  }

  const today = resolveDateRangeBounds("today");
  const last7Days = resolveDateRangeBounds("last_7_days");

  const todayOrders = orders.filter((o: any) => {
    const ts = new Date(o.$createdAt || o.created_at || Date.now()).getTime();
    return ts >= today.startMs && ts <= today.endMs;
  });

  const last7Orders = orders.filter((o: any) => {
    const ts = new Date(o.$createdAt || o.created_at || Date.now()).getTime();
    return ts >= last7Days.startMs && ts < today.startMs;
  });

  const avgDailyRevenue = (last7Orders.reduce((s: number, o: any) => s + Number(o.total_amount || o.total || 0), 0)) / 6;
  const todayRevenue = todayOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || o.total || 0), 0);

  if (avgDailyRevenue > 50) {
    const diff = todayRevenue - avgDailyRevenue;
    const pctChange = Math.round((diff / avgDailyRevenue) * 100);

    if (pctChange >= 100 || pctChange <= -60) {
      return {
        hasAnomaly: true,
        signal: {
          signalType: "performance_anomaly",
          accountId,
          severity: "INFO",
          resourceType: "performance",
          evidence: {
            metricName: "Daily Sales Revenue",
            changePercentage: pctChange,
            currentValue: todayRevenue,
            comparisonValue: Math.round(avgDailyRevenue),
            comparisonPeriod: "6-day average",
          },
          deduplicationKey: `${accountId}:performance_anomaly:${new Date().toISOString().slice(0, 10)}`,
        },
      };
    }
  }

  return { hasAnomaly: false };
}

// ---------------------------------------------------------------------------
// 12. PROACTIVE ACTION HANDLERS (REGISTERED ACTIONS)
// ---------------------------------------------------------------------------

export async function handleGetProactiveAlertSettings(
  context: AdminBusinessAssistantContext
): Promise<{ success: boolean; message: string; data: any }> {
  const prefs = await getProactiveAlertPreferences(context.accountId);

  let text = `⚙️ *Proactive Alerts & Digests Settings*\n\n`;
  text += `• *Master Proactive Alerts:* ${prefs.isProactiveAlertsEnabled ? "🟢 ENABLED" : "⚪ DISABLED (Default)"}\n\n`;
  text += `*Event Categories:*\n`;
  text += `• Operations & Bot Health: ${prefs.categories.operations ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Customer Attention & Handover: ${prefs.categories.customers ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Orders & Courier Booking: ${prefs.categories.orders ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Stock & Inventory: ${prefs.categories.stock ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Campaigns & Broadcasts: ${prefs.categories.campaigns ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Integrations (WooCommerce/PostEx): ${prefs.categories.integrations ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Billing & Low Wallet: ${prefs.categories.billing ? "✅ Active" : "⚪ Off"}\n`;
  text += `• Security & Login Alerts: ${prefs.categories.security ? "✅ Active" : "⚪ Off"}\n\n`;
  text += `*Digests:*\n`;
  text += `• Daily Digest: ${prefs.categories.dailyDigest ? `🟢 On (${prefs.schedules.dailyDigestTime})` : "⚪ Off"}\n`;
  text += `• Weekly Digest: ${prefs.categories.weeklyDigest ? `🟢 On (Monday 09:00)` : "⚪ Off"}\n\n`;
  text += `*Thresholds:*\n`;
  text += `• High-Value Order: $${prefs.thresholds.highValueOrderUsd}\n`;
  text += `• Low Wallet Floor: $${prefs.thresholds.lowWalletAlertFloorUsd.toFixed(2)}\n`;
  text += `• Low Stock Level: ${prefs.thresholds.lowStockThreshold} units\n\n`;
  text += `*(Proactive notifications cost $0.003 only upon successful WhatsApp delivery).*`;

  return {
    success: true,
    message: text.trim(),
    data: prefs,
  };
}

export async function handleUpdateProactiveAlertCategory(
  context: AdminBusinessAssistantContext,
  params: { category: string; enabled: boolean }
): Promise<{ success: boolean; message: string; data?: any }> {
  const cleanCat = String(params.category || "").toLowerCase().trim();
  const enabled = params.enabled !== false;

  const validCategories = [
    "operations",
    "customers",
    "orders",
    "stock",
    "campaigns",
    "integrations",
    "billing",
    "security",
    "dailydigest",
    "weeklydigest",
  ];

  if (!validCategories.includes(cleanCat)) {
    return {
      success: false,
      message: `❌ Invalid proactive alert category "${params.category}". Allowed: ${validCategories.join(", ")}`,
    };
  }

  const catMap: Record<string, keyof ProactiveAlertPreferences["categories"]> = {
    operations: "operations",
    customers: "customers",
    orders: "orders",
    stock: "stock",
    campaigns: "campaigns",
    integrations: "integrations",
    billing: "billing",
    security: "security",
    dailydigest: "dailyDigest",
    weeklydigest: "weeklyDigest",
  };

  const key = catMap[cleanCat];
  const patch: Partial<ProactiveAlertPreferences> = {
    categories: { [key]: enabled } as any,
  };

  // If enabling a category, also enable master proactive toggle if it was off
  if (enabled) {
    patch.isProactiveAlertsEnabled = true;
  }

  const updated = await saveProactiveAlertPreferences(context.accountId, patch);

  return {
    success: true,
    message: `✅ *Proactive Alert Category Updated*\n\nCategory "*${key}*" is now *${enabled ? "ENABLED" : "DISABLED"}*.\nMaster Proactive Notifications: ${updated.isProactiveAlertsEnabled ? "🟢 Active" : "⚪ Off"}.`,
    data: updated,
  };
}

export async function handleSetDailyDigestTime(
  context: AdminBusinessAssistantContext,
  params: { time: string }
): Promise<{ success: boolean; message: string; data?: any }> {
  const rawTime = String(params.time || "").trim();
  const timeMatch = rawTime.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);

  if (!timeMatch) {
    return {
      success: false,
      message: `❌ Invalid time format "${rawTime}". Please provide time in HH:MM (24-hour format, e.g. "09:00" or "18:30").`,
    };
  }

  const formattedTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  const updated = await saveProactiveAlertPreferences(context.accountId, {
    schedules: { dailyDigestTime: formattedTime } as any,
    categories: { dailyDigest: true } as any,
    isProactiveAlertsEnabled: true,
  });

  return {
    success: true,
    message: `✅ *Daily Business Digest Scheduled*\n\nYour daily business digest will be sent at *${formattedTime}* (Account Business Timezone).\nCost: $0.003 / successful daily digest.`,
    data: updated,
  };
}

export async function handleSetHighValueOrderThreshold(
  context: AdminBusinessAssistantContext,
  params: { threshold: number }
): Promise<{ success: boolean; message: string; data?: any }> {
  const val = Number(params.threshold);
  if (isNaN(val) || val < 0) {
    return {
      success: false,
      message: `❌ Invalid threshold value. Please provide a positive number (e.g. 100 or 500).`,
    };
  }

  const updated = await saveProactiveAlertPreferences(context.accountId, {
    thresholds: { highValueOrderUsd: val } as any,
  });

  return {
    success: true,
    message: `✅ *High-Value Order Threshold Set*\n\nYou will receive an alert whenever an order exceeds *$${val.toLocaleString()}*.`,
    data: updated,
  };
}

export async function handleSetLowWalletAlertThreshold(
  context: AdminBusinessAssistantContext,
  params: { threshold: number }
): Promise<{ success: boolean; message: string; data?: any }> {
  const val = Number(params.threshold);
  if (isNaN(val) || val <= 0.003) {
    return {
      success: false,
      message: `❌ Low wallet alert threshold must be greater than $0.003 (minimum message fee) to allow useful notifications. Suggested: $0.50 or $1.00.`,
    };
  }

  const updated = await saveProactiveAlertPreferences(context.accountId, {
    thresholds: { lowWalletAlertFloorUsd: val } as any,
  });

  return {
    success: true,
    message: `✅ *Low Wallet Alert Floor Set*\n\nYou will receive an alert whenever your wallet balance drops below *$${val.toFixed(2)}*.`,
    data: updated,
  };
}

// ---------------------------------------------------------------------------
// 14. PROACTIVE SCHEDULER WIRING & EXECUTION
// ---------------------------------------------------------------------------

export const PROACTIVE_SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let proactiveSchedulerTimer: NodeJS.Timeout | null = null;
let proactiveSchedulerInitialTimeout: NodeJS.Timeout | null = null;
let isProactiveSchedulerActive = false;

export function isProactiveSchedulerRunning(): boolean {
  return isProactiveSchedulerActive;
}

export function isProactiveSchedulerEnabled(env: Record<string, any> = process.env): boolean {
  return String(env.ADMIN_PROACTIVE_SCHEDULER_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

export async function runProactiveSchedulerScan(): Promise<{
  scannedUsers: number;
  dailyDigestsSent: number;
  weeklyDigestsSent: number;
  signalsDispatched: number;
}> {
  let dailyDigestsSent = 0;
  let weeklyDigestsSent = 0;
  let signalsDispatched = 0;

  if (!isProactiveSchedulerEnabled()) {
    return { scannedUsers: 0, dailyDigestsSent: 0, weeklyDigestsSent: 0, signalsDispatched: 0 };
  }

  let users: any[] = [];
  try {
    users = (await proactiveServiceDeps.listUsers?.().catch(() => [])) || [];
    if (!users.length) {
      const res = await proactiveServiceDeps.databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [
        Query.limit(500),
      ]).catch(() => ({ documents: [] }));
      users = res.documents || [];
    }
  } catch {}

  const now = new Date();

  for (const user of users) {
    const accountId = user?.$id || user?.id;
    if (!accountId) continue;

    const isAssistantEnabled = user?.is_business_assistant_enabled ?? user?.business_assistant_enabled ?? false;
    const adminPhone = user?.admin_alerts_phone || user?.admin_number || user?.whatsapp_number || "";
    if (!isAssistantEnabled || !adminPhone) continue;

    const prefs = await getProactiveAlertPreferences(accountId);
    if (!prefs.isProactiveAlertsEnabled) continue;

    // 1. Daily Digest
    if (prefs.categories.dailyDigest) {
      const targetTime = prefs.schedules?.dailyDigestTime || "09:00";
      const [targetH, targetM] = targetTime.split(":").map(Number);
      const tz = prefs.schedules?.timezone || "Asia/Karachi";

      let localHours = now.getHours();
      let localMinutes = now.getMinutes();
      try {
        const timeStr = now.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
        const [h, m] = timeStr.split(":").map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          localHours = h;
          localMinutes = m;
        }
      } catch {}

      const targetMinOfDay = (targetH || 9) * 60 + (targetM || 0);
      const currentMinOfDay = localHours * 60 + localMinutes;
      if (Math.abs(currentMinOfDay - targetMinOfDay) <= 15) {
        const res = await dispatchDailyDigest(accountId).catch(() => ({ dispatched: false } as any));
        if (res.dispatched) dailyDigestsSent++;
      }
    }

    // 2. Weekly Digest
    if (prefs.categories.weeklyDigest) {
      const targetDay = prefs.schedules?.weeklyDigestDay ?? 1; // Monday
      const tz = prefs.schedules?.timezone || "Asia/Karachi";
      let localDay = now.getDay();
      let localHours = now.getHours();
      try {
        const dayStr = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        if (typeof dayMap[dayStr] === "number") localDay = dayMap[dayStr];
      } catch {}

      if (localDay === targetDay && localHours >= 9 && localHours <= 11) {
        const res = await dispatchWeeklyDigest(accountId).catch(() => ({ dispatched: false } as any));
        if (res.dispatched) weeklyDigestsSent++;
      }
    }

    // 3. Performance Anomaly Check
    if (prefs.categories.operations || prefs.categories.orders) {
      const anomaly = await evaluateBusinessPerformanceChange(accountId).catch(() => ({ hasAnomaly: false } as any));
      if (anomaly.hasAnomaly && anomaly.signal) {
        const res = await evaluateAndDispatchSignal(anomaly.signal as ProactiveSignal).catch(() => ({ dispatched: false } as any));
        if (res.dispatched) signalsDispatched++;
      }
    }
  }

  return {
    scannedUsers: users.length,
    dailyDigestsSent,
    weeklyDigestsSent,
    signalsDispatched,
  };
}

export function startProactiveBusinessScheduler(): void {
  if (!isProactiveSchedulerEnabled()) {
    console.log("[ProactiveScheduler] Disabled by ADMIN_PROACTIVE_SCHEDULER_ENABLED=false.");
    return;
  }

  if (proactiveSchedulerTimer) {
    return; // Already running
  }

  console.log("[ProactiveScheduler] Proactive Business Manager Scheduler started. Scanning every 5 minutes.");
  isProactiveSchedulerActive = true;

  let isScanning = false;
  const tick = async () => {
    if (isScanning) return;
    isScanning = true;
    try {
      await runProactiveSchedulerScan();
    } catch (e: any) {
      console.error("[ProactiveScheduler] Tick error:", e?.message || e);
    } finally {
      isScanning = false;
    }
  };

  proactiveSchedulerInitialTimeout = setTimeout(tick, 60 * 1000);
  proactiveSchedulerTimer = setInterval(tick, PROACTIVE_SCHEDULER_INTERVAL_MS);
}

export function stopProactiveBusinessScheduler(): void {
  if (proactiveSchedulerInitialTimeout) {
    clearTimeout(proactiveSchedulerInitialTimeout);
    proactiveSchedulerInitialTimeout = null;
  }
  if (proactiveSchedulerTimer) {
    clearInterval(proactiveSchedulerTimer);
    proactiveSchedulerTimer = null;
  }
  isProactiveSchedulerActive = false;
}
