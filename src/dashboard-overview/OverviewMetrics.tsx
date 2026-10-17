import React from "react";
import {
  Bot,
  CalendarClock,
  MessageSquare,
  Package,
  ShoppingCart,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { MetricTile } from "../components/dashboard/DashboardPrimitives";
import type { OverviewMetric } from "./overview-model";

const METRIC_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Smartphone,
  Bot,
  Users,
  ShoppingCart,
  Wallet,
  MessageSquare,
  Package,
  CalendarClock,
};

export interface OverviewMetricsProps {
  metrics: OverviewMetric[];
}

export const OverviewMetrics: React.FC<OverviewMetricsProps> = ({ metrics }) => {
  const visibleMetrics = (metrics || []).filter((m) => m.available);

  if (visibleMetrics.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibleMetrics.map((metric) => {
        const Icon = METRIC_ICON_MAP[metric.iconName] || MessageSquare;

        return (
          <div key={metric.id}>
            <MetricTile
              label={metric.label}
              value={metric.value}
              helper={metric.helper}
              icon={Icon}
              tone={metric.tone as any}
            />
          </div>
        );
      })}
    </div>
  );
};
