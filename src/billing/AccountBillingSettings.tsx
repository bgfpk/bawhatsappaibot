import React from "react";
import { Settings, Globe, Mail, Building } from "lucide-react";
import type { AccountSettingsData } from "./billing-model";

interface Props {
  settings?: AccountSettingsData;
}

export const AccountBillingSettings: React.FC<Props> = ({ settings }) => {
  const businessName = settings?.businessName || "Unavailable";
  const billingEmail = settings?.billingEmail || "Unavailable";
  const currency = settings?.currency || "USD";
  const timezone = settings?.timezone || "Unavailable";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Account Billing Settings</h2>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
              Manage business name, billing contact email, and account currency preferences.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-neutral-500/10 text-[var(--ca-text-secondary)] text-xs font-medium border border-[var(--ca-border-subtle)]">
            These account billing preferences are read-only and managed by account administration.
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Business / Workspace Name
            </label>
            <div className="relative">
              <Building className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                disabled
                value={businessName}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Billing Contact Email
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="email"
                disabled
                value={billingEmail}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Account Display Currency
            </label>
            <div className="relative">
              <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <select
                value={currency}
                disabled
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none cursor-not-allowed opacity-80"
              >
                <option value="USD">USD ($ - United States Dollar)</option>
                <option value="PKR">PKR (Rs. - Pakistani Rupee)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Business Timezone (Read-only)
            </label>
            <input
              type="text"
              disabled
              value={timezone}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-muted)] cursor-not-allowed opacity-80"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
