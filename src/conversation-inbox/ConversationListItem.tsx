import React from "react";
import { Bot, UserCheck, PauseCircle, CheckCircle2 } from "lucide-react";
import type { ConversationItem } from "./conversation-model";
import { ToneBadge } from "../components/dashboard/DashboardPrimitives";

export interface ConversationListItemProps {
  conversation: ConversationItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  formatTimestamp?: (ts?: number | string) => string;
}

export const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  isSelected,
  onSelect,
  formatTimestamp = (ts) => (ts ? String(ts) : ""),
}) => {
  const initial = conversation.customerName.charAt(0).toUpperCase() || "C";

  return (
    <article
      onClick={() => onSelect(conversation.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(conversation.id);
        }
      }}
      className={`group relative cursor-pointer rounded-2xl border p-3.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
        isSelected
          ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/20"
          : "border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] hover:border-emerald-400 hover:shadow-md"
      }`}
      aria-selected={isSelected}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 font-black text-emerald-700 dark:text-emerald-300">
          {initial}
          {conversation.unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-black text-white shadow-sm">
              {conversation.unreadCount}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="truncate text-xs font-black tracking-tight text-[var(--ca-text-primary)]" title={conversation.customerName}>
              {conversation.customerName}
            </h4>
            {conversation.lastMessageTimestamp && (
              <span className="shrink-0 text-[10px] font-medium text-[var(--ca-text-muted)]">
                {formatTimestamp(conversation.lastMessageTimestamp)}
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--ca-text-secondary)] leading-relaxed">
            {conversation.lastMessagePreview}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-mono font-semibold text-[var(--ca-text-muted)]">
              {conversation.displayPhone}
            </span>

            <div className="flex items-center gap-1">
              {conversation.isHumanTakeover ? (
                <ToneBadge tone="blue" className="text-[9px] py-0.5 px-2">
                  <UserCheck className="mr-1 h-3 w-3" />
                  <span>Human</span>
                </ToneBadge>
              ) : conversation.isAiPaused ? (
                <ToneBadge tone="neutral" className="text-[9px] py-0.5 px-2">
                  <PauseCircle className="mr-1 h-3 w-3" />
                  <span>Paused</span>
                </ToneBadge>
              ) : (
                <ToneBadge tone="teal" className="text-[9px] py-0.5 px-2">
                  <Bot className="mr-1 h-3 w-3" />
                  <span>AI Active</span>
                </ToneBadge>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};
