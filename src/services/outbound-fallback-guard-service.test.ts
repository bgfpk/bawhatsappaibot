import test from "node:test";
import assert from "node:assert/strict";

import {
  containsBannedGenericFallback,
  replaceBannedGenericFallback,
} from "./outbound-fallback-guard-service.ts";

test("generic main detail fallback phrase is banned", () => {
  assert.equal(containsBannedGenericFallback("Ji, main aap ko sahi guide karna chahta hun. Aap main detail ek dafa bata dein."), true);
});

test("banned fallback is removed instead of replaced with customer copy", () => {
  const next = replaceBannedGenericFallback(
    "I want to guide you correctly. Please share the main detail once.",
    "english",
    "delivery charges?"
  );
  assert.equal(next, "");
});

test("new product order delivery generic fallback phrase is banned", () => {
  assert.equal(
    containsBannedGenericFallback("Aap product, order, ya delivery ki specific detail send kar dein, main check kar deta hoon."),
    true,
  );
});
