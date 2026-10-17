import React, { useState } from "react";
import { Bot, Copy, Edit2, Play, Pause, RotateCcw, Send, Trash2, CheckCircle2, User } from "lucide-react";
import { ConnectionStateBadge } from "./ConnectionStateBadge";
import { normalizeConnectionState, type NormalizeConnectionStateInput } from "./connection-state";
import { OwnerProfileEditor } from "../components/personal-assistant/OwnerProfileEditor";

export interface InstanceCardData {
  id: string;
  name?: string;
  display_name?: string;
  jid?: string;
  phone_number?: string;
  status?: string;
  is_active?: number;
  updated_at?: number | string;
  last_inbound_at?: number | string;
  last_message_at?: number | string;
  is_system_alert_bot?: boolean;
  provider_type?: string;
  providerType?: string;
  provider_config?: any;
  providerConfig?: any;
  instancePurpose?: string;
  instance_purpose?: string;
  controlBusinessInstanceId?: string;
  control_business_instance_id?: string;
}

export interface InstanceCardProps {
  instance: InstanceCardData;
  allInstances?: InstanceCardData[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleActive: (id: string, currentActive: number, e: React.MouseEvent) => void;
  onRename: (id: string, currentName: string, e: React.MouseEvent) => void;
  onResetLogin: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onSetSystemAlertBot?: (id: string, e: React.MouseEvent) => void;
  isSuperAdmin?: boolean;
  formatTimestamp?: (ts?: number | string) => string;
}

export const InstanceCard: React.FC<InstanceCardProps> = ({
  instance,
  allInstances = [],
  isSelected,
  onSelect,
  onToggleActive,
  onRename,
  onResetLogin,
  onDelete,
  onSetSystemAlertBot,
  isSuperAdmin = false,
  formatTimestamp = (ts) => (ts ? String(ts) : "N/A"),
}) => {
  const [showOwnerProfile, setShowOwnerProfile] = useState(false);
  const instanceId = instance.id;
  const instanceName = instance.name || instance.display_name || "WhatsApp Instance";
  const instanceNumber = instance.phone_number || (instance.jid ? instance.jid.replace(/@.*$/, "") : "");

  const isCloudApi =
    instance.provider_type === "whatsapp_cloud_api" ||
    instance.providerType === "whatsapp_cloud_api" ||
    instance.provider_config?.providerType === "whatsapp_cloud_api" ||
    instance.providerConfig?.providerType === "whatsapp_cloud_api";

  const statusInput: NormalizeConnectionStateInput = {
    status: instance.status,
    is_active: instance.is_active,
    jid: instance.jid,
  };
  const normalized = normalizeConnectionState(statusInput);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard && instanceId) {
      navigator.clipboard.writeText(instanceId);
    }
  };

  return (
    <article
      onClick={() => onSelect(instanceId)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(instanceId);
        }
      }}
      className={`group relative cursor-pointer rounded-2xl border bg-[var(--ca-surface-1)] p-5 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
        isSelected
          ? "border-emerald-500 ring-2 ring-emerald-500/15 dark:border-emerald-500"
          : "border-[var(--ca-border-subtle)]"
      }`}
      aria-label={`Instance ${instanceName}, ${normalized.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
              isSelected
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-[var(--ca-surface-2)] text-[var(--ca-text-muted)] group-hover:text-emerald-600"
            }`}
          >
            <Bot className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-black tracking-tight text-[var(--ca-text-primary)]" title={instanceName}>
                {instanceName}
              </h3>
              <button
                type="button"
                onClick={(e) => onRename(instanceId, instanceName, e)}
                className="rounded p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-surface-2)] hover:text-emerald-600 transition-colors"
                title="Rename instance"
                aria-label={`Rename ${instanceName}`}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="truncate text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {instanceNumber ? `+${instanceNumber}` : "No phone number linked"}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <ConnectionStateBadge statusInput={statusInput} />
          {instance.instancePurpose === "personal" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
              <span>Personal</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span>Business</span>
            </span>
          )}
          {isSelected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              <span>Selected</span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] px-3 py-2 text-[11px] font-medium text-[var(--ca-text-secondary)]">
        <span className="truncate font-mono">ID: {instanceId.substring(0, 16)}...</span>
        <button
          type="button"
          onClick={handleCopyId}
          className="rounded p-1 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]"
          title="Copy Instance ID"
          aria-label="Copy Instance ID"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      {instance.instancePurpose === "personal" && (() => {
        const controlId = instance.controlBusinessInstanceId || instance.control_business_instance_id;
        const controllingInstance = allInstances.find((i) => i.id === controlId);
        const controlName = controllingInstance?.name || controllingInstance?.display_name || (controlId ? `Business (${controlId.substring(0, 8)}...)` : undefined);
        let foundationStatus: "Setup Incomplete" | "Control Available" | "Control Unavailable" | "Dormant" = "Dormant";
        if (!controlId) {
          foundationStatus = "Setup Incomplete";
        } else if (allInstances.length > 0 && !controllingInstance) {
          foundationStatus = "Control Unavailable";
        } else {
          foundationStatus = "Control Available";
        }

        return (
          <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs dark:border-indigo-950/60 dark:bg-indigo-950/20 space-y-1.5" data-testid="personal-instance-details">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[var(--ca-text-secondary)]">Instance Purpose:</span>
              <span className="font-bold text-indigo-700 dark:text-indigo-300">Personal (Immutable)</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[var(--ca-text-secondary)]">Controlled Through:</span>
              <span className="font-medium text-[var(--ca-text-primary)]" data-testid="controlling-business-name">{controlName || "None"}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[var(--ca-text-secondary)]">Foundation Status:</span>
              <span className={`inline-flex items-center gap-1 font-bold ${
                foundationStatus === "Control Available"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : foundationStatus === "Setup Incomplete"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-rose-700 dark:text-rose-300"
              }`} data-testid="foundation-status">
                {foundationStatus}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-indigo-100/60 dark:border-indigo-900/40">
              <span className="font-bold text-[var(--ca-text-secondary)]">Personal Profile:</span>
              <button
                type="button"
                data-testid="open-owner-profile-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOwnerProfile(true);
                }}
                className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 underline"
              >
                <User className="h-3 w-3" />
                Manage Owner360
              </button>
            </div>
          </div>
        );
      })()}

      {/* Action Toolbar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ca-border-subtle)] pt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => onToggleActive(instanceId, instance.is_active ?? 1, e)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
              instance.is_active === 0
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"
            }`}
            title={instance.is_active === 0 ? "Resume automated messages" : "Pause automated messages"}
          >
            {instance.is_active === 0 ? (
              <>
                <Play className="h-3 w-3 fill-current" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 fill-current" />
                <span>Pause</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => onResetLogin(instanceId, e)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--ca-text-secondary)] transition-colors hover:border-amber-400 hover:text-amber-600"
            title="Reset WhatsApp session auth to scan QR again"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Login</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && onSetSystemAlertBot && (
            <button
              type="button"
              onClick={(e) => onSetSystemAlertBot(instanceId, e)}
              className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                instance.is_system_alert_bot
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                  : "bg-[var(--ca-surface-2)] text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]"
              }`}
            >
              {instance.is_system_alert_bot ? "System Bot" : "Set System Bot"}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => onDelete(instanceId, e)}
            className="rounded-lg bg-rose-50 p-2 text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60"
            title="Delete Instance"
            aria-label={`Delete ${instanceName}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showOwnerProfile && (
        <OwnerProfileEditor
          isOpen={showOwnerProfile}
          onClose={() => setShowOwnerProfile(false)}
        />
      )}
    </article>
  );
};
