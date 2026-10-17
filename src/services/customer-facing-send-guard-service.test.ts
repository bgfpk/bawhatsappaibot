import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetCustomerFacingSendGuardTestDeps,
  __setCustomerFacingSendGuardTestDeps,
  assertCustomerFacingSendAllowed,
} from "./customer-facing-send-guard-service.ts";

test.afterEach(() => {
  __resetCustomerFacingSendGuardTestDeps();
});

test("expired target account blocks super-admin customer-facing send context", async () => {
  const logs: string[] = [];
  __setCustomerFacingSendGuardTestDeps({
    canSendCustomerFacingMessage: async () => ({
      allowed: false,
      reason: "trial_expired",
    } as any),
  });

  const result = await assertCustomerFacingSendAllowed({
    userId: "expired_customer_account",
    context: "super_admin_manual_send",
    customerJid: "contact-6c9bc40fc084@example.invalid",
    logger: { warn: (msg) => logs.push(msg) },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "trial_expired");
  assert.match(logs[0], /Blocked customer-facing send/);
});
