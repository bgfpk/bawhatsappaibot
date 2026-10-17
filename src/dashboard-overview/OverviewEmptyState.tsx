import React from "react";
import { Activity } from "lucide-react";

export interface OverviewEmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const OverviewEmptyState: React.FC<OverviewEmptyStateProps> = ({
  title = "No Recent Activity Recorded",
  description = "New WhatsApp customer events, bot auto-replies, and system events will appear here automatically.",
  icon: Icon = Activity,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-8 text-center shadow-sm">
      <div className="rounded-full bg-[var(--ca-surface-3)] p-3 text-[var(--ca-text-muted)] mb-3">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-bold text-[var(--ca-text-primary)]">{title}</h4>
      <p className="mt-1 text-xs text-[var(--ca-text-secondary)] max-w-sm">{description}</p>
    </div>
  );
};
