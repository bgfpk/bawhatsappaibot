import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, LogOut, ChevronDown, ChevronRight } from 'lucide-react';
import { DASHBOARD_NAVIGATION, NavGroup, NavItem } from './navigation-config';
import { filterNavigationByRole } from './navigation-utils';
import { resolvePathByViewAndTab } from '../app/dashboard-route-registry';
import { Tooltip } from '../design-system/primitives';
import { BrandLogo } from '../components/BrandLogo';
import { cn } from '../design-system/utils';

export interface DashboardSidebarProps {
  activeView: string;
  activeTab?: string;
  isAdmin?: boolean;
  showGetStarted?: boolean;
  onSetView: (view: string, tab?: string) => void;
  onSignOut?: () => void;
  className?: string;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeView,
  activeTab,
  isAdmin = false,
  showGetStarted = true,
  onSetView,
  onSignOut,
  className,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ca_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

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

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('ca_sidebar_collapsed', String(next));
    } catch {}
  };

  const toggleParent = (parentId: string, defaultView: string, defaultTab?: string) => {
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
    if (activeView !== defaultView || (defaultTab && activeTab !== defaultTab)) {
      onSetView(defaultView, defaultTab);
    }
  };

  const navGroups: NavGroup[] = React.useMemo(
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
  const lastActiveKeyRef = React.useRef<string>('');

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
    <aside
      aria-label="Main Navigation Sidebar"
      className={cn(
        'hidden lg:flex flex-col bg-[var(--ca-surface-1)] border-r border-[var(--ca-border-default)] transition-all duration-200 ease-in-out h-full max-h-screen z-[var(--ca-z-header)] select-none shrink-0 overflow-hidden',
        isCollapsed ? 'w-[var(--ca-layout-sidebar-collapsed)]' : 'w-[var(--ca-layout-sidebar-expanded)]',
        className
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--ca-border-subtle)] shrink-0">
        <a href="/" aria-label="BlackArrow home" className="flex items-center gap-3 overflow-hidden transition-opacity hover:opacity-80">
          <BrandLogo imageClassName={isCollapsed ? 'h-7 w-auto' : 'h-9 w-auto'} />
        </a>
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] rounded-lg hover:bg-[var(--ca-surface-2)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] shrink-0"
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation Group Items */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
        {navGroups.map((group) => {
          const isExpanded = isCategoryExpanded(group.id);

          return (
            <div key={group.id} className={cn('transition-all duration-200', isExpanded ? 'mb-5' : 'mb-1')}>
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleCategory(group.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`sidebar-category-${group.id}`}
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
              )}
              {(!isCollapsed ? isExpanded : true) && (
                <ul id={`sidebar-category-${group.id}`} className="mt-1 space-y-1" role="list">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const hasChildren = Boolean(item.children && item.children.length > 0);
                    const isActive = isItemActive(item);
                    const itemPath = item.path || resolvePathByViewAndTab(item.view, item.tab);

                    if (hasChildren && item.children) {
                      const isParentActive = isItemActive(item);
                      const isParentExpanded = expandedParents[item.id] ?? isParentActive;

                      const parentButton = (
                        <button
                          type="button"
                          onClick={() => toggleParent(item.id, item.children![0].view, item.children![0].tab)}
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
                            {!isCollapsed && <span className="truncate">{item.label}</span>}
                          </div>
                          {!isCollapsed && (
                            <div className="shrink-0 text-[var(--ca-text-muted)]">
                              {isParentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                          )}
                        </button>
                      );

                      return (
                        <li key={item.id} className="space-y-1">
                          {isCollapsed ? (
                            <Tooltip content={item.label} position="right">
                              {parentButton}
                            </Tooltip>
                          ) : (
                            parentButton
                          )}

                          {/* Render Children */}
                          {isParentExpanded && !isCollapsed && (
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

                    const linkContent = (
                      <Link
                        to={itemPath}
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
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );

                    return (
                      <li key={item.id}>
                        {isCollapsed ? (
                          <Tooltip content={item.label} position="right">
                            {linkContent}
                          </Tooltip>
                        ) : (
                          linkContent
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Sign Out Action */}
      {onSignOut && (
        <div className="p-3 border-t border-[var(--ca-border-subtle)] shrink-0">
          {isCollapsed ? (
            <Tooltip content="Sign Out" position="right">
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign Out"
                className="w-full flex items-center justify-center p-2.5 rounded-lg text-[var(--ca-danger-text)] hover:bg-[var(--ca-danger-soft)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
              >
                <LogOut size={18} aria-hidden="true" />
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-[var(--ca-danger-text)] hover:bg-[var(--ca-danger-soft)] transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
            >
              <LogOut size={18} className="shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
};
