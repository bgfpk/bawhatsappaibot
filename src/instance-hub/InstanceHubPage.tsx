import React, { useState } from "react";
import { AlertTriangle, Layers, MessageSquare, RotateCcw, Smartphone, Zap } from "lucide-react";
import { InstanceHubHeader } from "./InstanceHubHeader";
import { InstanceSummary } from "./InstanceSummary";
import { InstanceGrid } from "./InstanceGrid";
import { InstanceEmptyState } from "./InstanceEmptyState";
import { QrPairingPanel } from "./qr/QrPairingPanel";
import { CreateInstanceDialog } from "./create/CreateInstanceDialog";
import { ResetLoginDialog } from "./reset/ResetLoginDialog";
import { normalizeConnectionState, type NormalizeConnectionStateInput } from "./connection-state";
import type { InstanceCardData } from "./InstanceCard";
import { INBOX_UI_ENABLED } from "../config/product-flags";
import { OwnerProfileEditor } from "../components/personal-assistant/OwnerProfileEditor";

export interface InstanceHubPageProps {
  instances: InstanceCardData[];
  selectedInstanceId?: string | null;
  connectionStatus?: string;
  qrCode?: string | null;
  adminNumber?: string;
  isSuperAdmin?: boolean;
  isLoading?: boolean;
  onSelectInstance: (id: string) => void;
  onCreateInstance: (name: string, providerType?: string, instancePurpose?: string, controlBusinessInstanceId?: string) => Promise<void> | void;
  onToggleActive: (id: string, currentActive: number, e: React.MouseEvent) => void;
  onRenameInstance: (id: string, currentName: string, e: React.MouseEvent) => void;
  onResetLogin: (id: string) => Promise<void> | void;
  onDeleteInstance: (id: string, e: React.MouseEvent) => void;
  onOpenAiStudio?: () => void;
  onOpenAdminAlerts?: () => void;
  onOpenInbox?: () => void;
  onRefreshInstances?: () => Promise<void> | void;
}

export const InstanceHubPage: React.FC<InstanceHubPageProps> = ({
  instances = [],
  selectedInstanceId = null,
  connectionStatus = "disconnected",
  qrCode = null,
  adminNumber = "",
  isSuperAdmin = false,
  isLoading = false,
  onSelectInstance,
  onCreateInstance,
  onToggleActive,
  onRenameInstance,
  onResetLogin,
  onDeleteInstance,
  onOpenAiStudio,
  onOpenAdminAlerts,
  onOpenInbox,
  onRefreshInstances,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isOwnerProfileOpen, setIsOwnerProfileOpen] = useState(false);

  const selectedInstance = instances.find(
    (i) => i.id === selectedInstanceId || (i as any).$id === selectedInstanceId,
  ) || null;

  const hasPersonalInstance = instances.some(
    (i) => i.instancePurpose === "personal" || i.instance_purpose === "personal"
  );

  // Counts for summary strip
  const totalCount = instances.length;
  const connectedCount = instances.filter((i) =>
    normalizeConnectionState({ status: i.status, is_active: i.is_active, jid: i.jid }).key === "connected",
  ).length;
  const qrRequiredCount = instances.filter(
    (i) => normalizeConnectionState({ status: i.status, is_active: i.is_active, jid: i.jid }).key === "qr_required" || Boolean(qrCode && i.id === selectedInstanceId),
  ).length;
  const attentionCount = instances.filter((i) => {
    const key = normalizeConnectionState({ status: i.status, is_active: i.is_active, jid: i.jid }).key;
    return key === "error" || key === "paused" || key === "disconnected";
  }).length;

  const handleResetConfirm = async () => {
    if (!resetTargetId) return;
    setIsResetting(true);
    try {
      await onResetLogin(resetTargetId);
    } finally {
      setIsResetting(false);
      setResetTargetId(null);
    }
  };

  const currentStatusInput: NormalizeConnectionStateInput = {
    status: connectionStatus || selectedInstance?.status,
    is_active: selectedInstance?.is_active ?? 1,
    jid: selectedInstance?.jid,
    qrCode,
  };

  return (
    <div className="flex flex-col gap-6">
      {!adminNumber && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="absolute bottom-0 left-0 top-0 w-1 bg-amber-400" />
          <div className="flex items-start gap-3 pl-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Action Recommended: Configure Admin WhatsApp Number
              </h4>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed font-medium">
                Add an admin notification number in Admin Alerts to receive real-time notifications on WhatsApp when urgent business events occur.
              </p>
              {(onOpenAdminAlerts || onOpenAiStudio) && (
                <button
                  type="button"
                  onClick={onOpenAdminAlerts || onOpenAiStudio}
                  className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-900/60 dark:text-amber-100"
                >
                  Configure in Admin Alerts
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <InstanceHubHeader
        onSyncNewIdentity={() => setIsCreateOpen(true)}
        onOpenOwnerProfile={hasPersonalInstance ? () => setIsOwnerProfileOpen(true) : undefined}
      />

      <InstanceSummary
        totalCount={totalCount}
        connectedCount={connectedCount}
        qrRequiredCount={qrRequiredCount}
        attentionCount={attentionCount}
      />

      {totalCount === 0 ? (
        <InstanceEmptyState onSyncNewIdentity={() => setIsCreateOpen(true)} />
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--ca-text-muted)]">
              Connected Identities ({totalCount})
            </h3>
            <InstanceGrid
              instances={instances}
              selectedInstanceId={selectedInstanceId}
              onSelectInstance={onSelectInstance}
              onToggleActive={onToggleActive}
              onRenameInstance={onRenameInstance}
              onResetLogin={(id, e) => {
                e.stopPropagation();
                setResetTargetId(id);
              }}
              onDeleteInstance={onDeleteInstance}
              isSuperAdmin={isSuperAdmin}
            />
          </div>

          {selectedInstance && (
            <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-[var(--ca-border-subtle)] pb-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
                    Active Session: {selectedInstance.name || selectedInstance.display_name || "WhatsApp Instance"}
                  </h3>
                </div>
                {INBOX_UI_ENABLED && onOpenInbox && (
                  <button
                    type="button"
                    onClick={onOpenInbox}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1.5 text-xs font-bold transition-colors hover:border-emerald-400"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Open Inbox</span>
                  </button>
                )}
              </div>

              <QrPairingPanel
                statusInput={currentStatusInput}
                qrCode={qrCode}
                instanceName={selectedInstance.name || selectedInstance.display_name || "WhatsApp Instance"}
                onResetLogin={() => setResetTargetId(selectedInstance.id)}
                onOpenDashboard={onOpenInbox}
              />
            </div>
          )}
        </div>
      )}

      {/* Dialog Modals */}
      <CreateInstanceDialog
        isOpen={isCreateOpen}
        instances={instances}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (name, providerType, purpose, controlId) => {
          await onCreateInstance(name, providerType, purpose, controlId);
          setIsCreateOpen(false);
        }}
        isLoading={isLoading}
      />

      <ResetLoginDialog
        isOpen={Boolean(resetTargetId)}
        instanceName={
          instances.find((i) => i.id === resetTargetId)?.name || "Selected WhatsApp Instance"
        }
        onClose={() => setResetTargetId(null)}
        onConfirm={handleResetConfirm}
        isLoading={isResetting}
      />

      {isOwnerProfileOpen && (
        <OwnerProfileEditor
          isOpen={isOwnerProfileOpen}
          onClose={() => setIsOwnerProfileOpen(false)}
        />
      )}
    </div>
  );
};
