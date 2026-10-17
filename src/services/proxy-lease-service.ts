import * as dbService from "./db-service.ts";

const UNCONNECTED_STATUSES = new Set(["disconnected", "qr-ready", "proxy-connecting", "connecting", "error"]);

export async function releaseUnconnectedProxyLease(input: {
  userId?: string;
  botId?: string;
  connectionStatus?: string;
  reason?: string;
}) {
  const userId = String(input.userId || "").trim();
  const botId = String(input.botId || "").trim();
  const status = String(input.connectionStatus || "").trim();
  if (!userId || !botId || !UNCONNECTED_STATUSES.has(status)) return false;

  const result = await dbService.releaseProxyQuotaForInactiveBot(botId, input.reason || "unconnected instance").catch(() => null) as any;
  return result?.released === true;
}
