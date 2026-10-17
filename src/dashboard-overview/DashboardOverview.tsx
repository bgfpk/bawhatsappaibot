import React, { useMemo } from "react";
import type { ClientOnboardingChecklist, ClientOnboardingChecklistItem } from "../services/client-onboarding-checklist-service";
import { buildOverviewModel, type BuildOverviewInput } from "./overview-model";
import { OverviewHeader } from "./OverviewHeader";
import { OverviewStatusStrip } from "./OverviewStatusStrip";
import { OverviewAttentionPanel } from "./OverviewAttentionPanel";
import { OverviewMetrics } from "./OverviewMetrics";
import { OverviewQuickActions } from "./OverviewQuickActions";
import { OverviewUsageSummary } from "./OverviewUsageSummary";
import { OverviewRecentActivity } from "./OverviewRecentActivity";

export interface DashboardOverviewProps {
  currentUser?: any;
  userBilling?: any;
  selectedBot?: any;
  connectionStatus?: string;
  isAutoReplyEnabled?: boolean;
  walletBalance?: number;
  customers?: any[];
  orders?: any[];
  followups?: any[];
  products?: any[];
  customFields?: any[];
  dashboardNotifications?: any[];
  onboardingChecklist: ClientOnboardingChecklist;
  isAdmin?: boolean;
  isLoading?: boolean;
  loadError?: string;
  onRefresh?: () => void;
  onNavigateView: (view: string, aiTab?: string, billingTab?: string) => void;
  onOpenOnboardingItem: (item: ClientOnboardingChecklistItem) => void;
  onOpenInbox: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  currentUser,
  userBilling,
  selectedBot,
  connectionStatus = "Disconnected",
  isAutoReplyEnabled = true,
  walletBalance = 0,
  customers = [],
  orders = [],
  followups = [],
  products = [],
  customFields = [],
  dashboardNotifications = [],
  onboardingChecklist,
  isAdmin = false,
  isLoading = false,
  loadError,
  onRefresh,
  onNavigateView,
  onOpenOnboardingItem,
  onOpenInbox,
}) => {
  const input: BuildOverviewInput = useMemo(
    () => ({
      currentUser,
      userBilling,
      selectedBot,
      connectionStatus,
      isAutoReplyEnabled,
      walletBalance,
      customers,
      orders,
      followups,
      products,
      customFields,
      dashboardNotifications,
      onboardingChecklist,
      isAdmin,
      isLoading,
      loadError,
    }),
    [
      currentUser,
      userBilling,
      selectedBot,
      connectionStatus,
      isAutoReplyEnabled,
      walletBalance,
      customers,
      orders,
      followups,
      products,
      customFields,
      dashboardNotifications,
      onboardingChecklist,
      isAdmin,
      isLoading,
      loadError,
    ]
  );

  const model = useMemo(() => buildOverviewModel(input), [input]);

  return (
    <div className="space-y-6">
      {/* Overview Header */}
      <OverviewHeader
        workspaceName={model.workspaceName}
        connectionStatus={model.connectionStatus}
        connectionTone={model.connectionTone}
        selectedBotLabel={model.selectedBotLabel}
        isLoading={model.isLoading}
        onRefresh={onRefresh}
        onNavigateView={(view) => onNavigateView(view)}
      />

      {/* Error alert banner if fetch failed */}
      {model.loadError && (
        <div className="rounded-xl border border-[var(--ca-warning-soft)] bg-[var(--ca-warning-soft)]/20 p-4 text-xs font-semibold text-[var(--ca-warning)] flex items-center justify-between">
          <span>{model.loadError}</span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="font-bold underline cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Operational Status Strip */}
      <OverviewStatusStrip
        connectionStatus={model.connectionStatus}
        connectionTone={model.connectionTone}
        selectedBotLabel={model.selectedBotLabel}
        isAiRepliesEnabled={model.isAiRepliesEnabled}
        walletBalance={model.walletBalance}
        launchReady={model.onboarding.launchReady}
        completedCoreCount={model.onboarding.completedCoreCount}
      />

      {/* Actionable Attention Panel */}
      <OverviewAttentionPanel
        items={model.attentionItems}
        onNavigate={(view, aiTab, billingTab) => onNavigateView(view, aiTab, billingTab)}
      />

      {/* Operational Metrics Cards */}
      <OverviewMetrics metrics={model.metrics} />

      {/* Role-Aware Quick Actions */}
      <OverviewQuickActions
        actions={model.quickActions}
        onNavigate={(view, aiTab, billingTab) => onNavigateView(view, aiTab, billingTab)}
      />

      {/* Wallet and Usage Summary */}
      <OverviewUsageSummary
        walletBalance={model.walletBalance}
        userPlanName={model.userPlanName}
        onNavigateBilling={() => onNavigateView("billing", undefined, "overview")}
      />

      {/* Recent Activity Feed */}
      <OverviewRecentActivity activities={model.recentActivities} />
    </div>
  );
};
