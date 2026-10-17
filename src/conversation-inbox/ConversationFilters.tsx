import React from "react";
import type { ConversationFilterType } from "./conversation-model";

export interface ConversationFiltersProps {
  activeFilter: ConversationFilterType;
  onSelectFilter: (filter: ConversationFilterType) => void;
  counts: {
    all: number;
    unread: number;
    ai_active: number;
    human: number;
    paused: number;
    orders: number;
  };
}

export const ConversationFilters: React.FC<ConversationFiltersProps> = ({
  activeFilter,
  onSelectFilter,
  counts,
}) => {
  const tabs: { id: ConversationFilterType; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "unread", label: "Unread", count: counts.unread },
    { id: "ai_active", label: "AI Active", count: counts.ai_active },
    { id: "human", label: "Human", count: counts.human },
    { id: "paused", label: "Paused", count: counts.paused },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--ca-border-subtle)] pb-3">
      {tabs.map((tab) => {
        const isActive = activeFilter === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectFilter(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              isActive
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-[var(--ca-surface-2)] text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-3)] hover:text-[var(--ca-text-primary)]"
            }`}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[var(--ca-surface-1)] text-[var(--ca-text-muted)]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
