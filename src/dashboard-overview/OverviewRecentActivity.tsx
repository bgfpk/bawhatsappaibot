import React from "react";
import { Activity, Clock } from "lucide-react";
import type { OverviewActivityItem } from "./overview-model";
import { OverviewEmptyState } from "./OverviewEmptyState";
import { ToneBadge } from "../components/dashboard/DashboardPrimitives";

export interface OverviewRecentActivityProps {
  activities: OverviewActivityItem[];
}

function formatTimestamp(ts: string | number) {
  if (!ts) return "Just now";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Recently";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const OverviewRecentActivity: React.FC<OverviewRecentActivityProps> = ({
  activities,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--ca-brand)]" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
          Recent Activity
        </h3>
      </div>

      {!activities || activities.length === 0 ? (
        <OverviewEmptyState />
      ) : (
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] divide-y divide-[var(--ca-border-subtle)] shadow-sm">
          {activities.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 p-4">
              <div className="flex items-start gap-3 min-w-0">
                <ToneBadge tone={item.tone || "neutral"}>
                  {item.category || "Event"}
                </ToneBadge>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--ca-text-primary)] truncate">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-[11px] text-[var(--ca-text-secondary)] line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[11px] text-[var(--ca-text-muted)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>{formatTimestamp(item.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
