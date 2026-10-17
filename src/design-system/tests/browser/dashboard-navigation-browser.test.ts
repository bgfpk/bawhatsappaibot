import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_ROUTE_REGISTRY,
  resolveRouteByPath,
  resolvePathByViewAndTab,
} from '../../../app/dashboard-route-registry';
import { DASHBOARD_NAVIGATION } from '../../../dashboard-shell/navigation-config';
import { findActiveNavItem } from '../../../dashboard-shell/navigation-utils';

test('Route Contract Safety & Tab ID Validation', () => {
  const validAiTabs = new Set(['instructions', 'learned', 'fields', 'calls', 'integrations', 'smart_sales']);
  const validContentTabs = new Set(['media', 'saved_replies', 'sequences', 'welcome']);
  const validSettingsTabs = new Set(['team', 'billing', 'alerts', 'security', 'sessions', 'proxy']);
  const validBillingTabs = new Set(['overview', 'usage', 'plans', 'history', 'account']);

  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    if (route.view === 'ai' && route.tab) {
      assert.ok(validAiTabs.has(route.tab), `Invalid AI tab ID in route: ${route.tab}`);
    }
    if (route.view === 'content_library' && route.tab) {
      assert.ok(validContentTabs.has(route.tab), `Invalid Content Library tab ID in route: ${route.tab}`);
    }
    if ((route.view === 'settings' || route.view === 'team' || route.view === 'security') && route.tab) {
      assert.ok(validSettingsTabs.has(route.tab), `Invalid Settings tab ID in route: ${route.tab}`);
    }
    if (route.view === 'billing' && route.tab) {
      assert.ok(validBillingTabs.has(route.tab), `Invalid Billing tab ID in route: ${route.tab}`);
    }
  }
});

test('Active Parent Regression Contracts', () => {
  // Billing history parent active
  const billingHistRoute = resolveRouteByPath('/billing/history');
  assert.ok(billingHistRoute);
  assert.equal(billingHistRoute.view, 'billing');

  // Content library sequences parent active
  const seqRoute = resolveRouteByPath('/content-library/sequences');
  assert.ok(seqRoute);
  assert.equal(seqRoute.tab, 'sequences');

  // AI confirmation fields
  const fieldsRoute = resolveRouteByPath('/ai-studio/confirmation-fields');
  assert.ok(fieldsRoute);
  assert.equal(fieldsRoute.tab, 'fields');

  // Settings admin alerts
  const alertsRoute = resolveRouteByPath('/settings/admin-alerts');
  assert.ok(alertsRoute);
  assert.equal(alertsRoute.tab, 'alerts');

  // Admin accounting
  const acctRoute = resolveRouteByPath('/admin/accounting');
  assert.ok(acctRoute);
  assert.equal(acctRoute.tab, 'accounting');
});
