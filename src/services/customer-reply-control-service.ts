import { isCustomerChatJid, normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";
import { getCustomerAutoReplyStopState } from "./difficult-customer-mode-service.ts";
import { getPersistedPnForLid, getPersistedLidForPn } from "./whatsapp-contact-identity-resolver.ts";

const TEMP_STOP_SECONDS = 60 * 60;

function clean(value: any) {
  return String(value || "").trim();
}

export function parseCustomerReplyControlCommand(text: any) {
  const value = clean(text);
  if (value === ".0") return { action: "pause_temp" as const };
  if (value === ".00") return { action: "pause_permanent" as const };
  if (value === ".1") return { action: "resume" as const };
  return null;
}

export function buildCustomerReplyControlPatch(command: { action: string }, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (command.action === "resume") {
    return {
      botReplyControl: "active",
      botReplyPausedUntil: 0,
      botReplyPausedPermanent: false,
      botReplyControlUpdatedAt: nowSeconds,
      botReplyStopReason: "",
      botReplyStopSource: "",
      aiPaused: false,
      ai_paused: false,
      aiResumedAt: nowSeconds,
      aiPauseCategory: "",
      aiPauseReason: "",
      manualReviewRequired: false,
    };
  }
  if (command.action === "pause_permanent") {
    return {
      botReplyControl: "paused_permanent",
      botReplyPausedUntil: 0,
      botReplyPausedPermanent: true,
      botReplyControlUpdatedAt: nowSeconds,
      botReplyStopReason: "Permanently stopped by .00 shortcode",
      botReplyStopSource: ".00",
      aiPaused: true,
      ai_paused: true,
      aiPausedAt: nowSeconds,
      aiPauseCategory: "admin_pause",
      aiPauseReason: "Permanently stopped by .00 shortcode",
    };
  }
  return {
    botReplyControl: "paused_temp",
    botReplyPausedUntil: nowSeconds + TEMP_STOP_SECONDS,
    botReplyPausedPermanent: false,
    botReplyControlUpdatedAt: nowSeconds,
    botReplyStopReason: "Temporarily stopped by .0 shortcode",
    botReplyStopSource: ".0",
    aiPaused: true,
    ai_paused: true,
    aiPausedAt: nowSeconds,
    aiPauseCategory: "admin_pause",
    aiPauseReason: "Temporarily stopped by .0 shortcode",
  };
}

export function getCustomerReplyPauseReason(profile: any = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  return getCustomerAutoReplyStopState(profile, nowSeconds).message;
}

export function getCustomerReplyControlTargetJids(primaryJid: any, altJid?: any, profile: any = {}) {
  const normPrimary = normalizeWhatsAppJid(primaryJid);
  const normAlt = normalizeWhatsAppJid(altJid);
  const mappedPn = normPrimary.endsWith("@lid") ? getPersistedPnForLid(normPrimary) : null;
  const mappedLid = normPrimary.endsWith("@s.whatsapp.net") ? getPersistedLidForPn(normPrimary) : null;

  return Array.from(new Set([
    normPrimary,
    normAlt,
    mappedPn,
    mappedLid,
    profile?.jid,
    profile?.lidJid,
    profile?.phoneJid,
    ...(Array.isArray(profile?.linkedJids) ? profile.linkedJids : []),
  ].map(normalizeWhatsAppJid).filter(isCustomerChatJid)));
}

export function describeCustomerReplyControl(command: { action: string }) {
  if (command.action === "resume") return "Bot replies resumed for this customer.";
  if (command.action === "pause_permanent") return "Bot replies permanently stopped for this customer.";
  return "Bot replies stopped for this customer for 1 hour.";
}
