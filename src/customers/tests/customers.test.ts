import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortCustomers } from "../customer-model";

test("filterAndSortCustomers: filters by search query and status correctly", () => {
  const list = [
    { $id: "c1", name: "Ayesha Malik", phone: "14515224130", profile: { aiPaused: false } },
    { $id: "c2", name: "Tariq Ali", phone: "13204737033", profile: { aiPaused: true } },
    { $id: "c3", name: "Zainab Bibi", phone: "12342421423", profile: { manualReviewRequired: true } },
  ];

  const searched = filterAndSortCustomers(
    list,
    { searchQuery: "ayesha", sourceFilter: "all", statusFilter: "all" },
    { column: "name", direction: "asc" },
  );
  assert.equal(searched.length, 1);
  assert.equal(searched[0].name, "Ayesha Malik");

  const paused = filterAndSortCustomers(
    list,
    { searchQuery: "", sourceFilter: "all", statusFilter: "ai_paused" },
    { column: "name", direction: "asc" },
  );
  assert.equal(paused.length, 1);
  assert.equal(paused[0].name, "Tariq Ali");
});
