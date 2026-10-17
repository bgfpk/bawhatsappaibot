import {
  buildDefaultPlannedCustomerUpdateMessage,
  normalizePlannedCustomerUpdateMessage,
} from "./customer-update-message-service.ts";

export type PlannedCustomerUpdateStatus = "pending" | "sent" | "cancelled";
export type PlannedCustomerUpdateRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type PlannedCustomerUpdate = {
  id: string;
  status: PlannedCustomerUpdateStatus;
  requestedText: string;
  summary: string;
  message: string;
  scheduledAt: number;
  createdAt: number;
  repeat?: PlannedCustomerUpdateRepeat;
  sentAt?: number;
  lastSentAt?: number;
  sentCount?: number;
  sentMessageId?: string;
  defaultBotId?: string;
  sendFromMode?: "default_only" | "customer_origin_then_default";
  actualBotId?: string;
  actualBotJid?: string;
  fallbackReason?: string;
};

const PK_OFFSET_MS = 5 * 60 * 60 * 1000;
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPkParts(epochSeconds: number) {
  const shifted = new Date(epochSeconds * 1000 + PK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function pkWallTimeToEpoch(parts: ReturnType<typeof getPkParts>, hour: number, minute: number) {
  return Math.floor((Date.UTC(parts.year, parts.month, parts.day, hour, minute, 0) - PK_OFFSET_MS) / 1000);
}

function pkCalendarToEpoch(year: number, month: number, day: number, hour: number, minute: number) {
  return Math.floor((Date.UTC(year, month, day, hour, minute, 0) - PK_OFFSET_MS) / 1000);
}

function nextWallTime(now: number, hour: number, minute = 0, addDays = 0) {
  const parts = getPkParts(now);
  const base = pkWallTimeToEpoch({ ...parts, day: parts.day + addDays }, hour, minute);
  return base <= now + 60 ? base + DAY_SECONDS : base;
}

export function normalizeCustomerUpdateRepeat(value: any): PlannedCustomerUpdateRepeat {
  const repeat = String(value || "none").toLowerCase().trim();
  if (repeat === "daily" || repeat === "weekly" || repeat === "monthly" || repeat === "yearly") return repeat;
  return "none";
}

function addPkMonths(epochSeconds: number, months: number) {
  const parts = getPkParts(epochSeconds);
  const targetMonth = parts.month + months;
  const lastDay = new Date(Date.UTC(parts.year, targetMonth + 1, 0)).getUTCDate();
  return pkCalendarToEpoch(parts.year, targetMonth, Math.min(parts.day, lastDay), parts.hour, parts.minute);
}

function addRepeatInterval(epochSeconds: number, repeat: PlannedCustomerUpdateRepeat) {
  if (repeat === "daily") return epochSeconds + DAY_SECONDS;
  if (repeat === "weekly") return epochSeconds + 7 * DAY_SECONDS;
  if (repeat === "monthly") return addPkMonths(epochSeconds, 1);
  if (repeat === "yearly") return addPkMonths(epochSeconds, 12);
  return 0;
}

export function getNextRepeatScheduledAt(scheduledAt: number, repeatInput: any, after = nowSeconds()) {
  const repeat = normalizeCustomerUpdateRepeat(repeatInput);
  if (repeat === "none") return 0;
  let next = Number(scheduledAt || 0);
  if (!next) next = after;
  for (let i = 0; i < 120 && next <= after + 60; i++) {
    next = addRepeatInterval(next, repeat);
  }
  return next;
}

function parseClock(text: string) {
  const match = text.match(/\b(at\s+)?(\d{1,2})(?::|\.|\s)?(\d{2})?\s*(am|pm|a\.m|p\.m|baje|bajay)?\b/);
  if (!match) return null;
  if (!match[1] && !match[4]) return null;

  let hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  const suffix = String(match[4] || "").replace(/\./g, "");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const hasMorning = /\b(morning|subah|sabah)\b/.test(text);
  const hasEvening = /\b(evening|shaam|sham|night|raat|rat|tonight)\b/.test(text);

  if (suffix === "pm" || hasEvening) {
    if (hour < 12) hour += 12;
  } else if (suffix === "am" || hasMorning) {
    if (hour === 12) hour = 0;
  } else if (hour <= 7) {
    hour += 12;
  }

  return { hour, minute };
}

function hasContactAction(text: string) {
  return /\b(message|msg|text|talk|call|contact|update|remind|notify|follow up|followup|rabta|raabta|baat|bat|reply)\b/.test(text);
}

function hasTemporalCue(text: string) {
  return /\b(later|baad mein|bad mein|baad me|bad me|morning|evening|night|subah|shaam|sham|raat|kal|tomorrow|next week|next month|order later)\b/.test(text);
}

function looksLikeDiscountOrMathQuestion(text: string) {
  const hasNumber = /\b\d{1,6}\b/.test(text);
  const hasPricingWord = /\b(discount|off|percent|percentage|kitna|kitne|kitny|price|rate|total|amount|bany|bny|banega|banay|bad kitna|bad kitny|baad kitna|baad kitny)\b/.test(text);
  return hasNumber && hasPricingWord;
}

function hasReminderIntent(text: string) {
  if (looksLikeDiscountOrMathQuestion(text) && !hasContactAction(text) && !hasTemporalCue(text)) return false;
  return hasContactAction(text) || hasTemporalCue(text);
}

function parseRelativeDelay(text: string, createdAt: number) {
  const match = text.match(/\b(?:after|in)\s+(\d{1,3})\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit.startsWith("min")) return createdAt + amount * 60;
  if (unit.startsWith("hour") || unit.startsWith("hr")) return createdAt + amount * HOUR_SECONDS;
  return createdAt + amount * DAY_SECONDS;
}

export function parsePlannedCustomerUpdate(input: string, createdAt = nowSeconds()): PlannedCustomerUpdate | null {
  const text = normalizeText(input);
  if (!text || !hasReminderIntent(text)) return null;

  const hasLater = /\b(later|baad mein|bad mein|talk later|order later|buy later|update you later|baad me|bad me)\b/.test(text);
  const hasTomorrow = /\b(tomorrow|kal)\b/.test(text);
  const hasNextWeek = /\b(next week|agli week|aglay week)\b/.test(text);
  const hasNextMonth = /\b(next month|agli month|aglay month|agla mahina|agle mahine)\b/.test(text);
  const hasMorning = /\b(morning|subah|sabah)\b/.test(text);
  const hasEvening = /\b(evening|shaam|sham)\b/.test(text);
  const hasNight = /\b(night|raat|rat|tonight)\b/.test(text);
  const clock = parseClock(text);
  const relativeDelay = parseRelativeDelay(text, createdAt);

  if (looksLikeDiscountOrMathQuestion(text) && !hasContactAction(text)) return null;

  if (!hasLater && !hasTomorrow && !hasNextWeek && !hasNextMonth && !hasMorning && !hasEvening && !hasNight && !clock && !relativeDelay) {
    return null;
  }

  let scheduledAt = createdAt + 4 * HOUR_SECONDS;
  let summary = "Customer asked to continue this conversation later.";

  if (relativeDelay) {
    scheduledAt = relativeDelay;
    summary = "Customer asked to be contacted after a delay.";
  } else if (clock) {
    scheduledAt = nextWallTime(createdAt, clock.hour, clock.minute, hasTomorrow ? 1 : 0);
    summary = `Customer asked to be messaged at ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}.`;
  } else if (hasNextWeek) {
    scheduledAt = nextWallTime(createdAt + 7 * DAY_SECONDS, 10, 0, 0);
    summary = "Customer asked to continue next week.";
  } else if (hasNextMonth) {
    scheduledAt = addPkMonths(nextWallTime(createdAt, 10, 0, 0), 1);
    summary = "Customer asked to continue next month.";
  } else if (hasMorning) {
    scheduledAt = nextWallTime(createdAt, 10, 0, hasTomorrow ? 1 : 0);
    summary = "Customer asked to talk in the morning.";
  } else if (hasEvening) {
    scheduledAt = nextWallTime(createdAt, 18, 0, hasTomorrow ? 1 : 0);
    summary = "Customer asked to talk in the evening.";
  } else if (hasNight) {
    scheduledAt = nextWallTime(createdAt, 21, 0, hasTomorrow ? 1 : 0);
    summary = "Customer asked to talk at night.";
  } else if (hasTomorrow) {
    scheduledAt = nextWallTime(createdAt, 10, 0, 1);
    summary = "Customer asked to continue tomorrow.";
  }

  return {
    id: `planned_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    requestedText: input.trim().slice(0, 500),
    summary,
    message: buildDefaultPlannedCustomerUpdateMessage(),
    scheduledAt,
    createdAt,
    repeat: "none",
  };
}

export function normalizePlannedUpdates(value: any): PlannedCustomerUpdate[] {
  const raw = typeof value === "string" ? (() => {
    try { return JSON.parse(value); } catch { return []; }
  })() : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const status: PlannedCustomerUpdateStatus = item?.status === "sent"
        ? "sent"
        : item?.status === "cancelled"
          ? "cancelled"
          : "pending";
      const sentAt = item?.sentAt ? Number(item.sentAt) : undefined;
      return {
        id: String(item?.id || `planned_${item?.createdAt || nowSeconds()}`),
        status,
        requestedText: String(item?.requestedText || "").slice(0, 500),
        summary: String(item?.summary || "Customer follow-up planned.").slice(0, 300),
        message: normalizePlannedCustomerUpdateMessage(String(item?.message || "").slice(0, 800)),
        scheduledAt: Number(item?.scheduledAt || 0),
        createdAt: Number(item?.createdAt || item?.scheduledAt || 0),
        repeat: normalizeCustomerUpdateRepeat(item?.repeat),
        sentAt,
        lastSentAt: item?.lastSentAt ? Number(item.lastSentAt) : sentAt,
        sentCount: Number(item?.sentCount || (sentAt ? 1 : 0)),
        sentMessageId: item?.sentMessageId ? String(item.sentMessageId) : undefined,
      };
    })
    .filter((item) => item.scheduledAt > 0);
}
