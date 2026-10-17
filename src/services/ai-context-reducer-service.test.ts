import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNormalizedSummaryProfileFacts,
  compactBusinessInstructions,
  compactSummary,
  reduceRecentMessages,
  selectRelevantLearnedNotes,
  selectRelevantProducts,
} from "./ai-context-reducer-service.ts";

test("recent chat context is capped while preserving the latest customer message", () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "model" : "user",
    text: `message ${index}`,
  }));
  const reduced = reduceRecentMessages(messages, 8);
  assert.equal(reduced.length, 8);
  assert.equal(reduced.at(-1)?.text, "message 11");
});

test("summary and business instructions are compacted and deduped", () => {
  const repeated = ["Rule one", "Rule one", "Rule two"].join("\n");
  assert.equal(compactBusinessInstructions(repeated, 100), "Rule one Rule two");
  assert.equal(compactSummary(repeated, 100), "Rule one Rule two");
});

test("product and learned-note reducers return only top relevant rows", () => {
  const products = [
    { name: "Red shoes", description: "running sneakers" },
    { name: "Blue bag", description: "travel luggage" },
    { name: "Green shirt", description: "cotton" },
  ];
  const selected = selectRelevantProducts("Do you have running shoes?", products, 2);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].name, "Red shoes");

  const notes = [
    "Offer shoe size guidance before checkout.",
    "Mention luggage warranty for travel bags.",
    "Keep replies concise.",
  ].join("\n");
  const relevantNotes = selectRelevantLearnedNotes("shoe sizes", notes, 1);
  assert.match(relevantNotes, /shoe size/i);
});

test("summary profile facts avoid full raw profile JSON while preserving critical fields", () => {
  const facts = buildNormalizedSummaryProfileFacts({
    profile: { customerName: "Sara", customerPhone: "92300", hugeRawBlob: "x".repeat(5000) },
    latestOrder: { productName: "Starter Pack", deliveryAddress: "Block A", missingFields: ["City"] },
  });
  assert.equal(facts.name, "Sara");
  assert.equal(facts.phone, "92300");
  assert.equal(facts.latestLeadOrOrder.productOrService, "Starter Pack");
  assert.deepEqual(facts.missingFields, ["City"]);
  assert.equal((facts as any).hugeRawBlob, undefined);
});
