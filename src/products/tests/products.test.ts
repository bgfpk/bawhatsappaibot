import test from "node:test";
import assert from "node:assert/strict";
import { filterProducts, normalizeProductRecord, mergeProductEdits } from "../product-model";

test("normalizeProductRecord: parses product record correctly", () => {
  const item = normalizeProductRecord({
    $id: "prod_101",
    name: "Leather Jacket",
    price: 4500,
    type: "physical",
  });

  assert.equal(item.id, "prod_101");
  assert.equal(item.name, "Leather Jacket");
  assert.equal(item.base_price, 4500);
  assert.equal(item.type, "physical");
});

test("filterProducts: filters by search query and type", () => {
  const list = [
    normalizeProductRecord({ $id: "p1", name: "Leather Jacket", type: "physical" }),
    normalizeProductRecord({ $id: "p2", name: "Website Audit", type: "digital" }),
  ];

  const searched = filterProducts(list, "audit", "all");
  assert.equal(searched.length, 1);
  assert.equal(searched[0].name, "Website Audit");

  const physical = filterProducts(list, "", "physical");
  assert.equal(physical.length, 1);
  assert.equal(physical[0].name, "Leather Jacket");
});

test("mergeProductEdits: end-to-end preservation of all 12 raw fields when editing description only", () => {
  const originalRaw = {
    $id: "prod_deep_99",
    name: "Custom Jacket",
    sku: "JKT-001",
    type: "physical",
    base_price: 120,
    cost_price: 60,
    stock: 45,
    weight: 1.2,
    description: "Old description",
    imageUrl: "https://example.com/jacket.jpg",
    variations: [
      { sku: "JKT-001-L", price: 120, stock: 20 },
      { sku: "JKT-001-XL", price: 130, stock: 25 },
    ],
    isAvailable: true,
    integrationMetadata: { source: "woocommerce", externalId: 9942 },
    customExtraField: "unmodified_value",
  };

  const edited = mergeProductEdits(originalRaw, { description: "Updated premium description" });

  assert.equal(edited.description, "Updated premium description");
  assert.equal(edited.name, "Custom Jacket");
  assert.equal(edited.sku, "JKT-001");
  assert.equal(edited.type, "physical");
  assert.equal(edited.base_price, 120);
  assert.equal(edited.cost_price, 60);
  assert.equal(edited.stock, 45);
  assert.equal(edited.weight, 1.2);
  assert.equal(edited.imageUrl, "https://example.com/jacket.jpg");
  assert.deepEqual(edited.variations, [
    { sku: "JKT-001-L", price: 120, stock: 20 },
    { sku: "JKT-001-XL", price: 130, stock: 25 },
  ]);
  assert.equal(edited.isAvailable, true);
  assert.deepEqual(edited.integrationMetadata, { source: "woocommerce", externalId: 9942 });
  assert.equal(edited.customExtraField, "unmodified_value");
});
