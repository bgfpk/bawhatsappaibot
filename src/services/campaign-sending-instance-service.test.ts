import test from "node:test";
import assert from "node:assert/strict";

import { resolveCampaignSendingInstance } from "./campaign-sending-instance-service.ts";

const bots = [
  { $id: "default", jid: "contact-37a60dee2b66@example.invalid", is_active: 1 },
  { $id: "origin", jid: "contact-120715ea6cdd@example.invalid", is_active: 1 },
  { $id: "paused", jid: "contact-ab56bc3211c2@example.invalid", is_active: 0 },
];

test("existing campaigns default to default_only sender", () => {
  const result = resolveCampaignSendingInstance({ defaultBotId: "default", bots });
  assert.equal(result.botId, "default");
  assert.equal(result.sendFromMode, "default_only");
  assert.equal(result.fallbackReason, "default_used_by_campaign_mode");
});

test("customer origin mode chooses connected origin", () => {
  const result = resolveCampaignSendingInstance({
    defaultBotId: "default",
    sendFromMode: "customer_origin_then_default",
    customer: { profile: { originBotId: "origin" } },
    bots,
    isBotConnected: (bot) => bot.$id === "origin",
  });
  assert.equal(result.botId, "origin");
  assert.equal(result.fallbackReason, "");
});

test("customer origin mode falls back when origin is disconnected", () => {
  const result = resolveCampaignSendingInstance({
    defaultBotId: "default",
    sendFromMode: "customer_origin_then_default",
    customer: { profile: { lastInboundBotId: "origin" } },
    bots,
    isBotConnected: () => false,
  });
  assert.equal(result.botId, "default");
  assert.equal(result.fallbackReason, "origin_disconnected");
});

test("customer origin mode falls back when origin is inactive", () => {
  const result = resolveCampaignSendingInstance({
    defaultBotId: "default",
    sendFromMode: "customer_origin_then_default",
    customer: { profile: { originBotId: "paused" } },
    bots,
  });
  assert.equal(result.botId, "default");
  assert.equal(result.fallbackReason, "origin_inactive");
});
