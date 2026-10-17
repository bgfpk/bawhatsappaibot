import { getReadableMessageContent } from "./whatsapp-message-content.ts";

export function describeTemplateForHistory(template: any, fallback = "Sequence template delivered") {
  const message = template?.message || template;
  const readable = getReadableMessageContent(message);
  const text = String(readable.text || "").trim();
  if (text) return text.slice(0, 500);

  const content = readable.content || {};
  if (content.imageMessage) return "[Image sequence template sent]";
  if (content.videoMessage) return "[Video sequence template sent]";
  if (content.audioMessage) return "[Voice sequence template sent]";
  if (content.documentMessage) return "[Document sequence template sent]";
  if (content.stickerMessage) return "[Sticker sequence template sent]";

  return fallback;
}
