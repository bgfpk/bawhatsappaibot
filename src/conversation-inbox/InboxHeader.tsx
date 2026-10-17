import React from "react";
import { MessageSquare } from "lucide-react";
import { DashboardPageHeader } from "../components/dashboard/DashboardPrimitives";

export interface InboxHeaderProps {
  totalCount: number;
  unreadTotal: number;
  activeBotName?: string;
  onOpenSelector?: () => void;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  totalCount,
  unreadTotal,
  activeBotName = "WhatsApp Instance",
  onOpenSelector,
}) => {
  return (
    <DashboardPageHeader
      eyebrow="Workspace"
      title="Conversation Inbox"
      description={`Manage active customer conversations for ${activeBotName}.`}
      icon={MessageSquare}
      actions={
        onOpenSelector ? (
          <button
            type="button"
            onClick={onOpenSelector}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-4 py-2 text-xs font-bold text-[var(--ca-text-primary)] transition-all hover:border-emerald-500 hover:shadow-sm"
          >
            <span>Change WhatsApp Identity</span>
          </button>
        ) : undefined
      }
    />
  );
};
