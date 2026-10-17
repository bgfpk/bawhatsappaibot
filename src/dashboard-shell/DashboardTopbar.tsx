import React from 'react';
import { Menu } from 'lucide-react';
import { DashboardBreadcrumbs } from './DashboardBreadcrumbs';
import { WorkspaceContextSummary } from './context/WorkspaceContextSummary';
import { AccountOption } from './context/AccountContextControl';
import { UserMenu } from './user/UserMenu';
import { ConnectionState } from './status/InstanceConnectionStatus';
import { cn } from '../design-system/utils';

export interface DashboardTopbarProps {
  activeView: string;
  activeTab?: string;
  onSetView: (view: string, tab?: string) => void;
  onOpenMobileNav: () => void;
  currentAccountName?: string;
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectAccount?: (id: string) => void;
  selectedBotLabel?: string;
  connectionStatus?: ConnectionState | string;
  onNavigateToInstanceHub?: () => void;
  currentUser?: any;
  isAdmin?: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onSignOut?: () => void;
  notificationCenter?: React.ReactNode;
  className?: string;
}

export const DashboardTopbar: React.FC<DashboardTopbarProps> = ({
  activeView,
  activeTab,
  onSetView,
  onOpenMobileNav,
  currentAccountName,
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedBotLabel,
  connectionStatus,
  onNavigateToInstanceHub,
  currentUser,
  isAdmin = false,
  isDarkMode = true,
  onToggleDarkMode,
  onSignOut,
  notificationCenter,
  className,
}) => {
  return (
    <header
      className={cn(
        'h-16 px-4 md:px-6 bg-[var(--ca-surface-1)] border-b border-[var(--ca-border-default)] flex items-center justify-between gap-4 sticky top-0 z-[var(--ca-z-header)] select-none shrink-0',
        className
      )}
    >
      {/* Left: Mobile Nav Trigger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open Navigation Menu"
          title="Open Menu"
          className="lg:hidden p-2 rounded-lg bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-3)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] shrink-0"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <DashboardBreadcrumbs
          activeView={activeView}
          activeTab={activeTab}
          onSetView={onSetView}
        />
      </div>

      {/* Right: Workspace Context, Notifications & User Profile Menu */}
      <div className="flex items-center gap-3 shrink-0">
        <WorkspaceContextSummary
          currentAccountName={currentAccountName}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={onSelectAccount}
          selectedBotLabel={selectedBotLabel}
          connectionStatus={connectionStatus}
          onNavigateToInstanceHub={onNavigateToInstanceHub}
          className="hidden sm:flex"
        />

        {notificationCenter && <div className="shrink-0">{notificationCenter}</div>}

        <UserMenu
          currentUser={currentUser}
          isAdmin={isAdmin}
          isDarkMode={isDarkMode}
          onToggleDarkMode={onToggleDarkMode}
          onNavigateToSettings={() => onSetView('settings')}
          onNavigateToAdmin={() => onSetView('admin')}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
};
