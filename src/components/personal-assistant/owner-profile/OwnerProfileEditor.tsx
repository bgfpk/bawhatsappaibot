import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  MapPin,
  Mail,
  Globe,
  MessageSquare,
  Clock,
  Shield,
  Check,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type {
  Owner360Profile,
  OwnerProfileEditorProps,
  OwnerProfileTabId,
} from "./owner-profile-types.ts";
import {
  fetchOwnerProfileApi,
  saveOwnerProfileApi,
  clearOwnerProfileApi,
} from "./owner-profile-api.ts";
import { OwnerIdentitySection } from "./OwnerIdentitySection.tsx";
import { OwnerContactsSection } from "./OwnerContactsSection.tsx";
import { OwnerAddressesSection } from "./OwnerAddressesSection.tsx";
import { OwnerPreferencesSection } from "./OwnerPreferencesSection.tsx";
import { OwnerCommunicationSection } from "./OwnerCommunicationSection.tsx";
import { OwnerAvailabilitySection } from "./OwnerAvailabilitySection.tsx";
import { OwnerCustomFactsSection } from "./OwnerCustomFactsSection.tsx";

export const OwnerProfileEditor: React.FC<OwnerProfileEditorProps> = ({
  isOpen,
  onClose,
  isInline,
}) => {
  const isModal = isOpen === true && Boolean(onClose);
  const shouldRender = isOpen !== false;

  const [profile, setProfile] = useState<Owner360Profile | null>(null);
  const [suggestions, setSuggestions] = useState<{ preferredName?: string; email?: string }>({});
  const [activeTab, setActiveTab] = useState<OwnerProfileTabId>("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setRevisionConflict(false);
    try {
      const data = await fetchOwnerProfileApi();
      setProfile(data.profile);
      if (data.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (e: any) {
      setErrorMessage(e.message || "Failed to load owner profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (shouldRender) {
      fetchProfile();
    }
  }, [shouldRender, fetchProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setRevisionConflict(false);

    try {
      const data = await saveOwnerProfileApi(profile, profile.revision);
      setProfile(data.profile);
      setSuccessMessage("Owner profile saved successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (e: any) {
      if (e.code === "REVISION_CONFLICT") {
        setRevisionConflict(true);
      }
      setErrorMessage(e.message || "Error saving profile");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!profile) return;
    if (
      !window.confirm(
        "Are you sure you want to reset your Owner360 profile? This will remove all saved addresses and personal details."
      )
    ) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);

    try {
      const data = await clearOwnerProfileApi(profile.revision);
      setProfile(data.profile);
      setSuccessMessage("Owner profile reset to defaults.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (e: any) {
      setErrorMessage(e.message || "Failed to clear profile");
    } finally {
      setSaving(false);
    }
  };

  if (!shouldRender) return null;

  const tabs: Array<{ id: OwnerProfileTabId; label: string; icon: React.ReactNode }> = [
    { id: "basic", label: "Basic Details", icon: <User className="h-4 w-4" /> },
    { id: "contacts", label: "Contact Details", icon: <Mail className="h-4 w-4" /> },
    { id: "addresses", label: "Addresses", icon: <MapPin className="h-4 w-4" /> },
    { id: "locale", label: "Locale & Timezone", icon: <Globe className="h-4 w-4" /> },
    { id: "communication", label: "Communication & Tone", icon: <MessageSquare className="h-4 w-4" /> },
    { id: "availability", label: "Availability & Meetings", icon: <Clock className="h-4 w-4" /> },
    { id: "facts", label: "Personal Facts", icon: <Shield className="h-4 w-4" /> },
  ];

  const editorContent = (
    <div
      className={`relative flex flex-col w-full rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] shadow-xl overflow-hidden ${
        isModal ? "max-w-4xl max-h-[90vh]" : "min-h-[500px]"
      }`}
      onClick={(e) => e.stopPropagation()}
      data-testid="owner-profile-editor"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--ca-border-subtle)] px-6 py-4 bg-[var(--ca-bg-subtle)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md flex-shrink-0">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
                Owner360 / Personal Profile
              </h3>
              {profile && (
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Rev #{profile.revision}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--ca-text-secondary)]">
              Authoritative personal context used by your Personal Assistant. Deny-by-default privacy.
            </p>
          </div>
        </div>
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)] hover:text-[var(--ca-text-primary)] transition-colors"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Suggestion banner from Google / Signup Identity */}
      {suggestions.preferredName && (!profile?.identity?.preferredName || profile.identity.preferredName.trim() === "") && (
        <div className="flex items-center justify-between bg-amber-50 px-6 py-2.5 border-b border-amber-200 text-xs text-amber-900 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>
              Use name from your Google account (<strong>{suggestions.preferredName}</strong>)? Default privacy will remain strictly <strong>PRIVATE</strong>.
            </span>
          </div>
          <button
            type="button"
            data-testid="google-prefill-name-button"
            onClick={(e) => {
              e.stopPropagation();
              if (profile) {
                setProfile({
                  ...profile,
                  identity: {
                    ...profile.identity,
                    preferredName: suggestions.preferredName,
                    source: "google_account",
                    privacyPolicy: "PRIVATE",
                  },
                });
              }
            }}
            className="rounded-md bg-amber-200 px-2.5 py-1 font-bold text-amber-900 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100 flex-shrink-0"
          >
            Use Suggestion
          </button>
        </div>
      )}

      {/* Concurrency Conflict Alert */}
      {revisionConflict && (
        <div
          className="flex items-center justify-between bg-rose-50 px-6 py-3 border-b border-rose-200 text-xs text-rose-900 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200"
          data-testid="revision-conflict-banner"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <span>
              <strong>Profile modified elsewhere.</strong> Your local changes conflict with a newer server revision.
            </span>
          </div>
          <button
            type="button"
            onClick={fetchProfile}
            className="rounded-md bg-rose-600 px-2.5 py-1 font-bold text-white hover:bg-rose-700 transition-colors"
          >
            Reload Latest Profile
          </button>
        </div>
      )}

      {/* Status messages */}
      {errorMessage && (
        <div className="flex items-center justify-between bg-rose-50 px-6 py-2.5 border-b border-rose-200 text-xs text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={fetchProfile}
            className="text-xs underline font-semibold hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      )}
      {successMessage && (
        <div
          data-testid="owner-profile-success-message"
          className="flex items-center gap-2 bg-emerald-50 px-6 py-2.5 border-b border-emerald-200 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-300"
        >
          <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] px-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-3.5 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:border-[var(--ca-border-subtle)]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && !profile ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mb-3" />
            <p className="text-xs font-medium text-[var(--ca-text-secondary)]">Loading owner profile...</p>
          </div>
        ) : !profile ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-3 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-[var(--ca-text-primary)]">Unable to load Owner360 profile</p>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1 max-w-sm">
              We couldn't retrieve your profile data. Please verify your connection or try again.
            </p>
            <button
              type="button"
              onClick={fetchProfile}
              className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow"
            >
              Retry Loading Profile
            </button>
          </div>
        ) : (
          <>
            {activeTab === "basic" && (
              <OwnerIdentitySection profile={profile} onChange={setProfile} />
            )}
            {activeTab === "contacts" && (
              <OwnerContactsSection profile={profile} onChange={setProfile} />
            )}
            {activeTab === "addresses" && (
              <OwnerAddressesSection profile={profile} onChange={setProfile} />
            )}
            {activeTab === "locale" && (
              <OwnerPreferencesSection profile={profile} onChange={setProfile} />
            )}
            {activeTab === "communication" && (
              <OwnerCommunicationSection profile={profile} onChange={setProfile} />
            )}
            {activeTab === "availability" && (
              <OwnerAvailabilitySection profile={profile} onChange={setProfile} />
            )}
            {activeTab === "facts" && (
              <OwnerCustomFactsSection
                profile={profile}
                onChange={setProfile}
                onError={(err) => setErrorMessage(err)}
              />
            )}
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-[var(--ca-border-subtle)] bg-[var(--ca-bg-subtle)] px-6 py-3">
        <button
          type="button"
          onClick={handleClear}
          disabled={saving || loading || !profile}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </button>

        <div className="flex items-center gap-3">
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)] transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            data-testid="save-owner-profile-button"
            onClick={handleSave}
            disabled={saving || loading || !profile}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        data-testid="owner-profile-modal"
        onClick={onClose}
      >
        {editorContent}
      </div>
    );
  }

  return editorContent;
};
