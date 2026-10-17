import assert from "node:assert/strict";
import test from "node:test";
import { buildAiStudioV2Status } from "./ai-studio-v2-service";

test("builds clean empty AI Studio states without fake metrics", () => {
  const result = buildAiStudioV2Status({});
  assert.ok(result.cards.length >= 6);
  assert.ok(result.notConnectedCount > 0);
  assert.equal(result.cards.find((card) => card.id === "analytics")?.value, "No usage yet");
});

test("aggregates configured AI Studio states from existing settings", () => {
  const result = buildAiStudioV2Status({
    botName: "BlackArrow Assistant",
    businessType: "products",
    instructions: "Reply clearly, collect order details, and escalate complex cases to the team.",
    learnedKnowledge: "Delivery takes 3 to 5 days.",
    replyMode: "text_preferred",
    products: [{ id: "p1" }],
    syncGroups: [{ purpose: "media" }],
    clientGeminiStatus: { hasKey: true },
    cacheBoostEnabled: true,
    customerIntelligenceEnabled: true,
    smartSalesEnabled: true,
    usage: { total: { customGeminiCycles: 12 } },
  });
  assert.ok(result.readyCount >= 5);
  assert.equal(result.cards.find((card) => card.id === "personality")?.status, "ready");
  assert.equal(result.cards.find((card) => card.id === "analytics")?.value, "12 AI cycles");
});

test("does not mutate input", () => {
  const input = { products: [{ id: "p1" }], syncGroups: [{ purpose: "welcome" }], clientGeminiStatus: { hasKey: true } };
  const before = JSON.stringify(input);
  buildAiStudioV2Status(input);
  assert.equal(JSON.stringify(input), before);
});
