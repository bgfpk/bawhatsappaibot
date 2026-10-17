import * as dbService from "./db-service.ts";
import { rememberAdminAlertTarget } from "./admin-alert-context-service.ts";
import { buildCustomerAiPausePatch, CUSTOMER_AI_PAUSE_CATEGORY_IRRELEVANT } from "./difficult-customer-mode-service.ts";
import { sendAdminOnlyText } from "./message-routing-guard-service.ts";
import { assertCustomerFacingSendAllowed } from "./customer-facing-send-guard-service.ts";
import { getBusinessVocabulary } from "./customer-reply-quality-guard-service.ts";

const irrelevantCustomerDeps = {
  saveMessage: dbService.saveMessage,
  updateCustomerProfile: dbService.updateCustomerProfile,
  sendAdminOnlyText,
};

export function __setIrrelevantCustomerTestDeps(overrides: Partial<typeof irrelevantCustomerDeps>) {
  Object.assign(irrelevantCustomerDeps, overrides || {});
}

export function __resetIrrelevantCustomerTestDeps() {
  Object.assign(irrelevantCustomerDeps, {
    saveMessage: dbService.saveMessage,
    updateCustomerProfile: dbService.updateCustomerProfile,
    sendAdminOnlyText,
  });
}

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BUSINESS_HINTS = [
  "price", "rate", "cost", "delivery", "order", "booking", "product", "package", "plan",
  "service", "buy", "purchase", "cod", "payment", "shipping", "tracking", "stock",
  "return", "refund", "exchange", "address", "city", "size", "color", "details",
  "qeemat", "kitne", "kitna", "deliver", "parcel", "mangwana", "lena", "khareed",
  "paisa", "payment", "cash", "maal", "item",
];

const SAFE_SHORT_MESSAGES = new Set([
  "hi", "hello", "hey", "salam", "assalam o alaikum", "aoa", "ji", "yes", "ok",
  "price", "details", "info", "help",
]);

const IRRELEVANT_PATTERNS = [
  /\b(larki|lerki|ladki|girl)\b.*\b(friendship|dosti|set|setting|number|number mil|karva|karwa)\b/,
  /\b(friendship|dosti)\b.*\b(larki|lerki|ladki|girl)\b/,
  /\b(girlfriend|boyfriend|gf|bf)\b.*\b(bana|banwa|dila|chahiye|karva|karwa)\b/,
  /\b(kisi\s+)?(larki|lerki|ladki|girl)\s+(ka\s+)?number\b/,
  /\b(date|dating|romance|romantic|love you|i love you|kiss|sex|sexy)\b/,
  /\b(shadi|shaadi)\b.*\b(karwa|karva|rishta|larki|ladki)\b/,
  /\b(timepass|time pass|gup shup|gupshup)\b/,
];

const ABUSE_PATTERNS = [
  /\b(fuck|bitch|asshole|bastard|harami|kamine|lanat|chutiya|madarchod|behenchod|bc|mc)\b/,
];

function hasActiveCustomerContext(profile: any = {}) {
  const customFields = profile?.customFields && typeof profile.customFields === "object" ? profile.customFields : {};
  return Boolean(
    clean(profile?.latestProductName) ||
    clean(profile?.latestOrderRef) ||
    clean(profile?.orderStatus) ||
    clean(profile?.leadStatus) ||
    clean(profile?.dealStage) ||
    clean(profile?.appointmentDate) ||
    clean(profile?.appointmentTime) ||
    Object.keys(customFields).some((key) => clean(customFields[key]))
  );
}

export function detectIrrelevantCustomerMessage(input: {
  latestText: any;
  profile?: any;
}) {
  const normalized = normalizeText(input.latestText);
  if (!normalized || SAFE_SHORT_MESSAGES.has(normalized)) {
    return { isIrrelevant: false, reason: "" };
  }

  const hasBusinessHint = BUSINESS_HINTS.some((hint) => normalized.includes(hint));
  if (hasBusinessHint) {
    return { isIrrelevant: false, reason: "" };
  }

  const irrelevant = IRRELEVANT_PATTERNS.find((pattern) => pattern.test(normalized));
  if (irrelevant) {
    if (hasActiveCustomerContext(input.profile) && /\b(timepass|time pass|gup shup|gupshup)\b/.test(normalized)) {
      return { isIrrelevant: false, reason: "" };
    }
    return { isIrrelevant: true, reason: "irrelevant social/romantic request" };
  }

  const abuse = ABUSE_PATTERNS.find((pattern) => pattern.test(normalized));
  if (abuse && normalized.split(" ").length <= 8) {
    return { isIrrelevant: true, reason: "abusive or timepass message unrelated to business" };
  }

  return { isIrrelevant: false, reason: "" };
}

export function buildIrrelevantBoundaryReply(input: { language?: string; businessType?: any; profile?: any }) {
  const vocabulary = getBusinessVocabulary(input.businessType);
  const customFields = input.profile?.customFields && typeof input.profile.customFields === "object" ? input.profile.customFields : {};
  const hasAppointment = clean(input.profile?.appointmentDate || customFields["Appointment Date"] || customFields["Preferred Date"]) ||
    clean(input.profile?.appointmentTime || customFields["Appointment Time"] || customFields["Preferred Time"]);

  if (hasAppointment) {
    return "Ji, aapka appointment detail already saved hai. Agar time/date change karna hai ya appointment confirm rakhna hai to bata dein.";
  }
  if (vocabulary.serviceLike) {
    return "Main service/appointment ke hawale se help kar sakta hun. Appointment, timing, ya service detail ka sawal hai to pooch lein.";
  }
  if (vocabulary.flow === "product" && /\b(product|products|ecommerce|shop|store|fashion|catalog|retail|order|delivery)\b/i.test(clean(input.businessType))) {
    return input.language === "english"
      ? "I can help with your product, price, order, or delivery question here. Please share what you need."
      : "Samajh gaya. Product, price ya delivery ke bare mein jo help chahiye ho bata dein.";
  }
  return input.language === "english"
    ? "Please share the business question a little more clearly so I can help."
    : "Business ke hawale se apna sawal thora clear kar dein taake main help kar sakun.";
}

function buildSummary(summary: any, reason: string, latestText: string) {
  const line = `Auto-reply paused for manual review: ${reason}. Last irrelevant message: "${latestText.slice(0, 180)}".`;
  const existing = clean(summary);
  const withoutOld = existing
    .split("\n")
    .filter((item) => !/^auto-reply paused for manual review:/i.test(item.trim()))
    .join("\n")
    .trim();
  return [line, withoutOld].filter(Boolean).join("\n").slice(0, 2500);
}

async function notifyAdmin(input: {
  sock: any;
  userConfig: any;
  dataOwnerKey: string;
  sender: string;
  latestText: string;
  reason: string;
  io?: any;
}) {
  const message = [
    "Manual review required",
    `Customer: ${input.sender}`,
    `Reason: ${input.reason}`,
    "",
    `Last message: ${input.latestText || "N/A"}`,
    "",
    "Auto-replies have been paused for this chat. Send a manual reply to resume AI, or use .1 to resume.",
  ].join("\n");

  const routed = await irrelevantCustomerDeps.sendAdminOnlyText({
    sock: input.sock,
    userConfig: input.userConfig,
    customerJid: input.sender,
    text: message,
    label: "Irrelevant customer admin alert",
    io: input.io,
  });
  if (!routed.sent) return false;
  const sent = routed.message;
  if (sent?.key?.id) rememberAdminAlertTarget(sent.key.id, input.sender);
  if (routed.sent) {
    input.io?.emit?.("system-log", { type: "warning", msg: `Admin notified about irrelevant customer ${input.sender.split("@")[0]}.` });
  }
  return Boolean(sent?.key?.id);
}

export async function handleIrrelevantCustomer(input: {
  sock: any;
  userConfig: any;
  userId?: string;
  dataOwnerKey: string;
  sender: string;
  latestText: any;
  profile?: any;
  language: string;
  io?: any;
}) {
  const detection = detectIrrelevantCustomerMessage({ latestText: input.latestText, profile: input.profile });
  if (!detection.isIrrelevant) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const latestText = clean(input.latestText);
  input.io?.emit?.("system-log", { type: "warning", msg: `Irrelevant customer detected: ${input.sender.split("@")[0]} (${detection.reason}).` });

  const profilePatch = {
    ...buildCustomerAiPausePatch(detection.reason, nowSeconds, CUSTOMER_AI_PAUSE_CATEGORY_IRRELEVANT),
    lastAdminEscalationReason: detection.reason,
    irrelevantCustomerDetectedAt: nowSeconds,
    chatSummary: buildSummary(input.profile?.chatSummary, detection.reason, latestText),
  };

  const shouldSendBoundary = Number(input.profile?.irrelevantBoundarySentAt || 0) < nowSeconds - 24 * 60 * 60;
  if (shouldSendBoundary) {
    const boundaryGuard = await assertCustomerFacingSendAllowed({
      userId: input.userId,
      context: "irrelevant_customer_boundary",
      customerJid: input.sender,
      io: input.io,
      logger: console,
    });
    if (boundaryGuard.allowed) {
      const boundary = buildIrrelevantBoundaryReply({
        language: input.language,
        businessType: input.userConfig?.business_type || input.userConfig?.businessType,
        profile: input.profile,
      });
      const sent = await input.sock.sendMessage(input.sender, { text: boundary });
      await irrelevantCustomerDeps.saveMessage(input.dataOwnerKey, input.sender, "model", boundary, sent?.key?.id).catch(() => {});
      (profilePatch as any).irrelevantBoundarySentAt = nowSeconds;
    }
  }

  await irrelevantCustomerDeps.updateCustomerProfile(input.dataOwnerKey, input.sender, profilePatch).catch(() => {});
  input.io?.emit?.("system-log", { type: "warning", msg: `Auto-reply paused for ${input.sender.split("@")[0]}: ${detection.reason}.` });

  const adminNotified = await notifyAdmin({
    sock: input.sock,
    userConfig: input.userConfig,
    dataOwnerKey: input.dataOwnerKey,
    sender: input.sender,
    latestText,
    reason: detection.reason,
    io: input.io,
  }).catch((error: any) => {
    input.io?.emit?.("system-log", { type: "error", msg: `Irrelevant customer admin notification failed: ${error?.message || "unknown error"}` });
    return false;
  });
  if (adminNotified) {
    await irrelevantCustomerDeps.updateCustomerProfile(input.dataOwnerKey, input.sender, {
      lastAdminEscalationAt: nowSeconds,
      lastAdminEscalationReason: detection.reason,
    }).catch(() => {});
  }

  return true;
}
