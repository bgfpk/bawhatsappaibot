import React from "react";
import { ArrowRight, BarChart3, Wallet } from "lucide-react";

export interface OverviewUsageSummaryProps {
  walletBalance: number;
  userPlanName: string;
  onNavigateBilling: () => void;
}

export const OverviewUsageSummary: React.FC<OverviewUsageSummaryProps> = ({
  walletBalance,
  userPlanName,
  onNavigateBilling,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-[var(--ca-brand-soft)] p-2.5 text-[var(--ca-brand)]">
          <Wallet className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--ca-text-primary)]">
              Wallet Balance: ${Math.max(0, walletBalance).toFixed(2)}
            </span>
            <span className="rounded-full bg-[var(--ca-surface-3)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ca-text-muted)]">
              {userPlanName}
            </span>
          </div>
          <p className="text-xs text-[var(--ca-text-secondary)]">
            AI credits and automated messaging usage are deducted from your wallet balance.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onNavigateBilling}
        className="ca-button-secondary gap-2 px-3 py-2 text-xs shrink-0"
      >
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
        <span>Manage Billing & Wallet</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
