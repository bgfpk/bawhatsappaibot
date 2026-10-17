import * as dbService from "./db-service.ts";
import { rememberAdminAlertTarget } from "./admin-alert-context-service.ts";
import { getCustomerContactIdentity } from "../utils/contact-identity.ts";
import { resolveCustomerIdentity } from "./customer-identity-resolver-service.ts";
import { sendAdminOnlyText } from "./message-routing-guard-service.ts";
import {
  detectHumanAdminRequest,
  type EscalationReasonCategory,
} from "./business-training-scope-guard-service.ts";
import {
  buildDynamicAdminIssueSummary,
  buildDynamicAdminSuggestedAction,
  buildShortAdminAlertMessage,
} from "./dynamic-escalation-reply-service.ts";
import { emitProactiveLeadLifecycleEvent } from "./proactive-lead-intelligence-service.ts";

const ESCALATION_COOLDOWN_SECONDS = 20 * 60;
const ALLOWED_ADMIN_ALERT_REASONS = new Set<EscalationReasonCategory>([
  "human_requested",
  "high_risk_unverified_question",
  "broken_customer_reply_unrepairable",
]);

function clean(value: any, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function normalizeText(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function isSharedPhonePlaceholder(text: string) {
  return text.includes("shared whatsapp number");
}

function normalizeAllowedAdminAlertReason(reason: EscalationReasonCategory | "" | undefined) {
  if (!reason) return "";
  if (reason === "broken_customer_reply") return "broken_customer_reply_unrepairable" as const;
  if (reason === "appointment_or_order_confirmation_risk") return "high_risk_unverified_question" as const;
  return ALLOWED_ADMIN_ALERT_REASONS.has(reason) ? reason : "";
}

function isPassiveAck(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const passive = new Set([
    "ok", "okay", "k", "yes", "yes ji", "ji", "jee", "han", "haan", "acha", "achha",
    "done", "fine", "thanks", "thank you", "shukriya", "jazakallah", "noted",
    "theek", "thik", "theek hai", "ठीक", "ٹھیک",
  ]);
  return passive.has(compact) || (/^[a-z]{1,3}$/i.test(compact) && !["cod"].includes(compact));
}

function compactInternationalPhone(value: any) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 11 || digits.length > 15) return "";
  return `+${digits}`;
}

export function detectAdminEscalation(input: {
  latestUserText: string;
  replyText?: string;
  historyArray?: any[];
  forcedReasonCategory?: EscalationReasonCategory;
  forcedTopic?: string;
}) {
  const allowedForcedReason = normalizeAllowedAdminAlertReason(input.forcedReasonCategory);
  if (allowedForcedReason) {
    return {
      shouldEscalate: true,
      reasons: [allowedForcedReason],
      reasonCategory: allowedForcedReason,
      topic: clean(input.forcedTopic, 120),
    };
  }
  const latest = normalizeText(input.latestUserText);
  const reasons: string[] = [];

  if (isSharedPhonePlaceholder(latest) || isPassiveAck(latest)) {
    return { shouldEscalate: false, reasons, reasonCategory: "" };
  }

  const askedForHuman = detectHumanAdminRequest(latest);

  let reasonCategory: EscalationReasonCategory | "" = "";
  if (askedForHuman) {
    reasons.push("human_requested");
    reasonCategory = "human_requested";
  }

  return {
    shouldEscalate: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
    reasonCategory,
    topic: "",
  };
}

export function buildCustomerEscalationReply(language: string) {
  if (language === "urdu") return "میں نے یہ بات admin کو بھیج دی ہے۔ ہماری ٹیم جلد آپ کو بہتر guide کر دے گی۔";
  if (language === "roman_urdu") return "Main ne ye baat admin ko bhej di hai. Hamari team jald aap ko better guide kar degi.";
  return "I've sent this to the admin. Our team will guide you properly shortly.";
}

export function buildAdminAttentionAlertMessage(input: {
  sender: string;
  senderName?: string;
  latestUserText: string;
  replyText?: string;
  historyArray?: any[];
  profile?: any;
  reasons: string[];
  reasonCategory?: EscalationReasonCategory;
  topic?: string;
  issueSummary?: string;
  suggestedAction?: string;
  customerReplyText?: string;
}) {
  const profile = input.profile || {};
  const identity = getCustomerContactIdentity({
    jid: input.sender,
    name: input.senderName,
    profile,
  });
  const resolvedIdentity = resolveCustomerIdentity({
    jid: input.sender,
    profile,
  });
  const displayName = identity.hasRealName ? identity.displayName : "Unknown";
  const customerPhone = compactInternationalPhone(resolvedIdentity.canonicalPhone);
  const reasonCategory = input.reasonCategory || (Array.isArray(input.reasons) && input.reasons[0] ? input.reasons[0] as EscalationReasonCategory : "unsupported_business_question");
  return buildShortAdminAlertMessage({
    customerName: displayName,
    customerPhone,
    sender: input.sender,
    latestUserText: input.latestUserText,
    reasonCategory,
    topic: input.topic || "",
    issueSummary: input.issueSummary || buildDynamicAdminIssueSummary({
      customerName: displayName,
      customerPhone,
      sender: input.sender,
      latestUserText: input.latestUserText,
      reasonCategory,
      topic: input.topic || "",
      customerReplyText: input.customerReplyText || input.replyText || "",
    }),
    suggestedAction: input.suggestedAction || buildDynamicAdminSuggestedAction({
      customerName: displayName,
      customerPhone,
      sender: input.sender,
      latestUserText: input.latestUserText,
      reasonCategory,
      topic: input.topic || "",
      customerReplyText: input.customerReplyText || input.replyText || "",
    }),
  });
}

export async function notifyAdminForEscalation(input: {
  sock: any;
  userConfig: any;
  dataOwnerKey: string;
  sender: string;
  senderName?: string;
  latestUserText: string;
  replyText?: string;
  historyArray?: any[];
  io?: any;
  forcedReasonCategory?: EscalationReasonCategory;
  forcedTopic?: string;
  forcedIssueSummary?: string;
  forcedSuggestedAction?: string;
  customerReplyText?: string;
  skipCooldown?: boolean;
}) {
  const detection = detectAdminEscalation(input);
  if (!detection.shouldEscalate) return { sent: false, detection };
  const reasonCategory = normalizeAllowedAdminAlertReason(
    (detection.reasonCategory || input.forcedReasonCategory || "") as EscalationReasonCategory
  );
  if (!reasonCategory) return { sent: false, detection };
  input.io?.emit?.("system-log", { type: "warning", msg: `admin_escalation_triggered reason=${reasonCategory}` });

  const profile = await dbService.getCustomerProfile(input.dataOwnerKey, input.sender).catch(() => null);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!input.skipCooldown && Number(profile?.lastAdminEscalationAt || 0) > nowSeconds - ESCALATION_COOLDOWN_SECONDS) {
    input.io?.emit?.("system-log", { type: "warning", msg: "admin_escalation_skipped reason=cooldown" });
    input.io?.emit?.("system-log", { type: "info", msg: "admin_escalation_sent=false" });
    return { sent: false, skipped: "cooldown", detection };
  }

  const resolvedIdentity = resolveCustomerIdentity({
    jid: input.sender,
    profile,
  });
  const customerPhone = compactInternationalPhone(resolvedIdentity.canonicalPhone);

  emitProactiveLeadLifecycleEvent({
    eventType: reasonCategory === "human_requested" ? "CUSTOMER_REQUESTED_HUMAN" : "URGENT_CUSTOMER_REQUEST",
    accountId: input.dataOwnerKey,
    botId: input.dataOwnerKey,
    leadId: `esc_${input.sender}_${nowSeconds}`,
    customerJid: input.sender,
    customerName: profile?.customerName,
    customerPhone: customerPhone || undefined,
    summary: `Customer escalation (${reasonCategory}): ${input.latestUserText}`,
    urgency: "urgent",
    sock: input.sock,
    io: input.io,
  }).catch((err) => console.warn("[AdminEscalation] Proactive event emit failed:", err));

  const message = buildAdminAttentionAlertMessage({
    ...input,
    profile,
    reasons: detection.reasons,
    reasonCategory,
    topic: input.forcedTopic || detection.topic || "",
    issueSummary: input.forcedIssueSummary || buildDynamicAdminIssueSummary({
      customerName: profile?.customerName,
      sender: input.sender,
      latestUserText: input.latestUserText,
      reasonCategory,
      topic: input.forcedTopic || detection.topic || "",
      customerReplyText: input.customerReplyText || input.replyText || "",
    }),
    suggestedAction: input.forcedSuggestedAction || buildDynamicAdminSuggestedAction({
      customerName: profile?.customerName,
      sender: input.sender,
      latestUserText: input.latestUserText,
      reasonCategory,
      topic: input.forcedTopic || detection.topic || "",
      customerReplyText: input.customerReplyText || input.replyText || "",
    }),
    customerReplyText: input.customerReplyText || input.replyText || "",
  });

  try {
    const routed = await sendAdminOnlyText({
      sock: input.sock,
      userConfig: input.userConfig,
      customerJid: input.sender,
      text: message,
      label: "Admin escalation",
      io: input.io,
    });
    if (!routed.sent) {
      input.io?.emit?.("system-log", { type: "warning", msg: `admin_escalation_skipped reason=${routed.skipped || "not_sent"}` });
      input.io?.emit?.("system-log", { type: "info", msg: "admin_escalation_sent=false" });
      return { sent: false, skipped: routed.skipped || "not_sent", detection };
    }
    const sent = routed.message;
    if (sent?.key?.id) rememberAdminAlertTarget(sent.key.id, input.sender);
    await dbService.updateCustomerProfile(input.dataOwnerKey, input.sender, {
      lastAdminEscalationAt: nowSeconds,
      lastAdminEscalationReason: detection.reasons.join("; "),
    }).catch(() => {});
    input.io?.emit?.("system-log", { type: "info", msg: "admin_escalation_sent=true" });
    return { sent: Boolean(sent?.key?.id), detection };
  } catch (error: any) {
    input.io?.emit?.("system-log", { type: "error", msg: `Admin escalation failed: ${error?.message || "unknown error"}` });
    input.io?.emit?.("system-log", { type: "info", msg: "admin_escalation_sent=false" });
    return { sent: false, error, detection };
  }
}
