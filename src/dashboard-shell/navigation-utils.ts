import { DASHBOARD_NAVIGATION, NavGroup, NavItem } from './navigation-config';

export function filterNavigationByRole(
  groups: NavGroup[],
  isAdmin: boolean,
  showGetStarted: boolean = true
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => (!item.adminOnly || isAdmin) && (showGetStarted || item.id !== 'get_started'))
        .map((item) => ({
          ...item,
          children: item.children
            ? item.children.filter((child) => (!child.adminOnly || isAdmin) && (showGetStarted || child.id !== 'get_started'))
            : undefined,
        })),
    }))
    .filter((group) => group.items.length > 0);
}

export function findActiveNavItem(
  activeView: string,
  activeTab?: string
): NavItem | null {
  if (activeTab) {
    for (const group of DASHBOARD_NAVIGATION) {
      for (const item of group.items) {
        if (item.children && item.children.length > 0) {
          for (const child of item.children) {
            if (child.view === activeView && child.tab === activeTab) {
              return child;
            }
          }
        }
        if (item.view === activeView && item.tab === activeTab) {
          return item;
        }
      }
    }
  }

  for (const group of DASHBOARD_NAVIGATION) {
    for (const item of group.items) {
      if (item.children && item.children.length > 0) {
        for (const child of item.children) {
          if (child.view === activeView && (!activeTab || !child.tab)) {
            return child;
          }
        }
      }
      if (item.view === activeView && (!activeTab || !item.tab)) {
        return item;
      }
    }
  }

  for (const group of DASHBOARD_NAVIGATION) {
    for (const item of group.items) {
      if (item.view === activeView) return item;
      if (item.children) {
        for (const child of item.children) {
          if (child.view === activeView) return child;
        }
      }
    }
  }

  return null;
}

export interface BreadcrumbStep {
  label: string;
  view?: string;
  tab?: string;
  isCurrent: boolean;
}

export function getBreadcrumbSteps(
  activeView: string,
  activeTab?: string
): BreadcrumbStep[] {
  const activeItem = findActiveNavItem(activeView, activeTab);
  if (!activeItem) {
    return [
      { label: 'Dashboard', view: 'global_dashboard', isCurrent: false },
      { label: activeView.charAt(0).toUpperCase() + activeView.slice(1), isCurrent: true },
    ];
  }

  let parentGroup: NavGroup | undefined;
  let parentItem: NavItem | undefined;

  for (const group of DASHBOARD_NAVIGATION) {
    for (const item of group.items) {
      if (item.id === activeItem.id) {
        parentGroup = group;
        break;
      }
      if (item.children?.some((c) => c.id === activeItem.id)) {
        parentGroup = group;
        parentItem = item;
        break;
      }
    }
    if (parentGroup) break;
  }

  const steps: BreadcrumbStep[] = [];

  if (parentGroup && parentGroup.id !== 'overview') {
    steps.push({ label: parentGroup.title, isCurrent: false });
  }

  if (parentItem) {
    steps.push({ label: parentItem.label, isCurrent: false });
  }

  steps.push({
    label: activeItem.label,
    view: activeItem.view,
    tab: activeItem.tab,
    isCurrent: true,
  });

  return steps;
}
