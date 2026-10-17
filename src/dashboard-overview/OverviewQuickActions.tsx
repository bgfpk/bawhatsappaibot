import React from "react";
import {
  Bot,
  CalendarClock,
  ChevronRight,
  MessageSquare,
  Package,
  Puzzle,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import type { OverviewQuickAction } from "./overview-model";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare,
  Smartphone,
  Bot,
  Package,
  Users,
  CalendarClock,
  Puzzle,
  Wallet,
};

export interface OverviewQuickActionsProps {
  actions: OverviewQuickAction[];
  onNavigate: (targetView: string, aiTab?: string, billingTab?: string) => void;
}

export const OverviewQuickActions: React.FC<OverviewQuickActionsProps> = ({
  actions,
  onNavigate,
}) => {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => {
          const Icon = ICON_MAP[action.iconName] || MessageSquare;

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onNavigate(action.targetView, action.aiTab, action.billingTab)}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3.5 text-left transition-all hover:border-[var(--ca-brand)] hover:bg-[var(--ca-surface-2)] shadow-sm group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-lg bg-[var(--ca-surface-3)] p-2 text-[var(--ca-text-primary)] group-hover:bg-[var(--ca-brand-soft)] group-hover:text-[var(--ca-brand)] transition-colors">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--ca-text-primary)] truncate">
                    {action.label}
                  </div>
                  <div className="text-[11px] text-[var(--ca-text-secondary)] truncate">
                    {action.description}
                  </div>
                </div>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[var(--ca-text-muted)] group-hover:text-[var(--ca-brand)] transition-colors"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
