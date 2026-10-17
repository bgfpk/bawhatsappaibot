import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetOutboundMessageBillingTestDeps,
  __setOutboundMessageBillingTestDeps,
  previewUsageBillingAction,
} from "./outbound-message-billing-service.ts";

test.afterEach(() => {
  __resetOutboundMessageBillingTestDeps();
});

test("expired account blocks voice reply billing preview before wallet check", async () => {
  __setOutboundMessageBillingTestDeps({
    getUser: async () => ({ $id: "user_1", wallet_balance: 999 } as any),
    canSendCustomerFacingMessage: async () => ({ allowed: false, reason: "trial_expired" } as any),
  });

  const preview = await previewUsageBillingAction("user_1", "customer_ai_voice_reply");

  assert.equal(preview.allowed, false);
  assert.equal(preview.reason, "trial_expired");
});
