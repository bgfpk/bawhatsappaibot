import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFollowupCampaign,
  filterFollowupLogs,
  type FollowupActivityLog,
} from "../followups/followup-model.ts";
import {
  deduplicateRecipients,
  calculateEstimatedCost,
  type BroadcastRecipient,
} from "../broadcasts/broadcast-model.ts";
import {
  normalizeCustomerUpdate,
  filterCustomerUpdates,
} from "../customer-updates/customer-update-model.ts";

test("Followup Model: normalizeFollowupCampaign parses properties safely", () => {
  const campaign = normalizeFollowupCampaign({
    id: "fup_101",
    name: "Cart Abandonment",
    type: "ai_smart_followup",
    hours: 12,
    prompt: "Offer free shipping",
  });

  assert.equal(campaign.id, "fup_101");
  assert.equal(campaign.name, "Cart Abandonment");
  assert.equal(campaign.campaign_type, "ai_smart_followup");
  assert.equal(campaign.hours, 12);
  assert.equal(campaign.offer_context, "Offer free shipping");
});

test("Followup Filter: filters activity logs by status and query", () => {
  const logs: FollowupActivityLog[] = [
    { id: "1", customerName: "Alice", timestamp: 100, status: "sent" },
    { id: "2", customerName: "Bob", timestamp: 200, status: "failed", reason: "Rate limit" },
    { id: "3", customerName: "Charlie", timestamp: 300, status: "skipped" },
  ];

  const sent = filterFollowupLogs(logs, "", "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].customerName, "Alice");

  const searched = filterFollowupLogs(logs, "Bob", "all");
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, "2");
});

test("Broadcast Model: deduplicateRecipients flags duplicate phone numbers", () => {
  const recipients: BroadcastRecipient[] = [
    { id: "r1", name: "Alice", phone: "+144225232320", isValid: true },
    { id: "r2", name: "Alice Duplicate", phone: "195545134641", isValid: true },
    { id: "r3", name: "Bob", phone: "+108540457300", isValid: true },
  ];

  const clean = deduplicateRecipients(recipients);
  assert.equal(clean.length, 3);
  assert.equal(clean[0].isDuplicate, false);
  assert.equal(clean[1].isDuplicate, true);
  assert.equal(clean[2].isDuplicate, false);

  const validOnly = clean.filter((r) => !r.isDuplicate);
  assert.equal(validOnly.length, 2);
});

test("Broadcast Cost Calculation: computes estimated cost correctly", () => {
  const cost = calculateEstimatedCost(100);
  assert.equal(cost, 0.1);
});

test("Customer Update Model: normalizeCustomerUpdate parses updates", () => {
  const update = normalizeCustomerUpdate({
    id: "upd_55",
    type: "stock",
    status: "pending",
    message: "Leather Jacket is back in stock!",
  });

  assert.equal(update.id, "upd_55");
  assert.equal(update.type, "stock");
  assert.equal(update.status, "pending");
  assert.equal(update.message, "Leather Jacket is back in stock!");
});

test("Customer Update Filter: filters by category and search term", () => {
  const updates = [
    normalizeCustomerUpdate({ id: "u1", type: "stock", message: "iPhone 15 restock" }),
    normalizeCustomerUpdate({ id: "u2", type: "planned", message: "Store holiday announcement" }),
  ];

  const stock = filterCustomerUpdates(updates, "", "stock");
  assert.equal(stock.length, 1);
  assert.equal(stock[0].id, "u1");

  const holiday = filterCustomerUpdates(updates, "holiday", "all");
  assert.equal(holiday.length, 1);
  assert.equal(holiday[0].id, "u2");
});
