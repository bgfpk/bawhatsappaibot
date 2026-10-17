import React, { useState, useMemo } from "react";
import { Search, FileText, Plus, Copy, Check, Edit2, Trash2, Layers, Sparkles } from "lucide-react";
import { DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { Dialog } from "../../design-system/primitives/Overlays";
import type { SavedReplyItem, SequenceGroupItem, WelcomeSequenceConfig } from "../content-library-model";
import { normalizeShortcutCode } from "../sequence-group-config-service";

export interface SavedRepliesPanelProps {
  replies: SavedReplyItem[];
  selectedBotId?: string;
  sequences?: SequenceGroupItem[];
  welcomeConfig?: WelcomeSequenceConfig;
  onSaveReplyShortcut?: (data: {
    id?: string;
    title: string;
    shortcutCode: string;
    instructions?: string;
  }) => Promise<void> | void;
  onDeleteReplyShortcut?: (id: string) => Promise<void> | void;
  onSelectTab?: (tab: "sequences" | "welcome") => void;
  formatDate?: (ts?: number | string) => string;
}

export const SavedRepliesPanel: React.FC<SavedRepliesPanelProps> = ({
  replies = [],
  selectedBotId,
  sequences = [],
  welcomeConfig,
  onSaveReplyShortcut,
  onDeleteReplyShortcut,
  onSelectTab,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<SavedReplyItem | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [formData, setFormData] = useState({
    title: "",
    shortcutCode: "",
    instructions: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Delete Modal State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const eligibleFlows = useMemo(() => {
    const list: Array<{ id: string; name: string; purpose: "sequence" | "welcome"; instructions?: string }> = [];
    (sequences || []).forEach((seq) => {
      if (!seq.shortcutCode) {
        list.push({
          id: seq.id,
          name: seq.name || "Sequence Group",
          purpose: "sequence",
          instructions: seq.instructions,
        });
      }
    });
    if (welcomeConfig && welcomeConfig.isConfigured && !welcomeConfig.shortcutCode) {
      list.push({
        id: welcomeConfig.id || "welcome",
        name: welcomeConfig.name || "Welcome Sequence",
        purpose: "welcome",
        instructions: welcomeConfig.instructions,
      });
    }
    return list;
  }, [sequences, welcomeConfig]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return replies;
    return replies.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.shortcut || "").toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q)
    );
  }, [replies, searchQuery]);

  const handleCopyShortcut = (shortcut?: string, id?: string) => {
    if (!shortcut) return;
    navigator.clipboard.writeText(shortcut);
    setCopiedId(id || shortcut);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAddModal = () => {
    setEditingReply(null);
    const initialTarget = eligibleFlows[0];
    setSelectedTargetId(initialTarget?.id || "");
    setFormData({
      title: initialTarget?.name || "",
      shortcutCode: "",
      instructions: initialTarget?.instructions || "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (reply: SavedReplyItem) => {
    setEditingReply(reply);
    setSelectedTargetId(reply.syncGroupId || reply.id);
    setFormData({
      title: reply.title || "",
      shortcutCode: reply.shortcut || "",
      instructions: reply.flowInstructions || "",
    });
    setIsModalOpen(true);
  };

  const handleSelectFlowChange = (targetId: string) => {
    setSelectedTargetId(targetId);
    const flow = eligibleFlows.find((f) => f.id === targetId);
    if (flow) {
      setFormData((prev) => ({
        ...prev,
        title: flow.name,
        instructions: flow.instructions || prev.instructions,
      }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = editingReply ? (editingReply.syncGroupId || editingReply.id) : selectedTargetId;
    if (!targetId || !formData.shortcutCode.trim() || !onSaveReplyShortcut) return;

    const normEntered = normalizeShortcutCode(formData.shortcutCode);
    if (!normEntered) return;
    const existingCollision = replies.find((r) => {
      const currentId = editingReply ? (editingReply.syncGroupId || editingReply.id) : targetId;
      if (r.syncGroupId === currentId || r.id === currentId) return false;
      return normalizeShortcutCode(r.shortcut) === normEntered;
    });
    if (existingCollision) {
      alert(`Shortcut code "${formData.shortcutCode.trim()}" collides with existing shortcut "!${existingCollision.shortcut}". Please choose a unique shortcut code.`);
      return;
    }

    setIsSaving(true);
    try {
      await onSaveReplyShortcut({
        id: targetId,
        title: formData.title.trim() || "Saved Flow",
        shortcutCode: formData.shortcutCode.trim().replace(/^!/, ""),
        instructions: formData.instructions.trim(),
      });
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save shortcut reply:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId || !onDeleteReplyShortcut) return;
    setIsDeleting(true);
    try {
      await onDeleteReplyShortcut(deletingId);
      setDeletingId(null);
    } catch (err) {
      console.error("Failed to delete shortcut reply:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
            Saved Replies & Shortcuts ({filtered.length})
          </h3>
          <p className="text-xs text-[var(--ca-text-muted)]">
            Reusable text templates and fast shortcuts for live chat and AI assistant replies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts or replies..."
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-9 pr-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            disabled={!selectedBotId}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Shortcut Reply</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          icon={FileText}
          title="No Saved Replies Found"
          body="No quick-reply shortcuts match your search. Create or configure a flow to assign shortcuts."
          tone="neutral"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm transition-all hover:border-emerald-500/30"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
                    !{item.shortcut || "no_code"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyShortcut(item.shortcut, item.id)}
                      title="Copy Shortcut"
                      className="rounded-lg p-1.5 text-[var(--ca-text-muted)] hover:bg-[var(--ca-surface-2)] hover:text-[var(--ca-text-primary)]"
                    >
                      {copiedId === (item.id || item.shortcut) ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {onSaveReplyShortcut && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        title="Edit Saved Reply Shortcut"
                        className="rounded-lg p-1.5 text-[var(--ca-text-muted)] hover:bg-[var(--ca-surface-2)] hover:text-[var(--ca-text-primary)]"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteReplyShortcut && (
                      <button
                        type="button"
                        onClick={() => setDeletingId(item.syncGroupId || item.id)}
                        title="Delete Shortcut Reply"
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[var(--ca-text-primary)]">{item.title}</h4>
                  <p className="mt-1 line-clamp-3 text-xs text-[var(--ca-text-secondary)] leading-relaxed">
                    {item.content}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[var(--ca-border-subtle)] pt-2.5 text-[10px] text-[var(--ca-text-muted)]">
                <span>Type: {item.type}</span>
                {item.sourceGroupName && (
                  <span className="font-medium text-[var(--ca-text-secondary)]">Flow: {item.sourceGroupName}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Shortcut Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReply ? "Edit Saved Reply Shortcut" : "Add Saved Reply Shortcut"}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {!editingReply && eligibleFlows.length === 0 ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-xs text-[var(--ca-text-secondary)] leading-relaxed">
                All your configured sequence and welcome flows already have quick-reply shortcuts assigned! To add another shortcut, create a new Sequence Group or configure a Welcome flow first.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    onSelectTab?.("sequences");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3.5 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
                >
                  <Layers className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Create Sequence Group</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    onSelectTab?.("welcome");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Configure Welcome</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {!editingReply && (
                <div>
                  <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
                    Select Source Flow <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedTargetId}
                    onChange={(e) => handleSelectFlowChange(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                  >
                    {eligibleFlows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name} ({flow.purpose})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
                  Flow Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({ ...prev, title: val }));
                  }}
                  placeholder="e.g. Price Catalog Reply"
                  className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
                  Shortcut Code (without !) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.shortcutCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/^!/, "");
                    setFormData((prev) => ({ ...prev, shortcutCode: val }));
                  }}
                  placeholder="e.g. prices"
                  className="w-full font-mono rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
                  Flow Instructions / Notes
                </label>
                <textarea
                  rows={4}
                  value={formData.instructions}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({ ...prev, instructions: val }));
                  }}
                  placeholder="The response text or instructions triggered by this shortcut..."
                  className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-[var(--ca-text-muted)] mt-1 block">
                  Actual captured WhatsApp messages/templates remain active in the underlying flow preview.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Shortcut Reply"}
                </button>
              </div>
            </>
          )}
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        title="Remove Shortcut Code"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--ca-text-secondary)] leading-relaxed">
            Are you sure you want to remove this quick-reply shortcut code? The underlying flow and its message sequence will remain active; only the shortcut trigger code will be cleared.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingId(null)}
              className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? "Removing..." : "Remove Shortcut"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
