import React, { useState } from "react";
import { Sparkles, ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, ShieldAlert, Layers, Edit2, RefreshCw, Unlink, Eye, Plus, Trash2, RotateCcw } from "lucide-react";
import { ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { Dialog } from "../../design-system/primitives/Overlays";
import type { WelcomeSequenceConfig } from "../content-library-model";
import { SequenceDetailDrawer } from "../sequences/SequenceDetailDrawer";
import { WhatsAppGroupSelector } from "../WhatsAppGroupSelector";

export interface WelcomeSequencePanelProps {
  config: WelcomeSequenceConfig;
  selectedBotId?: string;
  onToggleWelcome?: (enabled: boolean) => Promise<void> | void;
  onSaveWelcomeGroup?: (data: {
    id?: string;
    name: string;
    groupJid?: string;
    shortcutCode?: string;
    instructions?: string;
    isEnabled?: boolean;
  }) => Promise<void> | void;
  onRefreshGroup?: (groupId?: string) => Promise<void> | void;
  onResetWelcome?: () => Promise<void> | void;
  onResetGroup?: (groupId: string) => Promise<void> | void;
  onUnlinkGroup?: (groupId: string) => Promise<void> | void;
  onDeleteWelcomeSequence?: (groupId?: string) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const WelcomeSequencePanel: React.FC<WelcomeSequencePanelProps> = ({
  config,
  selectedBotId,
  onToggleWelcome,
  onSaveWelcomeGroup,
  onRefreshGroup,
  onResetWelcome,
  onResetGroup,
  onUnlinkGroup,
  onDeleteWelcomeSequence,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: config.name || "Welcome Sequence",
    groupJid: config.groupJid || "",
    shortcutCode: config.shortcutCode || "welcome",
    instructions: config.instructions || "",
    isEnabled: config.isEnabled,
  });
  const [isSaving, setIsSaving] = useState(false);

  const isConfigured = config.isConfigured;

  const getStatusDisplay = () => {
    switch (config.readinessStatus) {
      case "ready":
        return {
          tone: "teal" as const,
          label: "Ready & Active",
          icon: CheckCircle2,
          desc: "Welcome sequence triggers automatically on first customer contact.",
        };
      case "templates_unavailable":
        return {
          tone: "amber" as const,
          label: "Templates Unavailable",
          icon: AlertTriangle,
          desc: "Welcome sequence group has no captured templates ready to send.",
        };
      case "wallet_blocked":
        return {
          tone: "rose" as const,
          label: "Wallet Balance Low",
          icon: ShieldAlert,
          desc: "Top up your wallet balance to allow automated sequence delivery.",
        };
      case "ambiguity_error":
        return {
          tone: "rose" as const,
          label: "Configuration Ambiguity Error",
          icon: AlertTriangle,
          desc: config.guardReason || "Multiple Welcome Sequence groups detected. Exactly one Welcome group is allowed.",
        };
      case "disabled":
        return {
          tone: "neutral" as const,
          label: "Welcome Sequence Paused",
          icon: ToggleLeft,
          desc: "Welcome sequence is currently paused in settings.",
        };
      default:
        return {
          tone: "neutral" as const,
          label: "Not Configured",
          icon: Layers,
          desc: "Assign a WhatsApp group as your welcome sequence source.",
        };
    }
  };

  const statusInfo = getStatusDisplay();
  const StatusIcon = statusInfo.icon;

  const handleOpenEditModal = () => {
    setFormData({
      name: config.name || "Welcome Sequence",
      groupJid: config.groupJid || "",
      shortcutCode: config.shortcutCode || "welcome",
      instructions: config.instructions || "",
      isEnabled: config.isEnabled,
    });
    setIsEditModalOpen(true);
  };

  const handleToggleClick = () => {
    if (!isConfigured) {
      handleOpenEditModal();
      return;
    }
    if (onToggleWelcome) {
      onToggleWelcome(!config.isEnabled);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.groupJid.trim() || !onSaveWelcomeGroup) return;
    setIsSaving(true);
    try {
      await onSaveWelcomeGroup({
        id: config.id || "welcome",
        name: formData.name.trim(),
        groupJid: formData.groupJid.trim(),
        shortcutCode: formData.shortcutCode.trim(),
        instructions: formData.instructions.trim(),
        isEnabled: formData.isEnabled,
      });
      setIsEditModalOpen(false);
    } catch (err) {
      console.error("Failed to save welcome sequence config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = Boolean(
    selectedBotId &&
    formData.name.trim() &&
    formData.groupJid &&
    formData.groupJid.trim().endsWith("@g.us")
  );

  const handleDeleteWelcome = async () => {
    const handler = onDeleteWelcomeSequence || onUnlinkGroup;
    if (!handler) return;
    setIsDeleting(true);
    try {
      await handler(config.id || config.groupJid || "welcome");
      setFormData({
        name: "Welcome Sequence",
        groupJid: "",
        shortcutCode: "welcome",
        instructions: "",
        isEnabled: false,
      });
      setIsDeleteModalOpen(false);
    } catch (err) {
      console.error("Failed to delete welcome sequence:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Sequence Main Header Card */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950 p-2.5 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
                  First-Contact Welcome Sequence
                </h3>
                <ToneBadge tone={statusInfo.tone}>{statusInfo.label}</ToneBadge>
              </div>
              <p className="text-xs text-[var(--ca-text-muted)] mt-0.5">
                Automatically delivers your configured intro flow when new customers message your WhatsApp instance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleWelcome && (
              <button
                type="button"
                onClick={handleToggleClick}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-4 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
              >
                {config.isEnabled ? (
                  <>
                    <ToggleRight className="h-5 w-5 text-emerald-600" />
                    <span>Enabled</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-5 w-5 text-[var(--ca-text-muted)]" />
                    <span>Disabled</span>
                  </>
                )}
              </button>
            )}

            {onSaveWelcomeGroup && (
              <button
                type="button"
                onClick={handleOpenEditModal}
                disabled={!selectedBotId}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isConfigured ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                <span>{isConfigured ? "Configure Welcome" : "Setup Welcome Group"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Readiness Status Explanation */}
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5 text-xs">
          <StatusIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-[var(--ca-text-primary)]">{statusInfo.label}</p>
            <p className="text-[var(--ca-text-muted)]">{statusInfo.desc}</p>
            {config.guardReason && (
              <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400 pt-1">
                Reason: {config.guardReason}
              </p>
            )}
          </div>
        </div>

        {/* Sequence Flow Specs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3">
            <span className="text-[var(--ca-text-muted)] text-[10px] uppercase font-bold block">Sequence Source</span>
            <span className="font-bold text-[var(--ca-text-primary)]">{config.name || "Welcome Group"}</span>
          </div>

          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3">
            <span className="text-[var(--ca-text-muted)] text-[10px] uppercase font-bold block">Total Items</span>
            <span className="font-bold text-[var(--ca-text-primary)]">{config.itemCount} items in flow</span>
          </div>

          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3">
            <span className="text-[var(--ca-text-muted)] text-[10px] uppercase font-bold block">Shortcut Code</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {config.shortcutCode ? `!${config.shortcutCode}` : "Not set"}
            </span>
          </div>
        </div>

        {/* Operational Actions */}
        <div className="flex items-center justify-between border-t border-[var(--ca-border-subtle)] pt-3">
          <div className="flex items-center gap-2">
            {onRefreshGroup && isConfigured && (
              <button
                type="button"
                onClick={() => onRefreshGroup(config.id || config.groupJid || "welcome")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reload Flow</span>
              </button>
            )}

            {(onResetWelcome || onResetGroup) && isConfigured && (
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-100"
                title="Reset Captured Templates (clears BlackArrow captured welcome templates fresh, WhatsApp group remains linked)"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Templates</span>
              </button>
            )}

            {(onDeleteWelcomeSequence || onUnlinkGroup) && isConfigured && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete / Remove Welcome Sequence</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            <Eye className="h-4 w-4" />
            <span>View Flow</span>
          </button>
        </div>
      </div>

      {/* Edit Welcome Group Dialog */}
      <Dialog
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Configure Welcome Message Sequence"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          {/* Searchable WhatsApp Group Selector */}
          <WhatsAppGroupSelector
            selectedBotId={selectedBotId}
            selectedJid={formData.groupJid}
            selectedGroupName={formData.name}
            label="Select WhatsApp Group"
            purposeContext="welcome"
            disabled={isSaving}
            onSelect={(group) => {
              if (group) {
                setFormData((prev) => ({
                  ...prev,
                  groupJid: group.jid,
                  name: prev.name && prev.name !== "Welcome Sequence" ? prev.name : group.name,
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
            <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
              Welcome Sequence Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. First-Contact Welcome Sequence"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
              Manual Trigger Shortcut Code (without !)
            </label>
            <input
              type="text"
              value={formData.shortcutCode}
              onChange={(e) => setFormData({ ...formData, shortcutCode: e.target.value.replace(/^!/, "") })}
              placeholder="welcome"
              className="w-full font-mono rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--ca-text-primary)] mb-1">
              Custom Instructions / Notes
            </label>
            <textarea
              rows={3}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Custom instructions for greeting first-time customers..."
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3">
            <div>
              <span className="font-bold text-xs text-[var(--ca-text-primary)] block">Enable First-Contact Welcome</span>
              <span className="text-[10px] text-[var(--ca-text-muted)] block">Trigger welcome sequence for new customer conversations</span>
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
              onClick={() => setIsEditModalOpen(false)}
              className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !isFormValid}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Welcome Configuration"}
            </button>
          </div>
        </form>
      </Dialog>


      {/* Delete / Remove Welcome Sequence Dialog */}
      <Dialog
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title="Delete / Remove Welcome Sequence"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-rose-700 dark:text-rose-300">
            <p className="font-bold">Are you sure you want to remove this Welcome Sequence?</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              This action detaches the linked WhatsApp group, clears the welcome configuration, and cancels any pending welcome sends. No automated welcome messages or wallet debits will occur.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setIsDeleteModalOpen(false)}
              className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteWelcome}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove Welcome Sequence</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Reset Welcome Sequence Dialog */}
      <Dialog
        isOpen={isResetModalOpen}
        onClose={() => !isResetting && setIsResetModalOpen(false)}
        title="Reset Welcome Sequence Templates"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--ca-text-primary)]">
            This removes all captured templates from this BlackArrow Welcome Group and starts its library fresh. The WhatsApp group, shortcut, and instructions remain linked.
          </p>
          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3 space-y-1">
            <p className="font-bold text-[var(--ca-text-primary)]">{config.name || "Welcome Sequence"}</p>
            {config.groupJid && <p className="font-mono text-[10px] text-[var(--ca-text-muted)]">{config.groupJid}</p>}
            <p className="text-[10px] text-[var(--ca-text-secondary)]">{config.itemCount} template messages will be deleted.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ca-border-subtle)]">
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setIsResetModalOpen(false)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isResetting}
              onClick={async () => {
                const handler = onResetWelcome || onResetGroup;
                if (!handler) return;
                setIsResetting(true);
                try {
                  await handler(config.id || config.groupJid || "welcome");
                  setIsResetModalOpen(false);
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

      <SequenceDetailDrawer
        sequence={{
          id: "welcome",
          name: config.name || "Welcome Sequence Flow",
          itemCount: config.itemCount,
          items: config.items,
          shortcutCode: config.shortcutCode,
          isEnabled: config.isEnabled,
        }}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        formatDate={formatDate}
      />
    </div>
  );
};
