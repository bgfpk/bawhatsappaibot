import React from 'react';
import { PageHeading } from '../design-system/primitives';
import { cn } from '../design-system/utils';

export interface DashboardPageFrameProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  metadata?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const DashboardPageFrame: React.FC<DashboardPageFrameProps> = ({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
  metadata,
  fullWidth = false,
  children,
  className,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full max-h-screen overflow-hidden bg-[var(--ca-canvas-0)] relative">
      {/* Accessibility Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[var(--ca-z-alert)] focus:px-4 focus:py-2 focus:bg-[var(--ca-brand)] focus:text-[var(--ca-brand-fg)] focus:font-bold focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 space-y-6 focus:outline-none min-h-0',
          fullWidth ? 'max-w-none' : 'max-w-[var(--ca-layout-content-max-width)] mx-auto w-full',
          className
        )}
      >
        {/* Optional Page Header Slot */}
        {title && (
          <div className="space-y-2 pb-2 border-b border-[var(--ca-border-subtle)]">
            {breadcrumbs && <div className="mb-2">{breadcrumbs}</div>}
            <PageHeading
              eyebrow={eyebrow}
              title={title}
              description={description}
              actions={
                <div className="flex items-center gap-3 flex-wrap">
                  {metadata}
                  {actions}
                </div>
              }
            />
          </div>
        )}

        {/* Content Slot */}
        <div className="min-w-0">{children}</div>
      </main>
    </div>
  );
};
