import React from "react";
import type { OwnerProfileSectionProps } from "./owner-profile-types.ts";

export const OwnerAvailabilitySection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
}) => {
  const avail = profile.availabilityPreferences || {
    preferredMeetingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    preferredMeetingWindows: [{ start: "09:00", end: "17:00" }],
    minimumNoticeHours: 24,
    defaultMeetingDurationMinutes: 30,
    preferredMeetingFormat: "google_meet",
    bufferMinutes: 15,
  };

  const updateAvail = (patch: Partial<typeof avail>) => {
    onChange({
      ...profile,
      availabilityPreferences: {
        ...avail,
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
          Preferred Meeting Format
        </label>
        <select
          value={avail.preferredMeetingFormat || "google_meet"}
          onChange={(e) => updateAvail({ preferredMeetingFormat: e.target.value as any })}
          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-3 py-2 text-xs"
        >
          <option value="google_meet">Google Meet</option>
          <option value="zoom">Zoom</option>
          <option value="phone">Phone Call</option>
          <option value="in_person">In Person</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
            Minimum Notice (Hours)
          </label>
          <input
            type="number"
            min="1"
            max="168"
            value={avail.minimumNoticeHours ?? 24}
            onChange={(e) => updateAvail({ minimumNoticeHours: parseInt(e.target.value) || 24 })}
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
            Default Duration (Minutes)
          </label>
          <input
            type="number"
            min="15"
            max="180"
            value={avail.defaultMeetingDurationMinutes ?? 30}
            onChange={(e) => updateAvail({ defaultMeetingDurationMinutes: parseInt(e.target.value) || 30 })}
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-input-bg)] px-3 py-2 text-xs"
          />
        </div>
      </div>
    </div>
  );
};
