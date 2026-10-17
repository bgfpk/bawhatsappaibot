import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DASHBOARD_ROUTE_REGISTRY,
  resolveRouteByPath,
  resolvePathByViewAndTab,
} from "../app/dashboard-route-registry";
import { DASHBOARD_NAVIGATION } from "../dashboard-shell/navigation-config";
import { filterNavigationByRole } from "../dashboard-shell/navigation-utils";
import {
  resolveGetStartedVisibility,
  resolveDefaultLoginPath,
  getGetStartedStorageKey,
} from "./get-started-visibility-service";
import { buildClientOnboardingChecklist } from "./client-onboarding-checklist-service";

test("Section 28.1: /get-started is registered in DASHBOARD_ROUTE_REGISTRY with correct metadata", () => {
  const route = DASHBOARD_ROUTE_REGISTRY.find((r) => r.id === "get_started" || r.path === "/get-started");
  assert.ok(route, "Route /get-started must be registered in registry");
  assert.equal(route.path, "/get-started");
  assert.equal(route.view, "get_started");
  assert.equal(route.label, "Get Started");
  assert.equal(route.section, "Overview");
  assert.equal(route.title, "Get Started | BlackArrow");
});

test("Section 28.2: resolveRouteByPath maps /get-started to get_started view", () => {
  const resolved = resolveRouteByPath("/get-started");
  assert.ok(resolved, "Should resolve route for /get-started");
  assert.equal(resolved.view, "get_started");
  assert.equal(resolved.id, "get_started");
});

test("Section 28.3: resolvePathByViewAndTab maps get_started view to /get-started", () => {
  const path = resolvePathByViewAndTab("get_started");
  assert.equal(path, "/get-started");
});

test("Section 28.4: get_started is top-most nav item in Overview section above dashboard", () => {
  const overviewSection = DASHBOARD_NAVIGATION.find((s) => s.id === "overview" || s.title === "Overview");
  assert.ok(overviewSection, "Overview section must exist in DASHBOARD_NAVIGATION");
  assert.ok(overviewSection.items.length >= 2, "Overview section must have at least 2 items");
  assert.equal(overviewSection.items[0].id, "get_started", "First item in Overview must be get_started");
  assert.equal(overviewSection.items[0].path, "/get-started");
  assert.equal(overviewSection.items[1].id, "dashboard", "Second item in Overview must be dashboard");
});

test("Section 28.5: filterNavigationByRole shows/hides get_started based on showGetStarted flag", () => {
  const navShown = filterNavigationByRole(DASHBOARD_NAVIGATION, false, true);
  const overviewShown = navShown.find((s) => s.id === "overview" || s.title === "Overview");
  assert.ok(overviewShown?.items.some((i) => i.id === "get_started"), "get_started should be shown when showGetStarted is true");

  const navHidden = filterNavigationByRole(DASHBOARD_NAVIGATION, false, false);
  const overviewHidden = navHidden.find((s) => s.id === "overview" || s.title === "Overview");
  assert.ok(!overviewHidden?.items.some((i) => i.id === "get_started"), "get_started should be hidden when showGetStarted is false");
});

test("Section 28.6 - 28.11: resolveGetStartedVisibility handles incomplete, complete, explicit true, and explicit false", () => {
  // 1. Incomplete setup with no preference -> Visible (true)
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: false, preference: null }),
    true,
    "Incomplete setup without preference must be visible"
  );
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: false, preference: undefined }),
    true,
    "Incomplete setup without preference must be visible"
  );

  // 2. Complete setup with no preference -> Hidden (false)
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: true, preference: null }),
    false,
    "Complete setup without preference must be hidden"
  );
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: true, preference: undefined }),
    false,
    "Complete setup without preference must be hidden"
  );

  // 3. Incomplete setup with explicit show (true) -> Visible (true)
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: false, preference: true }),
    true,
    "Explicit true preference must always show Get Started"
  );

  // 4. Complete setup with explicit show (true) -> Visible (true)
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: true, preference: true }),
    true,
    "Explicit true preference must always show Get Started even if complete"
  );

  // 5. Incomplete setup with explicit hide (false) -> Hidden (false)
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: false, preference: false }),
    false,
    "Explicit false preference must hide Get Started even if incomplete"
  );

  // 6. Complete setup with explicit hide (false) -> Hidden (false)
  assert.equal(
    resolveGetStartedVisibility({ isLaunchReady: true, preference: false }),
    false,
    "Explicit false preference must hide Get Started"
  );
});

test("Section 28.12 - 28.13: resolveDefaultLoginPath returns /get-started when visible and /dashboard when hidden", () => {
  assert.equal(resolveDefaultLoginPath({ isGetStartedVisible: true }), "/get-started");
  assert.equal(resolveDefaultLoginPath({ isGetStartedVisible: false }), "/dashboard");
});

test("Section 28.14: Deep links are preserved directly and never rewritten to /get-started", () => {
  const sampleDeepLinks = [
    { path: "/customers", view: "customers" },
    { path: "/products", view: "products" },
    { path: "/orders", view: "orders" },
    { path: "/ai-studio/instructions", view: "ai", tab: "instructions" },
    { path: "/ai-studio/confirmation-fields", view: "ai", tab: "fields" },
    { path: "/dashboard/integrations", view: "integrations" },
    { path: "/billing/overview", view: "billing", tab: "overview" },
  ];

  for (const deepLink of sampleDeepLinks) {
    const resolved = resolveRouteByPath(deepLink.path);
    assert.ok(resolved, `Deep link ${deepLink.path} must resolve`);
    assert.equal(resolved.view, deepLink.view);
    if (deepLink.tab) {
      assert.equal(resolved.tab, deepLink.tab);
    }
  }
});

test("Section 28.15: getGetStartedStorageKey produces isolated per-user keys", () => {
  assert.equal(getGetStartedStorageKey("user-abc"), "blackarrow_show_get_started:user-abc");
  assert.equal(getGetStartedStorageKey("user-xyz"), "blackarrow_show_get_started:user-xyz");
  assert.equal(getGetStartedStorageKey(""), "blackarrow_show_get_started");
  assert.equal(getGetStartedStorageKey(undefined), "blackarrow_show_get_started");
});

test("Section 28.16: DashboardOverview is purely operational without OnboardingExperience", () => {
  const overviewSource = readFileSync(
    resolve(process.cwd(), "src/dashboard-overview/DashboardOverview.tsx"),
    "utf8"
  );
  assert.ok(!overviewSource.includes("<OnboardingExperience"), "DashboardOverview must not render OnboardingExperience");
  assert.ok(!overviewSource.includes("<ClientOnboardingChecklist"), "DashboardOverview must not render ClientOnboardingChecklist");
});

test("Section 28.17 & 29: Operational page headers have no CompactGuide tutorial clutter", () => {
  const cleanedFiles = [
    "src/products/ProductsPage.tsx",
    "src/orders/OrdersPage.tsx",
    "src/knowledge/KnowledgePage.tsx",
    "src/integrations/IntegrationCenter.tsx",
    "src/instance-hub/InstanceHubHeader.tsx",
    "src/engagement/broadcasts/BroadcastPage.tsx",
    "src/engagement/followups/FollowupCenter.tsx",
    "src/engagement/customer-updates/CustomerUpdatesPage.tsx",
    "src/customers/CustomersPage.tsx",
    "src/platform-settings/SettingsPage.tsx",
    "src/content-library/ContentLibraryPage.tsx",
    "src/billing/BillingPage.tsx",
    "src/components/dashboard/pages/LiveMonitorPage.tsx",
    "src/conversation-inbox/InboxHeader.tsx",
    "src/crm/CrmPipeline.tsx",
  ];

  for (const file of cleanedFiles) {
    const content = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.ok(
      !content.includes("CompactGuide"),
      `File ${file} must not contain CompactGuide tutorial cards in operational header`
    );
  }
});
