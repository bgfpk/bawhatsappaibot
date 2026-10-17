import React from 'react';
import { CheckCircle2, Loader2, QrCode, AlertCircle, PauseCircle, WifiOff } from 'lucide-react';
import { cn } from '../../design-system/utils';

export type ConnectionState =
  | 'Connected'
  | 'Connecting'
  | 'QR Required'
  | 'Disconnected'
  | 'Error'
  | 'Paused'
  | 'Unknown';

export interface InstanceConnectionStatusProps {
  status: ConnectionState | string;
  showIcon?: boolean;
  className?: string;
}

export const InstanceConnectionStatus: React.FC<InstanceConnectionStatusProps> = ({
  status,
  showIcon = true,
  className,
}) => {
  const normStatus = (status || 'Disconnected').trim();

  let icon = <CheckCircle2 size={14} className="shrink-0 text-[var(--ca-success)]" aria-hidden="true" />;
  let badgeStyle = 'bg-[var(--ca-success-soft)] text-[var(--ca-success)] border-[var(--ca-success-soft)]';
  let ariaLabel = `Status: ${normStatus}`;

  if (normStatus === 'Connecting') {
    icon = <Loader2 size={14} className="shrink-0 animate-spin text-[var(--ca-warning)]" aria-hidden="true" />;
    badgeStyle = 'bg-[var(--ca-warning-soft)] text-[var(--ca-warning)] border-[var(--ca-warning-soft)]';
  } else if (normStatus === 'QR Required' || normStatus === 'QR Code Required') {
    icon = <QrCode size={14} className="shrink-0 text-[var(--ca-brand)]" aria-hidden="true" />;
    badgeStyle = 'bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] border-[var(--ca-brand-soft)]';
  } else if (normStatus === 'Disconnected') {
    icon = <WifiOff size={14} className="shrink-0 text-[var(--ca-text-muted)]" aria-hidden="true" />;
    badgeStyle = 'bg-[var(--ca-surface-3)] text-[var(--ca-text-secondary)] border-[var(--ca-border-subtle)]';
  } else if (normStatus === 'Error' || normStatus === 'Failed') {
    icon = <AlertCircle size={14} className="shrink-0 text-[var(--ca-danger-text)]" aria-hidden="true" />;
    badgeStyle = 'bg-[var(--ca-danger-soft)] text-[var(--ca-danger-text)] border-[var(--ca-danger-soft)]';
  } else if (normStatus === 'Paused') {
    icon = <PauseCircle size={14} className="shrink-0 text-[var(--ca-warning)]" aria-hidden="true" />;
    badgeStyle = 'bg-[var(--ca-warning-soft)] text-[var(--ca-warning)] border-[var(--ca-warning-soft)]';
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border border-solid select-none transition-colors',
        badgeStyle,
        className
      )}
    >
      {showIcon && icon}
      <span>{normStatus}</span>
    </span>
  );
};
