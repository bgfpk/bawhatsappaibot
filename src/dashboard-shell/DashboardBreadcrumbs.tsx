import React from 'react';
import { ChevronRight } from 'lucide-react';
import { getBreadcrumbSteps, BreadcrumbStep } from './navigation-utils';
import { cn } from '../design-system/utils';

export interface DashboardBreadcrumbsProps {
  activeView: string;
  activeTab?: string;
  onSetView?: (view: string, tab?: string) => void;
  className?: string;
}

export const DashboardBreadcrumbs: React.FC<DashboardBreadcrumbsProps> = ({
  activeView,
  activeTab,
  onSetView,
  className,
}) => {
  const steps: BreadcrumbStep[] = getBreadcrumbSteps(activeView, activeTab);

  if (steps.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-xs text-[var(--ca-text-muted)]', className)}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;

          return (
            <li key={`${step.label}-${index}`} className="inline-flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight size={12} className="text-[var(--ca-text-faint)] shrink-0" aria-hidden="true" />
              )}
              {step.isCurrent ? (
                <span
                  aria-current="page"
                  className="font-semibold text-[var(--ca-text-primary)] tracking-tight"
                >
                  {step.label}
                </span>
              ) : step.view && onSetView ? (
                <button
                  type="button"
                  onClick={() => onSetView(step.view!, step.tab)}
                  className="hover:text-[var(--ca-text-primary)] transition-colors focus:outline-none focus:underline"
                >
                  {step.label}
                </button>
              ) : (
                <span>{step.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
