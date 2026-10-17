import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomer360Profile, normalizeCustomer360Email, normalizeCustomer360Phone } from "./customer-360-service";

const at = "@";

test("normalizes phone and email identifiers", () => {
  assert.equal(normalizeCustomer360Phone("+92 313-692-3129"), "1175303345");
  assert.equal(normalizeCustomer360Email("  contact-7a836a7c0967@example.invalid "), "contact-b4c9a289323b@example.invalid");
});

test("matches orders and CRM leads by normalized phone", () => {
  const customer = { id: "c1", name: "Ahad", phone: "+92 300 1112223" };
  const orders = [{ id: "o1", order_data: { customerPhone: "105192612072", totalPrice: "2500", productName: "Starter" }, created_at: 1000 }];
  const leads = [{ id: "l1", phone: "14450520011", status: "open", dealStage: "qualified", assignedTo: "Sales" }];
  const profile = buildCustomer360Profile({ customer, orders, leads, nowMs: 2000000 });
  assert.equal(profile.orderCount, 1);
  assert.equal(profile.activeLead?.id, "l1");
  assert.equal(profile.dealStage, "qualified");
});

test("Customer 360 opened from LID alias shows trusted phone and aggregates alias records", () => {
  const customers = [
    { id: "real", name: "Ahad Firdosi", customer_id: "contact-d3b9636f8b0e@example.invalid", profile: { customerJid: "contact-d3b9636f8b0e@example.invalid", customerSummary: "Real phone summary" } },
    { id: "alias", name: "AF", customer_id: "alias123@lid", profile: { lidJid: "alias123@lid", phoneJid: "contact-d3b9636f8b0e@example.invalid", linkedJids: ["alias123@lid", "contact-d3b9636f8b0e@example.invalid"], lastMessage: "Waiting your reply", lastMessageAt: 4000 } },
  ];
  const profile = buildCustomer360Profile({
    customer: customers[1],
    customers,
    leads: [{ id: "lead1", phone: "+92 306 6935544", status: "open" }],
    orders: [{ id: "order1", phone: "153238380473", order_data: { totalPrice: "1200" } }],
  });

  assert.equal(profile.phone, "+92 306 6935544");
  assert.equal(profile.activeLead?.id, "lead1");
  assert.equal(profile.orderCount, 1);
  assert.equal(profile.linkedAliasCount && profile.linkedAliasCount >= 2, true);
  assert.equal(profile.timelineItems.some((item) => item.description === "Waiting your reply"), true);
});

test("saved customer name wins over profile business name", () => {
  const profile = buildCustomer360Profile({ customer: { id: "c1", name: "Saved Buyer", profile: { whatsappCustomerIntelligence: { businessName: "Business Name" } } } });
  assert.equal(profile.name, "Saved Buyer");
  assert.equal(profile.whatsappProfile?.businessName, "Business Name");
});

test("uses verified/business name when saved name is missing", () => {
  const verified = buildCustomer360Profile({ customer: { id: "c1", profile: { whatsappProfile: { verifiedName: "Verified Customer" } } } });
  assert.equal(verified.name, "Verified Customer");
  const business = buildCustomer360Profile({ customer: { id: "c1", profile: { whatsappCustomerIntelligence: { businessName: "Customer Shop", category: "Retail", scannedAt: 123 } } } });
  assert.equal(business.name, "Customer Shop");
  assert.equal(business.whatsappProfile?.businessCategory, "Retail");
  assert.equal(business.whatsappProfile?.syncedAt, 123);
});

test("uses pushName when verified/business name is missing", () => {
  const profile = buildCustomer360Profile({ customer: { id: "c1", profile: { name: "+164143750543", pushName: "Push Name Buyer" } } });
  assert.equal(profile.name, "Push Name Buyer");
});

test("does not show phone-like name as Customer 360 name", () => {
  const profile = buildCustomer360Profile({ customer: { id: "c1", name: "+17803421345189", phone: "+17803421345189" } });
  assert.equal(profile.name.endsWith("contact"), true);
  assert.equal(profile.phone, "+17803421345189");
});

test("does not show random customer id as name or phone", () => {
  const profile = buildCustomer360Profile({ customer: { id: "c1", name: "1545254013", customer_id: "1545254013" } });
  assert.equal(profile.name.endsWith("contact"), true);
  assert.equal(profile.phone, "");
  assert.equal(profile.contactLabel, "Unknown alias");
});

test("blocks internal contact identifiers as names and phones", () => {
  const values = [`123456789${at}lid`, `abcdef${at}hosted.lid`, `120363000000${at}g.us`, `status${at}broadcast`];
  values.forEach((jid) => {
    const profile = buildCustomer360Profile({ customer: { id: "c1", name: jid, jid } });
    assert.equal(profile.name.endsWith("contact"), true);
    assert.equal(profile.phone, "");
  });
});

test("uses linked lead or order real names when customer and profile names are not usable", () => {
  const leadProfile = buildCustomer360Profile({ customer: { id: "c1", phone: "105192612072", name: "+164143750543" }, leads: [{ id: "l1", phone: "105192612072", name: "Lead Buyer" }] });
  assert.equal(leadProfile.name, "Lead Buyer");
  const orderProfile = buildCustomer360Profile({ customer: { id: "c1", phone: "105192612072", name: "105192612072" }, orders: [{ id: "o1", phone: "105192612072", order_data: { customerName: "Order Buyer" } }] });
  assert.equal(orderProfile.name, "Order Buyer");
});

test("matches records by normalized email when phone is missing", () => {
  const customer = { id: "c1", email: "contact-0fb341e15311@example.invalid" };
  const orders = [{ id: "o1", order_data: { customerEmail: "contact-e7dae240a9b4@example.invalid", codAmount: "1200" } }];
  const leads = [{ id: "l1", email: "contact-de36dbd0690f@example.invalid", status: "new" }];
  const profile = buildCustomer360Profile({ customer, orders, leads });
  assert.equal(profile.orderCount, 1);
  assert.equal(profile.activeLead?.id, "l1");
});

test("aggregates order value and selects latest order", () => {
  const customer = { id: "c1", phone: "105192612072" };
  const orders = [{ id: "old", phone: "105192612072", order_data: { totalPrice: "1000" }, created_at: 1000 }, { id: "new", phone: "105192612072", order_data: { codAmount: "1500" }, created_at: 3000 }];
  const profile = buildCustomer360Profile({ customer, orders });
  assert.equal(profile.lifetimeValue, 2500);
  assert.equal(profile.latestOrder?.id, "new");
});

test("sorts follow-ups and timeline newest first", () => {
  const nowMs = 10_000;
  const customer = { id: "c1", phone: "105192612072", profile: { lastMessage: "Need price", lastMessageAt: 1 } };
  const followUps = [{ id: "f1", phone: "105192612072", dueAt: 9, status: "pending", note: "Old follow-up" }, { id: "f2", phone: "105192612072", dueAt: 12, status: "pending", note: "Next follow-up" }];
  const profile = buildCustomer360Profile({ customer, followUps, nowMs });
  assert.equal(profile.overdueFollowUps.length, 1);
  assert.equal(profile.nextFollowUpAt, 12_000);
  assert.ok(profile.timelineItems[0].timestamp >= profile.timelineItems[profile.timelineItems.length - 1].timestamp);
});

test("handles missing data with deterministic defaults", () => {
  const profile = buildCustomer360Profile({ customer: { id: "c1" }, orders: [], leads: [], followUps: [] });
  assert.equal(profile.id, "c1");
  assert.equal(profile.name.endsWith("contact"), true);
  assert.equal(profile.orderCount, 0);
  assert.equal(profile.lifetimeValue, 0);
  assert.equal(profile.conversationAvailable, false);
});

test("dedupes linked records and does not mutate inputs", () => {
  const customer = { id: "c1", phone: "105192612072", name: "+164143750543", profile: { whatsappCustomerIntelligence: { businessName: "Customer Shop" } } };
  const orders = [{ id: "o1", phone: "105192612072", order_data: { totalPrice: "500" } }, { id: "o1", phone: "105192612072", order_data: { totalPrice: "500" } }];
  const before = JSON.stringify({ customer, orders });
  const profile = buildCustomer360Profile({ customer, orders });
  assert.equal(profile.orderCount, 1);
  assert.equal(JSON.stringify({ customer, orders }), before);
});
