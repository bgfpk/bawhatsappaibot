import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../../server.ts", import.meta.url), "utf8");
const billingSource = fs.readFileSync(new URL("../billing/BillingPage.tsx", import.meta.url), "utf8");
const integrationFoundationSource = fs.readFileSync(new URL("../components/dashboard/pages/IntegrationFoundationPage.tsx", import.meta.url), "utf8");

test("ProtectedDashboardApplication contains modular navigation and settings components", () => {
  assert.match(appSource, /DASHBOARD_ROUTE_REGISTRY/);
  assert.match(appSource, /DashboardShell/);
  assert.match(appSource, /ContentLibraryPage/);
  assert.match(appSource, /BillingPage/);
  assert.match(appSource, /SettingsPage/);
});

test("server.ts preserves core API routes", () => {
  assert.match(serverSource, /\/api\/user\/config/);
  assert.match(serverSource, /\/api\/bots\/update-config/);
  assert.match(serverSource, /\/api\/billing\/creem\/create-checkout/);
  assert.match(serverSource, /\/api\/user\/transactions/);
});

test("integration foundation renders real available integrations and flags future systems", () => {
  assert.match(integrationFoundationSource, /WooCommerce/);
  assert.match(integrationFoundationSource, /Calendar \/ bookings/);
  assert.match(integrationFoundationSource, /Meta inboxes/);
  assert.match(integrationFoundationSource, /Planned/);
  assert.match(integrationFoundationSource, /Coming soon/);
  assert.match(integrationFoundationSource, /Ready via webhook/);
  assert.doesNotMatch(integrationFoundationSource, /Google Sheets", status: "Ready now"/);
  assert.doesNotMatch(integrationFoundationSource, /Shopify", status: "Ready now"/);
});

test("CRM backend files and server routes remain present", () => {
  assert.equal(fs.existsSync(new URL("./crm-foundation-service.ts", import.meta.url)), true);
  assert.equal(fs.existsSync(new URL("./crm-agent-mode-service.ts", import.meta.url)), true);
  assert.equal(fs.existsSync(new URL("../components/dashboard/pages/CrmFoundationPage.tsx", import.meta.url)), true);
  assert.match(serverSource, /\/api\/user\/crm\/overview/);
  assert.match(serverSource, /\/api\/user\/crm\/notifications/);
});

test("wallet and Creem pricing actions remain visible in source", () => {
  assert.match(appSource, /startCreemCheckout/);
  assert.match(appSource, /openCreemCustomerPortal/);
  assert.match(appSource, /startCreemCheckout\(\{ type: "wallet_topup"/);
  assert.match(billingSource, /BillingPage/);
});
