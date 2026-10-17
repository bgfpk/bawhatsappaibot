import type { MessageItem } from "./conversation-model";

/**
 * Truthfully converts raw message objects into normalized MessageItem models.
 * Strictly avoids Math.random(), fake Date.now() fallbacks, and manufactured status.
 */
export function getStableMessageId(raw: any): string {
  const serverId = raw?.id || raw?.key?.id || raw?.messageId || raw?.$id || raw?.sentMessageId;
  if (serverId) return String(serverId);

  const dbId = raw?.eventId || raw?.dbId || raw?._id;
  if (dbId) return String(dbId);

  const correlationId = raw?.correlationId || raw?.clientMsgId || raw?.tempId;
  if (correlationId) return String(correlationId);

  const sender = raw?.sender || (raw?.isMe || raw?.isFromMe || raw?.key?.fromMe ? "user" : "customer");
  const textSnippet = String(raw?.text || raw?.body || raw?.message || raw?.caption || "")
    .trim()
    .slice(0, 32)
    .replace(/\s+/g, "_");
  const ts = raw?.timestamp || raw?.createdAt || raw?.$createdAt;

  if (ts) {
    return `msg_${sender}_${ts}_${textSnippet}`;
  }

  return `msg_${sender}_${textSnippet}`;
}

export function normalizeMessageItem(raw: any, index?: number): MessageItem {
  const messageId = getStableMessageId(raw);

  const isMe = Boolean(raw?.isMe || raw?.isFromMe || raw?.key?.fromMe || raw?.sender === "user" || raw?.sender === "bot");
  const sender: MessageItem["sender"] = raw?.sender || (isMe ? (raw?.isBot ? "bot" : "user") : "customer");
  const senderName = raw?.senderName || (sender === "customer" ? "Customer" : sender === "bot" ? "AI Assistant" : "Agent");

  const text = String(raw?.text || raw?.body || raw?.message || raw?.caption || "").trim();
  const timestamp = raw?.timestamp || raw?.createdAt || raw?.$createdAt || undefined;

  let mediaType: MessageItem["mediaType"] = undefined;
  if (raw?.mediaType || raw?.type) {
    const t = String(raw?.mediaType || raw?.type).toLowerCase();
    if (t.includes("image")) mediaType = "image";
    else if (t.includes("video")) mediaType = "video";
    else if (t.includes("audio") || t.includes("voice")) mediaType = "audio";
    else if (t.includes("document")) mediaType = "document";
  }

  const status: MessageItem["status"] = raw?.status || (raw?.pending ? "sending" : undefined);

  return {
    id: String(messageId),
    sender,
    senderName,
    text,
    timestamp,
    mediaType,
    mediaUrl: raw?.mediaUrl || raw?.url || undefined,
    fileName: raw?.fileName || raw?.filename || undefined,
    fileSize: raw?.fileSize || undefined,
    status,
    error: raw?.error || undefined,
  };
}
