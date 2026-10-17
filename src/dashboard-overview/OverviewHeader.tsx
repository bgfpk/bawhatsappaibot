import React from "react";
import { BarChart3, RefreshCw, ShieldCheck } from "lucide-react";
import { StatusBadge, WorkspaceHero } from "../components/dashboard/DashboardPrimitives";

export interface OverviewHeaderProps {
  workspaceName: string;
  connectionStatus: string;
  connectionTone: "teal" | "amber" | "rose" | "neutral";
  selectedBotLabel: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  onNavigateView: (view: string) => void;
}

export const OverviewHeader: React.FC<OverviewHeaderProps> = ({
  workspaceName,
  connectionStatus,
  connectionTone,
  selectedBotLabel,
  isLoading,
  onRefresh,
  onNavigateView,
}) => {
  return (
    <WorkspaceHero
      eyebrow={workspaceName}
      title="Dashboard Overview"
      description="Operational command center for connection health, setup progress, customer activity, wallet readiness, and quick assistant actions."
      icon={BarChart3}
      status={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={connectionTone as any}>{connectionStatus}</StatusBadge>
          <StatusBadge tone="blue">{selectedBotLabel}</StatusBadge>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="ca-button-secondary gap-2 px-3 text-xs"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigateView("security")}
            className="ca-button-quiet gap-2 px-3 text-xs"
          >
            <ShieldCheck className="h-4 w-4 text-[var(--ca-brand)]" />
            Security & Proxies
          </button>
        </div>
      }
    />
  );
};
