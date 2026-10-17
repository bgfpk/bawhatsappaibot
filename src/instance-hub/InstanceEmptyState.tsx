import React from "react";
import { Plus, QrCode } from "lucide-react";
import { DashboardEmptyState } from "../components/dashboard/DashboardPrimitives";

export interface InstanceEmptyStateProps {
  onSyncNewIdentity: () => void;
}

export const InstanceEmptyState: React.FC<InstanceEmptyStateProps> = ({
  onSyncNewIdentity,
}) => {
  return (
    <DashboardEmptyState
      icon={QrCode}
      title="No WhatsApp Identity Connected Yet"
      body="Connect your first WhatsApp number so BlackArrow can receive customer messages, send automated AI replies, and manage customer conversations."
      tone="brand"
      action={
        <button
          type="button"
          onClick={onSyncNewIdentity}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Sync New Identity</span>
        </button>
      }
    />
  );
};
