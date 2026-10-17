import React, { useState, useMemo } from "react";
import { BellRing, Plus, RefreshCw, ListFilter, Users, PackageCheck } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar, DashboardEmptyState, ToneBadge } from "../../components/dashboard/DashboardPrimitives";
import { RecipientListsPanel } from "../../components/customer-updates/RecipientListsPanel";
import { canEditCustomerUpdate } from "../../components/customer-updates/customer-update-editing";
import { UpdateEditor } from "./UpdateEditor";
import { DeliveryRunsPanel } from "./DeliveryRunsPanel";
import { normalizeCustomerUpdate, type CustomerUpdateItem } from "./customer-update-model";

export interface CustomerUpdatesPageProps {
  updates?: any[];
  recipientLists?: any[];
  customers?: any[];
  bots?: any[];
  selectedBotId?: string | null;
  onSaveUpdate?: (data: Partial<CustomerUpdateItem>) => Promise<void> | void;
  onDeleteUpdate?: (id: string) => Promise<void> | void;
  onSaveRecipientList?: (listData: any) => Promise<void> | void;
  onDeleteRecipientList?: (id: string) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const CustomerUpdatesPage: React.FC<CustomerUpdatesPageProps> = ({
  updates = [],
  recipientLists = [],
  customers = [],
  bots = [],
  selectedBotId,
  onSaveUpdate,
  onDeleteUpdate,
  onSaveRecipientList,
  onDeleteRecipientList,
  onRefresh,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [activeTab, setActiveTab] = useState<"updates" | "lists" | "runs">("updates");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<CustomerUpdateItem | null>(null);

  const normalizedUpdates = useMemo(() => {
    return (updates || []).map(normalizeCustomerUpdate);
  }, [updates]);

  const handleEdit = (upd: CustomerUpdateItem) => {
    if (!canEditCustomerUpdate(upd)) return;
    setEditingUpdate(upd);
    setIsEditorOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Automation"
        title="Customer Updates"
        description="Schedule stock availability notifications and planned update alerts for targeted customer lists."
        icon={BellRing}
      />

      <DashboardToolbar>
        <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("updates")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "updates"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Scheduled Updates ({normalizedUpdates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("lists")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "lists"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Recipient Lists ({recipientLists.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("runs")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "runs"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Delivery History
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh()}
              className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2 text-[var(--ca-text-secondary)] hover:border-emerald-500 hover:text-[var(--ca-text-primary)]"
              title="Refresh Customer Updates"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingUpdate(null);
              setIsEditorOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Schedule Update</span>
          </button>
        </div>
      </DashboardToolbar>

      {activeTab === "updates" && (
        normalizedUpdates.length === 0 ? (
          <DashboardEmptyState
            icon={BellRing}
            title="No Scheduled Customer Updates"
            body="Schedule a planned update or stock availability alert for your customers."
            tone="neutral"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {normalizedUpdates.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <ToneBadge tone={item.type === "stock" ? "blue" : "teal"}>
                      {item.type === "stock" ? "Stock Alert" : "Planned Update"}
                    </ToneBadge>
                    <ToneBadge tone={item.status === "sent" ? "teal" : item.status === "cancelled" ? "rose" : "amber"}>
                      {item.status}
                    </ToneBadge>
                  </div>

                  <p className="font-bold text-xs text-[var(--ca-text-primary)] leading-snug">
                    {item.message}
                  </p>

                  <div className="space-y-1 font-mono text-[10px] text-[var(--ca-text-muted)] bg-[var(--ca-surface-2)] p-2.5 rounded-xl border border-[var(--ca-border-subtle)]">
                    <p>Scheduled: {item.scheduledAt ? formatDate(item.scheduledAt) : "Immediate"}</p>
                    <p>Repeat: {item.repeat || "none"}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--ca-border-subtle)] pt-2.5 text-[11px]">
                  <span className="text-[var(--ca-text-muted)] font-medium">
                    {item.sentCount ? `${item.sentCount} sent` : "Pending send"}
                  </span>

                  {canEditCustomerUpdate(item) && onSaveUpdate && (
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="font-bold text-emerald-600 hover:underline"
                    >
                      Edit Update
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === "lists" && (
        <RecipientListsPanel mode="lists" />
      )}

      {activeTab === "runs" && (
        <DeliveryRunsPanel
          updates={normalizedUpdates}
          formatDate={formatDate}
        />
      )}

      <UpdateEditor
        update={editingUpdate}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingUpdate(null);
        }}
        onSave={async (data) => {
          if (onSaveUpdate) await onSaveUpdate(data);
        }}
      />
    </div>
  );
};
