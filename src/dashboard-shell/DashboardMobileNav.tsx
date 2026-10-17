import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import { Drawer, Button } from '../design-system/primitives';
import { DASHBOARD_NAVIGATION, NavGroup, NavItem } from './navigation-config';
import { filterNavigationByRole } from './navigation-utils';
import { resolvePathByViewAndTab } from '../app/dashboard-route-registry';
import { WorkspaceContextSummary } from './context/WorkspaceContextSummary';
import { AccountOption } from './context/AccountContextControl';
import { ConnectionState } from './status/InstanceConnectionStatus';
import { cn } from '../design-system/utils';

export interface DashboardMobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  activeTab?: string;
  isAdmin?: boolean;
  showGetStarted?: boolean;
  onSetView: (view: string, tab?: string) => void;
  currentAccountName?: string;
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectAccount?: (id: string) => void;
  selectedBotLabel?: string;
  connectionStatus?: ConnectionState | string;
  onNavigateToInstanceHub?: () => void;
  onSignOut?: () => void;
}

export const DashboardMobileNav: React.FC<DashboardMobileNavProps> = ({
  isOpen,
  onClose,
  activeView,
  activeTab,
  isAdmin = false,
  showGetStarted = true,
  onSetView,
  currentAccountName,
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedBotLabel,
  connectionStatus,
  onNavigateToInstanceHub,
  onSignOut,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    let saved: Record<string, boolean> = {};
    try {
      const item = localStorage.getItem('ca_sidebar_expanded_categories');
      if (item) saved = JSON.parse(item);
    } catch {}
    return saved;
  });

  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>(() => {
    let saved: Record<string, boolean> = {};
    try {
      const item = localStorage.getItem('ca_sidebar_expanded_parents');
      if (item) saved = JSON.parse(item);
    } catch {}
    return {
      admin_tools: activeView === 'admin' || Boolean(saved.admin_tools),
      reports_analytics: activeView === 'analytics' || Boolean(saved.reports_analytics),
      ...saved,
    };
  });

  useEffect(() => {
    if (activeView === 'admin') {
      setExpandedParents((prev) => ({ ...prev, admin_tools: true }));
    } else if (activeView === 'analytics') {
      setExpandedParents((prev) => ({ ...prev, reports_analytics: true }));
    }
  }, [activeView, activeTab]);

  const toggleParent = (parentId: string) => {
    setExpandedParents((prev) => {
      const parentItem = navGroups.flatMap((g) => g.items).find((i) => i.id === parentId);
      const isParentActive = parentItem ? isItemActive(parentItem) : false;
      const currentExpanded = prev[parentId] ?? isParentActive;
      const next = {
        ...prev,
        [parentId]: !currentExpanded,
      };
      try {
        localStorage.setItem('ca_sidebar_expanded_parents', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const navGroups: NavGroup[] = useMemo(
    () => filterNavigationByRole(DASHBOARD_NAVIGATION, isAdmin, showGetStarted),
    [isAdmin, showGetStarted]
  );

  const isItemActive = (item: NavItem): boolean => {
    if (item.children && item.children.length > 0) {
      return item.children.some((child) => isItemActive(child));
    }
    if (item.tab && activeTab) {
      return item.view === activeView && item.tab === activeTab;
    }
    if (item.view === activeView) {
      if (['billing', 'content_library', 'ai', 'settings', 'team', 'security', 'analytics', 'admin', 'departments'].includes(activeView)) {
        return true;
      }
      return !activeTab || !item.tab;
    }
    if (item.view === 'settings' && ['security', 'notifications'].includes(activeView)) {
      return true;
    }
    return false;
  };

  const isGroupActive = (group: NavGroup): boolean => {
    return group.items.some((item) => isItemActive(item));
  };

  const isCategoryExpanded = (groupId: string): boolean => {
    if (expandedCategories[groupId] !== undefined) {
      return expandedCategories[groupId];
    }
    const activeGroup = navGroups.find((group) => isGroupActive(group));
    if (activeGroup && activeGroup.id === groupId) {
      return true;
    }
    if (groupId === 'overview') {
      return true;
    }
    return false;
  };

  const toggleCategory = (groupId: string) => {
    setExpandedCategories((prev) => {
      const isCurrentlyExpanded = isCategoryExpanded(groupId);
      const next = {
        ...prev,
        [groupId]: !isCurrentlyExpanded,
      };
      try {
        localStorage.setItem('ca_sidebar_expanded_categories', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const activeKey = `${activeView}:${activeTab || ''}`;
  const lastActiveKeyRef = useRef<string>('');

  useEffect(() => {
    const activeGroup = navGroups.find((group) => isGroupActive(group));
    if (activeGroup) {
      if (lastActiveKeyRef.current !== activeKey) {
        lastActiveKeyRef.current = activeKey;
        setExpandedCategories((prev) => {
          if (prev[activeGroup.id] === true) return prev;
          const next = { ...prev, [activeGroup.id]: true };
          try {
            localStorage.setItem('ca_sidebar_expanded_categories', JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    }
  }, [activeKey, navGroups]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="left"
      title="BlackArrow Menu"
      footer={
        onSignOut && (
          <Button
            variant="destructive"
            size="sm"
            leadingIcon={<LogOut size={16} />}
            onClick={() => {
              onSignOut();
              onClose();
            }}
            className="w-full justify-center"
          >
            Sign Out
          </Button>
        )
      }
    >
      <div className="space-y-6 pb-4">
        {/* Account & Instance Summary */}
        <div className="p-3 rounded-xl bg-[var(--ca-surface-2)] border border-[var(--ca-border-subtle)] space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
            Workspace Context
          </p>
          <WorkspaceContextSummary
            currentAccountName={currentAccountName}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={(id) => {
              if (onSelectAccount) onSelectAccount(id);
            }}
            selectedBotLabel={selectedBotLabel}
            connectionStatus={connectionStatus}
            onNavigateToInstanceHub={() => {
              if (onNavigateToInstanceHub) onNavigateToInstanceHub();
              onClose();
            }}
          />
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {navGroups.map((group) => {
            const isExpanded = isCategoryExpanded(group.id);

            return (
              <div key={group.id} className={cn('transition-all duration-200', isExpanded ? 'mb-5' : 'mb-1')}>
                <button
                  type="button"
                  onClick={() => toggleCategory(group.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`mobile-category-${group.id}`}
                  className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] rounded-lg transition-all select-none group focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
                >
                  <span className="truncate">{group.title}</span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      'shrink-0 transition-transform duration-200 text-[var(--ca-text-muted)] group-hover:text-[var(--ca-text-primary)]',
                      isExpanded ? 'transform rotate-0' : 'transform -rotate-90'
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isExpanded && (
                  <ul id={`mobile-category-${group.id}`} className="mt-1 space-y-1" role="list">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const hasChildren = Boolean(item.children && item.children.length > 0);

                      if (hasChildren && item.children) {
                        const isParentActive = isItemActive(item);
                        const isParentExpanded = expandedParents[item.id] ?? isParentActive;

                        return (
                          <li key={item.id} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => toggleParent(item.id)}
                              aria-expanded={isParentExpanded}
                              className={cn(
                                'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-left focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]',
                                isParentActive
                                  ? 'bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] border-l-2 border-[var(--ca-brand)] shadow-sm'
                                  : 'text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] border-l-2 border-transparent'
                              )}
                            >
                              <div className="flex items-center gap-3 truncate">
                                <Icon
                                  size={18}
                                  className={cn(
                                    'shrink-0',
                                    isParentActive ? 'text-[var(--ca-brand)]' : 'text-[var(--ca-text-muted)]'
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
                              </div>
                              <div className="shrink-0 text-[var(--ca-text-muted)]">
                                {isParentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </div>
                            </button>
                            {isParentExpanded && (
                              <ul className="pl-4 space-y-1 border-l border-[var(--ca-border-subtle)] ml-4" role="list">
                              {item.children.map((child) => {
                                const ChildIcon = child.icon;
                                const isChildActive = child.tab
                                  ? child.view === activeView && child.tab === activeTab
                                  : child.view === activeView && !activeTab;
                                const childPath = child.path || resolvePathByViewAndTab(child.view, child.tab);

                                return (
                                  <li key={child.id}>
                                    <Link
                                      to={childPath}
                                      onClick={onClose}
                                      aria-current={isChildActive ? 'page' : undefined}
                                      className={cn(
                                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]',
                                        isChildActive
                                          ? 'bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] font-bold shadow-sm'
                                          : 'text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)]'
                                      )}
                                    >
                                      <ChildIcon
                                        size={15}
                                        className={cn(
                                          'shrink-0',
                                          isChildActive ? 'text-[var(--ca-brand)]' : 'text-[var(--ca-text-muted)]'
                                        )}
                                        aria-hidden="true"
                                      />
                                      <span className="truncate">{child.label}</span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                        );
                      }

                      const isActive = isItemActive(item);
                      const itemPath = item.path || resolvePathByViewAndTab(item.view, item.tab);

                      return (
                        <li key={item.id}>
                          <Link
                            to={itemPath}
                            onClick={onClose}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-left focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]',
                              isActive
                                ? 'bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] border-l-2 border-[var(--ca-brand)] shadow-sm'
                                : 'text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] border-l-2 border-transparent'
                            )}
                          >
                            <Icon
                              size={18}
                              className={cn(
                                'shrink-0',
                                isActive ? 'text-[var(--ca-brand)]' : 'text-[var(--ca-text-muted)]'
                              )}
                              aria-hidden="true"
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </Drawer>
  );
};
