import { getReadableMessageContent } from "./whatsapp-message-content.ts";

export function isProgrammaticOutboundMessage(msg: any, sentIds: Set<string>) {
  const id = msg?.key?.id;
  return Boolean(msg?.key?.fromMe && id && sentIds.has(id));
}

export function getManualMessageInsight(msg: any) {
  const readable = getReadableMessageContent(msg?.message);
  const text = readable.text.trim();
  const kind = readable.hasAudio ? "voice" : (readable.hasMedia ? "media" : "text");

  let summaryText = text;
  if (!summaryText && readable.hasAudio) summaryText = "[Manual voice note sent]";
  if (!summaryText && readable.hasMedia) summaryText = "[Manual media sent]";
  if (summaryText && readable.hasMedia && text) summaryText = `[Manual media caption]: ${text}`;

  return {
    kind,
    text: summaryText,
    hasMeaningfulContent: readable.hasMeaningfulContent,
  };
}
