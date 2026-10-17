import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
const tokens = fs.readFileSync(new URL("../design-system/tokens.css", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../dashboard-shell/DashboardShell.tsx", import.meta.url), "utf8");
const sidebar = fs.readFileSync(new URL("../components/AppSidebar.tsx", import.meta.url), "utf8");
const chartTheme = fs.readFileSync(new URL("../components/dashboard/dashboard-chart-theme.ts", import.meta.url), "utf8");
const onboarding = fs.readFileSync(new URL("../components/dashboard/ClientOnboardingChecklist.tsx", import.meta.url), "utf8");

test("Luminous design tokens establish explicit dark/light CSS variables", () => {
  for (const token of [
    "--ca-canvas-0",
    "--ca-surface-0",
    "--ca-border-subtle",
    "--ca-border-strong",
    "--ca-text-primary",
    "--ca-text-secondary",
    "--ca-brand",
    "--ca-z-header",
    "--ca-z-drawer",
  ]) {
    assert.match(tokens, new RegExp(`${token}:`));
  }
  assert.match(tokens, /\[data-theme="light"\]/);
  assert.match(tokens, /@media \(prefers-reduced-motion: reduce\)/);
});

test("DashboardShell maintains shell hierarchy with responsive sidebar and topbar", () => {
  assert.match(shell, /DashboardSidebar/);
  assert.match(shell, /DashboardPageFrame/);
  assert.match(sidebar, /clientItems/);
  assert.match(sidebar, /adminItems/);
  assert.match(app, /ProtectedDashboardApplication/);
});

test("ProtectedDashboardApplication uses CSS design tokens over raw hardcoded inline colors", () => {
  assert.match(app, /var\(--ca-/);
  assert.match(app, /ca-tone-blue/);
  assert.match(app, /ca-tone-amber/);
  assert.match(app, /ca-tone-violet/);
});

test("client onboarding checklist exposes recommended action, progressive expansion, and persistence", () => {
  assert.match(onboarding, /ClientOnboardingChecklist/);
  assert.match(onboarding, /Improve your setup later/);
  assert.match(onboarding, /recommendedCoreItem/);
  assert.match(onboarding, /onOpenItem\(recommended\)/);
  assert.match(onboarding, /blackarrow_setup_checklist_collapsed/);
});

test("chart palette uses multiple semantic tokens without changing chart data builders", () => {
  for (let index = 1; index <= 7; index += 1) assert.match(chartTheme, new RegExp(`var\\(--ca-chart-${index}\\)`));
  assert.equal((chartTheme.match(/var\(--ca-chart-/g) || []).length, 7);
  assert.match(app, /buildUsageDailySeries/);
  assert.match(app, /getDashboardChartColor/);
});
