import test from "node:test";
import assert from "node:assert/strict";

import { buildProductFirstReply, findStrongMediaTemplate, rankProductsForRouter } from "./product-first-router-service.ts";

const products = [
  { name: "Warehouse Rack", sku: "WR-1", description: "Heavy duty storage rack", base_price: 12000, stock: 4 },
  { name: "Office Chair", sku: "OC-1", description: "Mesh chair", base_price: 9000, stock: 2 },
  { name: "Cafe Table", sku: "CT-1", description: "Round table", base_price: 7000, stock: 0 },
  { name: "Retail Shelf", sku: "RS-1", description: "Display shelf", base_price: 8000, stock: 5 },
  { name: "Storage Box", sku: "SB-1", description: "Plastic box", base_price: 1200, stock: 10 },
  { name: "Delivery Trolley", sku: "DT-1", description: "Warehouse trolley", base_price: 15000, stock: 1 },
];

test("product-first reply uses top relevant products only", () => {
  const ranked = rankProductsForRouter("price for warehouse rack", products, 3);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].product.name, "Warehouse Rack");
});

test("strong product match builds deterministic reply", () => {
  const result = buildProductFirstReply({ text: "warehouse rack price", products });
  assert.equal(result.matched, true);
  assert.match(result.text, /Warehouse Rack/);
  assert.match(result.text, /12000/);
});

test("weak product match falls back to Gemini", () => {
  const result = buildProductFirstReply({ text: "what do you recommend", products });
  assert.equal(result.matched, false);
  assert.equal(result.reason, "weak_product_match");
});

test("media template requires strong keyword overlap", () => {
  const weak = findStrongMediaTemplate({ text: "send photo", templates: [{ caption: "warehouse rack photos" }] });
  const strong = findStrongMediaTemplate({ text: "send warehouse rack photo", templates: [{ caption: "warehouse rack photos" }] });
  assert.equal(weak, null);
  assert.equal(strong?.caption, "warehouse rack photos");
});
