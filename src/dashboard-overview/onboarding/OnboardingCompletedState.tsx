import React from "react";
import { CheckCircle2, MessageSquare, RefreshCw } from "lucide-react";
import type { ClientOnboardingChecklistItem } from "../../services/client-onboarding-checklist-service";
import { INBOX_UI_ENABLED } from "../../config/product-flags";

export interface OnboardingCompletedStateProps {
  onOpenInbox: () => void;
  onReviewSetup: () => void;
}

export const OnboardingCompletedState: React.FC<OnboardingCompletedStateProps> = ({
  onOpenInbox,
  onReviewSetup,
}) => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--ca-success-soft)] bg-[var(--ca-surface-1)] p-5 sm:flex-row sm:items-center sm:justify-between shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-xl bg-[var(--ca-success-soft)] p-2.5 text-[var(--ca-success)]">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--ca-success)]">
            Launch Ready
          </span>
          <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Your WhatsApp Assistant is Ready</h3>
          <p className="text-xs text-[var(--ca-text-secondary)]">
            All core launch milestones are complete. You can review your configuration anytime.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onReviewSetup}
          className="ca-button-secondary gap-2 px-3 py-2 text-xs"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Review Setup
        </button>
        {INBOX_UI_ENABLED && (
          <button
            type="button"
            onClick={onOpenInbox}
            className="ca-button-primary gap-2 px-4 py-2 text-xs"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Open Inbox
          </button>
        )}
      </div>
    </div>
  );
};
