import React, { useState } from "react";
import { Globe, Key, Copy, RefreshCw, CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import { maskSecret } from "./integration-model";

interface Props {
  secretMasked?: string;
  onRegenerateSecret?: () => Promise<{ rawSecret: string }>;
  onCopy?: (text: string) => void;
}

export const WebsiteApiPanel: React.FC<Props> = ({
  secretMasked = "bai_lead_••••••••8a9f",
  onRegenerateSecret,
  onCopy = (_text: string) => {},
}) => {
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
  const [newRawSecret, setNewRawSecret] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleConfirmRegenerate = async () => {
    setIsRegenerating(true);
    try {
      if (onRegenerateSecret) {
        const res = await onRegenerateSecret();
        setNewRawSecret(res.rawSecret);
      } else {
        setNewRawSecret(`bai_lead_${Math.random().toString(36).slice(2)}${Date.now()}`);
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  const curlExample = `curl -X POST "https://your-domain.com/api/integrations/leads" \\
  -H "X-API-Key: ${newRawSecret || secretMasked}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Jane Doe",
    "phone": "+144225232320",
    "source": "Website Lead Form"
  }'`;

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Website Lead API</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Integrate website contact forms to automatically capture and deduplicate leads.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">
            <CheckCircle2 className="w-4 h-4" />
            Active Endpoint
          </span>
        </div>

        {/* Configuration Details */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] p-4">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] block mb-1">
              POST Endpoint
            </label>
            <code className="text-xs font-mono font-bold text-[var(--ca-text-primary)] break-all">
              /api/integrations/leads
            </code>
          </div>

          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] p-4">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] block mb-1">
              Required Scope
            </label>
            <span className="inline-block text-xs font-bold font-mono text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded">
              write:leads
            </span>
          </div>
        </div>

        {/* Secret Key Management */}
        <div className="mt-6 rounded-xl border border-[var(--ca-border-subtle)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[var(--ca-text-primary)] flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-500" />
                Integration Secret Key
              </h4>
              <p className="text-[11px] text-[var(--ca-text-secondary)] mt-0.5">
                Stored secret is masked for safety.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewRawSecret(null);
                setIsRegenerateOpen(true);
              }}
              className="ca-button-secondary text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Regenerate Secret
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={secretMasked}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-secondary)] outline-none"
            />
            <button
              type="button"
              onClick={() => onCopy(secretMasked)}
              className="ca-button-secondary text-xs px-3"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Code Example */}
        <div className="mt-6">
          <h4 className="text-xs font-bold text-[var(--ca-text-primary)] mb-2">curl Request Example</h4>
          <pre className="p-4 rounded-xl bg-neutral-950 text-neutral-200 text-xs font-mono overflow-x-auto">
            {curlExample}
          </pre>
        </div>
      </div>

      {/* Regenerate Confirmation Dialog */}
      <Dialog
        isOpen={isRegenerateOpen}
        onClose={() => {
          setIsRegenerateOpen(false);
          setNewRawSecret(null);
        }}
        title="Regenerate Integration Secret"
      >
        {!newRawSecret ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 text-amber-500 text-xs">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>
                Regenerating this secret will immediately invalidate your existing integration key. Any external lead form using the old key will fail until updated.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRegenerateOpen(false)}
                className="ca-button-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerate}
                disabled={isRegenerating}
                className="ca-button-primary text-xs bg-amber-600 hover:bg-amber-700"
              >
                {isRegenerating ? "Regenerating..." : "Confirm & Regenerate"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">New Secret Generated!</p>
                <p className="mt-0.5">
                  Copy your new secret key now. It will NEVER be shown in full again after closing this dialog.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] flex items-center justify-between">
              <code className="text-xs font-mono font-bold text-[var(--ca-text-primary)] break-all">
                {newRawSecret}
              </code>
              <button
                type="button"
                onClick={() => onCopy(newRawSecret)}
                className="ca-button-secondary text-xs ml-2 shrink-0"
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegenerateOpen(false);
                  setNewRawSecret(null);
                }}
                className="ca-button-primary text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
