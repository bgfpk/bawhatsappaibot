import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEngineSocketStatusLog,
  FRESH_WORKER_STATUS_GRACE_MS,
  hasFreshWorkerStatus,
  buildInfrastructureSyncStatusLog,
  INFRASTRUCTURE_SYNC_DELAYED_ERROR,
  shouldRunRateLimitedAction,
  WORKER_ENGINE_SOCKET_PATH,
  WORKER_ENGINE_SOCKET_TRANSPORTS,
  WORKER_REALTIME_WARNING_MESSAGE,
} from "./engine-socket-fallback-service.ts";

test("worker engine socket path stays on legacy worker channel", () => {
  assert.equal(WORKER_ENGINE_SOCKET_PATH, "/socket.io");
  assert.deepEqual(WORKER_ENGINE_SOCKET_TRANSPORTS, ["polling"]);
});

test("engine socket status logs stay concise and exact", () => {
  assert.equal(
    buildEngineSocketStatusLog({ status: "degraded", reason: "connect_error" }),
    "engine_socket_status status=degraded reason=connect_error",
  );
  assert.equal(
    buildEngineSocketStatusLog({ status: "degraded", reason: "disconnect" }),
    "engine_socket_status status=degraded reason=disconnect",
  );
  assert.equal(buildEngineSocketStatusLog({ status: "recovered" }), "engine_socket_recovered");
  assert.equal(
    buildInfrastructureSyncStatusLog(),
    "infrastructure_sync_status source=rest_fallback status=loaded",
  );
  assert.equal(
    INFRASTRUCTURE_SYNC_DELAYED_ERROR,
    "Connection update delayed. Settings may be temporarily out of sync.",
  );
  assert.equal(
    WORKER_REALTIME_WARNING_MESSAGE,
    "Live worker status reconnecting. Settings and dashboard data are loading from the main server.",
  );
});

test("rate-limited actions only rerun after the configured interval", () => {
  assert.equal(shouldRunRateLimitedAction(0, 1_000, 15_000), true);
  assert.equal(shouldRunRateLimitedAction(5_000, 10_000, 15_000), false);
  assert.equal(shouldRunRateLimitedAction(5_000, 20_001, 15_000), true);
});

test("fresh worker QR or connected status prevents stale degraded state from winning", () => {
  assert.equal(hasFreshWorkerStatus(0, 10_000), false);
  assert.equal(hasFreshWorkerStatus(5_000, 10_000), true);
  assert.equal(hasFreshWorkerStatus(5_000, 20_001), false);
  assert.equal(hasFreshWorkerStatus(5_000, 19_999, FRESH_WORKER_STATUS_GRACE_MS), true);
});
