import React, { useState } from "react";
import { Mail, Phone, Plus, Trash2 } from "lucide-react";
import type { OwnerProfileSectionProps, OwnerContactMethod, OwnerDataPrivacyPolicy } from "./owner-profile-types.ts";
import { OwnerPrivacyControl } from "./OwnerPrivacyControl.tsx";
import { PRIVACY_POLICY_OPTIONS } from "./owner-profile-form-utils.ts";

export const OwnerContactsSection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
}) => {
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState<Partial<OwnerContactMethod>>({
    type: "email",
    label: "Personal",
    value: "",
    isDefault: false,
    privacyPolicy: "PRIVATE",
  });

  const handleAddContact = () => {
    if (!newContact.value || !newContact.label) return;
    const contactToAdd: OwnerContactMethod = {
      id: crypto.randomUUID(),
      type: newContact.type || "email",
      label: newContact.label.trim(),
      value: newContact.value.trim(),
      isDefault: Boolean(newContact.isDefault || profile.contactMethods.length === 0),
      privacyPolicy: newContact.privacyPolicy || "PRIVATE",
      source: "owner_dashboard",
    };
    onChange({
      ...profile,
      contactMethods: [...profile.contactMethods, contactToAdd],
    });
    setShowContactForm(false);
    setNewContact({ type: "email", label: "Personal", value: "", privacyPolicy: "PRIVATE" });
  };

  const handleDeleteContact = (id: string) => {
    onChange({
      ...profile,
      contactMethods: profile.contactMethods.filter((cm) => cm.id !== id),
    });
  };

  const handleUpdatePrivacy = (id: string, privacyPolicy: OwnerDataPrivacyPolicy) => {
    onChange({
      ...profile,
      contactMethods: profile.contactMethods.map((cm) =>
        cm.id === id ? { ...cm, privacyPolicy } : cm
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ca-text-secondary)]">
          Private communication channels for your Personal Assistant context.
        </p>
        <button
          type="button"
          onClick={() => setShowContactForm(!showContactForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Contact Method
        </button>
      </div>

      {showContactForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 space-y-3">
          <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
            New Contact Method
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Type
              </label>
              <select
                value={newContact.type || "email"}
                onChange={(e) =>
                  setNewContact({ ...newContact, type: e.target.value as any })
                }
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. Personal or Work"
                value={newContact.label || ""}
                onChange={(e) => setNewContact({ ...newContact, label: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Value
              </label>
              <input
                type="text"
                placeholder="contact-b4c9a289323b@example.invalid or +923..."
                value={newContact.value || ""}
                onChange={(e) => setNewContact({ ...newContact, value: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--ca-text-secondary)]">Privacy:</label>
              <select
                value={newContact.privacyPolicy || "PRIVATE"}
                onChange={(e) =>
                  setNewContact({
                    ...newContact,
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
                onClick={() => setShowContactForm(false)}
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddContact}
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {profile.contactMethods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ca-border-subtle)] p-6 text-center text-xs text-[var(--ca-text-secondary)]">
          No contact methods saved yet. Add an email or phone for personal notifications.
        </div>
      ) : (
        <div className="grid gap-3">
          {profile.contactMethods.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-subtle)] p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {c.type === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--ca-text-primary)]">{c.value}</span>
                    <span className="rounded bg-[var(--ca-hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ca-text-secondary)]">
                      {c.label}
                    </span>
                    {c.isDefault && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--ca-text-secondary)] mt-0.5">
                    Policy: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{c.privacyPolicy}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <OwnerPrivacyControl
                  value={c.privacyPolicy}
                  onChange={(val) => handleUpdatePrivacy(c.id, val)}
                  compact
                />
                <button
                  type="button"
                  onClick={() => handleDeleteContact(c.id)}
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
