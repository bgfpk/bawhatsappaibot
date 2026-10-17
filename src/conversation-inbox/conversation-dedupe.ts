import type { MessageItem } from "./conversation-model";

/**
 * Safe deduplication utility for messages.
 * Reconciles pending local messages with server-confirmed socket/HTTP messages.
 * Keeps two distinct messages with identical text when their real IDs differ.
 */
export function deduplicateMessages(messages: MessageItem[]): MessageItem[] {
  const seenIds = new Set<string>();
  const result: MessageItem[] = [];

  for (const msg of messages) {
    if (!msg || !msg.id) continue;
    const id = msg.id;

    // Direct real ID match -> Ignore duplicate
    if (seenIds.has(id)) {
      continue;
    }

    // Reconcile pending local message when explicit correlation ID matches
    if ((msg.status === "sent" || msg.status === "delivered" || msg.status === "read") && (msg as any).correlationId) {
      const pendingIndex = result.findIndex(
        (existing) =>
          existing.status === "sending" &&
          (existing as any).correlationId === (msg as any).correlationId
      );

      if (pendingIndex !== -1) {
        seenIds.delete(result[pendingIndex].id);
        result[pendingIndex] = msg;
        seenIds.add(id);
        continue;
      }
    }

    seenIds.add(id);
    result.push(msg);
  }

  return result;
}

/**
 * Generates a stable identity for a message without Math.random().
 */
export function getStableMessageId(msg: any): string {
  if (msg?.id) return String(msg.id);
  if (msg?.key?.id) return String(msg.key.id);
  if (msg?.messageId) return String(msg.messageId);
  if (msg?.$id) return String(msg.$id);

  const sender = msg?.sender || (msg?.isMe ? "user" : "customer");
  const textSnippet = String(msg?.text || msg?.body || msg?.message || "").slice(0, 16);
  const ts = msg?.timestamp || msg?.createdAt || 0;

  return `msg-${sender}-${ts}-${textSnippet}`;
}
