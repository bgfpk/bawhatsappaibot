// src/services/whatsapp-cloud-api-chaos-race.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  claimCloudInboundMessage,
  updateCloudInboundMessageState,
  clearDurableCloudDedup,
} from "./whatsapp-cloud-api-durable-dedup.ts";
import {
  createOnboardingAttempt,
  validateAndConsumeOnboardingAttempt,
  clearOnboardingAttempts,
} from "./whatsapp-meta-onboarding-session.ts";
import {
  recordPhoneApiFailure,
  recordPhoneApiSuccess,
  isPhoneInCooldown,
  classifySendAttemptOutcome,
  clearPhoneRateStates,
} from "./whatsapp-cloud-api-rate-controller.ts";
import {
  resolveWhatsAppOutboundPolicy,
} from "./whatsapp-outbound-policy-service.ts";

test.afterEach(() => {
  clearDurableCloudDedup();
  clearOnboardingAttempts();
  clearPhoneRateStates();
});

test("Chaos: concurrent duplicate inbound webhook messages race - exactly 1 claimed", async () => {
  const wamid = "wamid.HBgL_concurrent_race_999";

  const [claim1, claim2, claim3] = await Promise.all([
    claimCloudInboundMessage({ accountId: "user_chaos", botId: "bot_chaos", providerMessageId: wamid }),
    claimCloudInboundMessage({ accountId: "user_chaos", botId: "bot_chaos", providerMessageId: wamid }),
    claimCloudInboundMessage({ accountId: "user_chaos", botId: "bot_chaos", providerMessageId: wamid }),
  ]);

  const claimedCount = [claim1, claim2, claim3].filter((c) => !c.isDuplicate).length;
  const duplicateCount = [claim1, claim2, claim3].filter((c) => c.isDuplicate).length;

  assert.equal(claimedCount, 1, "Exactly one concurrent webhook delivery must claim the message");
  assert.equal(duplicateCount, 2, "All subsequent deliveries must be flagged as duplicate");
});

test("Chaos: worker restart between durable claim and AI processing - recovers and preserves idempotency", async () => {
  const wamid = "wamid.HBgL_restart_crash_888";

  // 1. First worker claims message
  const firstClaim = await claimCloudInboundMessage({
    accountId: "user_crashed",
    botId: "bot_crashed",
    providerMessageId: wamid,
  });
  assert.equal(firstClaim.isDuplicate, false);

  // 2. Mark as processing
  await updateCloudInboundMessageState({
    claimKeyOrId: firstClaim.claimId,
    state: "processing",
  });

  // 3. Duplicate webhook arrives after crash/restart
  const retryClaim = await claimCloudInboundMessage({
    accountId: "user_crashed",
    botId: "bot_crashed",
    providerMessageId: wamid,
  });

  assert.equal(retryClaim.isDuplicate, true);
});

test("Chaos: concurrent onboarding attempts with same state - exactly 1 consumed", async () => {
  const attempt = createOnboardingAttempt({
    userId: "user_race_onboarding",
    botId: "bot_race_onboarding",
  });

  const [res1, res2, res3] = await Promise.all([
    Promise.resolve(validateAndConsumeOnboardingAttempt({
      attemptId: attempt.attemptId,
      state: attempt.state,
      userId: "user_race_onboarding",
      botId: "bot_race_onboarding",
    })),
    Promise.resolve(validateAndConsumeOnboardingAttempt({
      attemptId: attempt.attemptId,
      state: attempt.state,
      userId: "user_race_onboarding",
      botId: "bot_race_onboarding",
    })),
    Promise.resolve(validateAndConsumeOnboardingAttempt({
      attemptId: attempt.attemptId,
      state: attempt.state,
      userId: "user_race_onboarding",
      botId: "bot_race_onboarding",
    })),
  ]);

  const validCount = [res1, res2, res3].filter((r) => r.valid).length;
  assert.equal(validCount, 1, "Only one caller can consume the onboarding attempt");
});

test("Chaos: 429 rate storm on Account A is isolated and never affects Account B", () => {
  const phoneA = "phone_tenant_a_123";
  const phoneB = "phone_tenant_b_456";

  // Account A bombarded with 429
  for (let i = 0; i < 10; i++) {
    recordPhoneApiFailure(phoneA, 429, 30);
  }

  assert.equal(isPhoneInCooldown(phoneA).inCooldown, true);
  assert.equal(isPhoneInCooldown(phoneB).inCooldown, false, "Account B must remain unaffected");
});

test("Chaos: network timeout after message POST classifies as ambiguous (0 charge, no duplicate send)", () => {
  const outcome = classifySendAttemptOutcome({
    networkError: new Error("socket hang up - request dropped"),
  });

  assert.equal(outcome.status, "ambiguous_send_result");
  assert.equal(outcome.retryable, false);
});

test("Chaos: Cloud instance disconnected during scheduled job fails closed (no Baileys fallback)", () => {
  const policy = resolveWhatsAppOutboundPolicy({
    providerType: "whatsapp_cloud_api",
    messagePurpose: "customer_update",
    latestInboundAt: null, // window closed
  });

  // Since no template provided, policy fails closed with cloud_template_required
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, "cloud_template_required");
  assert.equal(policy.sendMode, "blocked");
});
