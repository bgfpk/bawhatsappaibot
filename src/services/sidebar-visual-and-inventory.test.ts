import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DASHBOARD_NAVIGATION } from '../dashboard-shell/navigation-config';
import { filterNavigationByRole, findActiveNavItem } from '../dashboard-shell/navigation-utils';
import { resolveRouteByPath, resolvePathByViewAndTab } from '../app/dashboard-route-registry';

test('1. All legitimate navigation groups exist in order', () => {
  const expectedGroupIds = [
    'overview',
    'whatsapp_workspace',
    'customers_engagement',
    'commerce_operations',
    'reports',
    'account',
    'administration',
  ];
  const actualGroupIds = DASHBOARD_NAVIGATION.map((g) => g.id);
  assert.deepEqual(actualGroupIds, expectedGroupIds, 'Navigation groups sequence mismatch');
});

test('2. Overview group items audit', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'overview');
  assert.ok(group, 'Overview group exists');
  const itemIds = group.items.map((i) => i.id);
  assert.deepEqual(itemIds, ['get_started', 'dashboard']);
  assert.equal(group.items[0].path, '/get-started');
  assert.equal(group.items[1].path, '/dashboard');
});

test('3. WhatsApp Workspace group items audit', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'whatsapp_workspace');
  assert.ok(group, 'WhatsApp Workspace group exists');
  const itemIds = group.items.map((i) => i.id);
  assert.ok(itemIds.includes('instance_hub'));
  assert.ok(itemIds.includes('business_assistant'));
  assert.ok(itemIds.includes('live_monitor'));
  assert.ok(itemIds.includes('ai_studio'));
  assert.ok(itemIds.includes('knowledge_center'));
  assert.ok(itemIds.includes('products_services'));
  assert.ok(itemIds.includes('content_library'));
});

test('4. Customers & Engagement audit: Departments directly under group with no leads_routing wrapper', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'customers_engagement');
  assert.ok(group, 'Customers & Engagement group exists');

  // No leads_routing wrapper
  const leadsWrapper = group.items.find((i) => i.id === 'leads_routing');
  assert.equal(leadsWrapper, undefined, 'leads_routing wrapper must not exist');

  // Departments is direct item
  const deptItem = group.items.find((i) => i.id === 'departments');
  assert.ok(deptItem, 'Departments must exist directly under Customers & Engagement');
  assert.equal(deptItem.path, '/departments');
  assert.equal(deptItem.view, 'departments');
  assert.equal(deptItem.children, undefined);

  // Siblings present
  const itemIds = group.items.map((i) => i.id);
  assert.ok(itemIds.includes('customers'));
  assert.ok(itemIds.includes('departments'));
  assert.ok(itemIds.includes('followups'));
  assert.ok(itemIds.includes('broadcasts'));
  assert.ok(itemIds.includes('customer_updates'));
});

test('5. Commerce & Operations group items audit', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'commerce_operations');
  assert.ok(group, 'Commerce & Operations group exists');
  const itemIds = group.items.map((i) => i.id);
  assert.deepEqual(itemIds, ['orders', 'integrations']);
  assert.equal(group.items[0].path, '/orders');
  assert.equal(group.items[1].path, '/dashboard/integrations');
});

test('6. Reports group items audit: Reports & Analytics and its 4 children restored', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'reports');
  assert.ok(group, 'Reports group exists');
  assert.equal(group.items.length, 1);

  const reportsItem = group.items[0];
  assert.equal(reportsItem.id, 'reports_analytics');
  assert.equal(reportsItem.label, 'Reports & Analytics');
  assert.equal(reportsItem.path, '/reports/performance');
  assert.ok(Array.isArray(reportsItem.children), 'reports_analytics must have children array');
  assert.equal(reportsItem.children.length, 4);

  const childIds = reportsItem.children.map((c) => c.id);
  assert.deepEqual(childIds, ['reports_performance', 'reports_usage', 'reports_live', 'reports_logs']);

  const childPaths = reportsItem.children.map((c) => c.path);
  assert.deepEqual(childPaths, [
    '/reports/performance',
    '/reports/usage',
    '/reports/live',
    '/reports/logs',
  ]);
});

test('7. Account group items audit', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'account');
  assert.ok(group, 'Account group exists');
  const itemIds = group.items.map((i) => i.id);
  assert.deepEqual(itemIds, ['wallet', 'team', 'settings']);
  assert.equal(group.items[0].path, '/billing/overview');
  assert.equal(group.items[1].path, '/settings/account-access');
  assert.equal(group.items[2].path, '/settings/admin-alerts');
});

test('8. Administration group items audit: admin_tools and all 7 authoritative children', () => {
  const group = DASHBOARD_NAVIGATION.find((g) => g.id === 'administration');
  assert.ok(group, 'Administration group exists');
  assert.equal(group.items.length, 1);

  const adminTools = group.items[0];
  assert.equal(adminTools.id, 'admin_tools');
  assert.equal(adminTools.label, 'Admin Tools');
  assert.equal(adminTools.adminOnly, true);
  assert.ok(Array.isArray(adminTools.children));
  assert.equal(adminTools.children.length, 7);

  const expectedChildren = [
    { id: 'admin_dashboard', tab: 'dashboard', path: '/admin/dashboard', label: 'Admin Dashboard' },
    { id: 'admin_users', tab: 'users', path: '/admin/users', label: 'Accounts & Users' },
    { id: 'admin_directory', tab: 'directory', path: '/admin/directory', label: 'Shared Directory' },
    { id: 'admin_smart_sales', tab: 'smart_sales', path: '/admin/smart-sales', label: 'Smart Sales Control' },
    { id: 'admin_accounting', tab: 'accounting', path: '/admin/accounting', label: 'Platform Accounting' },
    { id: 'admin_logs', tab: 'logs', path: '/admin/logs', label: 'Logs' },
    { id: 'admin_proxies', tab: 'proxies', path: '/admin/proxies', label: 'System Proxies' },
  ];

  for (const expected of expectedChildren) {
    const found = adminTools.children.find((c) => c.id === expected.id);
    assert.ok(found, `Child ${expected.id} not found in admin_tools`);
    assert.equal(found.tab, expected.tab);
    assert.equal(found.path, expected.path);
    assert.equal(found.label, expected.label);
    assert.equal(found.adminOnly, true);
  }
});

test('9. Role and permission filtering contracts', () => {
  const nonAdmin = filterNavigationByRole(DASHBOARD_NAVIGATION, false);
  assert.equal(nonAdmin.some((g) => g.id === 'administration'), false);

  const admin = filterNavigationByRole(DASHBOARD_NAVIGATION, true);
  assert.equal(admin.some((g) => g.id === 'administration'), true);
});

test('10. Route resolution and direct URL compatibility', () => {
  const routesToTest = [
    { path: '/get-started', view: 'get_started' },
    { path: '/dashboard', view: 'global_dashboard' },
    { path: '/instances', view: 'selector' },
    { path: '/dashboard/business-assistant', view: 'business_assistant' },
    { path: '/live-monitor', view: 'live_monitor' },
    { path: '/ai-studio/instructions', view: 'ai' },
    { path: '/knowledge-center', view: 'knowledge' },
    { path: '/products', view: 'products' },
    { path: '/content-library/media', view: 'content_library' },
    { path: '/customers', view: 'customers' },
    { path: '/departments', view: 'departments' },
    { path: '/followups', view: 'marketing' },
    { path: '/broadcasts', view: 'broadcast' },
    { path: '/customer-updates', view: 'customer_updates' },
    { path: '/orders', view: 'orders' },
    { path: '/dashboard/integrations', view: 'integrations' },
    { path: '/reports/performance', view: 'analytics' },
    { path: '/reports/usage', view: 'analytics' },
    { path: '/reports/live', view: 'analytics' },
    { path: '/reports/logs', view: 'analytics' },
    { path: '/billing/overview', view: 'billing' },
    { path: '/settings/account-access', view: 'team' },
    { path: '/settings/admin-alerts', view: 'settings' },
    { path: '/admin/dashboard', view: 'admin' },
    { path: '/admin/accounting', view: 'admin' },
  ];

  for (const rt of routesToTest) {
    const resolved = resolveRouteByPath(rt.path);
    assert.ok(resolved, `Failed to resolve route: ${rt.path}`);
    assert.equal(resolved.view, rt.view, `View mismatch for ${rt.path}`);
  }
});

test('11. Visual design source integrity in DashboardSidebar and DashboardMobileNav', () => {
  const sidebarSource = readFileSync(new URL('../dashboard-shell/DashboardSidebar.tsx', import.meta.url), 'utf8');
  const mobileSource = readFileSync(new URL('../dashboard-shell/DashboardMobileNav.tsx', import.meta.url), 'utf8');

  // No leads_routing wrapper
  assert.equal(sidebarSource.includes('leads_routing'), false, 'Sidebar must not have leads_routing wrapper');
  assert.equal(mobileSource.includes('leads_routing'), false, 'MobileNav must not have leads_routing wrapper');

  // Interactive category header with text-[10px] uppercase font language preserved
  assert.match(sidebarSource, /text-\[10px\] font-bold uppercase tracking-wider/);
  assert.match(mobileSource, /text-\[10px\] font-bold uppercase tracking-wider/);

  // Expandable category accessibility and storage
  assert.match(sidebarSource, /ca_sidebar_expanded_categories/);
  assert.match(mobileSource, /ca_sidebar_expanded_categories/);
  assert.match(sidebarSource, /aria-expanded=\{isExpanded\}/);
  assert.match(mobileSource, /aria-expanded=\{isExpanded\}/);

  // Chevron rotation indicator
  assert.match(sidebarSource, /isExpanded \? 'transform rotate-0' : 'transform -rotate-90'/);
  assert.match(mobileSource, /isExpanded \? 'transform rotate-0' : 'transform -rotate-90'/);

  // Rich active-item styling: brand-soft, brand text, brand left border, shadow
  assert.match(sidebarSource, /bg-\[var\(--ca-brand-soft\)\] text-\[var\(--ca-brand\)\] border-l-2 border-\[var\(--ca-brand\)\] shadow-sm/);
  assert.match(mobileSource, /bg-\[var\(--ca-brand-soft\)\] text-\[var\(--ca-brand\)\] border-l-2 border-\[var\(--ca-brand\)\] shadow-sm/);

  // Parent button active styling
  assert.match(sidebarSource, /bg-\[var\(--ca-surface-2\)\] text-\[var\(--ca-text-primary\)\] border-l-2 border-\[var\(--ca-brand\)\] shadow-sm/);
  assert.match(mobileSource, /bg-\[var\(--ca-surface-2\)\] text-\[var\(--ca-text-primary\)\] border-l-2 border-\[var\(--ca-brand\)\] shadow-sm/);

  // Parent expansion state
  assert.match(sidebarSource, /ca_sidebar_expanded_parents/);
  assert.match(mobileSource, /ca_sidebar_expanded_parents/);

  // Item dimensions: px-3 py-2.5
  assert.match(sidebarSource, /px-3 py-2\.5 rounded-lg text-xs font-semibold/);
  assert.match(mobileSource, /px-3 py-2\.5 rounded-lg text-xs font-semibold/);
});
