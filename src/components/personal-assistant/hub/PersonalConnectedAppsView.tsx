import React, { useState, useEffect } from "react";
import {
  Calendar,
  FileText,
  Mail,
  Users,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Plus,
  ExternalLink,
  AlertCircle,
  FolderOpen,
  Info,
} from "lucide-react";
import { GoogleToolsSettingsCard } from "../settings/GoogleToolsSettingsCard.tsx";
import type { SelectedDriveFile } from "../../../services/google-personal-auth-types.ts";
import {
  listAuthorizedDriveFiles,
  validateAndAddDriveFile,
  unlinkAuthorizedDriveFile,
  fetchGooglePickerConfig,
} from "./hub-api.ts";
import { formatRelativeTime } from "./hub-utils.ts";

export const PersonalConnectedAppsView: React.FC = () => {
  const [driveFiles, setDriveFiles] = useState<SelectedDriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualFileIdInput, setManualFileIdInput] = useState("");
  const [pickerConfig, setPickerConfig] = useState<{ configured: boolean; appId?: string; apiKeyMasked?: string }>({
    configured: false,
  });

  const loadFiles = async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const [files, config] = await Promise.all([
        listAuthorizedDriveFiles(),
        fetchGooglePickerConfig().catch(() => ({ configured: false })),
      ]);
      setDriveFiles(files);
      setPickerConfig(config);
    } catch (err: any) {
      setError(err.message || "Failed to load connected app data.");
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleAddDriveFile = async (idOrUrl: string) => {
    const trimmed = idOrUrl.trim();
    if (!trimmed) return;

    // Extract file ID if owner pasted a Google Drive link
    let fileId = trimmed;
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      fileId = match[1];
    }

    setActionLoading(true);
    setError(null);
    try {
      const added = await validateAndAddDriveFile(fileId);
      setDriveFiles((prev) => [...prev.filter((f) => f.fileId !== added.fileId), added]);
      setManualFileIdInput("");
    } catch (err: any) {
      setError(err.message || "Could not authorize Drive file. Verify file ID and drive.file authorization.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlinkFile = async (fileId: string) => {
    if (!window.confirm("Remove access to this Drive file? Personal tasks will no longer be able to read it.")) return;
    setActionLoading(true);
    setError(null);
    try {
      await unlinkAuthorizedDriveFile(fileId);
      setDriveFiles((prev) => prev.filter((f) => f.fileId !== fileId));
    } catch (err: any) {
      setError(err.message || "Failed to unlink file.");
    } finally {
      setActionLoading(false);
    }
  };

  const openGooglePicker = () => {
    if (!pickerConfig.configured) {
      setError(
        "Google Picker API is not enabled in environment (requires GOOGLE_PICKER_API_KEY). You can authorize specific files directly by pasting their Drive Link or ID below."
      );
      return;
    }
    const google = (window as any).google;
    if (google?.picker) {
      try {
        const picker = new google.picker.PickerBuilder()
          .addView(google.picker.ViewId.DOCS)
          .setAppId(pickerConfig.appId || "")
          .setCallback(async (data: any) => {
            if (data.action === google.picker.Action.PICKED) {
              const doc = data.docs?.[0];
              if (doc?.id) {
                await handleAddDriveFile(doc.id);
              }
            }
          })
          .build();
        picker.setVisible(true);
      } catch (err: any) {
        setError("Error opening Google Picker: " + (err.message || "Unknown error"));
      }
    } else {
      setError("Google Picker library loading pending. You can use the explicit Drive File ID / Link input below.");
    }
  };

  return (
    <div className="space-y-6" data-testid="connected-apps-container">
      {/* Existing Google Tools Settings Card */}
      <GoogleToolsSettingsCard />

      {/* Selected Google Drive Files Section (Sections 41, 42, 44) */}
      <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              Authorized Google Drive Files
            </h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
              Only files you explicitly select are authorized for Personal Assistant context. BlackArrow does not have broad access to your Google Drive.
            </p>
          </div>

          <button
            onClick={openGooglePicker}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Select with Google Picker</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Explicit File ID / URL input fallback */}
        <div className="p-3.5 rounded-xl bg-black/20 border border-[var(--ca-border-subtle)] space-y-2">
          <label className="text-xs font-semibold text-[var(--ca-text-primary)] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
            Add Drive File by Link or ID (Direct Selection):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualFileIdInput}
              onChange={(e) => setManualFileIdInput(e.target.value)}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms or Drive sharing link"
              className="flex-1 px-3 py-2 rounded-xl text-xs bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => handleAddDriveFile(manualFileIdInput)}
              disabled={actionLoading || !manualFileIdInput.trim()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shrink-0 disabled:opacity-50"
            >
              Authorize File
            </button>
          </div>
        </div>

        {/* Authorized Files List */}
        {loadingFiles ? (
          <div className="py-6 text-center text-xs text-[var(--ca-text-secondary)]">
            Loading authorized files...
          </div>
        ) : driveFiles.length === 0 ? (
          <p className="text-xs text-center text-[var(--ca-text-muted)] py-6">
            No Google Drive files are currently authorized for your Personal Assistant.
          </p>
        ) : (
          <div className="divide-y divide-[var(--ca-border-subtle)]">
            {driveFiles.map((f) => (
              <div key={f.fileId} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-semibold text-[var(--ca-text-primary)] truncate">{f.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-[var(--ca-text-secondary)] font-mono">
                      {f.mimeType.split("/")[1] || "file"}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--ca-text-muted)] font-mono">
                    ID: {f.fileId} • Selected {formatRelativeTime(f.selectedAt)}
                    {f.sizeBytes ? ` • ${(f.sizeBytes / 1024).toFixed(1)} KB` : ""}
                  </div>
                </div>

                <button
                  onClick={() => handleUnlinkFile(f.fileId)}
                  disabled={actionLoading}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                  title="Remove file authorization"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
