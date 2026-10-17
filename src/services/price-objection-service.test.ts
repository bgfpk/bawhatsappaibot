import test from "node:test";
import assert from "node:assert/strict";

import { buildPriceObjectionReply } from "./price-objection-service.ts";

test("price objection helper does not generate deterministic customer copy", () => {
  const reply = buildPriceObjectionReply({
    history: [
      { role: "model", text: "Product: Premium Headphones" },
      { role: "user", text: "That price is too high. Another seller is cheaper." },
    ],
    products: [
      { name: "Premium Headphones", base_price: 120, description: "wireless audio with noise cancelling" },
      { name: "Lite Headphones", base_price: 80, description: "wireless audio" },
    ],
    language: "english",
  });

  assert.equal(reply, "");
});
