import React, { useState } from "react";
import { Radio, RefreshCw, Unlink, HelpCircle, Plus, Edit2, ToggleLeft, ToggleRight, Check, RotateCcw } from "lucide-react";
import { ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { Dialog } from "../../design-system/primitives/Overlays";
import type { MediaGroupItem } from "../content-library-model";
import { WhatsAppGroupSelector } from "../WhatsAppGroupSelector";

export interface MediaGroupsPanelProps {
  groups: MediaGroupItem[];
  selectedBotId?: string;
  mediaGroupLimit?: number;
  onSaveGroup?: (data: {
    id?: string;
    name: string;
    groupJid?: string;
    instructions?: string;
    autoSync?: boolean;
    isEnabled?: boolean;
  }) => Promise<void> | void;
  onToggleGroup?: (groupId: string, enabled: boolean) => Promise<void> | void;
  onRefreshGroup?: (groupId: string) => Promise<void> | void;
  onResetGroup?: (groupId: string) => Promise<void> | void;
  onUnlinkGroup?: (groupId: string) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const MediaGroupsPanel: React.FC<MediaGroupsPanelProps> = ({
  groups = [],
  selectedBotId,
  mediaGroupLimit,
  onSaveGroup,
  onToggleGroup,
  onRefreshGroup,
  onResetGroup,
  onUnlinkGroup,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MediaGroupItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    groupJid: "",
    instructions: "",
    autoSync: true,
    isEnabled: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [resettingGroup, setResettingGroup] = useState<MediaGroupItem | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const isLimitReached = typeof mediaGroupLimit === "number" && mediaGroupLimit > 0 && groups.length >= mediaGroupLimit;

  const handleOpenAddModal = () => {
    setEditingGroup(null);
    setFormData({
      name: "",
      groupJid: "",
      instructions: "",
      autoSync: true,
      isEnabled: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (group: MediaGroupItem) => {
    setEditingGroup(group);
    setFormData({
      name: group.name || "",
      groupJid: group.jid || "",
      instructions: (group as any).instructions || "",
      autoSync: (group as any).autoSync !== false,
      isEnabled: group.enabled !== false,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.groupJid.trim() || !onSaveGroup) return;
    setIsSaving(true);
    try {
      await onSaveGroup({
        id: editingGroup?.id,
        name: formData.name.trim(),
        groupJid: formData.groupJid.trim(),
        instructions: formData.instructions.trim(),
        autoSync: formData.autoSync,
        isEnabled: formData.isEnabled,
      });
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save media group:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = Boolean(
    selectedBotId &&
    formData.groupJid &&
    formData.groupJid.trim().endsWith("@g.us") &&
    formData.name.trim()
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Configured WhatsApp Media Groups</span>
          </h3>
          <p className="text-xs text-[var(--ca-text-muted)]">
            WhatsApp groups designated to auto-capture reusable images, videos, documents, and templates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Setup Guidance</span>
          </button>

          {onSaveGroup && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              disabled={!selectedBotId || isLimitReached}
              title={isLimitReached ? `Media group limit reached (${groups.length}/${mediaGroupLimit})` : "Link Media Group"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Link Media Group</span>
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 text-center space-y-3">
          <p className="text-xs font-bold text-[var(--ca-text-secondary)]">No WhatsApp Media Groups configured yet.</p>
          <p className="text-[11px] text-[var(--ca-text-muted)] max-w-md mx-auto">
            Designate a WhatsApp group to automatically index media templates for your AI assistant and customer replies.
          </p>
          {onSaveGroup && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              disabled={!selectedBotId || isLimitReached}
              title={isLimitReached ? `Media group limit reached (${groups.length}/${mediaGroupLimit})` : "Link First Media Group"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Link First Media Group</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {groups.map((group) => {
            const tone =
              group.status === "connected"
                ? "teal"
                : group.status === "paused"
                ? "neutral"
                : group.status === "needs_group"
                ? "amber"
                : "rose";

            const statusLabel =
              group.status === "connected"
                ? "Capturing"
                : group.status === "paused"
                ? "Paused"
                : group.status === "needs_group"
                ? "Needs Group Selection"
                : "Error";

            return (
              <div
                key={group.id}
                className="flex items-center justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm"
              >
                <div className="space-y-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--ca-text-primary)] truncate">{group.name}</span>
                    <ToneBadge tone={tone}>{statusLabel}</ToneBadge>
                  </div>
                  {group.jid ? (
                    <p className="font-mono text-[10px] text-[var(--ca-text-muted)] truncate">JID: {group.jid}</p>
                  ) : (
                    <p className="text-[10px] text-amber-500 font-medium">WhatsApp group binding required</p>
                  )}
                  <p className="text-[10px] text-[var(--ca-text-secondary)] font-medium">
                    {group.templateCount} captured items • Last active: {formatDate(group.lastCapturedAt)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onToggleGroup && (
                    <button
                      type="button"
                      onClick={() => onToggleGroup(group.id, group.status !== "connected")}
                      className="rounded-lg border border-[var(--ca-border-default)] p-2 text-[var(--ca-text-secondary)] hover:border-emerald-500 hover:text-[var(--ca-text-primary)]"
                      title={group.status === "connected" ? "Pause Media Group" : "Enable Media Group"}
                    >
                      {group.status === "connected" ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-[var(--ca-text-muted)]" />
                      )}
                    </button>
                  )}
                  {onSaveGroup && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(group)}
                      className="rounded-lg border border-[var(--ca-border-default)] p-2 text-[var(--ca-text-secondary)] hover:border-emerald-500 hover:text-[var(--ca-text-primary)]"
                      title="Edit Media Group settings"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onRefreshGroup && (
                    <button
                      type="button"
                      onClick={() => onRefreshGroup(group.id)}
                      className="rounded-lg border border-[var(--ca-border-default)] p-2 text-[var(--ca-text-secondary)] hover:border-emerald-500 hover:text-[var(--ca-text-primary)]"
                      title="Refresh captured content"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onResetGroup && (
                    <button
                      type="button"
                      onClick={() => setResettingGroup(group)}
                      className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-2 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/60"
                      title="Reset Templates (clears BlackArrow captured items fresh, WhatsApp group remains linked)"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onUnlinkGroup && (
                    <button
                      type="button"
                      onClick={() => onUnlinkGroup(group.id)}
                      className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 p-2 text-red-600 hover:bg-red-100"
                      title="Unlink group (removes configuration without leaving WhatsApp group)"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Media Group Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingGroup ? "Edit WhatsApp Media Group" : "Link WhatsApp Media Group"}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Searchable WhatsApp Group Selector */}
          <WhatsAppGroupSelector
            selectedBotId={selectedBotId}
            selectedJid={formData.groupJid}
            selectedGroupName={formData.name}
            label="Select WhatsApp Group"
            purposeContext="media"
            disabled={isSaving}
            excludedJids={groups.filter((g) => g.id !== editingGroup?.id && g.jid).map((g) => g.jid)}
            onSelect={(group) => {
              if (group) {
                setFormData((prev) => ({
                  ...prev,
                  groupJid: group.jid,
                  name: group.name,
                }));
              } else {
                setFormData((prev) => ({
                  ...prev,
                  groupJid: "",
                  name: "",
                }));
              }
            }}
          />

          <div>
            <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
              Instructions / Purpose Notes <span className="font-normal text-[var(--ca-text-muted)]">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Instructions for indexing media in this group..."
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3">
            <div>
              <span className="font-bold text-xs text-[var(--ca-text-primary)] block">Auto Sync</span>
              <span className="text-[10px] text-[var(--ca-text-muted)] block">Automatically index incoming group media</span>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, autoSync: !formData.autoSync })}
              className="rounded-lg p-1 text-emerald-600"
            >
              {formData.autoSync ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-gray-400" />}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3">
            <div>
              <span className="font-bold text-xs text-[var(--ca-text-primary)] block">Enabled</span>
              <span className="text-[10px] text-[var(--ca-text-muted)] block">Active Media Group capturing</span>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isEnabled: !formData.isEnabled })}
              className="rounded-lg p-1 text-emerald-600"
            >
              {formData.isEnabled ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-gray-400" />}
            </button>
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
              disabled={isSaving || !isFormValid}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Media Group"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Setup Guidance Dialog */}
      <Dialog
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        title="WhatsApp Media Group Setup Guide"
      >
        <div className="space-y-3 text-xs font-medium text-[var(--ca-text-primary)]">
          <ol className="list-decimal list-inside space-y-2.5">
            <li>Create the WhatsApp group on your connected WhatsApp account.</li>
            <li>Open BlackArrow Media Group setup and select your group from the list.</li>
            <li>Add optional instructions to guide AI when selecting media.</li>
            <li>Click Save.</li>
            <li>Send media (photos, videos, documents) into that WhatsApp group.</li>
            <li>BlackArrow automatically syncs and indexes new content when Auto Sync is enabled.</li>
          </ol>
          <div className="pt-3 border-t border-[var(--ca-border-subtle)] flex justify-end">
            <button
              type="button"
              onClick={() => setIsGuideOpen(false)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Got it
            </button>
          </div>
        </div>
      </Dialog>

      {/* Reset Media Group Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(resettingGroup)}
        onClose={() => !isResetting && setResettingGroup(null)}
        title="Reset Media Group Templates"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--ca-text-primary)]">
            This removes all captured templates from this BlackArrow Media Group and starts its library fresh. The WhatsApp group remains linked.
          </p>
          {resettingGroup && (
            <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3 space-y-1">
              <p className="font-bold text-[var(--ca-text-primary)]">{resettingGroup.name}</p>
              <p className="font-mono text-[10px] text-[var(--ca-text-muted)]">{resettingGroup.jid}</p>
              <p className="text-[10px] text-[var(--ca-text-secondary)]">{resettingGroup.templateCount} captured items will be deleted.</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setResettingGroup(null)}
              className="rounded-xl border border-[var(--ca-border-default)] px-3 py-1.5 font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isResetting}
              onClick={async () => {
                if (!resettingGroup || !onResetGroup) return;
                setIsResetting(true);
                try {
                  await onResetGroup(resettingGroup.id);
                  setResettingGroup(null);
                } finally {
                  setIsResetting(false);
                }
              }}
              className="rounded-xl bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-1.5"
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
