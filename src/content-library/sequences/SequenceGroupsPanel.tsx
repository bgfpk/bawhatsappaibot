import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Layers,
  Eye,
  ToggleLeft,
  ToggleRight,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { Dialog } from "../../design-system/primitives/Overlays";
import { filterSequences, type SequenceGroupItem } from "../content-library-model";
import { SequenceDetailDrawer } from "./SequenceDetailDrawer";
import { WhatsAppGroupSelector } from "../WhatsAppGroupSelector";

export interface SequenceGroupsPanelProps {
  sequences: SequenceGroupItem[];
  selectedBotId?: string;
  sequenceGroupLimit?: number;
  onToggleSequence?: (sequenceId: string, enabled: boolean) => Promise<void> | void;
  onRefreshGroup?: (groupId?: string) => Promise<void> | void;
  onResetGroup?: (groupId: string) => Promise<void> | void;
  onUnlinkGroup?: (groupId: string) => Promise<void> | void;
  onSaveSequenceGroup?: (data: {
    id?: string;
    name: string;
    groupJid?: string;
    instructions?: string;
    shortcutCode?: string;
    keywordTrigger?: string;
    isEnabled?: boolean;
  }) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const SequenceGroupsPanel: React.FC<SequenceGroupsPanelProps> = ({
  sequences = [],
  selectedBotId,
  sequenceGroupLimit,
  onToggleSequence,
  onRefreshGroup,
  onResetGroup,
  onUnlinkGroup,
  onSaveSequenceGroup,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeq, setSelectedSeq] = useState<SequenceGroupItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add / Edit Modal State
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingSeq, setEditingSeq] = useState<SequenceGroupItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    groupJid: "",
    instructions: "",
    shortcutCode: "",
    keywordTrigger: "",
    isEnabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Reset Modal State
  const [resettingSeq, setResettingSeq] = useState<SequenceGroupItem | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Delete Modal State
  const [deletingSeq, setDeletingSeq] = useState<SequenceGroupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasBot = Boolean(selectedBotId);

  const filtered = useMemo(() => {
    return filterSequences(sequences, searchQuery);
  }, [sequences, searchQuery]);

  const activeCount = useMemo(() => sequences.filter((s) => s.isEnabled).length, [sequences]);
  const totalItemCount = useMemo(() => sequences.reduce((sum, s) => sum + (s.itemCount || 0), 0), [sequences]);
  const isAtCapacity = typeof sequenceGroupLimit === "number" && sequences.length >= sequenceGroupLimit;

  const handleOpenAddModal = () => {
    if (!hasBot || isAtCapacity) return;
    setEditingSeq(null);
    setFormData({
      name: "",
      groupJid: "",
      instructions: "",
      shortcutCode: "",
      keywordTrigger: "",
      isEnabled: true,
    });
    setIsAddEditOpen(true);
  };

  const handleOpenEditModal = (seq: SequenceGroupItem) => {
    if (!hasBot) return;
    setEditingSeq(seq);
    setFormData({
      name: seq.name || "",
      groupJid: seq.groupJid || "",
      instructions: seq.instructions || "",
      shortcutCode: seq.shortcutCode || "",
      keywordTrigger: seq.keywordTrigger || "",
      isEnabled: seq.isEnabled,
    });
    setIsAddEditOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeq && isAtCapacity) return;
    if (!formData.name.trim() || !formData.groupJid.trim() || !onSaveSequenceGroup) return;
    setIsSaving(true);
    try {
      await onSaveSequenceGroup({
        id: editingSeq?.id,
        name: formData.name.trim(),
        groupJid: formData.groupJid.trim(),
        instructions: formData.instructions.trim() || undefined,
        shortcutCode: formData.shortcutCode.trim() || undefined,
        keywordTrigger: formData.keywordTrigger.trim() || undefined,
        isEnabled: formData.isEnabled,
      });
      setIsAddEditOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = Boolean(
    hasBot &&
    formData.name.trim() &&
    formData.groupJid &&
    formData.groupJid.trim().endsWith("@g.us")
  );

  const handleConfirmDelete = async () => {
    if (!deletingSeq || !onUnlinkGroup) return;
    setIsDeleting(true);
    try {
      await onUnlinkGroup(deletingSeq.id);
      setDeletingSeq(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTriggerRefresh = async (groupId?: string) => {
    if (!onRefreshGroup) return;
    setIsRefreshing(true);
    try {
      await onRefreshGroup(groupId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--ca-border-subtle)] pb-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Sequence Groups ({sequences.length})</span>
          </h3>
          <p className="text-xs text-[var(--ca-text-muted)] mt-0.5">
            {activeCount} active · {totalItemCount} template items configured
            {typeof sequenceGroupLimit === "number" ? ` · Limit: ${sequenceGroupLimit}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefreshGroup && (
            <button
              type="button"
              onClick={() => handleTriggerRefresh()}
              disabled={isRefreshing || !hasBot}
              className="ca-button-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-emerald-500" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Reload Templates"}</span>
            </button>
          )}

          {onSaveSequenceGroup && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              disabled={isAtCapacity || !hasBot}
              className={`text-xs font-bold py-2 px-3.5 rounded-xl inline-flex items-center gap-1.5 transition-all ${
                isAtCapacity || !hasBot
                  ? "bg-neutral-500/10 text-[var(--ca-text-muted)] cursor-not-allowed border border-[var(--ca-border-subtle)]"
                  : "ca-button-primary"
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Add Sequence Group</span>
            </button>
          )}
        </div>
      </div>

      {/* Limit Capacity Warning */}
      {isAtCapacity && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Sequence Group capacity limit reached ({sequences.length}/{sequenceGroupLimit}). Upgrade plan or buy add-ons to configure more.
            </span>
          </div>
          <Link
            to="/billing/plans"
            className="shrink-0 font-bold text-amber-300 underline hover:text-white text-xs"
          >
            Upgrade Plan &rarr;
          </Link>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sequences, shortcuts, keywords..."
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-9 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Sequence Cards Grid */}
      {filtered.length === 0 ? (
        <DashboardEmptyState
          icon={Layers}
          title="No Sequence Groups Found"
          body={searchQuery ? "No captured sequence groups match your search query." : "No sequence groups configured yet."}
          tone="neutral"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((seq) => (
            <div
              key={seq.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-[var(--ca-text-primary)] truncate" title={seq.name}>
                    {seq.name}
                  </h4>
                  {onToggleSequence && (
                    <button
                      type="button"
                      disabled={!hasBot}
                      onClick={() => hasBot && onToggleSequence(seq.id, !seq.isEnabled)}
                      className="text-emerald-600 hover:text-emerald-700 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={seq.isEnabled ? "Disable Sequence" : "Enable Sequence"}
                    >
                      {seq.isEnabled ? (
                        <ToggleRight className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-[var(--ca-text-muted)]" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                  <ToneBadge tone={seq.isEnabled ? "teal" : "neutral"}>
                    {seq.isEnabled ? "Active" : "Disabled"}
                  </ToneBadge>
                  <span className="font-mono text-[var(--ca-text-muted)]">
                    {seq.itemCount} items
                  </span>
                  {seq.groupJid && (
                    <span className="font-mono text-[10px] text-[var(--ca-text-muted)] truncate max-w-[120px]" title={seq.groupJid}>
                      {seq.groupJid.split("@")[0]}
                    </span>
                  )}
                </div>

                <div className="space-y-1 font-mono text-[10px] bg-[var(--ca-surface-2)] p-2 rounded-xl border border-[var(--ca-border-subtle)]">
                  {seq.shortcutCode && (
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold truncate">
                      Shortcut: !{seq.shortcutCode}
                    </p>
                  )}
                  {seq.keywordTrigger && (
                    <p className="text-blue-600 dark:text-blue-400 font-bold truncate">
                      Keyword: {seq.keywordTrigger}
                    </p>
                  )}
                  {!seq.shortcutCode && !seq.keywordTrigger && (
                    <p className="text-[var(--ca-text-muted)] italic">No trigger configured</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--ca-border-subtle)] pt-2.5 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSeq(seq)}
                    className="inline-flex items-center gap-1 font-bold text-emerald-600 hover:underline"
                    title="View ordered template items"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View Flow</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {onSaveSequenceGroup && (
                    <button
                      type="button"
                      disabled={!hasBot}
                      onClick={() => handleOpenEditModal(seq)}
                      className="p-1 rounded-lg text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Edit Sequence Config"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {onResetGroup && (
                    <button
                      type="button"
                      disabled={!hasBot}
                      onClick={() => setResettingSeq(seq)}
                      className="p-1 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Reset Templates (clears BlackArrow captured sequence messages, preserves group configuration and triggers)"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {onUnlinkGroup && (
                    <button
                      type="button"
                      disabled={!hasBot}
                      onClick={() => setDeletingSeq(seq)}
                      className="p-1 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Delete / Unlink Group"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Flow Drawer */}
      <SequenceDetailDrawer
        sequence={selectedSeq}
        isOpen={Boolean(selectedSeq)}
        onClose={() => setSelectedSeq(null)}
        formatDate={formatDate}
      />

      {/* Add / Edit Sequence Group Modal */}
      <Dialog
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        title={editingSeq ? `Edit Sequence Group: ${editingSeq.name}` : "Add Sequence Group"}
      >
        <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
          {/* Searchable WhatsApp Group Selector */}
          <WhatsAppGroupSelector
            selectedBotId={selectedBotId}
            selectedJid={formData.groupJid}
            selectedGroupName={formData.name}
            label="Select WhatsApp Group"
            purposeContext="sequence"
            disabled={isSaving}
            excludedJids={sequences.filter((s) => s.id !== editingSeq?.id && s.groupJid).map((s) => s.groupJid!)}
            onSelect={(group) => {
              if (group) {
                setFormData((prev) => ({
                  ...prev,
                  groupJid: group.jid,
                  name: prev.name.trim() ? prev.name : group.name,
                }));
              } else {
                setFormData((prev) => ({
                  ...prev,
                  groupJid: "",
                }));
              }
            }}
          />

          <div>
            <label className="block font-bold text-[var(--ca-text-primary)] mb-1">
              Sequence Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Sales Welcome Sequence"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--ca-text-primary)] mb-1">
              Shortcut Code (Optional)
            </label>
            <input
              type="text"
              value={formData.shortcutCode}
              onChange={(e) => setFormData({ ...formData, shortcutCode: e.target.value })}
              placeholder="e.g. welcome_sales"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--ca-text-primary)] mb-1">
              Trigger Keywords
            </label>
            <input
              type="text"
              value={formData.keywordTrigger}
              onChange={(e) => setFormData({ ...formData, keywordTrigger: e.target.value })}
              placeholder="e.g. pricing, catalog, help (comma-separated)"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-[var(--ca-text-muted)] mt-1">
              Comma-separated phrases that trigger this sequence flow.
            </p>
          </div>

          <div>
            <label className="block font-bold text-[var(--ca-text-primary)] mb-1">
              Instructions Summary
            </label>
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Operational guidance for AI sequence selection..."
              rows={2}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-3 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="seq_enabled_check"
              checked={formData.isEnabled}
              onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
              className="rounded border-[var(--ca-border-default)] text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="seq_enabled_check" className="font-bold text-[var(--ca-text-primary)] cursor-pointer">
              Enable Sequence Group Automation
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
            <button
              type="button"
              onClick={() => setIsAddEditOpen(false)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !isFormValid}
              className="ca-button-primary text-xs disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Sequence Group"}
            </button>
          </div>
        </form>
      </Dialog>


      {/* Delete / Unlink Modal */}
      <Dialog
        isOpen={Boolean(deletingSeq)}
        onClose={() => setDeletingSeq(null)}
        title={`Unlink Sequence Group: ${deletingSeq?.name}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--ca-text-secondary)]">
            Are you sure you want to remove <strong>{deletingSeq?.name}</strong> configuration from BlackArrow?
          </p>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 text-[11px] font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>Note: This removes the sequence configuration from BlackArrow. The actual WhatsApp group will remain untouched.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ca-border-subtle)]">
            <button
              type="button"
              onClick={() => setDeletingSeq(null)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="ca-button-danger text-xs"
            >
              {isDeleting ? "Unlinking..." : "Unlink Sequence Group"}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Reset Sequence Group Modal */}
      <Dialog
        isOpen={Boolean(resettingSeq)}
        onClose={() => !isResetting && setResettingSeq(null)}
        title="Reset Sequence Group Templates"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--ca-text-primary)]">
            This removes all captured templates from this BlackArrow Sequence Group and starts its sequence fresh. The WhatsApp group, shortcut, keywords, and instructions remain configured.
          </p>
          {resettingSeq && (
            <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3 space-y-1">
              <p className="font-bold text-[var(--ca-text-primary)]">{resettingSeq.name}</p>
              <p className="font-mono text-[10px] text-[var(--ca-text-muted)]">{resettingSeq.groupJid}</p>
              <p className="text-[10px] text-[var(--ca-text-secondary)]">{resettingSeq.itemCount} template messages will be deleted.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ca-border-subtle)]">
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setResettingSeq(null)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isResetting}
              onClick={async () => {
                if (!resettingSeq || !onResetGroup) return;
                setIsResetting(true);
                try {
                  await onResetGroup(resettingSeq.id);
                  setResettingSeq(null);
                } finally {
                  setIsResetting(false);
                }
              }}
              className="ca-button-danger text-xs inline-flex items-center gap-1.5"
            >
              {isResetting ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              <span>{isResetting ? "Resetting..." : "Reset Templates"}</span>
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
