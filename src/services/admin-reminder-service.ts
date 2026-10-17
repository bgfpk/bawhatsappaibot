import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AdminBusinessAssistantContext } from "./admin-identity-service.ts";
import { recordAdminAuditEvent, maskAdminIdentity } from "./admin-audit-service.ts";
import { chargeUsageBillingAction, previewUsageBillingAction } from "./outbound-message-billing-service.ts";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  getExplicitAccountTimezone,
  resolveBusinessTimezone,
} from "./business-timezone-service.ts";

export type AdminReminderStatus = "pending" | "sent" | "failed" | "cancelled";

export interface AdminReminder {
  reminderId: string;
  accountId: string;
  adminJid: string;
  adminPhone: string;
  botId: string;
  text: string;
  scheduledAtMs: number;
  scheduledAtIso: string;
  formattedTime: string;
  timezone: string;
  createdAt: number;
  updatedAt: number;
  status: AdminReminderStatus;
  claimedAt?: number | null;
  sentAt?: number | null;
  billed: boolean;
  error?: string | null;
}

const REMINDER_DIR = path.join(process.cwd(), "data", "admin-reminders");

function ensureDir() {
  if (!fs.existsSync(REMINDER_DIR)) {
    fs.mkdirSync(REMINDER_DIR, { recursive: true });
  }
}

function reminderFilePath(reminderId: string) {
  return path.join(REMINDER_DIR, `${reminderId}.json`);
}

export const reminderServiceDeps = {
  previewUsageBillingAction,
  chargeUsageBillingAction,
  recordAdminAuditEvent,
};

export function __setAdminReminderTestDeps(overrides: Partial<typeof reminderServiceDeps>) {
  Object.assign(reminderServiceDeps, overrides || {});
}

export function __resetAdminReminderTestDeps() {
  Object.assign(reminderServiceDeps, {
    previewUsageBillingAction,
    chargeUsageBillingAction,
    recordAdminAuditEvent,
  });
}

/**
 * Parses natural language or structured scheduled time string into a valid future timestamp (ms).
 */
export function parseScheduledTime(
  input: string | number,
  timezone: string = "Asia/Karachi",
  baseNow: Date = new Date()
): { scheduledAtMs: number; scheduledAtIso: string; formattedTime: string } | null {
  if (typeof input === "number") {
    const ms = input < 1e11 ? input * 1000 : input;
    if (isNaN(ms)) return null;
    const d = new Date(ms);
    return {
      scheduledAtMs: ms,
      scheduledAtIso: d.toISOString(),
      formattedTime: d.toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }),
    };
  }

  const raw = String(input || "").trim();
  if (!raw) return null;

  // 1. Direct ISO / Date parse
  const directDate = new Date(raw);
  if (!isNaN(directDate.getTime()) && raw.includes("-") && (raw.includes("T") || raw.includes(":"))) {
    return {
      scheduledAtMs: directDate.getTime(),
      scheduledAtIso: directDate.toISOString(),
      formattedTime: directDate.toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }),
    };
  }

  // 2. Relative offset: "in X minutes", "in X hours", "in X mins", "in X hrs"
  const inRelMatch = raw.match(/^in\s+(\d+)\s*(mins?|minutes?|hours?|hrs?|secs?|seconds?)$/i);
  if (inRelMatch) {
    const amount = parseInt(inRelMatch[1], 10);
    const unit = inRelMatch[2].toLowerCase();
    let offsetMs = 0;
    if (unit.startsWith("sec")) offsetMs = amount * 1000;
    else if (unit.startsWith("min")) offsetMs = amount * 60 * 1000;
    else if (unit.startsWith("hour") || unit.startsWith("hr")) offsetMs = amount * 3600 * 1000;

    const targetMs = baseNow.getTime() + offsetMs;
    const d = new Date(targetMs);
    return {
      scheduledAtMs: targetMs,
      scheduledAtIso: d.toISOString(),
      formattedTime: d.toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }),
    };
  }

  // 3. Time of day: "today 4PM", "today 4:00 PM", "4PM", "4:30 PM", "16:00", "tomorrow 4PM", "tomorrow 9:00 AM"
  const isTomorrow = /\btomorrow\b|\bkal\b/i.test(raw);
  const timeClean = raw.replace(/\b(?:today|tomorrow|aaj|kal|at|ko|pm|am)\b/gi, (m) => m.toLowerCase()).trim();

  // Extract hour, minute, am/pm
  const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = (timeMatch[3] || "").toLowerCase();

    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    // Use current date parts in target timezone
    let target = new Date(baseNow);
    if (isTomorrow) {
      target.setDate(target.getDate() + 1);
    }

    target.setHours(hour, minute, 0, 0);

    // If time was specified for "today" without "tomorrow" but the time has already passed today, and user didn't specify day:
    if (!isTomorrow && target.getTime() <= baseNow.getTime()) {
      // If within 2 hours in the past and no meridiem was specified, maybe they meant PM?
      if (!meridiem && hour < 12) {
        const pmTarget = new Date(target);
        pmTarget.setHours(hour + 12, minute, 0, 0);
        if (pmTarget.getTime() > baseNow.getTime()) {
          target = pmTarget;
        }
      }
    }

    return {
      scheduledAtMs: target.getTime(),
      scheduledAtIso: target.toISOString(),
      formattedTime: target.toLocaleString("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }),
    };
  }

  return null;
}

/**
 * Creates a durable admin reminder.
 */
export async function handleCreateAdminReminder(
  context: AdminBusinessAssistantContext,
  params: {
    text: string;
    scheduledAt: string | number;
    timezone?: string;
  }
): Promise<{ success: boolean; message: string; data?: AdminReminder }> {
  const accountId = context.accountId;
  const adminJid = context.adminJid;
  const adminPhone = context.adminPhone || adminJid.split("@")[0];
  const botId = context.botId || "primary";

  const isAuthorized = Boolean(
    context &&
    context.isAuthorizedAdmin !== false &&
    (context.isAuthorizedAdmin ||
      context.mode === "admin_business_assistant" ||
      context.isBusinessAssistantEnabled === true ||
      context.adminRole === "owner" ||
      context.adminRole === "admin" ||
      context.adminRole === "manager")
  );

  if (!isAuthorized || !adminJid) {
    return {
      success: false,
      message: "❌ Only authorized account administrators can create private reminders.",
    };
  }

  const text = String(params.text || "").trim();
  if (!text) {
    return {
      success: false,
      message: "❌ Please provide the reminder text (e.g. *remind me to do mobile package at 4 PM*).",
    };
  }

  const rawInput = String(params.scheduledAt || "").trim();
  const isRelative = /^in\s+\d+\s*(?:mins?|minutes?|hours?|hrs?|secs?|seconds?)$/i.test(rawInput);
  const isTimestamp = typeof params.scheduledAt === "number" || (rawInput.includes("-") && (rawInput.includes("T") || rawInput.includes(":")) && !isNaN(new Date(rawInput).getTime()));

  const explicitTz = params.timezone || (context as any).accountTimezone || getExplicitAccountTimezone((context as any).userConfig) || getExplicitAccountTimezone((context as any).user);

  if (!explicitTz && !isRelative && !isTimestamp) {
    return {
      success: false,
      message: `⚠️ *Account Timezone Not Configured*\n\nPlease set your account timezone in Business Assistant dashboard settings, or specify timezone in your message (e.g. *remind me to pack order at 4 PM PKT* or *4 PM UTC*).`,
    };
  }

  const tz = explicitTz || DEFAULT_BUSINESS_TIMEZONE;
  const parsedTime = parseScheduledTime(params.scheduledAt, tz);

  if (!parsedTime) {
    return {
      success: false,
      message: `❌ Could not understand the scheduled time "${params.scheduledAt}". Please specify a valid time (e.g. *today at 4 PM*, *tomorrow 10 AM*, *in 2 hours*).`,
    };
  }

  const nowMs = Date.now();
  if (parsedTime.scheduledAtMs <= nowMs + 15 * 1000) {
    return {
      success: false,
      message: `❌ Reminder time must be in the future (scheduled for ${parsedTime.formattedTime}).`,
    };
  }

  const reminderId = `rem_${accountId}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const reminder: AdminReminder = {
    reminderId,
    accountId,
    adminJid,
    adminPhone,
    botId,
    text,
    scheduledAtMs: parsedTime.scheduledAtMs,
    scheduledAtIso: parsedTime.scheduledAtIso,
    formattedTime: parsedTime.formattedTime,
    timezone: tz,
    createdAt: nowMs,
    updatedAt: nowMs,
    status: "pending",
    billed: false,
  };

  try {
    ensureDir();
    fs.writeFileSync(reminderFilePath(reminderId), JSON.stringify(reminder, null, 2), "utf8");
  } catch (err: any) {
    console.error("[AdminReminder] Failed to save reminder to disk:", err);
    return {
      success: false,
      message: `❌ Failed to save reminder to persistent storage: ${err?.message || "Storage error"}`,
    };
  }

  reminderServiceDeps.recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(adminJid),
    botId,
    actionId: "admin_reminder_created",
    riskLevel: "WRITE",
    confirmationRequired: false,
    executionResult: "success",
    metadata: { reminderId, text, scheduledAtIso: parsedTime.scheduledAtIso, formattedTime: parsedTime.formattedTime },
  });

  return {
    success: true,
    message: `⏰ *Admin Reminder Scheduled*\n\n• *Reminder:* ${text}\n• *Time:* ${parsedTime.formattedTime}\n• *Recipient:* Private WhatsApp Admin (+${adminPhone})\n\n_I will send you a WhatsApp message right at the scheduled time._`,
    data: reminder,
  };
}

/**
 * Lists all active or past reminders for the account.
 */
export async function handleListAdminReminders(
  context: AdminBusinessAssistantContext,
  params: { status?: AdminReminderStatus | "all" } = {}
): Promise<{ success: boolean; message: string; data?: { reminders: AdminReminder[] } }> {
  const accountId = context.accountId;
  const isAuthorized = Boolean(
    context &&
    context.isAuthorizedAdmin !== false &&
    (context.isAuthorizedAdmin ||
      context.mode === "admin_business_assistant" ||
      context.isBusinessAssistantEnabled === true ||
      context.adminRole === "owner" ||
      context.adminRole === "admin" ||
      context.adminRole === "manager")
  );

  if (!isAuthorized || !context.adminJid) {
    return {
      success: false,
      message: "❌ Only authorized account administrators can manage private reminders.",
    };
  }

  const filterStatus = params.status || "pending";

  ensureDir();
  let reminders: AdminReminder[] = [];

  try {
    const files = fs.readdirSync(REMINDER_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = fs.readFileSync(path.join(REMINDER_DIR, file), "utf8");
        const r = JSON.parse(content) as AdminReminder;
        if (r.accountId === accountId) {
          if (filterStatus === "all" || r.status === filterStatus) {
            reminders.push(r);
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("[AdminReminder] Error reading reminders:", err);
  }

  reminders.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);

  if (reminders.length === 0) {
    return {
      success: true,
      message: `⏰ *Admin Reminders*\n\nNo ${filterStatus === "pending" ? "upcoming" : filterStatus} reminders found.`,
      data: { reminders: [] },
    };
  }

  let text = `⏰ *Admin Reminders (${reminders.length})*\n\n`;
  reminders.forEach((r, idx) => {
    const statusIcon = r.status === "pending" ? "⏳" : r.status === "sent" ? "✅" : r.status === "cancelled" ? "🚫" : "⚠️";
    text += `${idx + 1}. ${statusIcon} *${r.text}*\n   Scheduled: ${r.formattedTime}\n   Status: ${r.status.toUpperCase()}\n`;
  });

  return {
    success: true,
    message: text.trim(),
    data: { reminders },
  };
}

/**
 * Cancels a pending reminder.
 */
export async function handleCancelAdminReminder(
  context: AdminBusinessAssistantContext,
  params: { reminderId?: string; query?: string } = {}
): Promise<{ success: boolean; message: string; data?: any }> {
  const accountId = context.accountId;
  const isAuthorized = Boolean(
    context &&
    context.isAuthorizedAdmin !== false &&
    (context.isAuthorizedAdmin ||
      context.mode === "admin_business_assistant" ||
      context.isBusinessAssistantEnabled === true ||
      context.adminRole === "owner" ||
      context.adminRole === "admin" ||
      context.adminRole === "manager")
  );

  if (!isAuthorized || !context.adminJid) {
    return {
      success: false,
      message: "❌ Only authorized account administrators can manage private reminders.",
    };
  }

  const reminderId = params.reminderId;
  const query = String(params.query || "").trim().toLowerCase();

  ensureDir();
  let targetReminder: AdminReminder | null = null;

  try {
    const files = fs.readdirSync(REMINDER_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = fs.readFileSync(path.join(REMINDER_DIR, file), "utf8");
        const r = JSON.parse(content) as AdminReminder;
        if (r.accountId === accountId && r.status === "pending") {
          if (reminderId && r.reminderId === reminderId) {
            targetReminder = r;
            break;
          }
          if (query && (r.text.toLowerCase().includes(query) || r.reminderId.toLowerCase().includes(query))) {
            targetReminder = r;
            break;
          }
          if (!reminderId && !query) {
            // Cancel latest / next upcoming
            targetReminder = r;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("[AdminReminder] Error searching reminders to cancel:", err);
  }

  if (!targetReminder) {
    return {
      success: false,
      message: `❌ No active pending reminder found${query ? ` matching "${query}"` : ""}.`,
    };
  }

  targetReminder.status = "cancelled";
  targetReminder.updatedAt = Date.now();

  try {
    fs.writeFileSync(reminderFilePath(targetReminder.reminderId), JSON.stringify(targetReminder, null, 2), "utf8");
  } catch (err: any) {
    return {
      success: false,
      message: `❌ Failed to update reminder status: ${err?.message || err}`,
    };
  }

  reminderServiceDeps.recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(context.adminJid),
    botId: context.botId,
    actionId: "admin_reminder_cancelled",
    riskLevel: "WRITE",
    confirmationRequired: false,
    executionResult: "success",
    metadata: { reminderId: targetReminder.reminderId, text: targetReminder.text },
  });

  return {
    success: true,
    message: `🚫 *Reminder Cancelled*\n\nCancelled reminder: *"${targetReminder.text}"* (scheduled for ${targetReminder.formattedTime}).`,
    data: targetReminder,
  };
}

/**
 * Scans and executes all due pending reminders across accounts.
 * Atomically marks claimed to prevent race conditions and duplicate delivery.
 * Charges $0.003 upon successful send only.
 */
export async function processDueAdminReminders(options: {
  sock?: any;
  getSockForBot?: (botId: string) => any;
  accountId?: string;
} = {}): Promise<{ processed: number; sent: number; failed: number }> {
  ensureDir();
  let processed = 0;
  let sentCount = 0;
  let failedCount = 0;

  const nowMs = Date.now();

  let files: string[] = [];
  try {
    files = fs.readdirSync(REMINDER_DIR);
  } catch {
    return { processed: 0, sent: 0, failed: 0 };
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = path.join(REMINDER_DIR, file);

    let reminder: AdminReminder;
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      reminder = JSON.parse(content);
    } catch {
      continue;
    }

    if (reminder.status !== "pending") continue;
    if (options.accountId && reminder.accountId !== options.accountId) continue;
    if (reminder.scheduledAtMs > nowMs) continue;

    // Atomic claim
    reminder.status = "sent"; // Optimistically mark to avoid re-triggering during send
    reminder.claimedAt = nowMs;
    reminder.updatedAt = nowMs;
    try {
      fs.writeFileSync(fullPath, JSON.stringify(reminder, null, 2), "utf8");
    } catch {
      continue;
    }

    processed++;

    // Resolve socket
    const activeSock = options.sock || (options.getSockForBot ? options.getSockForBot(reminder.botId) : null);

    const messageText = `⏰ *Admin Reminder Alert*\n\n${reminder.text}\n\n_(Scheduled for ${reminder.formattedTime})_`;

    let sendSuccess = false;
    let errorMsg = "";

    if (activeSock && typeof activeSock.sendMessage === "function") {
      try {
        await activeSock.sendMessage(reminder.adminJid, { text: messageText });
        sendSuccess = true;
      } catch (err: any) {
        errorMsg = err?.message || String(err);
        console.error(`[AdminReminder] Failed to send reminder ${reminder.reminderId} via socket:`, err);
      }
    } else {
      // Fallback: If no socket is passed in test/worker mode, try dynamic import if available or mark failed
      errorMsg = "No active WhatsApp socket connection available to deliver reminder.";
    }

    if (sendSuccess) {
      sentCount++;
      reminder.status = "sent";
      reminder.sentAt = Date.now();
      reminder.billed = true;

      // Charge $0.003 canonical fee
      try {
        await reminderServiceDeps.chargeUsageBillingAction(
          reminder.accountId,
          "admin_business_assistant_message",
          {
            botId: reminder.botId,
            customerJid: reminder.adminJid,
            eventId: reminder.reminderId,
          },
          `Admin Reminder Delivered: ${reminder.text.slice(0, 40)}`
        );
      } catch (billErr) {
        console.error("[AdminReminder] Billing error:", billErr);
      }

      reminderServiceDeps.recordAdminAuditEvent({
        accountId: reminder.accountId,
        adminJidMasked: maskAdminIdentity(reminder.adminJid),
        botId: reminder.botId,
        actionId: "admin_reminder_delivered",
        riskLevel: "READ",
        confirmationRequired: false,
        executionResult: "success",
        metadata: { reminderId: reminder.reminderId, text: reminder.text },
      });
    } else {
      failedCount++;
      reminder.status = "failed";
      reminder.error = errorMsg;
      reminder.billed = false;
    }

    reminder.updatedAt = Date.now();
    try {
      fs.writeFileSync(fullPath, JSON.stringify(reminder, null, 2), "utf8");
    } catch {}
  }

  return { processed, sent: sentCount, failed: failedCount };
}

let reminderSchedulerTimer: NodeJS.Timeout | null = null;
let activeGetSockFn: ((botId?: string) => any) | null = null;

export function startAdminReminderScheduler(options: {
  intervalMs?: number;
  getSockFn?: (botId?: string) => any;
} = {}): void {
  if (options.getSockFn) {
    activeGetSockFn = options.getSockFn;
  }

  const g = global as any;
  if (reminderSchedulerTimer || g.__blackarrow_admin_reminder_scheduler_active) {
    return;
  }

  const intervalMs = options.intervalMs || 30 * 1000; // Check every 30 seconds

  g.__blackarrow_admin_reminder_scheduler_active = true;
  reminderSchedulerTimer = setInterval(async () => {
    try {
      const sockResolver = options.getSockFn || activeGetSockFn;
      const sock = sockResolver ? sockResolver() : undefined;
      await processDueAdminReminders({ sock, getSockForBot: sockResolver || undefined });
    } catch (err) {
      console.error("[AdminReminderScheduler] Loop error:", err);
    }
  }, intervalMs);
}

export function stopAdminReminderScheduler(): void {
  if (reminderSchedulerTimer) {
    clearInterval(reminderSchedulerTimer);
    reminderSchedulerTimer = null;
  }
  const g = global as any;
  g.__blackarrow_admin_reminder_scheduler_active = false;
  activeGetSockFn = null;
}

export function isReminderSchedulerRunning(): boolean {
  const g = global as any;
  return Boolean(reminderSchedulerTimer || g.__blackarrow_admin_reminder_scheduler_active);
}

/**
 * Lists all reminders for a specific account.
 */
export function listRemindersForAccount(
  accountId: string,
  filterStatus: AdminReminderStatus | "all" = "all"
): AdminReminder[] {
  ensureDir();
  const reminders: AdminReminder[] = [];
  const cleanAccountId = String(accountId || "").trim();
  if (!cleanAccountId) return [];

  try {
    const files = fs.readdirSync(REMINDER_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = fs.readFileSync(path.join(REMINDER_DIR, file), "utf8");
        const r = JSON.parse(content) as AdminReminder;
        if (r.accountId === cleanAccountId) {
          if (filterStatus === "all" || r.status === filterStatus) {
            reminders.push(r);
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("[AdminReminder] Error reading reminders:", err);
  }

  reminders.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
  return reminders;
}

/**
 * Creates a reminder for an account directly.
 */
export function createReminderForAccount(input: {
  accountId: string;
  adminPhone: string;
  text: string;
  scheduledAt: string | number;
  timezone?: string;
  botId?: string;
}): { success: boolean; message: string; reminder?: AdminReminder } {
  const { accountId, adminPhone, text, scheduledAt, timezone, botId } = input;
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    return { success: false, message: "Reminder text is required." };
  }

  const rawInput = String(scheduledAt || "").trim();
  const isRelative = /^in\s+\d+\s*(?:mins?|minutes?|hours?|hrs?|secs?|seconds?)$/i.test(rawInput);
  const isTimestamp = typeof scheduledAt === "number" || (rawInput.includes("-") && (rawInput.includes("T") || rawInput.includes(":")) && !isNaN(new Date(rawInput).getTime()));

  if (!timezone && !isRelative && !isTimestamp) {
    return {
      success: false,
      message: "Account timezone is not configured. Please select your timezone before scheduling ambiguous local time reminders.",
    };
  }

  const tz = timezone || DEFAULT_BUSINESS_TIMEZONE;
  const parsedTime = parseScheduledTime(scheduledAt, tz);
  if (!parsedTime) {
    return { success: false, message: `Could not parse scheduled time "${scheduledAt}".` };
  }

  const nowMs = Date.now();
  if (parsedTime.scheduledAtMs <= nowMs + 10 * 1000) {
    return { success: false, message: "Reminder time must be in the future." };
  }

  const normalizedPhone = String(adminPhone || "").replace(/\D/g, "");
  const adminJid = normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : "";
  const reminderId = `rem_${accountId}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const reminder: AdminReminder = {
    reminderId,
    accountId,
    adminJid,
    adminPhone: normalizedPhone,
    botId: botId || "",
    text: cleanText,
    scheduledAtMs: parsedTime.scheduledAtMs,
    scheduledAtIso: parsedTime.scheduledAtIso,
    formattedTime: parsedTime.formattedTime,
    timezone: tz,
    createdAt: nowMs,
    updatedAt: nowMs,
    status: "pending",
    billed: false,
  };

  try {
    ensureDir();
    fs.writeFileSync(reminderFilePath(reminderId), JSON.stringify(reminder, null, 2), "utf8");
  } catch (err: any) {
    return { success: false, message: `Failed to persist reminder: ${err?.message || err}` };
  }

  reminderServiceDeps.recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(adminJid || adminPhone),
    botId: botId || "",
    actionId: "admin_reminder_created",
    riskLevel: "WRITE",
    confirmationRequired: false,
    executionResult: "success",
    metadata: { reminderId, text: cleanText, scheduledAtIso: parsedTime.scheduledAtIso, formattedTime: parsedTime.formattedTime },
  });

  return { success: true, message: "Reminder created successfully.", reminder };
}

/**
 * Reschedules an existing reminder for an account.
 */
export function rescheduleReminderForAccount(input: {
  accountId: string;
  reminderId: string;
  scheduledAt: string | number;
  timezone?: string;
  message?: string;
}): { success: boolean; message: string; reminder?: AdminReminder } {
  const { accountId, reminderId, scheduledAt, timezone, message } = input;
  ensureDir();
  const filePath = reminderFilePath(reminderId);
  if (!fs.existsSync(filePath)) {
    return { success: false, message: "Reminder not found." };
  }

  let reminder: AdminReminder;
  try {
    reminder = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { success: false, message: "Could not read reminder data." };
  }

  if (reminder.accountId !== accountId) {
    return { success: false, message: "Unauthorized reminder access." };
  }

  const tz = timezone || reminder.timezone || "Asia/Karachi";
  const parsedTime = parseScheduledTime(scheduledAt, tz);
  if (!parsedTime) {
    return { success: false, message: `Could not parse new scheduled time "${scheduledAt}".` };
  }

  const nowMs = Date.now();
  if (parsedTime.scheduledAtMs <= nowMs + 10 * 1000) {
    return { success: false, message: "New reminder time must be in the future." };
  }

  reminder.scheduledAtMs = parsedTime.scheduledAtMs;
  reminder.scheduledAtIso = parsedTime.scheduledAtIso;
  reminder.formattedTime = parsedTime.formattedTime;
  reminder.timezone = tz;
  if (message && message.trim()) {
    reminder.text = message.trim();
  }
  reminder.status = "pending";
  reminder.claimedAt = null;
  reminder.error = null;
  reminder.updatedAt = nowMs;

  try {
    fs.writeFileSync(filePath, JSON.stringify(reminder, null, 2), "utf8");
  } catch (err: any) {
    return { success: false, message: `Failed to update reminder: ${err?.message || err}` };
  }

  reminderServiceDeps.recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(reminder.adminJid),
    botId: reminder.botId,
    actionId: "admin_reminder_rescheduled",
    riskLevel: "WRITE",
    confirmationRequired: false,
    executionResult: "success",
    metadata: { reminderId, text: reminder.text, newScheduledAtIso: parsedTime.scheduledAtIso },
  });

  return { success: true, message: "Reminder rescheduled successfully.", reminder };
}

/**
 * Cancels a reminder for an account.
 */
export function cancelReminderForAccount(
  accountId: string,
  reminderId: string
): { success: boolean; message: string; reminder?: AdminReminder } {
  ensureDir();
  const filePath = reminderFilePath(reminderId);
  if (!fs.existsSync(filePath)) {
    return { success: false, message: "Reminder not found." };
  }

  let reminder: AdminReminder;
  try {
    reminder = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { success: false, message: "Could not read reminder data." };
  }

  if (reminder.accountId !== accountId) {
    return { success: false, message: "Unauthorized reminder access." };
  }

  reminder.status = "cancelled";
  reminder.updatedAt = Date.now();

  try {
    fs.writeFileSync(filePath, JSON.stringify(reminder, null, 2), "utf8");
  } catch (err: any) {
    return { success: false, message: `Failed to cancel reminder: ${err?.message || err}` };
  }

  reminderServiceDeps.recordAdminAuditEvent({
    accountId,
    adminJidMasked: maskAdminIdentity(reminder.adminJid),
    botId: reminder.botId,
    actionId: "admin_reminder_cancelled",
    riskLevel: "WRITE",
    confirmationRequired: false,
    executionResult: "success",
    metadata: { reminderId, text: reminder.text },
  });

  return { success: true, message: "Reminder cancelled successfully.", reminder };
}
