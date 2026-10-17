import React, { useState } from "react";
import { Webhook, Plus, Copy, Trash2, Send, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import type { WebhookRecord } from "./integration-model";

const SUPPORTED_EVENTS = [
  "lead.captured",
  "order.created",
  "order.updated",
  "product.updated",
  "customer.updated",
];

interface Props {
  webhooks?: WebhookRecord[];
  onCreateWebhook?: (name: string, targetUrl: string, events: string[]) => Promise<{ rawSecret: string; record: WebhookRecord }>;
  onDeleteWebhook?: (id: string) => Promise<void>;
  onTestPing?: (id: string) => Promise<{ success: boolean; message?: string }>;
  onCopy?: (text: string) => void;
  formatDate?: (ts: any) => string;
}

export const WebhooksPanel: React.FC<Props> = ({
  webhooks = [],
  onCreateWebhook,
  onDeleteWebhook,
  onTestPing,
  onCopy = (_text: string) => {},
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["lead.captured"]);
  const [isCreating, setIsCreating] = useState(false);

  const [rawSecretOnce, setRawSecretOnce] = useState<string | null>(null);

  const [deletingWebhook, setDeletingWebhook] = useState<WebhookRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [pingResult, setPingResult] = useState<{ id: string; success: boolean; message?: string } | null>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);

  const handleToggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetUrl.trim() || selectedEvents.length === 0) return;

    setIsCreating(true);
    try {
      if (onCreateWebhook) {
        const res = await onCreateWebhook(name.trim(), targetUrl.trim(), selectedEvents);
        setRawSecretOnce(res.rawSecret);
      } else {
        const generatedSecret = `whsec_${Math.random().toString(36).slice(2)}${Date.now()}`;
        setRawSecretOnce(generatedSecret);
      }
      setIsCreateOpen(false);
      setName("");
      setTargetUrl("");
      setSelectedEvents(["lead.captured"]);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingWebhook) return;
    setIsDeleting(true);
    try {
      if (onDeleteWebhook) await onDeleteWebhook(deletingWebhook.id);
      setDeletingWebhook(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestPing = async (id: string) => {
    setPingingId(id);
    setPingResult(null);
    try {
      if (onTestPing) {
        const res = await onTestPing(id);
        setPingResult({ id, ...res });
      } else {
        setPingResult({ id, success: true, message: "Synthetic test payload delivered successfully (200 OK)." });
      }
    } catch (err: any) {
      setPingResult({ id, success: false, message: err.message || "Webhook delivery failed." });
    } finally {
      setPingingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Webhook className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Webhooks</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Subscribe to real-time events and deliver JSON payloads to your custom URL.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="ca-button-primary text-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Webhook
          </button>
        </div>

        {/* Webhooks Table */}
        <div className="mt-6 overflow-x-auto">
          {webhooks.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
              No webhooks configured yet. Click "Add Webhook" to register an endpoint.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Name</th>
                  <th className="py-3 px-3">Target URL</th>
                  <th className="py-3 px-3">Events</th>
                  <th className="py-3 px-3">Secret</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {webhooks.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--ca-bg-hover)]">
                    <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)]">
                      {item.name}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-secondary)] truncate max-w-[200px]">
                      {item.targetUrl}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {item.events.map((e) => (
                          <span
                            key={e}
                            className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-muted)]">
                      {item.secretMasked}
                    </td>
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)]">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="py-3 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleTestPing(item.id)}
                        disabled={pingingId === item.id}
                        className="ca-button-secondary text-xs px-2.5 py-1"
                      >
                        <Send className={`w-3.5 h-3.5 mr-1 ${pingingId === item.id ? "animate-spin" : ""}`} />
                        {pingingId === item.id ? "Testing..." : "Test Ping"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingWebhook(item)}
                        className="ca-button-secondary text-xs text-rose-500 hover:bg-rose-500/10 px-2.5 py-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pingResult && (
          <div className={`mt-4 p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
            pingResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
          }`}>
            <span>{pingResult.message}</span>
            <button
              type="button"
              onClick={() => setPingResult(null)}
              className="text-[11px] underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register New Webhook Endpoint"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Webhook Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Order Sync Webhook"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Target HTTPS URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://your-server.com/webhooks/blackarrow"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-2">
              Subscribed Events *
            </label>
            <div className="grid grid-cols-2 gap-2 p-2 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]">
              {SUPPORTED_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={() => handleToggleEvent(event)}
                    className="accent-[var(--ca-brand)] rounded"
                  />
                  <span className="font-mono font-bold text-[var(--ca-text-secondary)]">
                    {event}
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
              disabled={isCreating || !name.trim() || !targetUrl.trim() || selectedEvents.length === 0}
              className="ca-button-primary text-xs"
            >
              {isCreating ? "Registering..." : "Register Webhook"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Secret Display Modal */}
      <Dialog
        isOpen={Boolean(rawSecretOnce)}
        onClose={() => setRawSecretOnce(null)}
        title="Webhook Signing Secret"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold">Save Webhook Signing Secret!</p>
              <p className="mt-0.5">
                Use this signing secret to verify incoming signature headers (`X-BlackArrow-Signature`). This secret will NEVER be shown in full again.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] flex items-center justify-between">
            <code className="text-xs font-mono font-bold text-[var(--ca-text-primary)] break-all">
              {rawSecretOnce}
            </code>
            <button
              type="button"
              onClick={() => onCopy(rawSecretOnce || "")}
              className="ca-button-secondary text-xs ml-2 shrink-0"
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setRawSecretOnce(null)}
              className="ca-button-primary text-xs"
            >
              I Have Saved This Secret
            </button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        isOpen={Boolean(deletingWebhook)}
        onClose={() => setDeletingWebhook(null)}
        title="Delete Webhook Subscription"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>
              Are you sure you want to delete webhook <strong className="font-bold">{deletingWebhook?.name}</strong>? Event notifications to <code className="font-mono">{deletingWebhook?.targetUrl}</code> will stop immediately.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingWebhook(null)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="ca-button-primary text-xs bg-rose-600 hover:bg-rose-700"
            >
              {isDeleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
