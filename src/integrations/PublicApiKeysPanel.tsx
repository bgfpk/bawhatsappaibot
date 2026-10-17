import React, { useState } from "react";
import { Key, Plus, Copy, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import { PUBLIC_API_SCOPES, type ApiKeyRecord, type PublicApiScope } from "./integration-model";

interface Props {
  apiKeys?: ApiKeyRecord[];
  onCreateKey?: (name: string, scopes: PublicApiScope[]) => Promise<{ rawKey: string; record: ApiKeyRecord }>;
  onRevokeKey?: (keyId: string) => Promise<void>;
  onCopy?: (text: string) => void;
  formatDate?: (ts: any) => string;
}

export const PublicApiKeysPanel: React.FC<Props> = ({
  apiKeys = [],
  onCreateKey,
  onRevokeKey,
  onCopy = (_text: string) => {},
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<PublicApiScope[]>(["read:account"]);
  const [isCreating, setIsCreating] = useState(false);

  const [rawKeyOnce, setRawKeyOnce] = useState<string | null>(null);

  const [revokingKey, setRevokingKey] = useState<ApiKeyRecord | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleToggleScope = (scope: PublicApiScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim() || selectedScopes.length === 0) return;

    setIsCreating(true);
    try {
      if (onCreateKey) {
        const res = await onCreateKey(keyName.trim(), selectedScopes);
        setRawKeyOnce(res.rawKey);
      } else {
        const generated = `bai_live_${Math.random().toString(36).slice(2)}${Date.now()}`;
        setRawKeyOnce(generated);
      }
      setIsCreateOpen(false);
      setKeyName("");
      setSelectedScopes(["read:account"]);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingKey) return;
    setIsRevoking(true);
    try {
      if (onRevokeKey) await onRevokeKey(revokingKey.id);
      setRevokingKey(null);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Public API Keys</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Generate scoped API keys to access BlackArrow account data securely.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="ca-button-primary text-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create API Key
          </button>
        </div>

        {/* API Keys Table */}
        <div className="mt-6 overflow-x-auto">
          {apiKeys.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
              No API keys created yet. Click "Create API Key" to get started.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Key Name</th>
                  <th className="py-3 px-3">Masked Key</th>
                  <th className="py-3 px-3">Scopes</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {apiKeys.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--ca-bg-hover)]">
                    <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)]">
                      {item.name}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-secondary)]">
                      {item.keyMasked}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {item.scopes.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          item.status === "active"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-rose-500/10 text-rose-500"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)]">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {item.status === "active" && (
                        <button
                          type="button"
                          onClick={() => setRevokingKey(item)}
                          className="ca-button-secondary text-xs text-rose-500 hover:bg-rose-500/10 px-2.5 py-1"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Key Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Public API Key"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Key Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Mobile App Backend"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-2">
              Select Permissions / Scopes *
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]">
              {PUBLIC_API_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => handleToggleScope(scope)}
                    className="accent-[var(--ca-brand)] rounded"
                  />
                  <span className="font-mono font-bold text-[var(--ca-text-secondary)]">
                    {scope}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !keyName.trim() || selectedScopes.length === 0}
              className="ca-button-primary text-xs"
            >
              {isCreating ? "Generating..." : "Generate API Key"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Raw Key Display Modal (Shown Once!) */}
      <Dialog
        isOpen={Boolean(rawKeyOnce)}
        onClose={() => setRawKeyOnce(null)}
        title="API Key Created Successfully"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold">Save your secret key now!</p>
              <p className="mt-0.5">
                This secret API key will NEVER be shown in full again after closing this window.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] flex items-center justify-between">
            <code className="text-xs font-mono font-bold text-[var(--ca-text-primary)] break-all">
              {rawKeyOnce}
            </code>
            <button
              type="button"
              onClick={() => onCopy(rawKeyOnce || "")}
              className="ca-button-secondary text-xs ml-2 shrink-0"
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setRawKeyOnce(null)}
              className="ca-button-primary text-xs"
            >
              I Have Saved This Key
            </button>
          </div>
        </div>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(revokingKey)}
        onClose={() => setRevokingKey(null)}
        title="Revoke API Key"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>
              Revoking key <strong className="font-mono">{revokingKey?.name}</strong> will permanently block all API calls using it. This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRevokingKey(null)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRevoke}
              disabled={isRevoking}
              className="ca-button-primary text-xs bg-rose-600 hover:bg-rose-700"
            >
              {isRevoking ? "Revoking..." : "Confirm Revoke"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
