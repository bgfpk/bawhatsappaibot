import test from "node:test";
import assert from "node:assert/strict";

import { BILLING_PLAN_DETAILS } from "./pricing.ts";
import { PLANS } from "../types.ts";

test("backend plan limits mirror public pricing plan details", () => {
  for (const [planId, details] of Object.entries(BILLING_PLAN_DETAILS)) {
    const backendPlan = PLANS[planId];
    assert.ok(backendPlan, `${planId} exists in backend plans`);
    assert.equal(backendPlan.price, details.monthlyPrice);
    assert.equal(backendPlan.included_instances, details.included_instances);
    assert.equal(backendPlan.max_instances, details.max_instances);
    assert.equal(backendPlan.included_products, details.included_products);
    assert.equal(backendPlan.max_products, details.max_products);
    assert.equal(backendPlan.customers, details.customers);
    assert.equal(backendPlan.orders_per_month, details.ordersPerMonth);
    assert.equal(backendPlan.media_templates, details.mediaTemplates);
    assert.equal(backendPlan.media_groups, details.mediaGroups);
    assert.equal(backendPlan.sequence_groups, details.sequenceGroups);
  }
});
