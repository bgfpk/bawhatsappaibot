import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  OwnerProfileSectionProps,
  OwnerCustomFact,
  OwnerDataPrivacyPolicy,
} from "./owner-profile-types.ts";
import { OwnerPrivacyControl } from "./OwnerPrivacyControl.tsx";
import { PRIVACY_POLICY_OPTIONS, isBlockedSecretInput } from "./owner-profile-form-utils.ts";

export const OwnerCustomFactsSection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
  onError,
}) => {
  const [showFactForm, setShowFactForm] = useState(false);
  const [newFact, setNewFact] = useState<Partial<OwnerCustomFact>>({
    label: "",
    category: "general",
    value: "",
    privacyPolicy: "PRIVATE",
  });

  const handleSaveFact = () => {
    if (!newFact.label || !newFact.value) return;

    if (
      isBlockedSecretInput(newFact.label) ||
      isBlockedSecretInput(newFact.category || "") ||
      isBlockedSecretInput(newFact.value)
    ) {
      if (onError) {
        onError("Passwords, PINs, OTPs, CVVs, and API keys cannot be stored in custom facts.");
      }
      return;
    }

    const factToAdd: OwnerCustomFact = {
      factId: crypto.randomUUID(),
      label: newFact.label.trim(),
      category: (newFact.category || "general").trim(),
      value: newFact.value.trim(),
      privacyPolicy: newFact.privacyPolicy || "PRIVATE",
      source: "owner_dashboard",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onChange({
      ...profile,
      customFacts: [...profile.customFacts, factToAdd],
    });
    setShowFactForm(false);
    setNewFact({ label: "", category: "general", value: "", privacyPolicy: "PRIVATE" });
  };

  const handleDeleteFact = (factId: string) => {
    onChange({
      ...profile,
      customFacts: profile.customFacts.filter((cf) => cf.factId !== factId),
    });
  };

  const handleUpdatePrivacy = (factId: string, privacyPolicy: OwnerDataPrivacyPolicy) => {
    onChange({
      ...profile,
      customFacts: profile.customFacts.map((cf) =>
        cf.factId === factId ? { ...cf, privacyPolicy } : cf
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--ca-text-secondary)]">
            Arbitrary owner preferences and facts (e.g. dietary restrictions, airport code).
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
            ⚠️ Passwords, PINs, OTPs, CVVs, and payment credentials are strictly blocked.
          </p>
        </div>
        <button
          type="button"
          data-testid="add-fact-button"
          onClick={() => setShowFactForm(!showFactForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Fact
        </button>
      </div>

      {showFactForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 space-y-3">
          <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
            New Safe Fact
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Label
              </label>
              <input
                type="text"
                data-testid="fact-label-input"
                placeholder="e.g. Dietary Preference"
                value={newFact.label || ""}
                onChange={(e) => setNewFact({ ...newFact, label: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Category
              </label>
              <input
                type="text"
                placeholder="lifestyle, travel, work"
                value={newFact.category || "general"}
                onChange={(e) => setNewFact({ ...newFact, category: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Value
              </label>
              <input
                type="text"
                data-testid="fact-value-input"
                placeholder="Vegetarian, no peanuts"
                value={newFact.value || ""}
                onChange={(e) => setNewFact({ ...newFact, value: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--ca-text-secondary)]">Privacy:</label>
              <select
                value={newFact.privacyPolicy || "PRIVATE"}
                onChange={(e) =>
                  setNewFact({
                    ...newFact,
                    privacyPolicy: e.target.value as OwnerDataPrivacyPolicy,
                  })
                }
                className="rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1 text-xs"
              >
                {PRIVACY_POLICY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFactForm(false)}
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="save-fact-button"
                onClick={handleSaveFact}
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Save Fact
              </button>
            </div>
          </div>
        </div>
      )}

      {profile.customFacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ca-border-subtle)] p-6 text-center text-xs text-[var(--ca-text-secondary)]">
          No custom facts saved yet. Add preferences like food, travel habits, or office hours.
        </div>
      ) : (
        <div className="grid gap-3">
          {profile.customFacts.map((f) => (
            <div
              key={f.factId}
              className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-subtle)] p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--ca-text-primary)]">{f.label}</span>
                  <span className="rounded bg-[var(--ca-hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ca-text-secondary)]">
                    {f.category}
                  </span>
                  <span className="rounded bg-[var(--ca-hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {f.privacyPolicy}
                  </span>
                </div>
                <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">{f.value}</p>
              </div>
              <div className="flex items-center gap-2">
                <OwnerPrivacyControl
                  value={f.privacyPolicy}
                  onChange={(val) => handleUpdatePrivacy(f.factId, val)}
                  compact
                />
                <button
                  type="button"
                  onClick={() => handleDeleteFact(f.factId)}
                  className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
