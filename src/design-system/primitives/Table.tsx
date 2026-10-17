import React, { forwardRef } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { cn } from '../utils';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  caption?: string;
}

export const Table: React.FC<TableProps> = ({ children, caption, className, ...props }) => {
  return (
    <div className="w-full overflow-x-auto custom-scrollbar border border-[var(--ca-border-default)] rounded-xl bg-[var(--ca-surface-1)]">
      <table className={cn('w-full text-left text-sm border-collapse', className)} {...props}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
};

export const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, className, ...props }, ref) => (
    <thead ref={ref} className={cn('bg-[var(--ca-surface-2)] border-b border-[var(--ca-border-default)]', className)} {...props}>
      {children}
    </thead>
  )
);
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, className, ...props }, ref) => (
    <tbody ref={ref} className={cn('divide-y divide-[var(--ca-border-subtle)]', className)} {...props}>
      {children}
    </tbody>
  )
);
TableBody.displayName = 'TableBody';

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  isSelected?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ children, isSelected = false, className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'transition-colors hover:bg-[var(--ca-surface-2)]',
        isSelected && 'bg-[var(--ca-selection-bg)] text-[var(--ca-selection-fg)]',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
);
TableRow.displayName = 'TableRow';

export interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortDirection?: 'asc' | 'desc' | false;
  onSort?: () => void;
}

export const TableHeaderCell: React.FC<TableHeaderCellProps> = ({
  children,
  sortDirection,
  onSort,
  className,
  ...props
}) => {
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ca-text-muted)] select-none',
        className
      )}
      {...props}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1.5 hover:text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] rounded p-1"
        >
          <span>{children}</span>
          {sortDirection === 'asc' ? (
            <ArrowUp size={14} className="text-[var(--ca-brand)]" aria-hidden="true" />
          ) : sortDirection === 'desc' ? (
            <ArrowDown size={14} className="text-[var(--ca-brand)]" aria-hidden="true" />
          ) : (
            <ArrowUpDown size={14} className="text-[var(--ca-text-faint)]" aria-hidden="true" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
};

export const TableCell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ children, className, ...props }, ref) => (
    <td ref={ref} className={cn('px-4 py-3.5 text-[var(--ca-text-primary)] align-middle', className)} {...props}>
      {children}
    </td>
  )
);
TableCell.displayName = 'TableCell';

export const TableEmptyRow: React.FC<{ colSpan: number; message?: string }> = ({
  colSpan,
  message = 'No data available',
}) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[var(--ca-text-muted)]">
      {message}
    </td>
  </tr>
);

export const TableLoadingRow: React.FC<{ colSpan: number; label?: string }> = ({
  colSpan,
  label = 'Loading data...',
}) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-[var(--ca-text-muted)]">
      <div className="inline-flex items-center gap-2" role="status" aria-label={label}>
        <Loader2 size={18} className="animate-spin text-[var(--ca-brand)]" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </td>
  </tr>
);
