import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_ROUTE_REGISTRY,
  resolveRouteByPath,
  resolvePathByViewAndTab,
} from '../app/dashboard-route-registry';
import { DASHBOARD_NAVIGATION } from '../dashboard-shell/navigation-config';
import {
  filterNavigationByRole,
  findActiveNavItem,
  getBreadcrumbSteps,
} from '../dashboard-shell/navigation-utils';

test('Dashboard Navigation & Routing — Route Registry Integrity', () => {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    assert.ok(route.id, `Route missing id: ${JSON.stringify(route)}`);
    assert.ok(route.path, `Route missing path: ${JSON.stringify(route)}`);
    assert.ok(route.path.startsWith('/'), `Route path must start with '/': ${route.path}`);
    assert.ok(route.title, `Route missing title: ${route.id}`);
    assert.ok(route.label, `Route missing label: ${route.id}`);

    assert.ok(!ids.has(route.id), `Duplicate route ID found: ${route.id}`);
    ids.add(route.id);

    assert.ok(!paths.has(route.path), `Duplicate route path found: ${route.path}`);
    paths.add(route.path);
  }
});

test('Dashboard Navigation & Routing — Route Resolution & Roundtrip', () => {
  const testCases = [
    { path: '/dashboard', view: 'global_dashboard', tab: undefined },
    { path: '/customers', view: 'customers', tab: undefined },
    { path: '/dashboard/integrations', view: 'integrations', tab: undefined },
    { path: '/live-monitor', view: 'live_monitor', tab: undefined },
    { path: '/billing/overview', view: 'billing', tab: 'overview' },
    { path: '/billing/history', view: 'billing', tab: 'history' },
    { path: '/billing/plans', view: 'billing', tab: 'plans' },
    { path: '/billing/usage', view: 'billing', tab: 'usage' },
    { path: '/settings/billing', view: 'settings', tab: 'billing' },
    { path: '/content-library/saved-replies', view: 'content_library', tab: 'saved_replies' },
    { path: '/ai-studio/instructions', view: 'ai', tab: 'instructions' },
    { path: '/admin/dashboard', view: 'admin', tab: 'dashboard' },
    { path: '/admin/users', view: 'admin', tab: 'users' },
    { path: '/admin/directory', view: 'admin', tab: 'directory' },
    { path: '/admin/smart-sales', view: 'admin', tab: 'smart_sales' },
    { path: '/admin/accounting', view: 'admin', tab: 'accounting' },
    { path: '/admin/logs', view: 'admin', tab: 'logs' },
    { path: '/admin/proxies', view: 'admin', tab: 'proxies' },
  ];

  for (const tc of testCases) {
    const resolved = resolveRouteByPath(tc.path);
    assert.ok(resolved, `Failed to resolve route for path: ${tc.path}`);
    assert.equal(resolved.view, tc.view, `Wrong view for ${tc.path}`);
    if (tc.tab) {
      assert.equal(resolved.tab, tc.tab, `Wrong tab for ${tc.path}`);
    }

    const pathBack = resolvePathByViewAndTab(tc.view, tc.tab);
    assert.equal(pathBack, tc.path, `Roundtrip path mismatch for view=${tc.view}, tab=${tc.tab}`);
  }
});

test('Dashboard Navigation & Routing — Inactive CRM and Inbox Safely Redirect to Dashboard', () => {
  const dormantPaths = [
    '/inbox',
    '/inbox/unread',
    '/crm',
    '/crm/leads',
    '/crm/pipeline',
  ];

  for (const path of dormantPaths) {
    const resolved = resolveRouteByPath(path);
    assert.ok(resolved, `Dormant path ${path} must safely resolve to dashboard`);
    assert.equal(resolved.path, '/dashboard');
    assert.equal(resolved.view, 'global_dashboard');
  }
});

test('Dashboard Navigation & Routing — Legacy Alias Resolution', () => {
  const aliases = [
    { alias: '/global_dashboard', targetPath: '/dashboard' },
    { alias: '/selector', targetPath: '/instances' },
    { alias: '/knowledge', targetPath: '/knowledge-center' },
    { alias: '/marketing', targetPath: '/followups' },
    { alias: '/broadcast', targetPath: '/broadcasts' },
    { alias: '/wallet', targetPath: '/billing/overview' },
    { alias: '/team', targetPath: '/settings/account-access' },
    { alias: '/admin', targetPath: '/admin/dashboard' },
  ];

  for (const a of aliases) {
    const resolved = resolveRouteByPath(a.alias);
    assert.ok(resolved, `Failed to resolve legacy alias: ${a.alias}`);
    assert.equal(resolved.path, a.targetPath, `Legacy alias ${a.alias} should map to canonical ${a.targetPath}`);
  }
});

test('Dashboard Navigation & Routing — 7 Admin Sub-items in Navigation Config', () => {
  const adminGroup = DASHBOARD_NAVIGATION.find((g) => g.id === 'administration');
  assert.ok(adminGroup, 'Administration group missing in DASHBOARD_NAVIGATION');

  const adminToolsItem = adminGroup.items.find((i) => i.id === 'admin_tools');
  assert.ok(adminToolsItem, 'admin_tools item missing in Administration group');
  assert.ok(adminToolsItem.adminOnly, 'admin_tools parent must be adminOnly');

  assert.ok(adminToolsItem.children, 'admin_tools must have children array');
  assert.equal(adminToolsItem.children.length, 7, `Expected 7 admin children, found ${adminToolsItem.children.length}`);

  const expectedChildTabs = [
    'dashboard',
    'users',
    'directory',
    'smart_sales',
    'accounting',
    'logs',
    'proxies',
  ];

  const actualChildTabs = adminToolsItem.children.map((c) => c.tab);
  assert.deepEqual(actualChildTabs, expectedChildTabs, 'Admin children tabs mismatch');

  for (const child of adminToolsItem.children) {
    assert.ok(child.adminOnly, `Admin child ${child.id} must be adminOnly`);
    assert.equal(child.view, 'admin', `Admin child ${child.id} must have view="admin"`);
    assert.ok(child.path, `Admin child ${child.id} must have path defined`);
  }
});

test('Dashboard Navigation & Routing — Role Filtering Gating for Non-Admins', () => {
  const nonAdminNav = filterNavigationByRole(DASHBOARD_NAVIGATION, false);
  const adminNav = filterNavigationByRole(DASHBOARD_NAVIGATION, true);

  const nonAdminAdminGroup = nonAdminNav.find((g) => g.id === 'administration');
  assert.equal(nonAdminAdminGroup, undefined, 'Administration group must be stripped for non-admins');

  const adminAdminGroup = adminNav.find((g) => g.id === 'administration');
  assert.ok(adminAdminGroup, 'Administration group must be present for admins');
  assert.equal(adminAdminGroup.items[0].children?.length, 7);
});

test('Dashboard Navigation & Routing — Active Nav Item & Breadcrumbs', () => {
  const activeAccounting = findActiveNavItem('admin', 'accounting');
  assert.ok(activeAccounting);
  assert.equal(activeAccounting.label, 'Platform Accounting');

  const stepsAccounting = getBreadcrumbSteps('admin', 'accounting');
  assert.equal(stepsAccounting.length, 3);
  assert.equal(stepsAccounting[0].label, 'Administration');
  assert.equal(stepsAccounting[1].label, 'Admin Tools');
  assert.equal(stepsAccounting[2].label, 'Platform Accounting');

  const activeCustomers = findActiveNavItem('customers');
  assert.ok(activeCustomers);
  assert.equal(activeCustomers.label, 'Customers');

  const stepsCustomers = getBreadcrumbSteps('customers');
  assert.equal(stepsCustomers[0].label, 'Customers & Engagement');
  assert.equal(stepsCustomers[1].label, 'Customers');

  // Verify Inbox and CRM are absent from active navigation
  const activeInbox = findActiveNavItem('inbox');
  assert.equal(activeInbox, null, 'Inbox must not be present in active navigation');
  const activeCrm = findActiveNavItem('crm');
  assert.equal(activeCrm, null, 'CRM must not be present in active navigation');
});
