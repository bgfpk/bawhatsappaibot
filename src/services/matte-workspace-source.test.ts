import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const tokens = read("../styles/blackarrow-theme.css");
const dashboardCss = read("../styles/dashboard-design-system.css");
const readability = read("../styles/theme-readability.css");
const sidebar = read("../components/AppSidebar.tsx");
const home = read("../components/dashboard/pages/HomeCommandCenterPage.tsx");
const onboarding = read("../components/dashboard/ClientOnboardingChecklist.tsx");
const app = read("../app/ProtectedDashboardApplication.tsx");
const darkMode = read("../hooks/useDarkMode.ts");

test("matte tokens use neutral canvases, fixed shadows, and no glow token", () => {
  for (const value of ["#0a0c0d", "#101315", "#f0f2f1", "#f7f8f7"]) assert.match(tokens, new RegExp(value));
  for (const token of ["shadow-flat", "shadow-soft", "shadow-raised", "shadow-modal"]) assert.match(tokens, new RegExp(`--ca-${token}:`));
  assert.doesNotMatch(tokens, /brand-glow|highlight-inset|gradient-hero/);
  assert.equal((tokens.match(/(?:linear|radial)-gradient/g) || []).length, 1);
  assert.match(tokens, /--ca-gradient-progress:/);
});

test("dashboard shell, sidebar, workspace bar, cards, and actions are matte", () => {
  assert.doesNotMatch(sidebar, /backdrop-blur/);
  assert.doesNotMatch(dashboardCss, /backdrop-filter|gradient-hero|brand-glow|highlight-inset/);
  assert.match(dashboardCss, /\.ca-sidebar[\s\S]*background: var\(--ca-surface-1\)/);
  assert.match(dashboardCss, /\.ca-workspace-bar[\s\S]*background: var\(--ca-surface-1\)/);
  assert.match(dashboardCss, /\.ca-workspace-hero[\s\S]*background: var\(--ca-surface-1\)/);
  assert.match(dashboardCss, /\.ca-metric-tile[\s\S]*background: var\(--ca-surface-1\)/);
  assert.match(dashboardCss, /\.ca-action-panel[\s\S]*background: var\(--ca-surface-2\)/);
  assert.match(dashboardCss, /\.ca-button-primary[\s\S]*background: var\(--ca-brand\)/);
});

test("Home uses separated customer rows and removes duplicated quick navigation", () => {
  assert.match(home, /ca-customer-waiting-row/);
  assert.match(home, /waitingCustomerTone/);
  assert.match(home, /Open all chats/);
  assert.match(home, /DashboardEmptyState/);
  assert.doesNotMatch(home, />Quick navigation</);
  assert.doesNotMatch(home, /bg-\[linear-gradient/);
});

test("onboarding and protected behavior contracts remain wired", () => {
  assert.match(onboarding, /checklist\.coreItems\.map/);
  assert.match(onboarding, /recommendedCoreItem/);
  assert.match(onboarding, /blackarrow_setup_checklist_collapsed/);
  assert.doesNotMatch(onboarding, /bg-\[linear-gradient/);
  assert.match(app, /customer_details_configured/);
  assert.match(app, /ai_chat_replies_enabled/);
});

test("all primary dashboard destinations inherit the matte system or shared primitives", () => {
  for (const view of ["global_dashboard", "dashboard", "orders", "products", "customers", "customer_updates", "marketing", "ai", "analytics", "selector", "billing", "settings"]) {
    assert.match(app, new RegExp(`activeView === ["']${view}["']|includes\\(activeView\\)`));
  }
  assert.match(app, /dashboard-shell/);
  assert.match(app, /dashboard-main/);
  assert.match(readability, /Narrow compatibility bridge/);
  assert.match(readability, /\.dashboard-main \.bg-white/);
});

test("theme persistence, fixed WhatsApp control, focus, and reduced motion remain", () => {
  assert.match(darkMode, /localStorage\.getItem\('isDarkMode'\)/);
  assert.match(darkMode, /localStorage\.setItem\('isDarkMode'/);
  assert.equal((app.match(/<Chatbot compact \/>/g) || []).length, 1);
  assert.match(dashboardCss, /:focus-visible/);
  assert.match(dashboardCss, /prefers-reduced-motion/);
});
