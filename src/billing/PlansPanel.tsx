import React, { useState } from "react";
import { Check, AlertTriangle, CreditCard, Wallet, RefreshCw } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import { BILLING_PLAN_DETAILS, BILLING_PLAN_IDS, normalizePlanId, calculatePlanUpgradeCost, type BillingPlanId } from "../config/pricing";
import { formatAccountCurrency } from "./billing-model";

interface Props {
  currentPlanId?: string;
  currentPlanExpiry?: number;
  walletBalanceUsd?: number;
  currency?: string;
  walletBillingPurchasesEnabled?: boolean;
  onPurchasePlanWithCard?: (planId: string) => Promise<void>;
  onPurchasePlanWithWallet?: (planId: string) => Promise<{ success: boolean; message?: string }>;
  onPurchasePlan?: (planId: string) => Promise<{ success: boolean; message?: string }>;
}

export const PlansPanel: React.FC<Props> = ({
  currentPlanId,
  currentPlanExpiry,
  walletBalanceUsd,
  currency = "USD",
  walletBillingPurchasesEnabled = false,
  onPurchasePlanWithCard,
  onPurchasePlanWithWallet,
  onPurchasePlan,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanId | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [status, setStatus] = useState<"ready" | "processing" | "success" | "error">("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const normalizedCurrentPlanId = normalizePlanId(currentPlanId);
  const selectedPlanDetails = selectedPlanId ? BILLING_PLAN_DETAILS[selectedPlanId] : null;
  const upgradeCalc = selectedPlanId
    ? calculatePlanUpgradeCost({
        currentPlanId,
        currentPlanExpiry,
        targetPlanId: selectedPlanId,
        billingCycle: "monthly",
      })
    : null;

  const planPrice = upgradeCalc?.targetPrice ?? (selectedPlanDetails?.monthlyPrice || 0);
  const currentPlanCredit = upgradeCalc?.currentPlanCredit || 0;
  const amountDueNow = upgradeCalc?.amountDueNow ?? planPrice;
  const hasWalletBalance = typeof walletBalanceUsd === "number";
  const isWalletInsufficient = hasWalletBalance ? walletBalanceUsd < amountDueNow : true;

  const handleOpenUpgrade = (planId: BillingPlanId) => {
    setSelectedPlanId(planId);
    setStatus("ready");
    setErrorMessage(null);
    setSuccessMessage(null);
    const calc = calculatePlanUpgradeCost({
      currentPlanId,
      currentPlanExpiry,
      targetPlanId: planId,
      billingCycle: "monthly",
    });
    const due = calc?.amountDueNow ?? (BILLING_PLAN_DETAILS[planId]?.monthlyPrice || 0);
    const insufficient = typeof walletBalanceUsd === "number" ? walletBalanceUsd < due : true;
    if (walletBillingPurchasesEnabled && !insufficient) {
      setPaymentMethod("wallet");
    } else {
      setPaymentMethod("card");
    }
  };

  const handleConfirmPurchase = async () => {
    if (!selectedPlanId) return;
    setStatus("processing");
    setErrorMessage(null);

    try {
      if (paymentMethod === "wallet") {
        if (!walletBillingPurchasesEnabled) {
          throw new Error("Wallet billing is not enabled for this account.");
        }
        if (isWalletInsufficient) {
          throw new Error("Insufficient wallet balance. Please choose Card/Creem or add funds.");
        }
        const handler = onPurchasePlanWithWallet || onPurchasePlan;
        if (!handler) throw new Error("Wallet purchase handler is not configured.");
        const res = await handler(selectedPlanId);
        if (res?.success) {
          setStatus("success");
          setSuccessMessage(res.message || `Successfully upgraded to ${selectedPlanDetails?.name || "new plan"} using wallet balance.`);
        } else {
          setStatus("error");
          setErrorMessage(res?.message || "Wallet plan upgrade failed.");
        }
      } else {
        if (onPurchasePlanWithCard) {
          await onPurchasePlanWithCard(selectedPlanId);
        } else if (onPurchasePlan) {
          await onPurchasePlan(selectedPlanId);
        } else {
          throw new Error("Card checkout is not configured.");
        }
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Plan upgrade failed. Please try again.");
    }
  };

  const isWalletChoiceDisabled = !walletBillingPurchasesEnabled;
  const isConfirmDisabled = status === "processing" || (paymentMethod === "wallet" && (!walletBillingPurchasesEnabled || isWalletInsufficient));

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BILLING_PLAN_IDS.map((planId) => {
          const plan = BILLING_PLAN_DETAILS[planId];
          const isCurrent = normalizedCurrentPlanId === planId;
          const isPopular = plan.popular;

          return (
            <div
              key={planId}
              className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all bg-[var(--ca-bg-surface)] ${
                isCurrent
                  ? "border-[var(--ca-brand)] ring-2 ring-[var(--ca-brand)]/20 shadow-md"
                  : isPopular
                  ? "border-amber-500/50 shadow-sm"
                  : "border-[var(--ca-border-subtle)]"
              }`}
            >
              {isPopular && !isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-[10px] font-bold text-black uppercase tracking-wider">
                  Most Popular
                </span>
              )}

              {isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--ca-brand)] px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Current Plan
                </span>
              )}

              <div>
                <h3 className="text-base font-bold text-[var(--ca-text-primary)]">{plan.name}</h3>

                <div className="mt-4 mb-4">
                  <span className="text-2xl font-extrabold font-mono text-[var(--ca-text-primary)]">
                    {formatAccountCurrency(plan.monthlyPrice, currency)}
                  </span>
                  <span className="text-xs text-[var(--ca-text-muted)] font-medium"> / month</span>
                </div>

                <ul className="space-y-2 border-t border-[var(--ca-border-subtle)] pt-4 text-xs">
                  {plan.highlights?.map((feat: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2 text-[var(--ca-text-secondary)]">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={() => handleOpenUpgrade(planId)}
                  className={`w-full text-xs font-bold py-2.5 px-4 rounded-xl transition-all ${
                    isCurrent
                      ? "bg-neutral-500/10 text-[var(--ca-text-muted)] cursor-default"
                      : "ca-button-primary"
                  }`}
                >
                  {isCurrent ? "Active Plan" : "Upgrade Plan"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Purchase Confirmation Modal */}
      <Dialog
        isOpen={Boolean(selectedPlanId)}
        onClose={() => {
          if (status !== "processing") {
            setSelectedPlanId(null);
            setStatus("ready");
            setErrorMessage(null);
            setSuccessMessage(null);
          }
        }}
        title={`Upgrade Plan: ${selectedPlanDetails?.name || ""}`}
      >
        <div className="space-y-4">
          {status === "success" ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-bold space-y-3">
              <p>{successMessage || "Plan upgrade completed successfully!"}</p>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlanId(null);
                    setStatus("ready");
                  }}
                  className="ca-button-primary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Plan Summary */}
              {paymentMethod === "card" ? (
                <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ca-text-secondary)]">{selectedPlanDetails?.name} price:</span>
                    <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                      {formatAccountCurrency(planPrice, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
                    <span className="font-bold text-[var(--ca-text-primary)]">Charged to Card now:</span>
                    <span className="font-extrabold font-mono text-[var(--ca-text-primary)] text-sm">
                      {formatAccountCurrency(planPrice, currency)} + applicable tax
                    </span>
                  </div>
                  {currentPlanCredit > 0 && (
                    <>
                      <div className="border-t border-[var(--ca-border-subtle)] pt-2 text-[var(--ca-text-secondary)]">
                        <span className="font-semibold text-[11px] uppercase tracking-wider text-emerald-500">After successful payment:</span>
                        <div className="flex justify-between text-emerald-500 mt-1">
                          <span>Added to BlackArrow Wallet:</span>
                          <span className="font-bold font-mono">
                            +{formatAccountCurrency(currentPlanCredit, currency)}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between text-[var(--ca-text-secondary)]">
                        <span>Net plan difference:</span>
                        <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                          {formatAccountCurrency(amountDueNow, currency)} before tax
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
                    <span className="text-[var(--ca-text-secondary)]">Next renewal:</span>
                    <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                      {formatAccountCurrency(planPrice, currency)}/month
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ca-text-secondary)]">{selectedPlanDetails?.name} price:</span>
                    <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                      {formatAccountCurrency(planPrice, currency)}
                    </span>
                  </div>
                  {currentPlanCredit > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Current-plan credit:</span>
                      <span className="font-bold font-mono">
                        -{formatAccountCurrency(currentPlanCredit, currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
                    <span className="font-bold text-[var(--ca-text-primary)]">Deducted from Wallet:</span>
                    <span className="font-extrabold font-mono text-[var(--ca-text-primary)] text-sm">
                      {formatAccountCurrency(amountDueNow, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
                    <span className="text-[var(--ca-text-secondary)]">Wallet Balance:</span>
                    <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                      {hasWalletBalance ? formatAccountCurrency(walletBalanceUsd, currency) : "Unavailable"}
                    </span>
                  </div>
                </div>
              )}

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--ca-text-primary)] block">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={status === "processing"}
                    onClick={() => {
                      setPaymentMethod("card");
                      setErrorMessage(null);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === "card"
                        ? "border-[var(--ca-brand)] bg-[var(--ca-brand)]/10 text-[var(--ca-brand)]"
                        : "border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
                    }`}
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>Card / Creem</span>
                  </button>

                  <button
                    type="button"
                    disabled={status === "processing" || isWalletChoiceDisabled}
                    onClick={() => {
                      if (walletBillingPurchasesEnabled) {
                        setPaymentMethod("wallet");
                        setErrorMessage(null);
                      }
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === "wallet"
                        ? "border-[var(--ca-brand)] bg-[var(--ca-brand)]/10 text-[var(--ca-brand)]"
                        : isWalletChoiceDisabled
                        ? "border-[var(--ca-border-subtle)] bg-neutral-500/5 text-[var(--ca-text-muted)] cursor-not-allowed opacity-60"
                        : "border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
                    }`}
                  >
                    <Wallet className="w-4 h-4 shrink-0" />
                    <span>Wallet Balance</span>
                  </button>
                </div>
              </div>

              {/* Alerts & Warnings */}
              {paymentMethod === "wallet" && isWalletInsufficient && (
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Insufficient wallet balance ({formatAccountCurrency(walletBalanceUsd || 0, currency)} available, {formatAccountCurrency(amountDueNow, currency)} required). Choose Card / Creem or top up your wallet.
                  </span>
                </div>
              )}

              {status === "error" && errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {status === "processing" && (
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                  <span>Processing your upgrade request...</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={status === "processing"}
                  onClick={() => {
                    setSelectedPlanId(null);
                    setStatus("ready");
                    setErrorMessage(null);
                  }}
                  className="ca-button-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPurchase}
                  disabled={isConfirmDisabled}
                  className="ca-button-primary text-xs"
                >
                  {status === "processing"
                    ? "Processing..."
                    : status === "error"
                    ? "Retry Upgrade"
                    : paymentMethod === "card"
                    ? "Pay with Card / Creem"
                    : `Confirm & Upgrade with Wallet (${formatAccountCurrency(amountDueNow, currency)})`}
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
};
