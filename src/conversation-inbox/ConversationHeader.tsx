import React from "react";
import { Bot, PanelRight, PauseCircle, Phone, UserCheck } from "lucide-react";
import type { ConversationItem } from "./conversation-model";
import { ToneBadge } from "../components/dashboard/DashboardPrimitives";

export interface ConversationHeaderProps {
  conversation: ConversationItem;
  onToggleCustomer360?: () => void;
  is360Open?: boolean;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
  onToggleCustomer360,
  is360Open = false,
}) => {
  return (
    <div className="flex items-center justify-between border-b border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 font-black text-emerald-700 dark:text-emerald-300">
          {conversation.customerName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black tracking-tight text-[var(--ca-text-primary)]">
            {conversation.customerName}
          </h3>
          <p className="flex items-center gap-1 text-xs font-mono font-semibold text-[var(--ca-text-muted)]">
            <Phone className="h-3 w-3" />
            <span>{conversation.displayPhone}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {conversation.isHumanTakeover ? (
          <ToneBadge tone="blue">
            <UserCheck className="mr-1 h-3.5 w-3.5" />
            <span>Human Takeover</span>
          </ToneBadge>
        ) : conversation.isAiPaused ? (
          <ToneBadge tone="neutral">
            <PauseCircle className="mr-1 h-3.5 w-3.5" />
            <span>AI Paused</span>
          </ToneBadge>
        ) : (
          <ToneBadge tone="teal">
            <Bot className="mr-1 h-3.5 w-3.5" />
            <span>AI Active</span>
          </ToneBadge>
        )}

        {onToggleCustomer360 && (
          <button
            type="button"
            onClick={onToggleCustomer360}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
              is360Open
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] text-[var(--ca-text-secondary)] hover:border-emerald-400"
            }`}
          >
            <PanelRight className="h-4 w-4" />
            <span className="hidden sm:inline">Customer 360</span>
          </button>
        )}
      </div>
    </div>
  );
};
