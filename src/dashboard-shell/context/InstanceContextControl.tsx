import React from 'react';
import { Radio, ChevronRight, Plus } from 'lucide-react';
import { InstanceConnectionStatus, ConnectionState } from '../status/InstanceConnectionStatus';
import { cn } from '../../design-system/utils';

export interface InstanceContextControlProps {
  selectedBotLabel?: string;
  connectionStatus?: ConnectionState | string;
  onNavigateToInstanceHub?: () => void;
  className?: string;
}

export const InstanceContextControl: React.FC<InstanceContextControlProps> = ({
  selectedBotLabel,
  connectionStatus = 'Disconnected',
  onNavigateToInstanceHub,
  className,
}) => {
  const hasInstance = Boolean(selectedBotLabel && selectedBotLabel.trim() !== '');

  if (!hasInstance) {
    return (
      <button
        type="button"
        onClick={onNavigateToInstanceHub}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--ca-danger-soft)] hover:bg-[var(--ca-danger-soft)]/80 border border-[var(--ca-danger-soft)] text-xs text-[var(--ca-danger-text)] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] select-none',
          className
        )}
        title="No WhatsApp Instance Connected. Click to Connect Number."
      >
        <Plus size={14} className="shrink-0 text-[var(--ca-danger-text)]" aria-hidden="true" />
        <span>Connect WhatsApp</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onNavigateToInstanceHub}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--ca-surface-2)] hover:bg-[var(--ca-surface-3)] border border-[var(--ca-border-default)] text-xs text-[var(--ca-text-primary)] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] select-none max-w-[260px]',
        className
      )}
      title={`Instance: ${selectedBotLabel} (${connectionStatus})`}
    >
      <Radio size={14} className="text-[var(--ca-brand)] shrink-0" aria-hidden="true" />
      <span className="truncate max-w-[110px] font-semibold">{selectedBotLabel}</span>
      <InstanceConnectionStatus status={connectionStatus} showIcon={false} />
      <ChevronRight size={12} className="text-[var(--ca-text-muted)] shrink-0 ml-0.5" aria-hidden="true" />
    </button>
  );
};
