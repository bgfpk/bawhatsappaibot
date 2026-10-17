import React from "react";

export interface OnboardingProgressProps {
  completedCount: number;
  totalCount: number;
  progressPercent: number;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  completedCount,
  totalCount,
  progressPercent,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold text-[var(--ca-text-secondary)]">
        <span>Setup Progress</span>
        <span aria-label={`${progressPercent}% completed (${completedCount} of ${totalCount} milestones)`}>
          {completedCount} of {totalCount} ({progressPercent}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding setup progress"
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--ca-surface-3)]"
      >
        <div
          className="h-full rounded-full bg-[var(--ca-brand)] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
};
