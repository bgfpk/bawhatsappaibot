import { getReadableMessageContent } from "./whatsapp-message-content.ts";
import { findLatestIncomingMessage, getMessageTimestampSeconds } from "./missed-message-recovery.ts";

export const MISSED_REPLY_FORCE_SHORTCUT = ",";
export const FORCE_REPLY_PENDING_DELIVERY_REASON = "force_reply_pending_delivery";

function getMessageId(message: any) {
  return String(message?.key?.id || "");
}

function getCommandContextInfo(commandMessage: any) {
  const readable = getReadableMessageContent(commandMessage?.message);
  return readable.content?.extendedTextMessage?.contextInfo ||
    readable.content?.imageMessage?.contextInfo ||
    readable.content?.videoMessage?.contextInfo ||
    readable.content?.documentMessage?.contextInfo ||
    readable.content?.audioMessage?.contextInfo ||
    {};
}

function buildSyntheticQuotedIncoming(commandMessage: any, customerJid: string) {
  const contextInfo = getCommandContextInfo(commandMessage);
  if (!contextInfo?.quotedMessage) return null;

  const commandAt = getMessageTimestampSeconds(commandMessage) || Math.floor(Date.now() / 1000);
  const quotedId = String(contextInfo.stanzaId || `quoted-${commandAt}`);

  return {
    key: {
      fromMe: false,
      remoteJid: customerJid,
      id: quotedId,
      participant: contextInfo.participant,
    },
    message: contextInfo.quotedMessage,
    messageTimestamp: Math.max(1, commandAt - 1),
  };
}

export function isMissedReplyForceShortcutText(text: any) {
  return String(text || "").trim() === MISSED_REPLY_FORCE_SHORTCUT;
}

export function describeForcedMissedReplyTarget(usedQuotedMessage: boolean) {
  return usedQuotedMessage ? "quoted customer message" : "latest missed customer message";
}

export function buildForcedMissedReplyHistory(historyArray: any[] = [], commandMessage: any, customerJid: string) {
  const commandId = getMessageId(commandMessage);
  const cleanHistory = commandId
    ? historyArray.filter((message) => getMessageId(message) !== commandId)
    : [...historyArray];

  const contextInfo = getCommandContextInfo(commandMessage);
  const quotedId = String(contextInfo?.stanzaId || "");
  let replyHistory = cleanHistory;
  let targetIncoming = findLatestIncomingMessage(cleanHistory);
  let usedQuotedMessage = false;

  if (quotedId) {
    const quotedIndex = cleanHistory.findIndex((message) => getMessageId(message) === quotedId);
    const quotedMessage = quotedIndex >= 0 ? cleanHistory[quotedIndex] : null;

    if (quotedMessage?.key?.fromMe === false) {
      replyHistory = cleanHistory.slice(0, quotedIndex + 1);
      targetIncoming = quotedMessage;
      usedQuotedMessage = true;
    } else if (quotedIndex < 0) {
      const syntheticQuoted = buildSyntheticQuotedIncoming(commandMessage, customerJid);
      if (syntheticQuoted) {
        replyHistory = [...cleanHistory, syntheticQuoted]
          .sort((a, b) => getMessageTimestampSeconds(a) - getMessageTimestampSeconds(b));
        targetIncoming = syntheticQuoted;
        usedQuotedMessage = true;
      }
    }
  }

  return {
    cleanHistory,
    replyHistory,
    targetIncoming,
    usedQuotedMessage,
  };
}
