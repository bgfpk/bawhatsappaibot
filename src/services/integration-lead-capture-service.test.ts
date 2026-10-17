import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIntegrationIdempotencyKey,
  buildIntegrationLeadId,
  captureIntegrationLead,
  normalizeWebsiteLeadPayload,
  normalizeWooCommerceCustomerPayload,
  normalizeWooCommerceOrderPayload,
  validateNormalizedIntegrationLead,
} from "./integration-lead-capture-service.ts";

test("normalizeWebsiteLeadPayload maps website fields into CRM lead shape", () => {
  const lead = normalizeWebsiteLeadPayload({
    name: "Ali Khan",
    phone: "0300-1234567",
    email: "contact-15bf9c64249b@example.invalid",
    message: "Need pricing",
    pageUrl: "https://example.com/pricing",
    externalId: "site-1",
  });

  assert.equal(lead.source, "website_api");
  assert.equal(lead.phone, "195545134641");
  assert.equal(lead.email, "contact-9d86ec2b59bb@example.invalid");
  assert.equal(lead.notes, "Need pricing");
  assert.equal(lead.idempotencyKey, "website_api:lead.created:site-1");
});

test("normalizeWooCommerceCustomerPayload maps customer data", () => {
  const lead = normalizeWooCommerceCustomerPayload({
    id: 55,
    billing: { first_name: "Sara", last_name: "Ali", phone: "+92 311 2223334", email: "contact-259b65833bba@example.invalid", city: "Lahore" },
  });

  assert.equal(lead.source, "woocommerce");
  assert.equal(lead.eventType, "customer.created");
  assert.equal(lead.name, "Sara Ali");
  assert.equal(lead.phone, "179837474409");
  assert.equal(lead.city, "Lahore");
});

test("normalizeWooCommerceOrderPayload maps order data without deep order sync", () => {
  const lead = normalizeWooCommerceOrderPayload({
    id: 1001,
    status: "processing",
    total: "149.99",
    billing: { first_name: "Hamza", last_name: "Khan", phone: "15811061380", email: "contact-9ea16643c7ed@example.invalid" },
    line_items: [{ name: "Starter Pack", quantity: 2 }],
  });

  assert.equal(lead.source, "woocommerce");
  assert.equal(lead.eventType, "order.created");
  assert.equal(lead.externalId, "1001");
  assert.equal(lead.productInterest, "Starter Pack");
  assert.equal(lead.quantity, "2");
  assert.match(lead.notes, /WooCommerce order 1001/);
});

test("validateNormalizedIntegrationLead requires contact or external id", () => {
  const lead = normalizeWebsiteLeadPayload({ message: "Only a message" });
  assert.throws(() => validateNormalizedIntegrationLead({ ...lead, idempotencyKey: "", externalId: "", phone: "", email: "" }), /requires at least/);
});

test("buildIntegrationLeadId is stable", () => {
  const lead = normalizeWebsiteLeadPayload({ externalId: "abc", source: "website" });
  assert.equal(buildIntegrationLeadId("acct_1", lead), buildIntegrationLeadId("acct_1", lead));
});

test("captureIntegrationLead skips duplicate idempotency without upserting", async () => {
  let upserted = false;
  const result = await captureIntegrationLead("acct_1", { externalId: "site-1", name: "Ali" }, {
    findEventByIdempotencyKey: async () => ({ id: "evt_1", leadId: "lead_1" } as any),
    upsertLead: async () => {
      upserted = true;
      return {} as any;
    },
    recordEvent: async (_accountId: string, event: any) => event,
  });

  assert.equal(result.duplicate, true);
  assert.equal(upserted, false);
  assert.equal(result.event.status, "duplicate");
});

test("captureIntegrationLead upserts and records success for new lead", async () => {
  const events: any[] = [];
  const result = await captureIntegrationLead("acct_1", { externalId: "site-2", phone: "15811061380", name: "Ali" }, {
    findEventByIdempotencyKey: async () => null,
    upsertLead: async (_accountId: string, lead: any) => ({ id: lead.id, source: lead.source } as any),
    recordEvent: async (_accountId: string, event: any) => {
      events.push(event);
      return event;
    },
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.lead.source, "website_api");
  assert.equal(events[0].status, "success");
});

test("buildIntegrationIdempotencyKey uses fallback hash for contact retries", () => {
  const key = buildIntegrationIdempotencyKey({ source: "website_api", eventType: "lead.created", phone: "92300", email: "contact-08168cd80dfd@example.invalid" });
  assert.match(key, /^website_api:lead\.created:/);
});
