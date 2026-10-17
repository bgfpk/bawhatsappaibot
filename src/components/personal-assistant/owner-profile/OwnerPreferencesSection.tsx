import React from "react";
import type { OwnerProfileSectionProps } from "./owner-profile-types.ts";
import { COMMON_TIMEZONES } from "./owner-profile-form-utils.ts";

export const OwnerPreferencesSection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
}) => {
  const locale = profile.locale || {
    timezone: "UTC",
    locale: "en-US",
    preferredLanguages: ["en"],
    defaultCurrency: "USD",
  };

  const updateLocale = (patch: Partial<typeof locale>) => {
    onChange({
      ...profile,
      locale: {
        ...locale,
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Primary Timezone (IANA)
        </label>
        <select
          data-testid="owner-timezone-select"
          value={locale.timezone || "UTC"}
          onChange={(e) => updateLocale({ timezone: e.target.value })}
          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-[var(--ca-text-secondary)]">
          Used to correctly calculate times for reminders, appointments, and daily agendas.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Default Currency
        </label>
        <input
          type="text"
          value={locale.defaultCurrency || "USD"}
          onChange={(e) => updateLocale({ defaultCurrency: e.target.value.toUpperCase() })}
          placeholder="PKR, USD, EUR"
          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Preferred Languages
        </label>
        <div className="flex gap-2">
          {["en", "ur", "ar", "es"].map((lang) => {
            const isSelected = locale.preferredLanguages?.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => {
                  const currentLangs = locale.preferredLanguages || ["en"];
                  const updated = isSelected
                    ? currentLangs.filter((l) => l !== lang)
                    : [...currentLangs, lang];
                  updateLocale({
                    preferredLanguages: updated.length > 0 ? updated : ["en"],
                  });
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  isSelected
                    ? "bg-indigo-600 text-white"
                    : "bg-[var(--ca-bg-subtle)] text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)]"
                }`}
              >
                {lang === "en" ? "English" : lang === "ur" ? "Urdu" : lang === "ar" ? "Arabic" : "Spanish"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
