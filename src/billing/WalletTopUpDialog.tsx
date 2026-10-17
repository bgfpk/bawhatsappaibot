import React, { useState } from "react";
import { Zap, ShieldCheck, CreditCard, CheckCircle2 } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import { WALLET_TOPUP_AMOUNTS, formatAccountCurrency } from "./billing-model";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTopUp?: (amountUsd: number) => Promise<{ success: boolean; newBalanceUsd?: number }>;
  currency?: string;
}

export const WalletTopUpDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  onTopUp,
  currency = "USD",
}) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(WALLET_TOPUP_AMOUNTS[1] || 25);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const effectiveAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveAmount <= 0 || !onTopUp) return;

    setIsSubmitting(true);
    setSuccessMessage(null);
    try {
      const res = await onTopUp(effectiveAmount);
      if (res.success) {
        setSuccessMessage(
          `Checkout started for ${formatAccountCurrency(effectiveAmount, currency)}. Complete payment in checkout window to update wallet balance.`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccessMessage(null);
    setCustomAmount("");
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Top Up Wallet Balance">
      <div className="space-y-4">
        {successMessage ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold text-[var(--ca-text-primary)]">{successMessage}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="ca-button-primary text-xs w-full"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 text-blue-500 text-xs">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">Instant Pay-as-you-go Credits</p>
                <p className="mt-0.5">
                  Wallet credits do not expire. Used automatically for AI text replies, voice notes, and broadcasts.
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-2">
                Select Top-Up Amount
              </label>
              <div className="grid grid-cols-4 gap-2">
                {WALLET_TOPUP_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(amt);
                      setCustomAmount("");
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold font-mono transition-all border ${
                      selectedAmount === amt && !customAmount
                        ? "border-[var(--ca-brand)] bg-[var(--ca-brand)]/10 text-[var(--ca-brand)]"
                        : "border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] text-[var(--ca-text-primary)]"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Or Custom Amount ($)
              </label>
              <input
                type="number"
                min="5"
                step="5"
                placeholder="e.g. 75"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] flex items-center justify-between text-xs font-bold">
              <span className="text-[var(--ca-text-secondary)]">Total to Charge:</span>
              <span className="text-[var(--ca-text-primary)] font-mono text-sm">
                {formatAccountCurrency(effectiveAmount, currency)}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="ca-button-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || effectiveAmount <= 0 || !onTopUp}
                className="ca-button-primary text-xs disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                {isSubmitting ? "Processing..." : "Confirm Top Up"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
};
