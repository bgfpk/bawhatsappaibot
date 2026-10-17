import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomerOriginPatch,
  decideProxyReleaseForUser,
} from "./instance-activity-service.ts";

test("unlinked instance releases user proxy when no active recent sibling depends on it", () => {
  const result = decideProxyReleaseForUser({
    targetBot: { $id: "dead", jid: "", user_id: "u1" },
    userBots: [{ $id: "dead", jid: "", user_id: "u1" }],
    nowSeconds: 200000,
  });
  assert.equal(result.release, true);
  assert.equal(result.reason, "proxy_released_due_to_unlinked");
});

test("linked recent instance does not release proxy", () => {
  const result = decideProxyReleaseForUser({
    targetBot: { $id: "active", jid: "contact-37a60dee2b66@example.invalid", last_inbound_at: 199900 },
    userBots: [],
    nowSeconds: 200000,
  });
  assert.equal(result.release, false);
  assert.equal(result.reason, "release_skipped_active_recent");
});

test("unknown linked activity does not release proxy", () => {
  const result = decideProxyReleaseForUser({
    targetBot: { $id: "unknown", jid: "contact-37a60dee2b66@example.invalid" },
    userBots: [],
    nowSeconds: 200000,
  });
  assert.equal(result.release, false);
  assert.equal(result.reason, "release_skipped_activity_unknown");
});

test("24h idle linked instance releases only when activity is reliable", () => {
  const result = decideProxyReleaseForUser({
    targetBot: { $id: "idle", jid: "contact-37a60dee2b66@example.invalid", last_outbound_at: 1000 },
    userBots: [],
    nowSeconds: 1000 + 25 * 60 * 60,
  });
  assert.equal(result.release, true);
  assert.equal(result.reason, "proxy_released_due_to_24h_inactive");
});

test("shared user-level proxy is not released when sibling is recent", () => {
  const result = decideProxyReleaseForUser({
    targetBot: { $id: "idle", jid: "contact-37a60dee2b66@example.invalid", last_outbound_at: 1000 },
    userBots: [
      { $id: "idle", jid: "contact-37a60dee2b66@example.invalid", last_outbound_at: 1000 },
      { $id: "recent", jid: "contact-120715ea6cdd@example.invalid", last_inbound_at: 199900, is_active: 1 },
    ],
    nowSeconds: 200000,
  });
  assert.equal(result.release, false);
  assert.equal(result.reason, "release_skipped_shared_user_proxy");
});

test("inbound message stores origin and last inbound bot metadata", () => {
  const patch = buildCustomerOriginPatch({
    botId: "bot_1",
    botJid: "contact-37a60dee2b66@example.invalid",
    direction: "inbound",
    existingProfile: {},
  });
  assert.equal(patch.originBotId, "bot_1");
  assert.equal(patch.lastInboundBotId, "bot_1");
});

test("successful outbound stores last outbound bot metadata", () => {
  const patch = buildCustomerOriginPatch({
    botId: "bot_1",
    botJid: "contact-37a60dee2b66@example.invalid",
    direction: "outbound",
  });
  assert.equal(patch.lastOutboundBotId, "bot_1");
  assert.equal(patch.lastOutboundBotJid, "contact-37a60dee2b66@example.invalid");
});
