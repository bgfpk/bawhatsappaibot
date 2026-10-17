import React from 'react';
import { Loader2, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { cn, STATUS_MAP, StatusType } from '../utils';
import { STATUS_ICONS } from '../icons';

/* ==========================================
 * BADGE / CHIP
 * ========================================== */

export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ children, tone = 'neutral', icon, className, ...props }) => {
  const toneStyles: Record<BadgeTone, string> = {
    brand: 'bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] border-[var(--ca-brand-soft)]',
    success: 'bg-[var(--ca-success-soft)] text-[var(--ca-success)] border-transparent',
    warning: 'bg-[var(--ca-warning-soft)] text-[var(--ca-warning)] border-transparent',
    danger: 'bg-[var(--ca-danger-soft)] text-[var(--ca-danger-text)] border-transparent',
    info: 'bg-[var(--ca-info-soft)] text-[var(--ca-info)] border-transparent',
    neutral: 'bg-[var(--ca-surface-3)] text-[var(--ca-text-secondary)] border-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border border-solid select-none',
        toneStyles[tone],
        className
      )}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};

/* ==========================================
 * ACCESSIBLE STATUS INDICATOR
 * ========================================== */

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusType;
  showIcon?: boolean;
  labelOverride?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  showIcon = true,
  labelOverride,
  className,
  ...props
}) => {
  const meta = STATUS_MAP[status] || STATUS_MAP.Inactive;
  const IconComponent = STATUS_ICONS[status] || CheckCircle2;
  const labelText = labelOverride || meta.label;

  const toneMap: Record<string, string> = {
    success: 'text-[var(--ca-success)]',
    warning: 'text-[var(--ca-warning)]',
    danger: 'text-[var(--ca-danger-text)]',
    info: 'text-[var(--ca-info)]',
    muted: 'text-[var(--ca-text-muted)]',
  };

  return (
    <div
      role="status"
      aria-label={meta.ariaLabel}
      className={cn('inline-flex items-center gap-2 text-xs font-medium', toneMap[meta.tone], className)}
      {...props}
    >
      {showIcon && (
        <IconComponent
          size={14}
          className={cn('shrink-0', status === 'Connecting' && 'animate-spin')}
          aria-hidden="true"
        />
      )}
      <span>{labelText}</span>
    </div>
  );
};

/* ==========================================
 * ALERT
 * ========================================== */

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  severity?: AlertSeverity;
  title?: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  severity = 'info',
  title,
  onClose,
  className,
  ...props
}) => {
  const isInterruption = severity === 'error' || severity === 'warning';
  const role = isInterruption ? 'alert' : 'region';

  const severityStyles: Record<AlertSeverity, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    info: {
      bg: 'bg-[var(--ca-info-soft)]',
      border: 'border-[var(--ca-info)]',
      text: 'text-[var(--ca-info-fg)]',
      icon: <Info size={18} className="text-[var(--ca-info)]" aria-hidden="true" />,
    },
    success: {
      bg: 'bg-[var(--ca-success-soft)]',
      border: 'border-[var(--ca-success)]',
      text: 'text-[var(--ca-success-fg)]',
      icon: <CheckCircle2 size={18} className="text-[var(--ca-success)]" aria-hidden="true" />,
    },
    warning: {
      bg: 'bg-[var(--ca-warning-soft)]',
      border: 'border-[var(--ca-warning)]',
      text: 'text-[var(--ca-warning-fg)]',
      icon: <AlertTriangle size={18} className="text-[var(--ca-warning)]" aria-hidden="true" />,
    },
    error: {
      bg: 'bg-[var(--ca-danger-soft)]',
      border: 'border-[var(--ca-danger)]',
      text: 'text-[var(--ca-danger-fg)]',
      icon: <AlertCircle size={18} className="text-[var(--ca-danger)]" aria-hidden="true" />,
    },
  };

  const style = severityStyles[severity];

  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border border-solid',
        style.bg,
        style.border,
        style.text,
        className
      )}
      {...props}
    >
      <div className="shrink-0 mt-0.5">{style.icon}</div>
      <div className="flex-1 text-sm leading-relaxed">
        {title && <div className="font-semibold text-base mb-1">{title}</div>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          className="shrink-0 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] p-1 rounded focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
        >
          &times;
        </button>
      )}
    </div>
  );
};

/* ==========================================
 * INLINE NOTICE
 * ========================================== */

export const InlineNotice: React.FC<{ tone?: BadgeTone; children: React.ReactNode; className?: string }> = ({
  tone = 'neutral',
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        'text-xs px-3 py-2 rounded-md bg-[var(--ca-surface-2)] text-[var(--ca-text-secondary)] border border-[var(--ca-border-subtle)] flex items-center gap-2',
        className
      )}
    >
      <span>{children}</span>
    </div>
  );
};

/* ==========================================
 * PROGRESS BAR
 * ========================================== */

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  label?: string;
}

export const ProgressIndicator: React.FC<ProgressProps> = ({ value, label, className, ...props }) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('w-full flex flex-col gap-1.5', className)} {...props}>
      {label && (
        <div className="flex justify-between text-xs text-[var(--ca-text-muted)] font-medium">
          <span>{label}</span>
          <span>{clampedValue}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
        className="w-full h-2 bg-[var(--ca-surface-3)] rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-[var(--ca-brand)] transition-all duration-300 ease-out"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
};

/* ==========================================
 * SKELETON (HIDDEN FROM ACCESSIBILITY TREE)
 * ========================================== */

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse bg-[var(--ca-skeleton-bg)] rounded-md select-none', className)}
    />
  );
};

/* ==========================================
 * EMPTY STATE
 * ========================================== */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action, className }) => {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-[var(--ca-border-default)] bg-[var(--ca-surface-1)]', className)}>
      {icon && <div className="mb-4 text-[var(--ca-text-muted)]" aria-hidden="true">{icon}</div>}
      <h3 className="text-base font-semibold text-[var(--ca-text-primary)] mb-1">{title}</h3>
      {description && <p className="text-sm text-[var(--ca-text-muted)] max-w-sm mb-6 leading-relaxed">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
};

/* ==========================================
 * ERROR STATE
 * ========================================== */

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  className,
}) => {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-[var(--ca-danger)] bg-[var(--ca-surface-1)]',
        className
      )}
    >
      <AlertCircle size={32} className="text-[var(--ca-danger)] mb-3" aria-hidden="true" />
      <h3 className="text-base font-semibold text-[var(--ca-text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--ca-text-muted)] max-w-md mb-6 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ca-surface-2)] hover:bg-[var(--ca-surface-3)] text-[var(--ca-text-primary)] border border-[var(--ca-border-default)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
        >
          Try Again
        </button>
      )}
    </div>
  );
};

/* ==========================================
 * LOADING STATE
 * ========================================== */

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Loading content...', className }) => {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('flex flex-col items-center justify-center p-12 gap-3 text-[var(--ca-text-muted)]', className)}
    >
      <Loader2 size={24} className="animate-spin text-[var(--ca-brand)]" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
};
