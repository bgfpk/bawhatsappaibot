import React from "react";
import type { OwnerProfileSectionProps, OwnerDataPrivacyPolicy } from "./owner-profile-types.ts";
import { OwnerPrivacyControl } from "./OwnerPrivacyControl.tsx";

export const OwnerIdentitySection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
}) => {
  const identity = profile.identity || { privacyPolicy: "PRIVATE", source: "system" };

  const updateIdentity = (patch: Partial<typeof identity>) => {
    onChange({
      ...profile,
      identity: {
        ...identity,
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Preferred Name
        </label>
        <input
          type="text"
          data-testid="owner-preferred-name-input"
          value={identity.preferredName || ""}
          onChange={(e) => updateIdentity({ preferredName: e.target.value })}
          placeholder="e.g. Farhan or Firdosi"
          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-[var(--ca-text-secondary)]">
          How your personal assistant refers to you informally.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Full Legal Name
        </label>
        <input
          type="text"
          value={identity.fullName || ""}
          onChange={(e) => updateIdentity({ fullName: e.target.value })}
          placeholder="e.g. Farhan Ali Khan"
          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
            Title / Honorific
          </label>
          <input
            type="text"
            value={identity.title || ""}
            onChange={(e) => updateIdentity({ title: e.target.value })}
            placeholder="e.g. Dr., Engr., Mr., Ms."
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
            Preferred Reference
          </label>
          <input
            type="text"
            value={identity.preferredReference || ""}
            onChange={(e) => updateIdentity({ preferredReference: e.target.value })}
            placeholder="e.g. Mr. Khan"
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
          />
        </div>
      </div>

      <OwnerPrivacyControl
        label="Identity Privacy Level"
        value={identity.privacyPolicy || "PRIVATE"}
        onChange={(val: OwnerDataPrivacyPolicy) => updateIdentity({ privacyPolicy: val })}
        testId="privacy-selector-preferredName"
      />
    </div>
  );
};
