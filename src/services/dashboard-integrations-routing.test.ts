import test from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_INTEGRATIONS_PATH,
  LIVE_MONITOR_PATH,
  DASHBOARD_ROUTE_REGISTRY,
  resolveRouteByPath,
  resolvePathByViewAndTab,
} from "../app/dashboard-route-registry.ts";
import { PUBLIC_SEO_ROUTES } from "../config/public-seo.ts";
import { DASHBOARD_NAVIGATION } from "../dashboard-shell/navigation-config.ts";

test("dashboard integrations constant is /dashboard/integrations", () => {
  assert.equal(DASHBOARD_INTEGRATIONS_PATH, "/dashboard/integrations");
});

test("live monitor constant is /live-monitor", () => {
  assert.equal(LIVE_MONITOR_PATH, "/live-monitor");
});

test("dashboard route registry maps integrations to /dashboard/integrations", () => {
  const integrationsDef = DASHBOARD_ROUTE_REGISTRY.find((r) => r.view === "integrations");
  assert.ok(integrationsDef, "Integrations route must be registered");
  assert.equal(integrationsDef.path, "/dashboard/integrations");
});

test("resolveRouteByPath resolves /dashboard/integrations to authenticated integrations view", () => {
  const route = resolveRouteByPath("/dashboard/integrations");
  assert.ok(route);
  assert.equal(route.view, "integrations");
});

test("resolvePathByViewAndTab resolves integrations view to /dashboard/integrations", () => {
  const path = resolvePathByViewAndTab("integrations");
  assert.equal(path, "/dashboard/integrations");
});

test("resolveRouteByPath resolves /live-monitor and legacy /terminal to live_monitor view", () => {
  const liveRoute = resolveRouteByPath("/live-monitor");
  assert.ok(liveRoute);
  assert.equal(liveRoute.view, "live_monitor");

  const terminalRoute = resolveRouteByPath("/terminal");
  assert.ok(terminalRoute);
  assert.equal(terminalRoute.view, "live_monitor");
});

test("public SEO routes preserve /integrations for public marketing website", () => {
  const integrationsSeo = PUBLIC_SEO_ROUTES.find((r) => r.key === "integrations" || r.path === "/integrations");
  assert.ok(integrationsSeo, "Public marketing integrations page must exist");
  assert.equal(integrationsSeo.path, "/integrations");
  assert.equal(integrationsSeo.canonicalPath, "/integrations");
});

test("dashboard shell navigation config uses DASHBOARD_INTEGRATIONS_PATH and includes Live Monitor", () => {
  const allNavItems = DASHBOARD_NAVIGATION.flatMap((section) => section.items);
  const integrationsNav = allNavItems.find((item) => item.view === "integrations");
  assert.ok(integrationsNav, "Integrations item must exist in navigation");
  assert.equal(integrationsNav.path, DASHBOARD_INTEGRATIONS_PATH);

  const liveMonitorNav = allNavItems.find((item) => item.view === "live_monitor");
  assert.ok(liveMonitorNav, "Live Monitor item must exist in navigation");
  assert.equal(liveMonitorNav.label, "Live Monitor");
  assert.equal(liveMonitorNav.path, LIVE_MONITOR_PATH);
});
