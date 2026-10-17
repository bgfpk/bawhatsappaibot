import test from "node:test";
import assert from "node:assert/strict";

import { checkOrderStock } from "./inventory-service.ts";

test("ambiguous variation does not become out-of-stock evidence", () => {
  const result = checkOrderStock([
    {
      id: "p1",
      name: "Bike Cover",
      stock: 2,
      variations: [
        { name: "Color", options: [{ name: "Black", stock: 2 }, { name: "Blue", stock: 1 }] },
      ],
    },
  ], {
    productName: "Bike Cover",
    variation: "premium",
    quantity: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.ambiguous, true);
});

test("clear unavailable option remains stock failure", () => {
  const result = checkOrderStock([
    {
      id: "p1",
      name: "Bike Cover",
      stock: 2,
      variations: [
        { name: "Color", options: [{ name: "Black", stock: 0 }, { name: "Blue", stock: 1 }] },
      ],
    },
  ], {
    productName: "Bike Cover",
    variation: "Black",
    quantity: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.ambiguous, undefined);
  assert.equal(result.optionName, "Black");
});
