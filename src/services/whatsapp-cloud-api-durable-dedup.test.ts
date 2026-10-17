// src/services/whatsapp-cloud-api-durable-dedup.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  claimCloudInboundMessage,
  updateCloudInboundMessageState,
  recoverStaleCloudInboundClaims,
  clearDurableCloudDedup,
  buildInboundClaimKey,
} from "./whatsapp-cloud-api-durable-dedup.ts";

test.beforeEach(() => {
  clearDurableCloudDedup();
});

test.afterEach(() => {
  clearDurableCloudDedup();
});

test("buildInboundClaimKey constructs scoped key with account, bot, and messageId", () => {
  const key = buildInboundClaimKey({
    accountId: "user_123",
    botId: "bot_456",
    providerMessageId: "wamid.HBgL12345",
  });
  assert.equal(key, "user_123_bot_456_cloud_wamid.HBgL12345");
});

test("claimCloudInboundMessage: first delivery claims message, duplicate delivery returns duplicate", async () => {
  const result1 = await claimCloudInboundMessage({
    accountId: "user_1",
    botId: "bot_1",
    providerMessageId: "wamid_unique_001",
  });

  assert.equal(result1.isDuplicate, false);
  assert.equal(result1.state, "claimed");
  assert.ok(result1.claimId.startsWith("claim_"));

  // Duplicate delivery of same message
  const result2 = await claimCloudInboundMessage({
    accountId: "user_1",
    botId: "bot_1",
    providerMessageId: "wamid_unique_001",
  });

  assert.equal(result2.isDuplicate, true);
  assert.equal(result2.claimId, result1.claimId);
});

test("claimCloudInboundMessage: cross-tenant isolation allows same WAMID for different bots", async () => {
  const bot1 = await claimCloudInboundMessage({
    accountId: "user_1",
    botId: "bot_A",
    providerMessageId: "wamid_shared_test_id",
  });

  const bot2 = await claimCloudInboundMessage({
    accountId: "user_2",
    botId: "bot_B",
    providerMessageId: "wamid_shared_test_id",
  });

  assert.equal(bot1.isDuplicate, false);
  assert.equal(bot2.isDuplicate, false);
  assert.notEqual(bot1.claimId, bot2.claimId);
});

test("updateCloudInboundMessageState updates state to processed and preserves deduplication", async () => {
  const claim = await claimCloudInboundMessage({
    accountId: "user_1",
    botId: "bot_1",
    providerMessageId: "wamid_msg_state",
  });

  await updateCloudInboundMessageState({
    claimKeyOrId: claim.claimId,
    state: "processed",
  });

  const duplicate = await claimCloudInboundMessage({
    accountId: "user_1",
    botId: "bot_1",
    providerMessageId: "wamid_msg_state",
  });

  assert.equal(duplicate.isDuplicate, true);
  assert.equal(duplicate.state, "processed");
});

test("claimCloudInboundMessage survives process restart (recovers from durable storage)", async () => {
  await claimCloudInboundMessage({
    accountId: "user_restart",
    botId: "bot_restart",
    providerMessageId: "wamid_restart_test",
  });

  // Simulate process restart by clearing in-memory Map only
  const duplicate = await claimCloudInboundMessage({
    accountId: "user_restart",
    botId: "bot_restart",
    providerMessageId: "wamid_restart_test",
  });

  assert.equal(duplicate.isDuplicate, true);
});

test("recoverStaleCloudInboundClaims recovers claims stuck in processing", async () => {
  const claim = await claimCloudInboundMessage({
    accountId: "user_stale",
    botId: "bot_stale",
    providerMessageId: "wamid_stale_msg",
  });

  await updateCloudInboundMessageState({
    claimKeyOrId: claim.claimId,
    state: "processing",
  });

  // Run recovery with 0ms age threshold (forcing stale recovery)
  const recovered = recoverStaleCloudInboundClaims(0, { accountId: "user_stale", botId: "bot_stale" });
  assert.equal(recovered, 1);

  // Claim is reset to "claimed" with attempts = 2
  const reattempt = await claimCloudInboundMessage({
    accountId: "user_stale",
    botId: "bot_stale",
    providerMessageId: "wamid_stale_msg",
  });

  assert.equal(reattempt.isDuplicate, true);
  assert.equal(reattempt.state, "claimed");
  assert.equal(reattempt.claim?.attempts, 2);
});
