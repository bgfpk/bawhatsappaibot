import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyDashboardNotificationState,
  generatedDashboardNotificationIds,
  updateDashboardNotificationState,
} from "./dashboard-notification-state-service.ts";
import {
  DASHBOARD_NOTIFICATION_TRIGGER_PLACEMENT,
  countActiveDashboardNotifications,
  getDashboardNotificationTriggerClassName,
  systemDashboardNotifications,
  topDashboardNotifications,
} from "./dashboard-notification-ui-service.ts";

test("notification trigger is configured for the sidebar footer", () => {
  assert.equal(DASHBOARD_NOTIFICATION_TRIGGER_PLACEMENT, "sidebar-footer");
  const className = getDashboardNotificationTriggerClassName();
  assert.match(className, /relative/);
  assert.doesNotMatch(className, /\bfixed\b/);
  assert.match(className, /hover:bg-gray-200/);
});

test("active notification count ignores read and completed rows", () => {
  assert.equal(countActiveDashboardNotifications([
    { id: "new" },
    { id: "read", read: true },
    { id: "done", completed: true },
  ]), 1);
});

test("generated dashboard notification read state persists across rebuilds", () => {
  const generated = systemDashboardNotifications({
    selectedBot: { name: "Shop", is_active: 0 },
    status: "qr-ready",
    walletBalance: 1,
    billing: { usage: 10, limit: 10 },
  });
  const state = updateDashboardNotificationState(undefined, {
    ids: generatedDashboardNotificationIds(generated),
    read: true,
  });
  const rebuilt = applyDashboardNotificationState(systemDashboardNotifications({
    selectedBot: { name: "Shop", is_active: 0 },
    status: "qr-ready",
    walletBalance: 1,
    billing: { usage: 10, limit: 10 },
  }), state);

  assert.equal(countActiveDashboardNotifications(rebuilt), 0);
  assert.equal(rebuilt.every((item) => item.read === true), true);
});

test("generated dashboard notification clear state hides rebuilt rows", () => {
  const generated = systemDashboardNotifications({
    selectedBot: { name: "Shop", is_active: 0 },
    status: "qr-ready",
    walletBalance: 0,
  });
  const state = updateDashboardNotificationState(undefined, {
    ids: generatedDashboardNotificationIds(generated),
    read: true,
    completed: true,
  });
  const rebuilt = applyDashboardNotificationState(systemDashboardNotifications({
    selectedBot: { name: "Shop", is_active: 0 },
    status: "qr-ready",
    walletBalance: 0,
  }), state);

  assert.equal(topDashboardNotifications(rebuilt).length, 0);
  assert.equal(rebuilt.every((item) => item.completed === true), true);
});

test("global notification bulk request sends JSON content type", () => {
  const source = readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
  const bulkHandlerStart = source.indexOf("const bulkUpdateDashboardNotifications");
  const bulkHandlerEnd = source.indexOf("const openDashboardNotificationLead", bulkHandlerStart);
  const bulkHandler = source.slice(bulkHandlerStart, bulkHandlerEnd);

  assert.ok(bulkHandlerStart > -1);
  assert.match(bulkHandler, /\/api\/user\/crm\/notifications\/bulk/);
  assert.match(bulkHandler, /headers:\s*\{\s*"Content-Type":\s*"application\/json"\s*\}/);
  assert.match(bulkHandler, /JSON\.stringify\(\{\s*action\s*\}\)/);
});

test("dashboard toast stack is top-right and not bottom-right", () => {
  const source = readFileSync(new URL("../components/dashboard/pages/CrmToastStack.tsx", import.meta.url), "utf8");

  assert.match(source, /top-\[max\(1rem,env\(safe-area-inset-top\)\)\]/);
  assert.match(source, /\bright-4\b/);
  assert.doesNotMatch(source, /\bbottom-4\b/);
});

test("dashboard drawer clear all can reach empty state", () => {
  const source = readFileSync(new URL("../components/dashboard/DashboardNotificationCenter.tsx", import.meta.url), "utf8");

  assert.match(source, /No active alerts\./);
  assert.match(source, /const clearAll = \(\) =>/);
  assert.match(source, /setLocalDoneIds/);
  assert.match(source, /onClearAll\?\.\(rows\)/);
});

test("CRM bulk notification service rejects invalid actions", () => {
  const source = readFileSync(new URL("./crm-foundation-service.ts", import.meta.url), "utf8");

  assert.match(source, /\["mark_all_read", "clear_all", "clear_read"\]\.includes\(action\)/);
  assert.match(source, /Unsupported notification bulk action\./);
});

test("sidebar account footer keeps notification bell last and hides email text", () => {
  const source = readFileSync(new URL("../components/AppSidebar.tsx", import.meta.url), "utf8");
  const themeIndex = source.indexOf('aria-label="Toggle theme"');
  const notificationIndex = source.indexOf("{notificationCenter}", themeIndex);

  assert.ok(themeIndex > -1);
  assert.ok(notificationIndex > themeIndex);
  assert.doesNotMatch(source, /currentUser\?\.email \|\| "Signed in"/);
});

test("notification panel anchors right-aligned under bell without bottom-left positioning", () => {
  const source = readFileSync(new URL("../components/dashboard/DashboardNotificationCenter.tsx", import.meta.url), "utf8");

  assert.match(source, /sm:right-0/);
  assert.match(source, /sm:top-full/);
  assert.match(source, /sm:w-\[28rem\]/);
  assert.doesNotMatch(source, /bottom-4\s+left-4/);
  assert.match(source, /registerOverlay/);
  assert.match(source, /handleClickOutside/);
});

test("notification center layout audit: desktop top-right, mobile drawer, page scroll anchor, viewport bounds", () => {
  const source = readFileSync(new URL("../components/dashboard/DashboardNotificationCenter.tsx", import.meta.url), "utf8");

  // 1. Desktop top-right bell anchoring
  assert.match(source, /sm:absolute\s+sm:inset-auto\s+sm:right-0\s+sm:top-full\s+sm:mt-2\s+sm:max-h-\[min\(78vh,38rem\)\]\s+sm:w-\[28rem\]/);

  // 2. Mobile viewport drawer/sheet
  assert.match(source, /fixed\s+inset-x-2\s+top-16\s+z-\[130\]\s+flex\s+max-h-\[calc\(100dvh-5rem\)\]/);

  // 3. Page scrolled stability: wrapped in relative inline-block so it moves with parent trigger
  assert.match(source, /ref=\{containerRef\}\s+className="relative inline-block"/);

  // 4. Viewport edges: constrained to prevent overflow on right or bottom
  assert.match(source, /sm:max-w-\[calc\(100vw-2rem\)\]/);

  // 5. Outside click detection: event target containment check
  assert.match(source, /containerRef\.current && !containerRef\.current\.contains\(e\.target as Node\)/);

  // 6. Close handling: Escape key dismissal via registerOverlay and modal backdrop
  assert.match(source, /registerOverlay\(popoverId,\s*\(\)\s*=>\s*setOpen\(false\),\s*true\)/);
  assert.match(source, /aria-label="Notifications"/);
  assert.match(source, /setOpen\(false\)/);

  // 7. No bottom-left positioning
  assert.doesNotMatch(source, /\bbottom-4\b[\s\S]{1,20}\bleft-4\b/);
  assert.doesNotMatch(source, /lg:left-\[18\.75rem\]/);
});
