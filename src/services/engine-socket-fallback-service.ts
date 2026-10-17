export const WORKER_ENGINE_SOCKET_PATH = "/socket.io";
export const WORKER_ENGINE_SOCKET_TRANSPORTS: string[] = ["polling"];
export const ENGINE_SOCKET_EVENT_RATE_LIMIT_MS = 15000;
export const ENGINE_SOCKET_FALLBACK_RATE_LIMIT_MS = 12000;
export const FRESH_WORKER_STATUS_GRACE_MS = 15000;
export const INFRASTRUCTURE_SYNC_DELAYED_ERROR = "Connection update delayed. Settings may be temporarily out of sync.";
export const WORKER_REALTIME_WARNING_MESSAGE = "Live worker status reconnecting. Settings and dashboard data are loading from the main server.";

export type EngineSocketDegradedReason = "connect_error" | "disconnect";

export function shouldRunRateLimitedAction(lastAtMs: number, nowMs: number, minIntervalMs: number) {
  if (!lastAtMs) return true;
  return nowMs - lastAtMs >= minIntervalMs;
}

export function hasFreshWorkerStatus(lastAtMs: number, nowMs: number, freshnessWindowMs = FRESH_WORKER_STATUS_GRACE_MS) {
  if (!lastAtMs) return false;
  return nowMs - lastAtMs < freshnessWindowMs;
}

export function buildEngineSocketStatusLog(input: { status: "degraded"; reason: EngineSocketDegradedReason } | { status: "recovered" }) {
  if (input.status === "recovered") {
    return "engine_socket_recovered";
  }
  return `engine_socket_status status=degraded reason=${input.reason}`;
}

export function buildInfrastructureSyncStatusLog() {
  return "infrastructure_sync_status source=rest_fallback status=loaded";
}
