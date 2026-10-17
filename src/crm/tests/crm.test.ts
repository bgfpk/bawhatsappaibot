import test from "node:test";
import assert from "node:assert/strict";
import { groupCustomersByStage, DEFAULT_CRM_STAGES } from "../crm-model";

test("groupCustomersByStage: groups customer records into pipeline stages", () => {
  const customers = [
    { $id: "c1", name: "Alpha Lead", crm_stage: "new_lead" },
    { $id: "c2", name: "Beta Lead", crm_stage: "order_placed" },
    { $id: "c3", name: "Gamma Lead", crm_stage: "delivered" },
  ];

  const grouped = groupCustomersByStage(customers);
  assert.equal(grouped["new_lead"].length, 1);
  assert.equal(grouped["order_placed"].length, 1);
  assert.equal(grouped["delivered"].length, 1);
  assert.equal(grouped["contacted"].length, 0);
});
