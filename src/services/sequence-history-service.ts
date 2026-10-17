import { getReadableMessageContent, isIgnorableWhatsappMessage } from "./whatsapp-message-content.ts";
import { PHONE_NUMBER_REQUEST_TEXT } from "./phone-number-consent-service.ts";

const AUTOMATION_MARKER_TEXTS = new Set([
    PHONE_NUMBER_REQUEST_TEXT.trim().toLowerCase(),
    "to receive delivery updates and future offers correctly, please share your whatsapp number here.",
    "to receive delivery updates and future offers correctly, please tap below to share your whatsapp number.",
    ",",
]);

function normalizeEpochSeconds(value: any) {
    const raw = value && typeof value.toNumber === "function" ? value.toNumber() : value;
    const numeric = Number(raw);
    if (!numeric) return 0;
    return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function isAutomationMarkerText(text: string) {
    const clean = text.trim().toLowerCase();
    return clean === "welcome_sent" || clean.startsWith("seq_sent_") || clean.startsWith("welcome_sent") || AUTOMATION_MARKER_TEXTS.has(clean);
}

function getComparableContent(message: any) {
    const readable = getReadableMessageContent(message?.message);
    if (readable.text.trim()) return readable.text.trim().toLowerCase();
    if (readable.hasAudio) return "[audio]";
    if (readable.hasMedia) return "[media]";
    return "";
}

function isSameIncomingEvent(a: any, b: any) {
    if (!a || !b) return false;
    const aId = String(a?.key?.id || "");
    const bId = String(b?.key?.id || "");
    if (aId && bId && aId === bId) return true;
    if (a?.key?.fromMe !== false || b?.key?.fromMe !== false) return false;
    const aText = getComparableContent(a);
    const bText = getComparableContent(b);
    if (!aText || aText !== bText) return false;
    const timeDiff = Math.abs(normalizeEpochSeconds(a?.messageTimestamp) - normalizeEpochSeconds(b?.messageTimestamp));
    return timeDiff <= 120;
}

export function buildSequenceHistoryFromDb(history: any[] = [], customerJid: string) {
    return history
        .filter(item => item?.text && !isAutomationMarkerText(String(item.text)))
        .map(item => ({
            key: {
                fromMe: item.role !== "user",
                remoteJid: customerJid,
                id: item.messageId || `db-${item.role}-${item.timestamp || Date.now()}`,
            },
            message: { conversation: String(item.text || "") },
            messageTimestamp: normalizeEpochSeconds(item.timestamp || Date.now()),
        }));
}

export function getRecentMeaningfulChatMessages(historyArray: any[] = [], limit = 5, excludeMessageId = "") {
    const seen = new Set<string>();
    const messages = historyArray
        .filter(message => {
            const id = String(message?.key?.id || "");
            if (excludeMessageId && id === excludeMessageId) return false;
            if (id && seen.has(id)) return false;
            if (id) seen.add(id);
            if (isIgnorableWhatsappMessage(message)) return false;
            const readable = getReadableMessageContent(message?.message);
            if (!readable.hasMeaningfulContent) return false;
            if (isAutomationMarkerText(readable.text)) return false;
            return true;
        })
        .sort((a, b) => normalizeEpochSeconds(a?.messageTimestamp) - normalizeEpochSeconds(b?.messageTimestamp));

    return messages.slice(-limit);
}

export function findLatestIncomingMeaningfulMessage(historyArray: any[] = []) {
    return getRecentMeaningfulChatMessages(historyArray, 50)
        .filter(message => message?.key?.fromMe === false)
        .pop();
}

export function shouldSendWelcomeSequence(historyArray: any[] = []) {
  const recentMessages = getRecentMeaningfulChatMessages(historyArray, 100);
  const latestIncoming = recentMessages.filter(message => message?.key?.fromMe === false).pop();
  if (!latestIncoming) return false;

  const previousIncomingMessages = recentMessages
    .filter(message => message?.key?.fromMe === false)
    .filter(message => !isSameIncomingEvent(message, latestIncoming));
  return previousIncomingMessages.length === 0;
}
