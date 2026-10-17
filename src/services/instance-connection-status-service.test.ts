import test from "node:test";
import assert from "node:assert/strict";

import {
  isTemporaryInstanceConnectionIssue,
  mapInstanceConnectionStatus,
  shouldHideNormalInstanceLog,
} from "./instance-connection-status-service.ts";

test("socket timeout maps to retrying instead of needs attention", () => {
  const state = mapInstanceConnectionStatus({ status: "error", issue: "Engine socket error: timeout", retryCount: 7, nextRetryMs: 10000 });
  assert.equal(state.status, "retrying");
  assert.equal(state.retryCount, 7);
  assert.equal(state.lastIssue, "network timeout");
  assert.equal(state.nextRetrySeconds, 10);
});

test("no proxy and temporary network issues map to retrying", () => {
  assert.equal(mapInstanceConnectionStatus({ issue: "No active proxy available" }).status, "retrying");
  assert.equal(mapInstanceConnectionStatus({ issue: "fetch failed due network timeout" }).status, "retrying");
});

test("QR and connected reset retry-facing state", () => {
  assert.equal(mapInstanceConnectionStatus({ status: "qr-ready", retryCount: 9 }).retryCount, 0);
  assert.equal(mapInstanceConnectionStatus({ status: "connected", retryCount: 9 }).retryCount, 0);
});

test("normal UI hides repeated raw socket timeout logs but technical issue is still classified", () => {
  assert.equal(isTemporaryInstanceConnectionIssue("Engine socket error: timeout"), true);
  assert.equal(isTemporaryInstanceConnectionIssue("Engine socket error: websocket error"), true);
  assert.equal(shouldHideNormalInstanceLog("Engine socket error: timeout"), true);
  assert.equal(shouldHideNormalInstanceLog("Engine socket error: websocket error"), true);
  assert.equal(shouldHideNormalInstanceLog("Logged out by user"), false);
});
