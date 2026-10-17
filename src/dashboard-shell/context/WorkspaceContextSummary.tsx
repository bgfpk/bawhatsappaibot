import React from 'react';
import { AccountContextControl, AccountOption } from './AccountContextControl';
import { InstanceContextControl } from './InstanceContextControl';
import { ConnectionState } from '../status/InstanceConnectionStatus';
import { cn } from '../../design-system/utils';

export interface WorkspaceContextSummaryProps {
  currentAccountName?: string;
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectAccount?: (id: string) => void;
  selectedBotLabel?: string;
  connectionStatus?: ConnectionState | string;
  onNavigateToInstanceHub?: () => void;
  className?: string;
}

export const WorkspaceContextSummary: React.FC<WorkspaceContextSummaryProps> = ({
  currentAccountName,
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedBotLabel,
  connectionStatus,
  onNavigateToInstanceHub,
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AccountContextControl
        currentAccountName={currentAccountName}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
      />
      <span className="text-[var(--ca-border-default)] select-none" aria-hidden="true">
        /
      </span>
      <InstanceContextControl
        selectedBotLabel={selectedBotLabel}
        connectionStatus={connectionStatus}
        onNavigateToInstanceHub={onNavigateToInstanceHub}
      />
    </div>
  );
};
