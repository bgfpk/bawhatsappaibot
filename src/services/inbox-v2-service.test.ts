import assert from "node:assert/strict";
import test from "node:test";
import { buildInboxV2Rows, filterInboxV2Rows, paginateInboxV2Rows } from "./inbox-v2-service";

const nowMs = new Date("2026-06-24T10:00:00Z").getTime();

test("builds rows from customers", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", name: "Ali", phone: "105192612072" }], nowMs });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerId, "phone:923001112223");
  assert.equal(rows[0].displayName, "Ali");
});

test("redacts OTP/login code in preview", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072", profile: { lastMessage: "Your OTP is: 252039", lastMessageAt: nowMs } }], nowMs });
  assert.equal(rows[0].latestContextPreview, "Your OTP is: [redacted code]");
  assert.equal(rows[0].redactionApplied, true);
});

test("preserves formatted phone and email identity", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072", email: "contact-6a6c26195c36@example.invalid", profile: { lastMessage: "hello" } }], nowMs });
  assert.equal(rows[0].phone, "+92 300 1112223");
  assert.equal(rows[0].rawPhoneDigits, "105192612072");
  assert.equal(rows[0].email, "contact-6a6c26195c36@example.invalid");
});

test("does not display random customer ids as phone", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", customer_id: "1545254013" }], nowMs });
  assert.equal(rows[0].phone, "");
  assert.equal(rows[0].contactLabel, "Unknown alias");
});

test("does not display random LID digits as phone", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", customer_id: "8418320478394@lid", phone: "+1463605508514", profile: { lidJid: "8418320478394@lid" } }], nowMs });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phone, "");
  assert.equal(rows[0].contactLabel, "Alias contact");
});

test("groups linked aliases into one visible inbox row", () => {
  const rows = buildInboxV2Rows({ customers: [
    { id: "real", name: "Ahad Firdosi", customer_id: "contact-d3b9636f8b0e@example.invalid", profile: { customerJid: "contact-d3b9636f8b0e@example.invalid", lastMessage: "Need details", lastMessageAt: nowMs - 1000 } },
    { id: "alias", name: "AF", customer_id: "alias123@lid", profile: { lidJid: "alias123@lid", phoneJid: "contact-d3b9636f8b0e@example.invalid", linkedJids: ["alias123@lid", "contact-d3b9636f8b0e@example.invalid"], lastMessage: "Waiting your reply", lastMessageAt: nowMs } },
  ], nowMs });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayName, "Ahad Firdosi");
  assert.equal(rows[0].phone, "+92 306 6935544");
  assert.equal(rows[0].linkedAliasCount && rows[0].linkedAliasCount >= 2, true);
  assert.equal(rows[0].latestContextPreview, "Waiting your reply");
});

test("flags needs_human", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", profile: { manualReviewRequired: true } }], nowMs });
  assert.ok(rows[0].queueFlags.includes("needs_human"));
});

test("flags unassigned CRM linked customers", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072" }], crmOverview: { leads: [{ id: "l1", phone: "105192612072", status: "open" }] }, nowMs });
  assert.ok(rows[0].queueFlags.includes("crm_linked"));
  assert.ok(rows[0].queueFlags.includes("unassigned"));
});

test("flags overdue follow-up", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072" }], crmOverview: { followUps: [{ id: "f1", phone: "105192612072", dueAt: nowMs - 1000, status: "pending" }] }, nowMs });
  assert.ok(rows[0].queueFlags.includes("overdue_followup"));
  assert.equal(rows[0].overdueFollowUpCount, 1);
});

test("flags due today", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072" }], crmOverview: { followUps: [{ id: "f1", phone: "105192612072", dueAt: nowMs + 60_000, status: "pending" }] }, nowMs });
  assert.ok(rows[0].queueFlags.includes("due_today"));
});

test("sorts priority correctly", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "normal", name: "Normal", profile: { lastMessageAt: nowMs + 1000, lastMessage: "newer" } }, { id: "human", name: "Human", profile: { manualReviewRequired: true, lastMessageAt: nowMs - 1000, lastMessage: "older" } }], nowMs });
  assert.equal(rows[0].customerId, "human");
});

test("handles missing customer profile safely", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1" }], nowMs });
  assert.equal(rows[0].displayName, "WhatsApp contact");
  assert.ok(rows[0].queueFlags.includes("no_summary"));
});

test("searches by assigned owner", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072" }], crmOverview: { leads: [{ id: "l1", phone: "105192612072", assignedTo: "Sara Sales" }] }, nowMs });
  assert.equal(filterInboxV2Rows(rows, { query: "sara" }).length, 1);
});

test("searches by phone with punctuation ignored", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "+92 300-111-2223" }], nowMs });
  assert.equal(filterInboxV2Rows(rows, { query: "+92 300 111 2223" }).length, 1);
  assert.equal(filterInboxV2Rows(rows, { query: "300-111-2223" }).length, 1);
});

test("searches by lead status and queue flag label", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", phone: "105192612072" }], crmOverview: { leads: [{ id: "l1", phone: "105192612072", status: "qualified", dealStage: "proposal" }] }, nowMs });
  assert.equal(filterInboxV2Rows(rows, { query: "qualified" }).length, 1);
  assert.equal(filterInboxV2Rows(rows, { query: "crm linked" }).length, 1);
});

test("filter applies before pagination", () => {
  const rows = buildInboxV2Rows({ customers: Array.from({ length: 40 }, (_, index) => ({ id: `c${index}`, name: index === 39 ? "Needle Customer" : `Customer ${index}` })), nowMs });
  const filtered = filterInboxV2Rows(rows, { query: "Needle" });
  const page = paginateInboxV2Rows(filtered, { page: 1, pageSize: 25 });
  assert.equal(filtered.length, 1);
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].displayName, "Needle Customer");
});

test("paginates and clamps page state", () => {
  const rows = buildInboxV2Rows({ customers: Array.from({ length: 52 }, (_, index) => ({ id: `c${index}`, name: `Customer ${index}` })), nowMs });
  const page = paginateInboxV2Rows(rows, { page: 3, pageSize: 25 });
  assert.equal(page.start, 51);
  assert.equal(page.end, 52);
  assert.equal(page.hasNext, false);
  assert.equal(page.hasPrevious, true);
  assert.equal(paginateInboxV2Rows(rows, { page: 99, pageSize: 25 }).page, 3);
});

test("does not expose raw sensitive preview through search results", () => {
  const rows = buildInboxV2Rows({ customers: [{ id: "c1", profile: { lastMessage: "api key: secret_123456" } }], nowMs });
  assert.equal(rows[0].latestContextPreview.includes("secret_123456"), false);
  assert.equal(filterInboxV2Rows(rows, { query: "secret_123456" }).length, 0);
});

test("does not mutate inputs", () => {
  const input = { customers: [{ id: "c1", profile: { lastMessage: "api key: secret_123456" } }], crmOverview: { leads: [{ id: "l1", customerId: "c1" }] }, orders: [{ id: "o1", customerId: "c1", order_data: { totalPrice: "100" } }], nowMs };
  const before = JSON.stringify(input);
  buildInboxV2Rows(input);
  assert.equal(JSON.stringify(input), before);
});
