import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_SEO_ROUTES } from "../config/public-seo";
import { CRM_UI_ENABLED, INBOX_UI_ENABLED } from "../config/product-flags";
import { DASHBOARD_NAVIGATION } from "../dashboard-shell/navigation-config";
import { resolveRouteByPath } from "../app/dashboard-route-registry";
import { buildOverviewModel } from "../dashboard-overview/overview-model";
import { buildClientOnboardingChecklist } from "../services/client-onboarding-checklist-service";
import { buildHomeCommandCenter } from "../services/home-command-center-service";

test("Separation: Public /integrations route vs Dashboard IntegrationFoundationPage", () => {
  // 1. Check public SEO route definition
  const integrationsSeo = PUBLIC_SEO_ROUTES.find((r) => r.key === "integrations" || r.path === "/integrations");
  assert.ok(integrationsSeo, "PUBLIC_SEO_ROUTES must contain integrations");
  assert.equal(integrationsSeo.path, "/integrations");
  assert.ok(integrationsSeo.title.includes("Integration"));

  // 2. Check public marketing integrations content exists in apps/web
  const integrationsHeroSource = readFileSync(
    resolve(process.cwd(), "apps/web/components/integrations/integrations-hero.tsx"),
    "utf8"
  );
  assert.ok(
    integrationsHeroSource.includes("Connect BlackArrow to Your Store, Website, Couriers"),
    "Public integrations hero must contain marketing heading"
  );

  // 3. Ensure Auth.tsx does NOT render IntegrationFoundationPage or operational dashboard controls
  const authSource = readFileSync(resolve(process.cwd(), "src/components/Auth.tsx"), "utf8");
  assert.equal(
    authSource.includes("const IntegrationFoundationPage = lazy("),
    false,
    "Auth.tsx must NOT lazy-import IntegrationFoundationPage"
  );
  assert.equal(
    authSource.includes("<IntegrationFoundationPage"),
    false,
    "Auth.tsx must NOT render <IntegrationFoundationPage />"
  );
  assert.equal(
    authSource.includes("Website lead capture endpoint"),
    false,
    "Public Auth must not expose operational lead capture controls"
  );
  assert.equal(
    authSource.includes("WooCommerce signing key"),
    false,
    "Public Auth must not expose WooCommerce signing key"
  );

  // 4. Check that authenticated dashboard retains IntegrationFoundationPage routing
  const protectedAppSource = readFileSync(
    resolve(process.cwd(), "src/app/ProtectedDashboardApplication.tsx"),
    "utf8"
  );
  assert.ok(
    protectedAppSource.includes('activeView === "integrations"'),
    "ProtectedDashboardApplication must route activeView === 'integrations'"
  );
  assert.ok(
    protectedAppSource.includes("<LazyIntegrationFoundationPage section=\"all\" />"),
    "ProtectedDashboardApplication must render LazyIntegrationFoundationPage for authenticated users"
  );

  const integrationPageSource = readFileSync(
    resolve(process.cwd(), "src/components/dashboard/pages/IntegrationFoundationPage.tsx"),
    "utf8"
  );
  assert.ok(
    integrationPageSource.includes("export function IntegrationFoundationPage"),
    "IntegrationFoundationPage must remain properly exported for dashboard use"
  );
});

test("Task A — Shared Route-change scroll restoration in AppRouter", () => {
  const routerSource = readFileSync(resolve(process.cwd(), "src/app/AppRouter.tsx"), "utf8");
  assert.ok(routerSource.includes("export const ScrollToTop"), "AppRouter.tsx must export ScrollToTop component");
  assert.ok(routerSource.includes("window.scrollTo(0, 0)"), "ScrollToTop must restore window scroll to 0, 0");
  assert.ok(routerSource.includes("<ScrollToTop />"), "AppRouter must mount <ScrollToTop />");
});

test("Task B & C — Feature flags are disabled", () => {
  assert.equal(CRM_UI_ENABLED, false, "CRM_UI_ENABLED must be false");
  assert.equal(INBOX_UI_ENABLED, false, "INBOX_UI_ENABLED must be false");
});

test("Task B & C — Navigation config excludes CRM and Inbox", () => {
  const allNavItems = DASHBOARD_NAVIGATION.flatMap((group) => group.items);
  const inboxItem = allNavItems.find((item) => item.id === "inbox");
  const crmItem = allNavItems.find((item) => item.id === "crm");

  assert.equal(inboxItem, undefined, "DASHBOARD_NAVIGATION must exclude inbox item");
  assert.equal(crmItem, undefined, "DASHBOARD_NAVIGATION must exclude crm item");
});

test("Task B & C — Direct routes to /crm and /inbox safely redirect to /dashboard", () => {
  const dormantRoutes = [
    "/crm",
    "/crm/",
    "/crm/pipeline",
    "/crm/leads",
    "/inbox",
    "/inbox/",
    "/inbox/chats",
    "/inbox/123",
  ];

  for (const route of dormantRoutes) {
    const resolved = resolveRouteByPath(route);
    assert.ok(resolved, `Path ${route} must resolve to fallback`);
    assert.equal(resolved.path, "/dashboard", `Path ${route} must redirect to /dashboard`);
    assert.equal(resolved.view, "global_dashboard");
  }
});

test("Task B & C — Dashboard Overview Model does not expose Inbox or CRM quick actions", () => {
  const onboardingChecklist = buildClientOnboardingChecklist({});
  const model = buildOverviewModel({
    customers: [],
    orders: [],
    followups: [],
    products: [],
    onboardingChecklist,
  });

  const inboxAction = model.quickActions.find((a) => a.id === "action_inbox" || a.targetView === "inbox");
  const crmAction = model.quickActions.find((a) => a.targetView === "crm");

  assert.equal(inboxAction, undefined, "Overview quick actions must not expose action_inbox");
  assert.equal(crmAction, undefined, "Overview quick actions must not expose crm actions");
});

test("Task B & C — Home Command Center filters out CRM and Inbox manual actions", () => {
  const home = buildHomeCommandCenter({
    customers: [],
    orders: [],
  });

  const visibleActions = home.manualActions.filter(
    (action) => (CRM_UI_ENABLED || action.target !== "crm") && (INBOX_UI_ENABLED || action.target !== "inbox")
  );

  assert.ok(
    !visibleActions.some((a) => a.target === "crm" || a.target === "inbox"),
    "Visible manual actions must not contain crm or inbox targets"
  );
});

test("Public Integrations and Dashboard Inbox Removal Verification", () => {
  const authSource = readFileSync(resolve(process.cwd(), "src/components/Auth.tsx"), "utf8");
  assert.ok(
    authSource.includes("const PublicIntegrationsPage = lazy("),
    "Auth.tsx must lazy load PublicIntegrationsPage"
  );
  assert.ok(
    authSource.includes("activePage === 'integrations'"),
    "Auth.tsx must contain activePage === 'integrations' branch"
  );
  assert.ok(
    authSource.includes("<PublicIntegrationsPage"),
    "Auth.tsx must render <PublicIntegrationsPage /> for public /integrations route"
  );

  const protectedAppSource = readFileSync(
    resolve(process.cwd(), "src/app/ProtectedDashboardApplication.tsx"),
    "utf8"
  );
  assert.ok(
    protectedAppSource.includes('(INBOX_UI_ENABLED && ["dashboard", "customers"].includes(activeView))'),
    "ProtectedDashboardApplication.tsx must guard Chats tab bar with INBOX_UI_ENABLED"
  );
  assert.ok(
    protectedAppSource.includes('INBOX_UI_ENABLED && activeView === "dashboard" && selectedBotId'),
    "ProtectedDashboardApplication.tsx must guard ConversationInboxPage with INBOX_UI_ENABLED"
  );
  assert.equal(
    protectedAppSource.includes('(activeView === "global_dashboard" || activeView === "dashboard") && selectedBotId'),
    false,
    "ProtectedDashboardApplication.tsx must NOT render ConversationInboxPage on global_dashboard"
  );
});
