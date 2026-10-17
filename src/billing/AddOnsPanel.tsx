import React, { useState } from "react";
import { Plus, AlertTriangle, Layers, CreditCard, Wallet, RefreshCw } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import { BILLING_ADDONS, getAddonMonthlyPriceUsd } from "../config/pricing";
import { formatAccountCurrency } from "./billing-model";

interface Props {
  walletBalanceUsd?: number;
  currency?: string;
  walletBillingPurchasesEnabled?: boolean;
  onPurchaseAddonWithCard?: (addonKey: string, quantity?: number) => Promise<void>;
  onPurchaseAddonWithWallet?: (addonKey: string, quantity?: number) => Promise<{ success: boolean; message?: string }>;
  onPurchaseAddon?: (addonKey: string) => Promise<{ success: boolean; message?: string }>;
}

export const AddOnsPanel: React.FC<Props> = ({
  walletBalanceUsd,
  currency = "USD",
  walletBillingPurchasesEnabled = false,
  onPurchaseAddonWithCard,
  onPurchaseAddonWithWallet,
  onPurchaseAddon,
}) => {
  const [selectedAddonKey, setSelectedAddonKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "wallet">("card");
  const [status, setStatus] = useState<"ready" | "processing" | "success" | "error">("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedAddonDetails = selectedAddonKey
    ? BILLING_ADDONS.find((item) => item.id === selectedAddonKey)
    : null;
  const addonPrice = selectedAddonKey ? getAddonMonthlyPriceUsd(selectedAddonKey) : 0;
  const hasWalletBalance = typeof walletBalanceUsd === "number";
  const isWalletInsufficient = hasWalletBalance ? walletBalanceUsd < addonPrice : true;

  const handleOpenPurchase = (addonKey: string) => {
    setSelectedAddonKey(addonKey);
    setStatus("ready");
    setErrorMessage(null);
    setSuccessMessage(null);
    if (walletBillingPurchasesEnabled && !isWalletInsufficient) {
      setPaymentMethod("wallet");
    } else {
      setPaymentMethod("card");
    }
  };

  const handleConfirmPurchase = async () => {
    if (!selectedAddonKey) return;
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
        const handler = onPurchaseAddonWithWallet || onPurchaseAddon;
        if (!handler) throw new Error("Wallet purchase handler is not configured.");
        const res = await handler(selectedAddonKey, 1);
        if (res?.success) {
          setStatus("success");
          setSuccessMessage(res.message || `Successfully purchased ${selectedAddonDetails?.name || selectedAddonKey} using wallet balance.`);
        } else {
          setStatus("error");
          setErrorMessage(res?.message || "Add-on purchase failed.");
        }
      } else {
        if (onPurchaseAddonWithCard) {
          await onPurchaseAddonWithCard(selectedAddonKey, 1);
        } else if (onPurchaseAddon) {
          await onPurchaseAddon(selectedAddonKey);
        } else {
          throw new Error("Card checkout is not configured.");
        }
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Add-on purchase failed. Please try again.");
    }
  };

  const isWalletChoiceDisabled = !walletBillingPurchasesEnabled;
  const isConfirmDisabled = status === "processing" || (paymentMethod === "wallet" && (!walletBillingPurchasesEnabled || isWalletInsufficient));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BILLING_ADDONS.map((addon) => (
          <div
            key={addon.id}
            className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[var(--ca-text-primary)] text-sm">{addon.name}</h3>
              </div>

              <div className="mt-4 mb-2">
                <span className="text-xl font-extrabold font-mono text-[var(--ca-text-primary)]">
                  {formatAccountCurrency(addon.monthlyPriceUsd, currency)}
                </span>
                <span className="text-xs text-[var(--ca-text-muted)] font-medium"> / month</span>
              </div>

              <p className="text-xs text-[var(--ca-text-secondary)]">
                Rate: {addon.price}
              </p>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={() => handleOpenPurchase(addon.id)}
                className="ca-button-primary text-xs w-full font-bold py-2.5 px-4 rounded-xl transition-all"
              >
                <Plus className="w-3.5 h-3.5 mr-1 inline-block" />
                Buy Add-on
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Purchase Dialog */}
      <Dialog
        isOpen={Boolean(selectedAddonKey)}
        onClose={() => {
          if (status !== "processing") {
            setSelectedAddonKey(null);
            setStatus("ready");
            setErrorMessage(null);
            setSuccessMessage(null);
          }
        }}
        title={`Buy Add-on: ${selectedAddonDetails?.name || selectedAddonKey || ""}`}
      >
        <div className="space-y-4">
          {status === "success" ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-bold space-y-3">
              <p>{successMessage || "Add-on purchased successfully!"}</p>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAddonKey(null);
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
              {/* Add-on Summary */}
              <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--ca-text-secondary)]">Selected Add-on:</span>
                  <span className="font-bold text-[var(--ca-text-primary)]">{selectedAddonDetails?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ca-text-secondary)]">Monthly Price:</span>
                  <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                    {formatAccountCurrency(addonPrice, currency)} / mo
                  </span>
                </div>
                <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
                  <span className="text-[var(--ca-text-secondary)]">Wallet Balance:</span>
                  <span className="font-bold font-mono text-[var(--ca-text-primary)]">
                    {hasWalletBalance ? formatAccountCurrency(walletBalanceUsd, currency) : "Unavailable"}
                  </span>
                </div>
              </div>

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
                    Insufficient wallet balance ({formatAccountCurrency(walletBalanceUsd || 0, currency)} available, {formatAccountCurrency(addonPrice, currency)} required). Choose Card / Creem or top up your wallet.
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
                  <span>Processing your add-on request...</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={status === "processing"}
                  onClick={() => {
                    setSelectedAddonKey(null);
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
                    ? "Retry Purchase"
                    : paymentMethod === "card"
                    ? "Pay with Card / Creem"
                    : "Confirm & Purchase with Wallet"}
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
};
