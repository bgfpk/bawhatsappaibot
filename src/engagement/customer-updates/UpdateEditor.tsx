import React, { useState, useEffect } from "react";
import { Dialog } from "../../design-system/primitives/Overlays";
import { Clock, Globe, Save } from "lucide-react";
import { TextLimitCounter } from "../../components/TextLimitCounter";
import type { CustomerUpdateItem, CustomerUpdateType, CustomerUpdateRepeat } from "./customer-update-model";

export interface UpdateEditorProps {
  update: CustomerUpdateItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updateData: Partial<CustomerUpdateItem>) => Promise<void> | void;
}

export const UpdateEditor: React.FC<UpdateEditorProps> = ({
  update,
  isOpen,
  onClose,
  onSave,
}) => {
  const [type, setType] = useState<CustomerUpdateType>("planned");
  const [message, setMessage] = useState("");
  const [repeat, setRepeat] = useState<CustomerUpdateRepeat>("none");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (update) {
      setType(update.type);
      setMessage(update.message || update.summary || "");
      setRepeat(update.repeat || "none");
      if (update.scheduledAt) {
        const d = new Date(update.scheduledAt);
        const iso = d.toISOString().slice(0, 16);
        setScheduledTime(iso);
      } else {
        setScheduledTime("");
      }
    } else {
      setType("planned");
      setMessage("");
      setRepeat("none");
      setScheduledTime("");
    }
  }, [update, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSaving(true);
    const ts = scheduledTime ? new Date(scheduledTime).getTime() : Date.now();
    try {
      await onSave({
        id: update?.id,
        type,
        message: message.trim(),
        summary: message.trim(),
        repeat,
        scheduledAt: ts,
        status: update?.status || "pending",
        raw: update?.raw,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={update ? "Edit Customer Update" : "Schedule Customer Update"}
      description="Configure automated customer alerts and stock notification updates."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Update Category
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="planned">Planned Customer Update</option>
              <option value="stock">Stock Availability Alert</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Repeat Recurrence
            </label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as any)}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="none">One-time (No repeat)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block mb-1 font-bold text-[var(--ca-text-primary)] flex items-center justify-between">
            <span>Scheduled Delivery Date & Time *</span>
            <span className="font-mono text-[10px] text-[var(--ca-text-muted)] flex items-center gap-1 font-normal">
              <Globe className="h-3 w-3" /> PKT (Asia/Karachi)
            </span>
          </label>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="font-bold text-[var(--ca-text-primary)]">
              Update Message Content *
            </label>
            <TextLimitCounter value={message} limit={1000} />
          </div>
          <textarea
            rows={4}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type customer update message..."
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500 font-sans"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !message.trim()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Update"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
