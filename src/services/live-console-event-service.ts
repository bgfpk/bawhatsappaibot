export type LiveConsoleEventLevel = "info" | "warn" | "error" | "success";
export type LiveConsoleEventScope = "bot" | "account" | "admin" | "global";

export type LiveConsoleEventType =
  | "inbound_message_received"
  | "message_saved"
  | "ai_started"
  | "ai_skipped"
  | "ai_output_complete"
  | "ai_output_incomplete"
  | "ai_reply_sent"
  | "ai_reply_failed"
  | "ai_reply_skipped"
  | "summary_queued"
  | "summary_updated"
  | "summary_skipped"
  | "summary_rejected"
  | "summary_failed"
  | "order_saved"
  | "order_updated"
  | "lead_saved"
  | "sequence_started"
  | "sequence_item_sent"
  | "sequence_item_skipped"
  | "sequence_item_failed"
  | "sequence_complete"
  | "sequence_partial"
  | "followup_selected"
  | "followup_sent"
  | "followup_skipped"
  | "followup_failed"
  | "followup_deleted_skipped"
  | "wallet_charged"
  | "wallet_not_charged"
  | "insufficient_wallet"
  | "trial_expired_block"
  | "subscription_expired_block"
  | "payment_error"
  | "subscription_error"
  | "creem_webhook_received"
  | "creem_webhook_failed"
  | "creem_payment_succeeded"
  | "creem_payment_failed"
  | "custom_gemini_cycle_charged"
  | "gemini_cache_boost_charged"
  | "customer_profile_scan_started"
  | "customer_profile_scan_saved"
  | "customer_profile_scan_skipped"
  | "customer_profile_scan_failed"
  | "customer_profile_scan_charged"
  | "customer_profile_scan_not_charged"
  | "worker_startup_restore"
  | "worker_watchdog_restore"
  | "worker_reconnect"
  | "worker_disconnected"
  | "whatsapp_cloud_webhook_received"
  | "whatsapp_cloud_webhook_failed"
  | "config_reloaded";

export type LiveConsoleEvent = {
  id: string;
  timestamp: number;
  type: LiveConsoleEventType;
  category: string;
  level: LiveConsoleEventLevel;
  scope: LiveConsoleEventScope;
  accountId?: string;
  botId?: string;
  customerJid?: string;
  title: string;
  message: string;
  reason?: string;
  status?: string;
  metadata?: Record<string, any>;
};

export type EmitLiveConsoleEventInput = Partial<Omit<LiveConsoleEvent, "id" | "timestamp" | "category">> & {
  type: LiveConsoleEventType;
};

const MAX_RECENT_EVENTS = 250;
const recentEvents: LiveConsoleEvent[] = [];
let sequence = 0;
let broadcaster: ((event: LiveConsoleEvent) => void) | null = null;

const SECRET_KEY_RE = /(api[_-]?key|secret|token|signature|password|authorization|cookie|rawbody|payload)/i;

function clean(value: any, limit = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function maskLiveConsoleJid(value: any) {
  const raw = clean(value, 120).replace(/[^a-zA-Z0-9@._:-]/g, "");
  if (!raw) return "";
  const [local, domain] = raw.split("@");
  const masked = local.length <= 7 ? local : `${local.slice(0, 3)}...${local.slice(-2)}`;
  return domain ? `${masked}@${domain}` : masked;
}

function safeMetadata(metadata: any) {
  const output: Record<string, any> = {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return output;
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_RE.test(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    } else {
      output[key] = clean(value, 160);
    }
  }
  return output;
}

export function getLiveConsoleCategory(type: any) {
  const value = clean(type).toLowerCase();
  if (value.startsWith("ai_") || value.includes("gemini")) return "AI";
  if (value.includes("wallet") || value.includes("billing")) return "Billing";
  if (value.includes("customer_profile_scan")) return "Customer Intelligence";
  if (value.includes("summary")) return "Summary";
  if (value.includes("payment") || value.includes("creem") || value.includes("subscription")) return "Payment";
  if (value.includes("sequence")) return "Sequence";
  if (value.includes("followup")) return "Follow-up";
  if (value.includes("worker") || value.includes("config")) return "Worker";
  if (value.includes("order") || value.includes("lead")) return "CRM";
  return "System";
}

export function setLiveConsoleEventBroadcaster(next: ((event: LiveConsoleEvent) => void) | null) {
  broadcaster = next;
}

export function clearLiveConsoleEventsForTest() {
  recentEvents.splice(0, recentEvents.length);
  sequence = 0;
  broadcaster = null;
}

export function formatLiveConsoleEventMessage(event: LiveConsoleEvent) {
  const reason = event.reason ? ` reason=${event.reason}` : "";
  const status = event.status ? ` status=${event.status}` : "";
  return `[${event.category}] ${event.title}${event.message ? `: ${event.message}` : ""}${reason}${status}`;
}

export function emitLiveConsoleEvent(input: EmitLiveConsoleEventInput) {
  const timestamp = Math.floor(Date.now() / 1000);
  const event: LiveConsoleEvent = {
    id: `${timestamp}-${++sequence}-${input.type}`,
    timestamp,
    type: input.type,
    category: getLiveConsoleCategory(input.type),
    level: input.level || "info",
    scope: input.scope || (input.botId ? "bot" : input.accountId ? "account" : "global"),
    accountId: clean(input.accountId, 80) || undefined,
    botId: clean(input.botId, 80) || undefined,
    customerJid: maskLiveConsoleJid(input.customerJid) || undefined,
    title: clean(input.title || input.type.replace(/_/g, " "), 90),
    message: clean(input.message || "", 260),
    reason: clean(input.reason || "", 100) || undefined,
    status: clean(input.status || "", 100) || undefined,
    metadata: safeMetadata(input.metadata),
  };
  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
  try {
    broadcaster?.(event);
  } catch {}
  return event;
}

export function listLiveConsoleEvents(filter: { since?: number; botId?: string; accountId?: string; includeGlobal?: boolean } = {}) {
  const since = Number(filter.since || 0);
  const botId = clean(filter.botId, 80);
  const accountId = clean(filter.accountId, 80);
  return recentEvents.filter((event) => {
    if (since && event.timestamp < since) return false;
    if (event.scope === "global" || event.scope === "admin") return filter.includeGlobal !== false;
    if (botId && event.botId === botId) return true;
    if (accountId && event.accountId === accountId) return true;
    return !botId && !accountId;
  });
}
