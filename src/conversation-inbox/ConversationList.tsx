import React from "react";
import { ConversationListItem } from "./ConversationListItem";
import type { ConversationItem } from "./conversation-model";
import { DashboardEmptyState } from "../components/dashboard/DashboardPrimitives";
import { MessageSquare } from "lucide-react";

export interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)]"
          />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <DashboardEmptyState
        icon={MessageSquare}
        title="No Conversations Found"
        body="No customer conversations match the current filter or search criteria."
        tone="neutral"
      />
    );
  }

  return (
    <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
      {conversations.map((item) => (
        <ConversationListItem
          key={item.id}
          conversation={item}
          isSelected={selectedId === item.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
