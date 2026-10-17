import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SYSTEM_PROXY_ASSIGNMENTS,
  calculateSystemProxyPoolStats,
  canAssignSystemProxy,
  canKeepAssignedSystemProxy,
  getSystemProxyHealthState,
  isSystemProxyGenericallyHealthy,
} from "./system-proxy-state-service.ts";

test("quota math uses generic working proxies and max 3 slots", () => {
  const stats = calculateSystemProxyPoolStats([
    { latency: 120, error_msg: "", load_count: 2, is_active: 1 },
    { latency: 95, error_msg: "", load_count: 1, is_active: 1 },
    { latency: 0, error_msg: "Connection timed out", load_count: 4, is_active: 1 },
    { latency: 0, error_msg: "", load_count: 0, is_active: 1 },
  ]);

  assert.equal(MAX_SYSTEM_PROXY_ASSIGNMENTS, 3);
  assert.deepEqual(stats, {
    total: 4,
    working: 2,
    error: 1,
    unknown: 1,
    connectedInstances: 7,
    totalQuota: 6,
    quotaLeft: 0,
  });
});

test("allocator respects max 3 assignments instead of 5", () => {
  assert.equal(canAssignSystemProxy({ is_active: 1, load_count: 2, error_msg: "" }), true);
  assert.equal(canAssignSystemProxy({ is_active: 1, load_count: 3, error_msg: "" }), false);
});

test("existing assigned proxy is kept when only generic health is considered", () => {
  const proxy = { is_active: 1, latency: 150, error_msg: "" };
  assert.equal(isSystemProxyGenericallyHealthy(proxy), true);
  assert.equal(canKeepAssignedSystemProxy(proxy), true);
  assert.equal(getSystemProxyHealthState(proxy), "working");
});
