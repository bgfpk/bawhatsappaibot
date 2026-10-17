import React from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { Popover } from '../../design-system/primitives';
import { cn } from '../../design-system/utils';

export interface AccountOption {
  id: string;
  name: string;
  plan?: string;
  isPrimary?: boolean;
}

export interface AccountContextControlProps {
  currentAccountName?: string;
  accounts?: AccountOption[];
  selectedAccountId?: string;
  onSelectAccount?: (id: string) => void;
  className?: string;
}

export const AccountContextControl: React.FC<AccountContextControlProps> = ({
  currentAccountName = 'Primary Workspace',
  accounts = [],
  selectedAccountId,
  onSelectAccount,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const hasMultipleAccounts = accounts.length > 1;

  if (!hasMultipleAccounts) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--ca-surface-2)] border border-[var(--ca-border-subtle)] text-xs text-[var(--ca-text-primary)] font-medium select-none',
          className
        )}
        title={`Account: ${currentAccountName}`}
      >
        <Building2 size={14} className="text-[var(--ca-brand)] shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[140px] font-semibold">{currentAccountName}</span>
      </div>
    );
  }

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      ariaLabel="Select Account Workspace"
      trigger={
        <button
          type="button"
          aria-label={`Select Account. Current: ${currentAccountName}`}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--ca-surface-2)] hover:bg-[var(--ca-surface-3)] border border-[var(--ca-border-default)] text-xs text-[var(--ca-text-primary)] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]',
            className
          )}
        >
          <Building2 size={14} className="text-[var(--ca-brand)] shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[130px] font-semibold">{currentAccountName}</span>
          <ChevronDown size={14} className="text-[var(--ca-text-muted)] shrink-0 ml-0.5" aria-hidden="true" />
        </button>
      }
    >
      <div className="w-56 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)] px-1">
          Switch Account
        </p>
        <div className="space-y-1" role="menu">
          {accounts.map((account) => {
            const isSelected = account.id === selectedAccountId;
            return (
              <button
                key={account.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (onSelectAccount) onSelectAccount(account.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md transition-colors text-left',
                  isSelected
                    ? 'bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] font-semibold'
                    : 'text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)]'
                )}
              >
                <div className="truncate pr-2">
                  <p className="truncate font-medium">{account.name}</p>
                  {account.plan && (
                    <p className="text-[10px] text-[var(--ca-text-muted)]">{account.plan}</p>
                  )}
                </div>
                {isSelected && <Check size={14} className="shrink-0 text-[var(--ca-brand)]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
};
