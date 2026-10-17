import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Layers, Activity, Sparkles, History, Settings } from "lucide-react";
import { DashboardPageHeader } from "../components/dashboard/DashboardPrimitives";
import { resolvePathByViewAndTab } from "../app/dashboard-route-registry";
import { BillingOverview } from "./BillingOverview";
import { WalletTopUpDialog } from "./WalletTopUpDialog";
import { UsageDashboard } from "./UsageDashboard";
import { PlansPanel } from "./PlansPanel";
import { AddOnsPanel } from "./AddOnsPanel";
import { BillingHistory } from "./BillingHistory";
import { AccountBillingSettings } from "./AccountBillingSettings";
import {
  DEFAULT_WALLET_CURRENCY,
  type BillingTabId,
  type WalletOverviewData,
  type UsageRecordItem,
  type BillingTransactionItem,
  type AccountSettingsData,
} from "./billing-model";

interface Props {
  initialTab?: BillingTabId;
  activeTab?: BillingTabId;
  onTabChange?: (tab: BillingTabId) => void;
  wallet?: WalletOverviewData;
  usageRecords?: UsageRecordItem[];
  transactions?: BillingTransactionItem[];
  accountSettings?: AccountSettingsData;
  walletBillingPurchasesEnabled?: boolean;
  onTopUp?: (amountUsd: number) => Promise<{ success: boolean; newBalanceUsd?: number }>;
  onPurchasePlanWithCard?: (planId: string, billingCycle?: "monthly" | "annual") => Promise<void>;
  onPurchasePlanWithWallet?: (planId: string, billingCycle?: "monthly" | "annual") => Promise<{ success: boolean; message?: string }>;
  onPurchasePlan?: (planId: string) => Promise<{ success: boolean; message?: string }>;
  onPurchaseAddonWithCard?: (addonKey: string, quantity?: number) => Promise<void>;
  onPurchaseAddonWithWallet?: (addonKey: string, quantity?: number) => Promise<{ success: boolean; message?: string }>;
  onPurchaseAddon?: (addonKey: string) => Promise<{ success: boolean; message?: string }>;
  onSaveAccountSettings?: (settings: AccountSettingsData) => Promise<void>;
  onDownloadStatementCSV?: () => void;
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (val: string) => void;
  onToDateChange?: (val: string) => void;
  isHistoryLoading?: boolean;
  hasHistoryLoadError?: boolean;
  formatDate?: (ts: any) => string;
  usageLimit?: number;
  onUsageLimitChange?: (limit: number) => void;
}

export const BillingPage: React.FC<Props> = ({
  initialTab = "overview",
  activeTab: controlledActiveTab,
  onTabChange,
  wallet,
  usageRecords = [],
  transactions = [],
  accountSettings,
  walletBillingPurchasesEnabled = false,
  usageLimit = 100,
  onUsageLimitChange,
  onTopUp,
  onPurchasePlanWithCard,
  onPurchasePlanWithWallet,
  onPurchasePlan,
  onPurchaseAddonWithCard,
  onPurchaseAddonWithWallet,
  onPurchaseAddon,
  onSaveAccountSettings,
  onDownloadStatementCSV,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  isHistoryLoading,
  hasHistoryLoadError,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [activeTab, setActiveTab] = useState<BillingTabId>(controlledActiveTab || initialTab);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  React.useEffect(() => {
    if (controlledActiveTab) {
      setActiveTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  const handleSelectTab = (tab: BillingTabId) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Layers },
    { id: "usage" as const, label: "Usage Breakdown", icon: Activity },
    { id: "plans" as const, label: "Plans & Add-ons", icon: Sparkles },
    { id: "history" as const, label: "Billing History", icon: History },
  ];

  const activeWallet = wallet;
  const activeAccountSettings = accountSettings;
  const walletCurrency = activeWallet?.currency || DEFAULT_WALLET_CURRENCY;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Page Header */}
      <DashboardPageHeader
        eyebrow="Account & Billing"
        title="Wallet, Plans & Usage"
        description="Manage your pay-as-you-go wallet balance, track itemized AI & broadcast usage, upgrade plans, and adjust account billing details."
        icon={Wallet}
      />

      {/* Sub-navigation */}
      <div className="flex border-b border-[var(--ca-border-subtle)] overflow-x-auto gap-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const targetPath = resolvePathByViewAndTab("billing", id);
          return (
            <Link
              key={id}
              to={targetPath}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                isActive
                  ? "border-[var(--ca-brand)] text-[var(--ca-brand)]"
                  : "border-transparent text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <BillingOverview
          wallet={activeWallet}
          onOpenTopUp={() => setIsTopUpOpen(true)}
          onSelectTab={handleSelectTab}
        />
      )}

      {activeTab === "usage" && (
        <UsageDashboard
          usageRecords={usageRecords}
          currency={walletCurrency}
          formatDate={formatDate}
          limit={usageLimit}
          onLimitChange={onUsageLimitChange}
        />
      )}

      {activeTab === "plans" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-base font-bold text-[var(--ca-text-primary)] mb-4">Subscription Plans</h2>
            <PlansPanel
              currentPlanId={activeWallet?.planId}
              currentPlanExpiry={activeWallet?.planExpiry}
              walletBalanceUsd={activeWallet?.balanceUsd}
              currency={walletCurrency}
              walletBillingPurchasesEnabled={walletBillingPurchasesEnabled}
              onPurchasePlanWithCard={onPurchasePlanWithCard}
              onPurchasePlanWithWallet={onPurchasePlanWithWallet}
              onPurchasePlan={onPurchasePlan}
            />
          </div>

          <div>
            <h2 className="text-base font-bold text-[var(--ca-text-primary)] mb-4">Capacity Add-ons</h2>
            <AddOnsPanel
              walletBalanceUsd={activeWallet?.balanceUsd}
              currency={walletCurrency}
              walletBillingPurchasesEnabled={walletBillingPurchasesEnabled}
              onPurchaseAddonWithCard={onPurchaseAddonWithCard}
              onPurchaseAddonWithWallet={onPurchaseAddonWithWallet}
              onPurchaseAddon={onPurchaseAddon}
            />
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <BillingHistory
          transactions={transactions}
          currency={walletCurrency}
          formatDate={formatDate}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={onFromDateChange}
          onToDateChange={onToDateChange}
          onDownloadStatementCSV={onDownloadStatementCSV}
          isLoading={isHistoryLoading}
          hasLoadError={hasHistoryLoadError}
        />
      )}

      {/* Top Up Modal */}
      <WalletTopUpDialog
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        onTopUp={onTopUp}
        currency={walletCurrency}
      />
    </div>
  );
};
