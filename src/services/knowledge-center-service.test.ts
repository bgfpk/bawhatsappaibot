import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeCenterInventory } from "./knowledge-center-service";

test("builds deterministic empty inventory without fake counts", () => {
  const inventory = buildKnowledgeCenterInventory({});
  assert.equal(inventory.sources.length > 0, true);
  assert.equal(inventory.summary.ready, 0);
  assert.equal(inventory.sources.find((item) => item.id === "woo-commerce")?.count, null);
});

test("counts real existing sources and WhatsApp profiles", () => {
  const inventory = buildKnowledgeCenterInventory({
    instructions: "We sell racks in Lahore.",
    learnedKnowledge: "Delivery takes 2 days.",
    products: [{ name: "Starter" }],
    syncGroups: [{ name: "Media Group", purpose: "media" }, { name: "Welcome", purpose: "sequence" }],
    customers: [{ profile: { whatsappCustomerIntelligence: { businessName: "Customer Shop", category: "Retail", scannedAt: 123 } } }],
    customerIntelligenceEnabled: true,
  });
  assert.equal(inventory.summary.ready >= 2, true);
  assert.equal(inventory.sources.find((item) => item.id === "whatsapp-profiles")?.count, 1);
  assert.equal(inventory.sources.find((item) => item.id === "products-services")?.count, 1);
});

test("redacts sensitive previews and does not mutate input", () => {
  const input = { instructions: "api key = sk-123456789 should not appear", products: [{ name: "Safe Product" }] };
  const before = JSON.stringify(input);
  const inventory = buildKnowledgeCenterInventory(input);
  const preview = inventory.sources.find((item) => item.id === "ai-instructions")?.preview || "";
  assert.equal(preview.includes("sk-123456789"), false);
  assert.equal(JSON.stringify(input), before);
});
