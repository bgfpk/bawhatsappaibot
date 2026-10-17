import test from "node:test";
import assert from "node:assert/strict";

import {
  getCrmSourceDisplayLabel,
  getCrmSourceGroup,
  normalizeCrmSource,
} from "./crm-source-service.ts";

test("CRM source display labels use customer-friendly origin text", () => {
  assert.equal(getCrmSourceDisplayLabel("whatsapp"), "WhatsApp inbound");
  assert.equal(getCrmSourceDisplayLabel("manual_admin"), "Manual admin action");
  assert.equal(getCrmSourceDisplayLabel("website knowledge"), "Website / knowledge");
  assert.equal(getCrmSourceDisplayLabel("website_api"), "Website API");
  assert.equal(getCrmSourceDisplayLabel("followup_campaign"), "Follow-up campaign");
  assert.equal(getCrmSourceDisplayLabel("customer_update"), "Customer update");
  assert.equal(getCrmSourceDisplayLabel("woocommerce webhook"), "WooCommerce");
  assert.equal(getCrmSourceDisplayLabel("wordpress"), "WordPress");
  assert.equal(getCrmSourceDisplayLabel("api"), "Website API");
});

test("CRM source normalization keeps supported sources grouped", () => {
  assert.equal(normalizeCrmSource("followup_campaign"), "Follow-up campaign");
  assert.equal(normalizeCrmSource("website_api"), "Website API");
  assert.equal(normalizeCrmSource("woocommerce"), "WooCommerce");
  assert.equal(normalizeCrmSource("wordpress"), "WordPress");
  assert.equal(getCrmSourceGroup("followup_campaign"), "manual_crm");
  assert.equal(getCrmSourceGroup("website_api"), "website_api");
  assert.equal(getCrmSourceGroup("website knowledge"), "website_api");
  assert.equal(getCrmSourceGroup("woocommerce"), "woo_wordpress");
});
