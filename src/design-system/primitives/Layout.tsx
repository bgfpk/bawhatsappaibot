import React from 'react';
import { cn } from '../utils';

/* ==========================================
 * SURFACE / CARD
 * ========================================== */

export type SurfaceLevel = 0 | 1 | 2 | 3 | 4 | 'elevated';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: SurfaceLevel;
  interactive?: boolean;
}

export const Surface: React.FC<SurfaceProps> = ({ children, level = 1, interactive = false, className, ...props }) => {
  const levelStyles: Record<SurfaceLevel, string> = {
    0: 'bg-[var(--ca-surface-0)] border-[var(--ca-border-subtle)]',
    1: 'bg-[var(--ca-surface-1)] border-[var(--ca-border-default)] shadow-[var(--ca-shadow-flat)]',
    2: 'bg-[var(--ca-surface-2)] border-[var(--ca-border-default)]',
    3: 'bg-[var(--ca-surface-3)] border-[var(--ca-border-strong)]',
    4: 'bg-[var(--ca-surface-4)] border-[var(--ca-border-strong)]',
    elevated: 'bg-[var(--ca-surface-elevated)] border-[var(--ca-border-default)] shadow-[var(--ca-shadow-raised)]',
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-solid transition-colors',
        levelStyles[level],
        interactive && 'hover:border-[var(--ca-border-strong)] cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/* ==========================================
 * STACK (FLEX COLUMN)
 * ========================================== */

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10;
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export const Stack: React.FC<StackProps> = ({ children, gap = 4, align = 'stretch', className, ...props }) => {
  const gapMap: Record<number, string> = {
    1: 'gap-1',
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    5: 'gap-5',
    6: 'gap-6',
    8: 'gap-8',
    10: 'gap-10',
  };

  const alignMap: Record<string, string> = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  };

  return (
    <div className={cn('flex flex-col', gapMap[gap], alignMap[align], className)} {...props}>
      {children}
    </div>
  );
};

/* ==========================================
 * INLINE (FLEX ROW)
 * ========================================== */

export interface InlineProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8;
  align?: 'start' | 'center' | 'end' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

export const Inline: React.FC<InlineProps> = ({
  children,
  gap = 3,
  align = 'center',
  justify = 'start',
  wrap = true,
  className,
  ...props
}) => {
  const gapMap: Record<number, string> = {
    1: 'gap-1',
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    5: 'gap-5',
    6: 'gap-6',
    8: 'gap-8',
  };

  const alignMap: Record<string, string> = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    baseline: 'items-baseline',
  };

  const justifyMap: Record<string, string> = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
  };

  return (
    <div
      className={cn(
        'flex',
        wrap ? 'flex-wrap' : 'flex-nowrap',
        gapMap[gap],
        alignMap[align],
        justifyMap[justify],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/* ==========================================
 * DIVIDER
 * ========================================== */

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({ orientation = 'horizontal', className }) => {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('w-px self-stretch bg-[var(--ca-border-default)] my-1', className)}
      />
    );
  }

  return (
    <hr
      role="separator"
      className={cn('w-full border-0 h-px bg-[var(--ca-border-default)] my-4', className)}
    />
  );
};

/* ==========================================
 * PAGE HEADING
 * ========================================== */

export interface PageHeadingProps {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeading: React.FC<PageHeadingProps> = ({ title, eyebrow, description, actions, className }) => {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--ca-border-subtle)]', className)}>
      <div className="flex flex-col gap-1">
        {eyebrow && (
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--ca-brand)]">{eyebrow}</span>
        )}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ca-text-primary)] leading-tight">
          {title}
        </h1>
        {description && <p className="text-sm text-[var(--ca-text-muted)] max-w-2xl mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
};

/* ==========================================
 * SECTION HEADING
 * ========================================== */

export interface SectionHeadingProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({ title, description, actions, className }) => {
  return (
    <div className={cn('flex items-center justify-between gap-4 my-3', className)}>
      <div>
        <h2 className="text-base font-bold text-[var(--ca-text-primary)]">{title}</h2>
        {description && <p className="text-xs text-[var(--ca-text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};

/* ==========================================
 * TOOLBAR
 * ========================================== */

export const Toolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  return (
    <div
      role="toolbar"
      aria-label="Action Toolbar"
      className={cn('flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--ca-surface-1)] border border-[var(--ca-border-default)] rounded-xl', className)}
    >
      {children}
    </div>
  );
};

/* ==========================================
 * METRIC TILE
 * ========================================== */

export interface MetricTileProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  className?: string;
}

export const MetricTile: React.FC<MetricTileProps> = ({ label, value, subtext, icon, trend, className }) => {
  return (
    <Surface level={1} className={cn('p-5 flex flex-col gap-2 relative overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ca-text-muted)]">{label}</span>
        {icon && <div className="text-[var(--ca-brand)]" aria-hidden="true">{icon}</div>}
      </div>
      <div className="text-3xl font-bold tracking-tight text-[var(--ca-text-primary)] tabular-nums">{value}</div>
      {(subtext || trend) && (
        <div className="flex items-center gap-2 text-xs text-[var(--ca-text-muted)] mt-1">
          {trend && (
            <span
              className={cn(
                'font-semibold px-1.5 py-0.5 rounded',
                trend.isPositive ? 'bg-[var(--ca-success-soft)] text-[var(--ca-success)]' : 'bg-[var(--ca-danger-soft)] text-[var(--ca-danger)]'
              )}
            >
              {trend.value}
            </span>
          )}
          {subtext && <span>{subtext}</span>}
        </div>
      )}
    </Surface>
  );
};
