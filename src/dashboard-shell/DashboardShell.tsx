import React, { useState } from 'react';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardTopbar } from './DashboardTopbar';
import { DashboardMobileNav } from './DashboardMobileNav';
import { DashboardPageFrame } from './DashboardPageFrame';
import { AccountOption } from './context/AccountContextControl';
import { ConnectionState } from './status/InstanceConnectionStatus';
import { cn } from '../design-system/utils';

export interface DashboardShellProps {
  activeView: string;
  activeTab?: string;
  onSetView: (view: string, tab?: string) => void;
  currentAccountName?: string;
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectAccount?: (id: string) => void;
  selectedBotLabel?: string;
  connectionStatus?: ConnectionState | string;
  onNavigateToInstanceHub?: () => void;
  currentUser?: any;
  isAdmin?: boolean;
  showGetStarted?: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onSignOut?: () => void;
  notificationCenter?: React.ReactNode;
  pageTitle?: string;
  pageEyebrow?: string;
  pageDescription?: string;
  pageActions?: React.ReactNode;
  fullWidthContent?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  activeView,
  activeTab,
  onSetView,
  currentAccountName,
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedBotLabel,
  connectionStatus,
  onNavigateToInstanceHub,
  currentUser,
  isAdmin = false,
  showGetStarted = true,
  isDarkMode = true,
  onToggleDarkMode,
  onSignOut,
  notificationCenter,
  pageTitle,
  pageEyebrow,
  pageDescription,
  pageActions,
  fullWidthContent = false,
  children,
  className,
}) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className={cn('dashboard-shell flex h-screen max-h-screen w-full overflow-hidden bg-[var(--ca-canvas-0)] text-[var(--ca-text-primary)]', className)}>
      {/* Desktop Navigation Sidebar */}
      <DashboardSidebar
        activeView={activeView}
        activeTab={activeTab}
        isAdmin={isAdmin}
        showGetStarted={showGetStarted}
        onSetView={onSetView}
        onSignOut={onSignOut}
      />

      {/* Responsive Mobile Navigation Drawer */}
      <DashboardMobileNav
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        activeView={activeView}
        activeTab={activeTab}
        isAdmin={isAdmin}
        showGetStarted={showGetStarted}
        onSetView={onSetView}
        currentAccountName={currentAccountName}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
        selectedBotLabel={selectedBotLabel}
        connectionStatus={connectionStatus}
        onNavigateToInstanceHub={onNavigateToInstanceHub}
        onSignOut={onSignOut}
      />

      {/* Main Content Area Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full max-h-screen overflow-hidden">
        {/* Top Header Bar */}
        <DashboardTopbar
          activeView={activeView}
          activeTab={activeTab}
          onSetView={onSetView}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          currentAccountName={currentAccountName}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={onSelectAccount}
          selectedBotLabel={selectedBotLabel}
          connectionStatus={connectionStatus}
          onNavigateToInstanceHub={onNavigateToInstanceHub}
          currentUser={currentUser}
          isAdmin={isAdmin}
          isDarkMode={isDarkMode}
          onToggleDarkMode={onToggleDarkMode}
          onSignOut={onSignOut}
          notificationCenter={notificationCenter}
        />

        {/* Page Frame & Main Content */}
        <DashboardPageFrame
          title={pageTitle}
          eyebrow={pageEyebrow}
          description={pageDescription}
          actions={pageActions}
          fullWidth={fullWidthContent}
        >
          {children}
        </DashboardPageFrame>
      </div>
    </div>
  );
};
