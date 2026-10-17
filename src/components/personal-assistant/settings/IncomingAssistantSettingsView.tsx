import React, { useState, useEffect } from "react";
import type { PersonalIncomingAssistantSettings, PersonalIncomingReplyMode, PersonalAssistantDisclosureMode } from "../../../services/personal-incoming-types.ts";

interface IncomingAssistantSettingsViewProps {
  instanceId?: string;
  isFeatureEnabled?: boolean;
}

export const IncomingAssistantSettingsView: React.FC<IncomingAssistantSettingsViewProps> = ({
  instanceId = "default_personal",
  isFeatureEnabled = true,
}) => {
  const [settings, setSettings] = useState<PersonalIncomingAssistantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [instanceId]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/personal-assistant/instances/${instanceId}/incoming-settings`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      } else {
        setError(data.error || "Failed to load assistant settings");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/personal-assistant/instances/${instanceId}/incoming-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
        setSuccessMessage("Settings saved successfully!");
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(data.error || "Failed to save settings");
      }
    } catch (err: any) {
      setError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!isFeatureEnabled) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
        <h3 className="font-semibold text-lg">Personal Assistant Disabled</h3>
        <p className="mt-1 text-sm">Personal Assistant feature is currently disabled in system settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mb-2" />
        <p className="text-sm">Loading incoming assistant configuration...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
        <p>{error || "Unable to load settings."}</p>
        <button
          onClick={fetchSettings}
          className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl">
      <div className="border-b border-slate-200 pb-4 mb-6">
        <h2 className="text-xl font-bold text-slate-900">Incoming Personal Assistant</h2>
        <p className="text-sm text-slate-500 mt-1">
          Configure how your Personal Assistant answers incoming messages on your personal WhatsApp instance.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <span className="font-semibold text-slate-800 block">Enable Incoming Assistant</span>
            <span className="text-xs text-slate-500">
              When disabled, incoming personal messages are saved to history without triggering auto-replies.
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  enabled: e.target.checked,
                  incomingReplyMode: e.target.checked && settings.incomingReplyMode === "off" ? "known_contacts_only" : settings.incomingReplyMode,
                })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Reply Scope */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Reply Scope</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: "off", label: "Off", desc: "No auto-replies" },
              { id: "known_contacts_only", label: "Known Contacts Only", desc: "Saved personal contacts" },
              { id: "all_private_contacts", label: "All Private Chats", desc: "Any 1-on-1 WhatsApp chat" },
            ].map((option) => (
              <label
                key={option.id}
                className={`p-3 border rounded-xl cursor-pointer flex flex-col transition-colors ${
                  settings.incomingReplyMode === option.id
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="replyScope"
                    value={option.id}
                    checked={settings.incomingReplyMode === option.id}
                    onChange={() =>
                      setSettings({
                        ...settings,
                        incomingReplyMode: option.id as PersonalIncomingReplyMode,
                        enabled: option.id !== "off",
                      })
                    }
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-semibold">{option.label}</span>
                </div>
                <span className="text-xs text-slate-500 mt-1 pl-5">{option.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Assistant Display Name */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Assistant Display Name
          </label>
          <input
            type="text"
            value={settings.assistantDisplayName}
            onChange={(e) => setSettings({ ...settings, assistantDisplayName: e.target.value })}
            placeholder="e.g. Personal Assistant"
            className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Identity Disclosure */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Identity Disclosure Mode
          </label>
          <select
            value={settings.disclosureMode}
            onChange={(e) =>
              setSettings({ ...settings, disclosureMode: e.target.value as PersonalAssistantDisclosureMode })
            }
            className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="first_contact">Introduce once on first contact / new conversation (Recommended)</option>
            <option value="always">Always include assistant identity in replies</option>
            <option value="never">Do not explicitly introduce as assistant</option>
          </select>
        </div>

        {/* Manual Takeover Duration */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Manual Takeover Duration (Minutes)
          </label>
          <p className="text-xs text-slate-500 mb-2">
            When you send a message yourself on your Personal WhatsApp, auto-replies are paused for that contact for this duration.
          </p>
          <input
            type="number"
            min={5}
            max={1440}
            value={settings.manualTakeoverDurationMinutes}
            onChange={(e) =>
              setSettings({ ...settings, manualTakeoverDurationMinutes: Number(e.target.value) || 60 })
            }
            className="w-32 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Owner Escalation */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <span className="font-semibold text-slate-800 block">Owner Escalation Notifications</span>
            <span className="text-xs text-slate-500">
              Notify you on your Business WhatsApp when a contact asks something requiring your personal decision.
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.ownerEscalationEnabled}
              onChange={(e) =>
                setSettings({ ...settings, ownerEscalationEnabled: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Global Assistant Instructions
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Provide custom guidance for your assistant when answering incoming personal chats. Your instructions are preserved completely.
          </p>
          <textarea
            rows={4}
            value={settings.globalInstructions}
            onChange={(e) => setSettings({ ...settings, globalInstructions: e.target.value })}
            placeholder="e.g. Be polite and brief. If someone asks about my availability this week, tell them I am travelling until Friday."
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono text-xs"
          />
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-slate-200 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving Changes..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
};
