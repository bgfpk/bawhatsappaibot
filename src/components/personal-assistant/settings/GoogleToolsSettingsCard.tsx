import React, { useState, useEffect } from "react";
import type {
  GooglePersonalConnection,
  GoogleCapability,
} from "../../../services/google-personal-auth-types.ts";

interface GoogleToolsSettingsCardProps {
  isFeatureEnabled?: boolean;
}

interface CapabilityMeta {
  key: GoogleCapability;
  title: string;
  icon: string;
  description: string;
  notice?: string;
}

const CAPABILITY_METAS: CapabilityMeta[] = [
  {
    key: "calendarEvents",
    title: "Google Calendar",
    icon: "📅",
    description: "Check your real availability and create/update approved calendar events.",
    notice: "Reads busy/free slots for scheduling. Private event titles are minimized.",
  },
  {
    key: "googleContactsRead",
    title: "Google Contacts",
    icon: "👥",
    description: "Find people from your Google Contacts when you ask the assistant to contact them.",
    notice: "Read-only lookup. Your address book is never bulk-imported or modified.",
  },
  {
    key: "gmailSend",
    title: "Gmail Send",
    icon: "✉️",
    description: "Send emails on your behalf when you authorize a Personal Assistant task.",
    notice: "Send-only permission. The assistant cannot read your inbox or search emails.",
  },
  {
    key: "driveSelectedFiles",
    title: "Google Drive Files",
    icon: "📁",
    description: "Use only files you explicitly select.",
    notice: "Access is strictly limited to files you choose to open (drive.file).",
  },
];

export const GoogleToolsSettingsCard: React.FC<GoogleToolsSettingsCardProps> = ({
  isFeatureEnabled = true,
}) => {
  const [connection, setConnection] = useState<GooglePersonalConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/personal-assistant/google/status");
      const data = await res.json();
      if (data.success && data.connection) {
        setConnection(data.connection);
      } else {
        setError(data.error || "Failed to load Google status");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (capabilities: GoogleCapability[]) => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/personal-assistant/google/oauth/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities }),
      });
      const data = await res.json();
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError(data.error || "Failed to start Google connection");
      }
    } catch (err: any) {
      setError(err?.message || "Connection failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect Google tools? This stops future calendar, contact, and email actions.")) {
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/personal-assistant/google/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success && data.connection) {
        setConnection(data.connection);
        setSuccessMessage("Google tools disconnected and local tokens revoked.");
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(data.error || "Failed to disconnect Google");
      }
    } catch (err: any) {
      setError(err?.message || "Disconnect failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggle = async (capability: GoogleCapability, currentEnabled: boolean) => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch("/api/personal-assistant/google/capabilities/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability, enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.success && data.connection) {
        setConnection(data.connection);
        setSuccessMessage(`Capability "${capability}" updated.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(data.error || "Failed to toggle capability");
      }
    } catch (err: any) {
      setError(err?.message || "Update failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isFeatureEnabled) {
    return null;
  }

  if (loading) {
    return (
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-slate-400">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
        Loading Google tools...
      </div>
    );
  }

  const isConnected = connection?.status === "CONNECTED";
  const isReauth = connection?.status === "REAUTH_REQUIRED";

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>🔗</span> Connected Google Tools
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Connect free Google Workspace tools (Calendar, Contacts, Gmail Send, Drive) with incremental, revocable permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected ({connection?.googleEmail || "Google"})
            </span>
          )}
          {isReauth && (
            <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-xs font-medium">
              ⚠️ Re-authorization Required
            </span>
          )}
          {!isConnected && !isReauth && (
            <span className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-400 rounded-full text-xs font-medium">
              Not Connected
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs">
          {successMessage}
        </div>
      )}

      {/* Capability Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CAPABILITY_METAS.map((meta) => {
          const isCapGranted = Boolean(connection?.capabilities?.[meta.key]);
          const isInternallyDisabled = Boolean(connection?.internalDisabledCapabilities?.[meta.key]);

          return (
            <div
              key={meta.key}
              className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4 space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <span>{meta.icon}</span> {meta.title}
                  </span>
                  {isCapGranted ? (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Disconnected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  {meta.description}
                </p>
                {meta.notice && (
                  <p className="text-[11px] text-slate-500 mt-1.5 italic">
                    {meta.notice}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                {isCapGranted ? (
                  <button
                    onClick={() => handleToggle(meta.key, !isInternallyDisabled)}
                    disabled={actionLoading}
                    className="text-xs font-medium text-slate-300 hover:text-white transition-colors"
                  >
                    {isInternallyDisabled ? "Enable Capability" : "Disable Capability"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect([meta.key])}
                    disabled={actionLoading}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Connect {meta.title} →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Connection Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <div className="text-xs text-slate-500">
          Zero-dollar free tier: Uses only free Google Workspace quotas. No paid APIs.
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="px-3.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
            >
              Disconnect Google Account
            </button>
          ) : (
            <button
              onClick={() =>
                handleConnect([
                  "calendarEvents",
                  "googleContactsRead",
                  "gmailSend",
                  "driveSelectedFiles",
                ])
              }
              disabled={actionLoading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Connect All Google Tools
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
