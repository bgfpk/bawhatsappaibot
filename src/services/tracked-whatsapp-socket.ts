import { prepareOutgoingWhatsAppText } from "./outbound-message-sanitizer.ts";

function trackMessageId(sentIds: Set<string>, id: any) {
  if (id) sentIds.add(String(id));
}

export function createTrackedWhatsAppSocket(sock: any, sentIds: Set<string>) {
  if (!sock) return sock;

  return new Proxy(sock, {
    get(target, prop, receiver) {
      if (prop === "sendMessage") {
        return async (...args: any[]) => {
          const payload = args[1];
          if (payload?.text !== undefined) {
            const prepared = prepareOutgoingWhatsAppText(payload.text);
            if (!prepared.text) {
              return { key: { id: "" }, skipped: true, blockedUnsafeText: true };
            }
            args[1] = { ...payload, text: prepared.text };
          } else if (payload?.caption !== undefined) {
            const prepared = prepareOutgoingWhatsAppText(payload.caption);
            args[1] = prepared.text ? { ...payload, caption: prepared.text } : payload;
          }
          const result = await target.sendMessage.apply(target, args);
          trackMessageId(sentIds, result?.key?.id);
          return result;
        };
      }

      if (prop === "relayMessage") {
        return async (...args: any[]) => {
          trackMessageId(sentIds, args[2]?.messageId || args[2]?.messageID);
          return target.relayMessage.apply(target, args);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
