import React from "react";
import { Plus, Smartphone, User } from "lucide-react";
import { DashboardPageHeader } from "../components/dashboard/DashboardPrimitives";

export interface InstanceHubHeaderProps {
  onSyncNewIdentity: () => void;
  canCreateNewInstance?: boolean;
  onOpenOwnerProfile?: () => void;
}

export const InstanceHubHeader: React.FC<InstanceHubHeaderProps> = ({
  onSyncNewIdentity,
  canCreateNewInstance = true,
  onOpenOwnerProfile,
}) => {
  return (
    <DashboardPageHeader
      eyebrow="Workspace"
      title="Instance Hub"
      description="Manage connected WhatsApp identities, pairing status, and connection health."
      icon={Smartphone}
      actions={
        <div className="flex items-center gap-2">
          {onOpenOwnerProfile && (
            <button
              type="button"
              data-testid="header-open-owner-profile-button"
              onClick={onOpenOwnerProfile}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 active:scale-95"
            >
              <User className="h-4 w-4" />
              <span>Owner Profile</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSyncNewIdentity}
            disabled={!canCreateNewInstance}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>Sync New Identity</span>
          </button>
        </div>
      }
    />
  );
};
