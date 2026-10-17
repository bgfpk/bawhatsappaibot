import React from "react";
import type { OwnerDataPrivacyPolicy } from "./owner-profile-types.ts";
import { PRIVACY_POLICY_OPTIONS } from "./owner-profile-form-utils.ts";

interface OwnerPrivacyControlProps {
  label?: string;
  value: OwnerDataPrivacyPolicy;
  onChange: (value: OwnerDataPrivacyPolicy) => void;
  testId?: string;
  compact?: boolean;
}

export const OwnerPrivacyControl: React.FC<OwnerPrivacyControlProps> = ({
  label = "Privacy Level",
  value,
  onChange,
  testId,
  compact = false,
}) => {
  if (compact) {
    return (
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value as OwnerDataPrivacyPolicy)}
        className="rounded border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-2 py-1 text-[11px] text-[var(--ca-text-primary)]"
      >
        {PRIVACY_POLICY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-subtle)] p-3">
      <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
        {label}
      </label>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value as OwnerDataPrivacyPolicy)}
        className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-2.5 py-1.5 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
      >
        {PRIVACY_POLICY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label} - {opt.description}
          </option>
        ))}
      </select>
    </div>
  );
};
