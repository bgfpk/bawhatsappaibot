import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeCommandCenter } from "./home-command-center-service";

const nowMs = new Date("2026-06-24T10:00:00Z").getTime();

test("builds summary counts from existing data", () => {
  const home = buildHomeCommandCenter({
    customers: [{ id: "c1", profile: { manualReviewRequired: true } }, { id: "c2" }],
    orders: [{ id: "o1", order_data: { totalPrice: "2500" } }],
    crmOverview: { leads: [{ id: "l1", status: "open" }], followUps: [] },
    nowMs,
  });
  assert.equal(home.snapshot.totalCustomers, 2);
  assert.equal(home.snapshot.needsHuman, 1);
  assert.equal(home.snapshot.orderCount, 1);
  assert.equal(home.snapshot.availableRevenue, 2500);
  assert.equal(home.snapshot.openCrmLeads, 1);
});

test("sorts needs attention from inbox priority", () => {
  const home = buildHomeCommandCenter({
    customers: [
      { id: "normal", name: "Normal" },
      { id: "human", name: "Human", profile: { manualReviewRequired: true } },
    ],
    nowMs,
  });
  assert.equal(home.needsAttention[0].customerId, "human");
});

test("handles empty data without fake metrics", () => {
  const home = buildHomeCommandCenter({ nowMs });
  assert.equal(home.snapshot.totalCustomers, 0);
  assert.equal(home.snapshot.availableRevenue, 0);
  assert.equal(home.snapshot.openCrmLeads, 0);
  assert.equal(home.needsAttention.length, 0);
});

test("does not mutate inputs", () => {
  const input = {
    customers: [{ id: "c1", profile: { lastMessage: "Your OTP is: 252039" } }],
    orders: [{ id: "o1", order_data: { totalPrice: "100" } }],
    crmOverview: { leads: [{ id: "l1", customerId: "c1" }] },
    nowMs,
  };
  const before = JSON.stringify(input);
  buildHomeCommandCenter(input);
  assert.equal(JSON.stringify(input), before);
});

test("does not leak sensitive preview text", () => {
  const home = buildHomeCommandCenter({
    customers: [{ id: "c1", profile: { lastMessage: "api key: secret_123456" } }],
    nowMs,
  });
  assert.equal(home.inboxRows[0].latestContextPreview.includes("secret_123456"), false);
});
