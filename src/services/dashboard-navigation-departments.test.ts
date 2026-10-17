import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DASHBOARD_ROUTE_REGISTRY,
  resolveRouteByPath,
} from "../app/dashboard-route-registry.ts";

import {
  DASHBOARD_NAVIGATION,
} from "../dashboard-shell/navigation-config.ts";

test("1. Lead Routing is no longer in Settings primary tabs", () => {
  const settingsSource = readFileSync(new URL("../platform-settings/SettingsPage.tsx", import.meta.url), "utf8");

  // Primary tabs definition should not contain lead_routing
  const tabsMatch = settingsSource.match(/const\s+tabs\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(tabsMatch, "Settings tabs array is defined");
  assert.equal(tabsMatch[1].includes('"lead_routing"'), false, "lead_routing is removed from primary tabs array");
  assert.equal(tabsMatch[1].includes("'lead_routing'"), false, "lead_routing is removed from primary tabs array");

  // But legacy tab fallback is preserved in body
  assert.match(settingsSource, /activeTab === ["']lead_routing["']/);
  assert.match(settingsSource, /<LeadRoutingSettingsSection/);
});

test("2. Departments is a direct item under Customers & Engagement (no leads_routing wrapper)", () => {
  const customersSection = DASHBOARD_NAVIGATION.find(s => s.id === "customers_engagement");
  assert.ok(customersSection, "customers_engagement section exists in main navigation");

  // Verify 'leads_routing' wrapper is REMOVED
  const leadsRoutingGroup = customersSection.items.find(item => item.id === "leads_routing");
  assert.equal(leadsRoutingGroup, undefined, "leads_routing wrapper must not exist under customers_engagement");

  // Verify departments is a DIRECT item under customers_engagement
  const deptItem = customersSection.items.find(item => item.id === "departments");
  assert.ok(deptItem, "Departments is a direct item under customers_engagement");
  assert.equal(deptItem.path, "/departments");
  assert.equal(deptItem.label, "Departments");
  assert.equal(deptItem.view, "departments");
  assert.equal(deptItem.children, undefined, "Departments does not have children");

  // Verify other siblings under customers_engagement
  const itemIds = customersSection.items.map(i => i.id);
  assert.ok(itemIds.includes("customers"), "Customers item exists");
  assert.ok(itemIds.includes("departments"), "Departments item exists");
  assert.ok(itemIds.includes("followups"), "Follow-ups item exists");
  assert.ok(itemIds.includes("broadcasts"), "Broadcasts item exists");
  assert.ok(itemIds.includes("customer_updates"), "Customer Updates item exists");
});

test("3. Direct /departments route resolves correctly", () => {
  const resolved = resolveRouteByPath("/departments");
  assert.ok(resolved, "Route resolves for /departments");
  assert.equal(resolved.view, "departments");
  assert.equal(resolved.path, "/departments");

  const registryEntry = DASHBOARD_ROUTE_REGISTRY.find(r => r.path === "/departments");
  assert.ok(registryEntry, "/departments is in DASHBOARD_ROUTE_REGISTRY");
  assert.equal(registryEntry.view, "departments");
});

test("4. Refresh preserves /departments route", () => {
  // Simulate page reload: location.pathname is /departments
  const initialLoad = resolveRouteByPath("/departments");
  assert.ok(initialLoad);
  assert.equal(initialLoad.view, "departments");

  // Re-evaluation after hydration
  const reloaded = resolveRouteByPath("/departments");
  assert.ok(reloaded);
  assert.equal(reloaded.view, initialLoad.view);
  assert.equal(reloaded.path, initialLoad.path);
});

test("5. Old Settings Lead Routing URL redirects / aliases safely to /departments", () => {
  // Direct legacy alias: /lead-routing
  const legacyDirect = resolveRouteByPath("/lead-routing");
  assert.ok(legacyDirect, "Route resolves for legacy /lead-routing");
  assert.equal(legacyDirect.view, "departments");
  assert.equal(legacyDirect.path, "/departments");

  // Settings subpath legacy alias: /settings/lead-routing
  const legacySettings = resolveRouteByPath("/settings/lead-routing");
  assert.ok(legacySettings, "Route resolves for legacy /settings/lead-routing");
  assert.equal(legacySettings.view, "departments");
  assert.equal(legacySettings.path, "/departments");
});

test("6. Collapsible category navigation architecture across desktop and mobile", () => {
  const sidebarSource = readFileSync(new URL("../dashboard-shell/DashboardSidebar.tsx", import.meta.url), "utf8");
  const mobileSource = readFileSync(new URL("../dashboard-shell/DashboardMobileNav.tsx", import.meta.url), "utf8");

  // Verify neither has the leads_routing wrapper
  assert.equal(sidebarSource.includes("leads_routing"), false, "Sidebar does not have leads_routing wrapper");
  assert.equal(mobileSource.includes("leads_routing"), false, "Mobile nav does not have leads_routing wrapper");

  // Verify category collapsible storage key
  assert.match(sidebarSource, /ca_sidebar_expanded_categories/);
  assert.match(mobileSource, /ca_sidebar_expanded_categories/);

  // Verify accessibility: aria-expanded and aria-controls on category toggle buttons
  assert.match(sidebarSource, /aria-expanded=\{isExpanded\}/);
  assert.match(sidebarSource, /aria-controls=\{`sidebar-category-\$\{group\.id\}`\}/);
  assert.match(mobileSource, /aria-expanded=\{isExpanded\}/);
  assert.match(mobileSource, /aria-controls=\{`mobile-category-\$\{group\.id\}`\}/);

  // Verify auto-expansion includes departments
  assert.match(sidebarSource, /'departments'/);
  assert.match(mobileSource, /'departments'/);

  // Verify chevron rotation indicator
  assert.match(sidebarSource, /isExpanded \? 'transform rotate-0' : 'transform -rotate-90'/);
  assert.match(mobileSource, /isExpanded \? 'transform rotate-0' : 'transform -rotate-90'/);
});
