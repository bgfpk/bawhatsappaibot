import React, { useState } from "react";
import { Bot, Briefcase, Plus, Smartphone, User, X } from "lucide-react";
import type { InstanceCardData } from "../InstanceCard";
import { isPersonalAssistantFeatureEnabled } from "../../services/personal-assistant-config-service";

export interface CreateInstanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, providerType?: string, instancePurpose?: string, controlBusinessInstanceId?: string) => Promise<void> | void;
  instances?: InstanceCardData[];
  isLoading?: boolean;
  errorMessage?: string | null;
  capacityReached?: boolean;
}

export const CreateInstanceDialog: React.FC<CreateInstanceDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  instances = [],
  isLoading = false,
  errorMessage = null,
  capacityReached = false,
}) => {
  const [instanceName, setInstanceName] = useState("");
  const [purpose, setPurpose] = useState<"business" | "personal">("business");
  const businessInstances = instances.filter(
    (i) => (i.instancePurpose || "business") === "business"
  );
  const [selectedControlId, setSelectedControlId] = useState<string>(
    businessInstances[0]?.id || ""
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim() || isLoading || capacityReached) return;
    if (purpose === "personal" && !selectedControlId) return;

    await onSubmit(
      instanceName.trim(),
      "whatsapp_web",
      purpose,
      purpose === "personal" ? selectedControlId : undefined
    );
    setInstanceName("");
    setPurpose("business");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-instance-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--ca-border-subtle)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 id="create-instance-title" className="text-base font-black tracking-tight text-[var(--ca-text-primary)]">
                Sync New Identity
              </h3>
              <p className="text-xs text-[var(--ca-text-secondary)] font-medium">
                Add a new WhatsApp business or personal assistant identity.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-surface-2)] hover:text-[var(--ca-text-primary)]"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {capacityReached ? (
          <div className="my-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <strong className="block font-bold">Account Instance Limit Reached</strong>
            <p className="mt-1 leading-relaxed">
              Your current account plan capacity limits the number of active WhatsApp identities. Contact workspace administrator or upgrade your plan to connect additional numbers.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {isPersonalAssistantFeatureEnabled() && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)] mb-2">
                  Instance Purpose
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPurpose("business")}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      purpose === "business"
                        ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
                        : "border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] hover:border-neutral-400"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ca-text-primary)]">
                      <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Business</span>
                    </div>
                    <p className="text-[11px] leading-tight text-[var(--ca-text-muted)]">
                      For customer chats, sales AI & support automation.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPurpose("personal");
                      if (!selectedControlId && businessInstances.length > 0) {
                        setSelectedControlId(businessInstances[0].id);
                      }
                    }}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      purpose === "personal"
                        ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                        : "border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] hover:border-neutral-400"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ca-text-primary)]">
                      <User className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Personal</span>
                    </div>
                    <p className="text-[11px] leading-tight text-[var(--ca-text-muted)]">
                      For AI Personal Assistant communicating on your behalf.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {purpose === "personal" && (
              <div>
                <label htmlFor="control-instance-select" className="block text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
                  Controlling Business WhatsApp
                </label>
                {businessInstances.length === 0 ? (
                  <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    You need at least one Business WhatsApp instance in this workspace to control your Personal Assistant.
                  </div>
                ) : (
                  <>
                    <select
                      id="control-instance-select"
                      value={selectedControlId}
                      onChange={(e) => setSelectedControlId(e.target.value)}
                      disabled={isLoading}
                      required
                      className="mt-1.5 w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2.5 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {businessInstances.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name || b.display_name || b.id} {b.phone_number ? `(${b.phone_number})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[var(--ca-text-muted)]">
                      Owner instructions come exclusively via Admin Business Assistant on this Business number.
                    </p>
                  </>
                )}
              </div>
            )}

            <div>
              <label htmlFor="instance-name-input" className="block text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
                Instance Friendly Name
              </label>
              <input
                id="instance-name-input"
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder={purpose === "personal" ? "e.g. My Personal Assistant" : "e.g. Sales Support Number"}
                required
                maxLength={80}
                autoFocus
                disabled={isLoading}
                className="mt-1.5 w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-4 py-2.5 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              <p className="mt-1 text-[11px] text-[var(--ca-text-muted)]">
                This name helps you identify this WhatsApp number in your workspace.
              </p>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!instanceName.trim() || isLoading || (purpose === "personal" && businessInstances.length === 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
              >
                {isLoading ? (
                  <span>Creating...</span>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Create Identity</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
