import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_NAVIGATION } from '../navigation-config';
import { filterNavigationByRole, findActiveNavItem, getBreadcrumbSteps } from '../navigation-utils';

test('Dashboard Navigation Config: Structure and icons', () => {
  assert.ok(Array.isArray(DASHBOARD_NAVIGATION), 'Navigation should be an array');
  assert.ok(DASHBOARD_NAVIGATION.length >= 5, 'Should have at least 5 navigation groups');

  for (const group of DASHBOARD_NAVIGATION) {
    assert.ok(group.id, 'Group must have an id');
    assert.ok(group.title, 'Group must have a title');
    assert.ok(Array.isArray(group.items), 'Group items must be an array');
    assert.ok(group.items.length > 0, 'Group must contain at least one item');

    for (const item of group.items) {
      assert.ok(item.id, 'Item must have an id');
      assert.ok(item.view, 'Item must specify a target view');
      assert.ok(item.label, 'Item must have a user-visible label');
      assert.ok(item.description, 'Item must have a description');
      assert.ok(typeof item.icon === 'function' || typeof item.icon === 'object', 'Item must have a valid icon component');
    }
  }
});

test('Navigation Utils: filterNavigationByRole', () => {
  const nonAdminGroups = filterNavigationByRole(DASHBOARD_NAVIGATION, false);
  const hasAdminItemNonAdmin = nonAdminGroups.some((g) =>
    g.items.some((i) => i.adminOnly)
  );
  assert.strictEqual(hasAdminItemNonAdmin, false, 'Non-admin navigation should exclude adminOnly items');

  const adminGroups = filterNavigationByRole(DASHBOARD_NAVIGATION, true);
  const hasAdminItemAdmin = adminGroups.some((g) =>
    g.items.some((i) => i.adminOnly)
  );
  assert.strictEqual(hasAdminItemAdmin, true, 'Admin navigation should include adminOnly items');
});

test('Navigation Utils: findActiveNavItem', () => {
  const globalDashItem = findActiveNavItem('global_dashboard');
  assert.ok(globalDashItem, 'Should find item for view "global_dashboard"');
  assert.strictEqual(globalDashItem?.id, 'dashboard');

  const selectorItem = findActiveNavItem('selector');
  assert.ok(selectorItem, 'Should find item for view "selector"');
  assert.strictEqual(selectorItem?.id, 'instance_hub');

  const customersItem = findActiveNavItem('customers');
  assert.ok(customersItem, 'Should find item for view "customers"');
  assert.strictEqual(customersItem?.id, 'customers');
});

test('Navigation Utils: getBreadcrumbSteps', () => {
  const stepsGlobalDash = getBreadcrumbSteps('global_dashboard');
  assert.strictEqual(stepsGlobalDash.length, 1);
  assert.strictEqual(stepsGlobalDash[0].label, 'Dashboard');
  assert.strictEqual(stepsGlobalDash[0].isCurrent, true);

  const stepsCustomers = getBreadcrumbSteps('customers');
  assert.strictEqual(stepsCustomers.length, 2);
  assert.strictEqual(stepsCustomers[0].label, 'Customers & Engagement');
  assert.strictEqual(stepsCustomers[0].isCurrent, false);
  assert.strictEqual(stepsCustomers[1].label, 'Customers');
  assert.strictEqual(stepsCustomers[1].isCurrent, true);

  const stepsUnknown = getBreadcrumbSteps('custom_page');
  assert.strictEqual(stepsUnknown.length, 2);
  assert.strictEqual(stepsUnknown[0].label, 'Dashboard');
  assert.strictEqual(stepsUnknown[0].view, 'global_dashboard');
  assert.strictEqual(stepsUnknown[1].label, 'Custom_page');
});
