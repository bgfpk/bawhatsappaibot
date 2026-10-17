import React, { useState } from "react";
import { Send, Truck, FileText, CheckCircle, ShieldAlert, AlertTriangle } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar } from "../../components/dashboard/DashboardPrimitives";
import { BroadcastHistoryPanel } from "./BroadcastHistoryPanel";
import type { BroadcastCampaignItem } from "./broadcast-model";

export interface BroadcastPageProps {
  history?: BroadcastCampaignItem[];
  bots?: any[];
  selectedBotId?: string | null;
  onSendBroadcast?: (data: {
    trackingNumbers: string[];
    type: "booked" | "out-for-delivery" | "delivered";
    title?: string;
    message?: string;
  }) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export function parseTrackingIds(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && !s.includes("@"))
    )
  );
}

export const BroadcastPage: React.FC<BroadcastPageProps> = ({
  history = [],
  bots = [],
  selectedBotId,
  onSendBroadcast,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [activeTab, setActiveTab] = useState<"composer" | "history">("composer");
  const [trackingInput, setTrackingInput] = useState("");
  const [statusType, setStatusType] = useState<"booked" | "out-for-delivery" | "delivered">("booked");
  const [customNote, setCustomNote] = useState("");
  const [isSending, setIsSending] = useState(false);

  const parsedIds = parseTrackingIds(trackingInput);
  const selectedBot = bots.find((b: any) => b.id === selectedBotId || b.$id === selectedBotId);
  const instanceName = selectedBot?.name || selectedBot?.phone || "Selected Instance";

  const handleSend = async () => {
    if (!selectedBotId || parsedIds.length === 0 || !onSendBroadcast) return;
    setIsSending(true);
    try {
      await onSendBroadcast({
        trackingNumbers: parsedIds,
        type: statusType,
        title: `Courier Update (${statusType})`,
        message: customNote.trim() || undefined,
      });
      setTrackingInput("");
      setCustomNote("");
      setActiveTab("history");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Courier & Order Tracking"
        title="Courier Order Status Broadcasts"
        description="Deliver automated WhatsApp order tracking status updates to customers using Courier tracking/AWB numbers."
        icon={Send}
      />

      {/* Action Toolbar */}
      <DashboardToolbar>
        <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("composer")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "composer"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            New Courier Broadcast
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "history"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Broadcast History ({history.length})
          </button>
        </div>
      </DashboardToolbar>

      {activeTab === "composer" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Left Form: AWB Tracking IDs & Status */}
          <div className="lg:col-span-2 space-y-4 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>Courier Order Tracking Setup</span>
            </h3>

            <div>
              <label className="block mb-1 text-xs font-bold text-[var(--ca-text-primary)]">
                Courier Tracking / AWB Numbers * (One per line or comma-separated)
              </label>
              <textarea
                rows={5}
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Enter courier tracking numbers e.g.:&#10;KHI10928374&#10;LHR99283471&#10;ISB55412398"
                className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-3 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
              />
              <p className="mt-1 text-[11px] text-[var(--ca-text-muted)] font-medium">
                {parsedIds.length} unique courier tracking ID{parsedIds.length === 1 ? "" : "s"} detected.
              </p>
            </div>

            <div>
              <label className="block mb-1 text-xs font-bold text-[var(--ca-text-primary)]">
                Order Status Update Event *
              </label>
              <select
                value={statusType}
                onChange={(e) => setStatusType(e.target.value as any)}
                className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
              >
                <option value="booked">Booked / Dispatched</option>
                <option value="out-for-delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-xs font-bold text-[var(--ca-text-primary)]">
                Optional Custom Note / Message Annex
              </label>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g. Thank you for shopping with us!"
                className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
              />
            </div>

            {!selectedBotId && (
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Please select an active WhatsApp instance to enable courier broadcasts.</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!selectedBotId || parsedIds.length === 0 || isSending}
                onClick={handleSend}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-all"
              >
                <Send className="h-4 w-4" />
                <span>{isSending ? "Dispatching..." : `Send ${parsedIds.length} Courier Broadcasts`}</span>
              </button>
            </div>
          </div>

          {/* Right Safety & Instance Card */}
          <div className="space-y-4 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-5 shadow-sm text-xs font-medium">
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
              Courier Safety & Instance
            </h3>

            <div className="space-y-2 rounded-xl bg-[var(--ca-surface-2)] p-3.5 border border-[var(--ca-border-subtle)]">
              <div className="flex justify-between">
                <span className="text-[var(--ca-text-muted)] font-bold">Instance:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{instanceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ca-text-muted)] font-bold">Valid Tracking IDs:</span>
                <span className="font-mono font-bold text-[var(--ca-text-primary)]">{parsedIds.length}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--ca-border-subtle)] pt-2">
                <span className="text-[var(--ca-text-muted)] font-bold">Event Type:</span>
                <span className="font-mono uppercase font-bold text-amber-600 dark:text-amber-400">{statusType}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] text-[var(--ca-text-muted)]">
              <p className="font-bold text-[var(--ca-text-primary)]">Safety Guarantees:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Only valid courier tracking/AWB numbers are dispatched.</li>
                <li>Customer phone numbers are strictly forbidden as tracking IDs.</li>
                <li>No wallet charges for failed or duplicate tracking dispatches.</li>
                <li>Requires explicit selected WhatsApp instance.</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <BroadcastHistoryPanel
          history={history}
          formatDate={formatDate}
        />
      )}
    </div>
  );
};
