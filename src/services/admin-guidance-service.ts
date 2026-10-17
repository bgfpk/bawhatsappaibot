import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";
import { getAdminAlertTarget } from "./admin-alert-context-service.ts";
import { normalizeWhatsAppPhone } from "./order-alert-service.ts";
import { getReadableMessageContent } from "./whatsapp-message-content.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeText(value: any) {
  return clean(value).replace(/\s+/g, " ");
}

function getAdminJid(config: any) {
  const phone = normalizeWhatsAppPhone(config?.admin_number || config?.adminNumber || config?.whatsapp_number);
  return phone ? `${phone}@s.whatsapp.net` : "";
}

function getContextInfo(content: any) {
  return content?.extendedTextMessage?.contextInfo ||
    content?.imageMessage?.contextInfo ||
    content?.videoMessage?.contextInfo ||
    content?.documentMessage?.contextInfo ||
    content?.audioMessage?.contextInfo ||
    {};
}

function getQuotedMessageId(message: any) {
  const content = getReadableMessageContent(message).content;
  return clean(getContextInfo(content).stanzaId);
}

function getQuotedMessageText(message: any) {
  const content = getReadableMessageContent(message).content;
  const quoted = getContextInfo(content).quotedMessage;
  return quoted ? getReadableMessageContent(quoted).text : "";
}

function isAdminAlertText(text: any) {
  const value = clean(text).toLowerCase();
  return value.includes("admin attention needed") || value.includes("reply to this alert");
}

function extractTargetJid(...texts: any[]) {
  for (const text of texts) {
    const match = clean(text).match(/\b(?:Chat|Customer)\s*:\s*([0-9A-Za-z._-]+@(?:s\.whatsapp\.net|lid|hosted\.lid))/i);
    const jid = normalizeWhatsAppJid(match?.[1]);
    if (jid) return jid;
  }
  return "";
}

function extractDirectReply(text: string) {
  const patterns = [
    /^(?:reply|send|say|tell customer|customer ko|usko|isko)\s*(?:this|ye|yeh)?\s*[:-]\s*(.+)$/i,
    /(?:give customer this reply|send this to customer|customer ko ye reply do)\s*[:-]\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function looksAdminOnly(text: string) {
  const value = normalizeText(text).toLowerCase();
  return /\b(internal|analysis|reason|escalation|debug|admin only|manual review|customer is|customer seems|bot should|ai should|note)\b/.test(value);
}

function extractInternalInstruction(text: string) {
  const patterns = [
    /^(?:note|remember|instruction|ai instruction|bot instruction|save this)\s*[:-]\s*(.+)$/i,
    /^(?:sirf yaad rakho|sirf note karo|only remember|do not send)\s*[:-]?\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return looksAdminOnly(text) ? clean(text) : "";
}

export function buildAdminGuidanceAction(input: {
  fromJid: string;
  message: any;
  text: string;
  userConfig: any;
}) {
  const adminJid = getAdminJid(input.userConfig);
  if (!adminJid || normalizeWhatsAppJid(input.fromJid) !== adminJid) return { isAdminGuidance: false };

  const latestText = normalizeText(input.text);
  const quotedMessageId = getQuotedMessageId(input.message);
  const quotedText = getQuotedMessageText(input.message);
  const targetJid = normalizeWhatsAppJid(getAdminAlertTarget(quotedMessageId)) || extractTargetJid(quotedText, latestText);
  if (!targetJid) {
    return isAdminAlertText(quotedText)
      ? { isAdminGuidance: true, missingTarget: true }
      : { isAdminGuidance: false };
  }

  const internalInstruction = extractInternalInstruction(latestText);
  const directReply = extractDirectReply(latestText);
  return {
    isAdminGuidance: true,
    targetJid,
    directReply,
    instruction: internalInstruction || (directReply ? "" : latestText),
  };
}
