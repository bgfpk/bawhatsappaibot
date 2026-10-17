import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
const helperSource = readFileSync(new URL("./engine-socket-fallback-service.ts", import.meta.url), "utf8");
const inboxSource = readFileSync(new URL("../components/dashboard/pages/InboxV2Page.tsx", import.meta.url), "utf8");
const realtimeConstantsSource = readFileSync(new URL("../realtime/constants.ts", import.meta.url), "utf8");

test("dashboard keeps worker engine socket separate from main realtime socket", () => {
  assert.match(helperSource, /export const WORKER_ENGINE_SOCKET_PATH = "\/socket\.io"/);
  assert.match(helperSource, /export const WORKER_ENGINE_SOCKET_TRANSPORTS: string\[\] = \["polling"\]/);
  assert.match(realtimeConstantsSource, /export const MAIN_REALTIME_SOCKET_PATH = "\/realtime\/socket\.io"/);
  assert.match(appSource, /path: WORKER_ENGINE_SOCKET_PATH/);
  assert.match(appSource, /transports: WORKER_ENGINE_SOCKET_TRANSPORTS/);
  assert.match(inboxSource, /path: MAIN_REALTIME_SOCKET_PATH/);
});

test("app degrades worker socket safely and refreshes infrastructure through REST", () => {
  assert.match(appSource, /credentials: "same-origin"/);
  assert.match(appSource, /setWorkerRealtimeWarning\(WORKER_REALTIME_WARNING_MESSAGE\)/);
  assert.match(appSource, /buildEngineSocketStatusLog\(\{ status: "degraded", reason \}\)/);
  assert.doesNotMatch(appSource, /console\.warn\(issue\)/);
});

test("helper exposes exact degraded and recovery log markers", () => {
  assert.match(helperSource, /engine_socket_status status=degraded reason=/);
  assert.match(helperSource, /engine_socket_recovered/);
  assert.match(helperSource, /infrastructure_sync_status source=rest_fallback status=loaded/);
});

test("fresh QR or connected state wins over stale degraded socket status", () => {
  assert.match(appSource, /if \(!hasRecentFreshWorkerStatus\(\)\)/);
  assert.match(appSource, /lastFreshWorkerStatusAtRef\.current = Date\.now\(\)/);
  assert.match(appSource, /markEngineSocketRecovered\(\)/);
});
