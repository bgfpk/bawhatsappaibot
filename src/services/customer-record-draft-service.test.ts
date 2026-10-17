import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftProfilePatch,
  buildIncompleteDraftRecord,
  shouldCreateOrUpdateDraftRecord,
} from "./customer-record-draft-service.ts";

test("product business inquiry creates incomplete order draft", () => {
  const record = buildIncompleteDraftRecord({
    businessFlow: "product",
    latestText: "Price for standard bike cover in black?",
    structuredState: {
      product: "Standard Bike Cover",
      variant: "Black",
      customerPhone: "15811061380",
      customFields: {},
    },
    configuredFields: [],
    customerJid: "contact-e4ed32210a80@example.invalid",
  });

  assert.equal(record?.recordType, "order");
  assert.equal(record?.recordStatus, "incomplete");
  assert.match(String(record?.transactionStatus || ""), /order incomplete/i);
});

test("service business inquiry creates incomplete lead draft", () => {
  const record = buildIncompleteDraftRecord({
    businessFlow: "service",
    latestText: "I need an appointment for skin consultation tomorrow",
    structuredState: {
      product: "Skin consultation",
      customerPhone: "15811061380",
      customFields: {},
    },
    configuredFields: [],
    customerJid: "contact-e4ed32210a80@example.invalid",
  });

  assert.equal(record?.recordType, "lead");
  assert.equal(record?.recordStatus, "incomplete");
  assert.match(String(record?.transactionStatus || ""), /lead incomplete/i);
});

test("existing incomplete draft is always updated by a useful reply", () => {
  assert.equal(shouldCreateOrUpdateDraftRecord({
    businessFlow: "product",
    latestText: "My address is 12 Main Street Lahore",
    activeRecord: { recordStatus: "incomplete" },
    structuredState: {},
    customerJid: "contact-e4ed32210a80@example.invalid",
  }), true);
});

test("low-signal greeting alone does not create a draft", () => {
  assert.equal(shouldCreateOrUpdateDraftRecord({
    businessFlow: "product",
    latestText: "hi",
    structuredState: {},
    customerJid: "contact-e4ed32210a80@example.invalid",
  }), false);
});

test("draft profile patch keeps partial records visible as incomplete", () => {
  const patch = buildDraftProfilePatch({
    recordType: "lead",
    serviceName: "Dental appointment",
    customerPhone: "15811061380",
    customerName: "Sana",
    customFields: {},
    missingFields: ["Preferred Date/Time"],
  }, { order_id: "draft_1" });

  assert.equal(patch.orderStatus, "Lead incomplete");
  assert.equal(patch.latestOrderRef, "draft_1");
  assert.deepEqual(patch.missingCustomFields, ["Preferred Date/Time"]);
});
