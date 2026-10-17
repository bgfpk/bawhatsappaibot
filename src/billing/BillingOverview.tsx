import React from "react";
import { Link } from "react-router-dom";
import { Wallet, ShieldCheck, AlertTriangle, ArrowUpRight, CheckCircle2, Zap, CreditCard, Sparkles } from "lucide-react";
import { formatAccountCurrency, type WalletOverviewData } from "./billing-model";

interface Props {
  wallet?: WalletOverviewData;
  onOpenTopUp?: () => void;
  onSelectTab?: (tab: any) => void;
}

export const BillingOverview: React.FC<Props> = ({
  wallet,
  onOpenTopUp,
  onSelectTab,
}) => {
  const isDepleted = wallet ? (wallet.balanceUsd || 0) <= 0 : false;
  const balanceText = wallet ? wallet.balanceFormatted : "Unavailable";
  const planText = wallet?.planName ? wallet.planName : "Unknown Plan";
  const statusText = (wallet?.accountStatus ? wallet.accountStatus : "unknown").toLowerCase();
  const isEntitlementActive = statusText === "active" || statusText === "trial";

  const getStatusHeadline = (status: string) => {
    switch (status) {
      case "active":
        return "Active Account";
      case "trial":
        return "Trial Period";
      case "restricted":
      case "expired":
        return "Restricted Account";
      case "past_due":
        return "Past Due";
      default:
        return "Unknown Status";
    }
  };

  const getStatusDescription = (status: string) => {
    switch (status) {
      case "active":
        return "Normal operational status.";
      case "trial":
        return "Free trial period active.";
      case "restricted":
      case "expired":
        return "Account actions restricted or plan expired.";
      case "past_due":
        return "Account payment past due.";
      default:
        return "Account status details unavailable.";
    }
  };

  return (
    <div className="space-y-6">
      {/* Wallet Balance Hero Card */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--ca-border-subtle)] bg-gradient-to-br from-[var(--ca-bg-surface)] via-[var(--ca-bg-hover)] to-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-2xl bg-[var(--ca-brand)]/10 text-[var(--ca-brand)]">
              <Wallet className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
                  Wallet Balance
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  statusText === "active"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : statusText === "trial"
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}>
                  <ShieldCheck className="w-3 h-3" />
                  {statusText}
                </span>
              </div>
              <h2 className="text-3xl font-extrabold text-[var(--ca-text-primary)] mt-1 font-mono">
                {wallet ? formatAccountCurrency(wallet.balanceUsd, wallet.currency) : balanceText}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenTopUp}
              disabled={!onOpenTopUp}
              className="ca-button-primary text-xs px-4 py-2.5 shadow-sm disabled:opacity-50"
            >
              <Zap className="w-4 h-4 mr-1.5" />
              Add Wallet Funds
            </button>
            <button
              type="button"
              onClick={() => onSelectTab?.("plans")}
              className="ca-button-secondary text-xs px-4 py-2.5"
            >
              Upgrade Plan
              <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
        </div>

        {/* Depleted Balance / Entitlement Warning */}
        {((!isEntitlementActive) || (isDepleted && isEntitlementActive)) && wallet && (
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-500 font-bold border border-rose-500/20">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {!isEntitlementActive
                ? "Your subscription plan is expired or inactive. Subscribe or renew your plan in Billing to restore automated AI replies."
                : `Your wallet balance is depleted (${formatAccountCurrency(wallet.balanceUsd, wallet.currency)}). Top up now to enable automated AI replies.`}
            </span>
          </div>
        )}
      </div>

      {/* Overview Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Active Plan Card */}
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ca-text-muted)] uppercase tracking-wider">
              Current Plan
            </span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-lg font-bold text-[var(--ca-text-primary)] mt-2">
            {planText}
          </h3>
          <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
            Includes AI Studio automation and Courier Order Status Broadcasts.
          </p>
          <button
            type="button"
            onClick={() => onSelectTab?.("plans")}
            className="text-xs font-bold text-[var(--ca-brand)] hover:underline mt-3 block"
          >
            View Plan Details →
          </button>
        </div>

        {/* Billing Method */}
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ca-text-muted)] uppercase tracking-wider">
              Payment Method
            </span>
            <CreditCard className="w-4 h-4 text-blue-500" />
          </div>
          <h3 className="text-lg font-bold text-[var(--ca-text-primary)] mt-2">
            Prepaid Wallet Balance
          </h3>
          <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
            Pay-as-you-go AI text, voice, and broadcast credits.
          </p>
          <button
            type="button"
            onClick={() => onSelectTab?.("history")}
            className="text-xs font-bold text-[var(--ca-brand)] hover:underline mt-3 block"
          >
            Billing History →
          </button>
        </div>

        {/* Account Capacity */}
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ca-text-muted)] uppercase tracking-wider">
              Account Status
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-[var(--ca-text-primary)] mt-2">
            {getStatusHeadline(statusText)}
          </h3>
          <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
            {getStatusDescription(statusText)}
          </p>
          <Link
            to="/settings/billing"
            className="text-xs font-bold text-[var(--ca-brand)] hover:underline mt-3 block"
          >
            Account Settings →
          </Link>
        </div>
      </div>
    </div>
  );
};
