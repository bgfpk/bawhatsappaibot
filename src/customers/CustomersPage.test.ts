import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortCustomers } from "./customer-model.ts";
import {
  getCustomerContactIdentity,
  getDisplayNameFromCustomer,
  getDisplayPhoneFromCustomer,
} from "../utils/contact-identity.ts";
import { buildCustomerDisplayName } from "../services/customer-display-name-service.ts";

const sampleCustomers: any[] = [
  // 1. Customer with real explicit saved name & resolved phone
  {
    $id: "cust_1",
    name: "Usman Tariq",
    phone: "195545134641",
    last_message_at: 1700003000,
    profile: {
      customerName: "Usman Tariq",
      savedName: "Usman Tariq",
      phoneJid: "contact-e4ed32210a80@example.invalid",
      phoneNumber: "195545134641",
      botReplyControl: "active",
      orders: [{ id: "ord_101", total: 4500 }],
    },
  },
  // 2. Customer with pushName fallback & resolved phone
  {
    $id: "cust_2",
    pushName: "Zainab Ali",
    customer_id: "34196580004073@lid",
    last_message_at: 1700002000,
    profile: {
      lidJid: "34196580004073@lid",
      pushName: "Zainab Ali",
      phoneNumber: "127422640056",
      phoneJid: "contact-1c85322e664f@example.invalid",
      botReplyControl: "paused_temp",
      botReplyPausedUntil: 1799999999, // Future timestamp -> temporary pause
    },
  },
  // 3. Customer with unresolved LID (no phone, no saved name, no pushName) -> fallback generic placeholder
  {
    $id: "cust_3",
    customer_id: "88196580004099@lid",
    last_message_at: 1700001000,
    profile: {
      lidJid: "88196580004099@lid",
      botReplyControl: "paused_permanent",
      botReplyPausedPermanent: true,
    },
  },
  // 4. Customer requiring human handling
  {
    $id: "cust_4",
    name: "Bilal Ahmed",
    phone: "151025129010",
    last_message_at: 1700004000,
    profile: {
      customerName: "Bilal Ahmed",
      manualReviewRequired: true,
    },
  },
];

test("Customers E2E 1: Real saved name displayed accurately", () => {
  const name = getDisplayNameFromCustomer(sampleCustomers[0]);
  assert.equal(name, "Usman Tariq");
});

test("Customers E2E 2: WhatsApp pushName fallback displayed when no explicit saved name exists", () => {
  const name = getDisplayNameFromCustomer(sampleCustomers[1]);
  assert.equal(name, "Zainab Ali");
});

test("Customers E2E 3: Generic placeholder used only when neither saved name nor pushName exists", () => {
  const name = buildCustomerDisplayName({
    jid: sampleCustomers[2].jid,
    customer_id: sampleCustomers[2].customer_id,
    profile: sampleCustomers[2].profile,
    fallback: sampleCustomers[2].name,
  });
  assert.equal(name, "Customer ••••4099");
});

test("Customers E2E 4: Resolved phone number displayed formatted (+92)", () => {
  const phone1 = getDisplayPhoneFromCustomer(sampleCustomers[0]);
  assert.equal(phone1, "+92 300 1234567");

  const phone2 = getDisplayPhoneFromCustomer(sampleCustomers[1]);
  assert.equal(phone2, "+92 321 9876543");
});

test("Customers E2E 5: Unresolved LID never displays raw digits as a phone number", () => {
  const identity = getCustomerContactIdentity(sampleCustomers[2]);
  assert.equal(identity.hasRealPhone, false);
  assert.equal(identity.displayPhone, "");
  assert.equal(identity.contactLabel, "Number unavailable");
  assert.notEqual(identity.displayPhone, "11346312729304");
});

test("Customers E2E 6: Filtering by status (ai_paused, human, orders)", () => {
  const paused = filterAndSortCustomers(
    sampleCustomers,
    { searchQuery: "", sourceFilter: "all", statusFilter: "ai_paused" },
    { column: "interacted", direction: "desc" }
  );
  // cust_2 (temp paused) and cust_3 (perm paused)
  assert.equal(paused.length, 2);
  assert.ok(paused.some((c) => c.$id === "cust_2"));
  assert.ok(paused.some((c) => c.$id === "cust_3"));

  const human = filterAndSortCustomers(
    sampleCustomers,
    { searchQuery: "", sourceFilter: "all", statusFilter: "human" },
    { column: "interacted", direction: "desc" }
  );
  assert.equal(human.length, 1);
  assert.equal(human[0].$id, "cust_4");

  const orders = filterAndSortCustomers(
    sampleCustomers,
    { searchQuery: "", sourceFilter: "all", statusFilter: "orders" },
    { column: "interacted", direction: "desc" }
  );
  assert.equal(orders.length, 1);
  assert.equal(orders[0].$id, "cust_1");
});

test("Customers E2E 7: Search by name and phone", () => {
  const byName = filterAndSortCustomers(
    sampleCustomers,
    { searchQuery: "Zainab", sourceFilter: "all", statusFilter: "all" },
    { column: "name", direction: "asc" }
  );
  assert.equal(byName.length, 1);
  assert.equal(byName[0].$id, "cust_2");

  const byPhone = filterAndSortCustomers(
    sampleCustomers,
    { searchQuery: "5557777", sourceFilter: "all", statusFilter: "all" },
    { column: "contact", direction: "asc" }
  );
  assert.equal(byPhone.length, 1);
  assert.equal(byPhone[0].$id, "cust_4");
});

test("Customers E2E 8: Sorting by last active interaction date descending", () => {
  const sorted = filterAndSortCustomers(
    sampleCustomers,
    { searchQuery: "", sourceFilter: "all", statusFilter: "all" },
    { column: "interacted", direction: "desc" }
  );
  assert.equal(sorted[0].$id, "cust_4"); // ts 1700004000
  assert.equal(sorted[1].$id, "cust_1"); // ts 1700003000
  assert.equal(sorted[2].$id, "cust_2"); // ts 1700002000
  assert.equal(sorted[3].$id, "cust_3"); // ts 1700001000
});
