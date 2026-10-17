import React from "react";
import type { OwnerProfileSectionProps } from "./owner-profile-types.ts";

export const OwnerCommunicationSection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
}) => {
  const comm = profile.communicationPreferences || {
    formality: "neutral",
    tone: "professional",
    brevity: "balanced",
    useEmojis: true,
    allowVoiceNotes: false,
  };

  const asst = profile.assistantRepresentation || {
    assistantDisplayName: "Personal Assistant",
    identityDisclosure: "always_disclose_ai",
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Assistant Display Name
        </label>
        <input
          type="text"
          value={asst.assistantDisplayName || "Personal Assistant"}
          onChange={(e) =>
            onChange({
              ...profile,
              assistantRepresentation: {
                ...asst,
                assistantDisplayName: e.target.value,
              },
            })
          }
          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs text-[var(--ca-text-primary)] focus:border-indigo-600 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
            Formality Level
          </label>
          <select
            value={comm.formality || "neutral"}
            onChange={(e) =>
              onChange({
                ...profile,
                communicationPreferences: {
                  ...comm,
                  formality: e.target.value as any,
                },
              })
            }
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-3 py-2 text-xs"
          >
            <option value="formal">Formal</option>
            <option value="neutral">Neutral / Balanced</option>
            <option value="casual">Casual / Friendly</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
            Brevity
          </label>
          <select
            value={comm.brevity || "balanced"}
            onChange={(e) =>
              onChange({
                ...profile,
                communicationPreferences: {
                  ...comm,
                  brevity: e.target.value as any,
                },
              })
            }
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-3 py-2 text-xs"
          >
            <option value="concise">Concise (Bullet points)</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed / Thorough</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          id="emojis-cb"
          checked={comm.useEmojis !== false}
          onChange={(e) =>
            onChange({
              ...profile,
              communicationPreferences: {
                ...comm,
                useEmojis: e.target.checked,
              },
            })
          }
          className="rounded border-[var(--ca-border-subtle)] text-indigo-600"
        />
        <label htmlFor="emojis-cb" className="text-xs text-[var(--ca-text-primary)] font-medium">
          Allow emojis in conversational responses
        </label>
      </div>
    </div>
  );
};
