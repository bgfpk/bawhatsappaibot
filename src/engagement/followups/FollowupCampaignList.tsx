import React from "react";
import { Clock, Plus, ToggleLeft, ToggleRight, Trash2, Edit2, Bot, Sparkles, MessageSquare } from "lucide-react";
import { ToneBadge, DashboardEmptyState } from "../../components/dashboard/DashboardPrimitives";
import type { FollowupCampaign } from "./followup-model";

export interface FollowupCampaignListProps {
  campaigns: FollowupCampaign[];
  onEditCampaign: (campaign: FollowupCampaign) => void;
  onDeleteCampaign: (campaign: FollowupCampaign) => void;
  onToggleActive: (campaign: FollowupCampaign, isActive: boolean) => void;
  onCreateNew: (type: "fixed_message" | "ai_smart_followup") => void;
  formatDate?: (ts?: number | string) => string;
}

export const FollowupCampaignList: React.FC<FollowupCampaignListProps> = ({
  campaigns = [],
  onEditCampaign,
  onDeleteCampaign,
  onToggleActive,
  onCreateNew,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  if (campaigns.length === 0) {
    return (
      <DashboardEmptyState
        icon={Clock}
        title="No Follow-up Campaigns"
        body="Create your first automated follow-up campaign to reconnect with inactive customers."
        tone="neutral"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((c) => {
        const isAi = c.campaign_type === "ai_smart_followup";

        return (
          <div
            key={c.id}
            className="flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm space-y-3"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 truncate">
                  {isAi ? (
                    <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <h4 className="text-xs font-bold text-[var(--ca-text-primary)] truncate">
                    {c.name}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleActive(c, !c.is_active)}
                  className="text-emerald-600 hover:text-emerald-700"
                  title={c.is_active ? "Pause Campaign" : "Activate Campaign"}
                >
                  {c.is_active ? (
                    <ToggleRight className="h-6 w-6 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-[var(--ca-text-muted)]" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <ToneBadge tone={c.is_active ? "teal" : "neutral"}>
                  {c.is_active ? "Active" : "Paused"}
                </ToneBadge>
                <span className="font-mono text-[var(--ca-text-muted)]">
                  {isAi ? "AI Smart Follow-up" : "Fixed Message"}
                </span>
              </div>

              <div className="space-y-1 text-[11px] bg-[var(--ca-surface-2)] p-2.5 rounded-xl border border-[var(--ca-border-subtle)]">
                <div className="flex justify-between">
                  <span className="text-[var(--ca-text-muted)] font-bold">Delay:</span>
                  <span className="font-mono font-bold text-[var(--ca-text-primary)]">{c.hours} hours after last chat</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--ca-text-muted)] font-bold">Audience:</span>
                  <span className="font-bold text-[var(--ca-text-secondary)]">{c.audience || "All Customers"}</span>
                </div>
                {isAi && c.offer_context && (
                  <p className="text-[10px] text-purple-700 dark:text-purple-300 line-clamp-2 pt-1 font-sans">
                    Offer Context: {c.offer_context}
                  </p>
                )}
                {!isAi && c.fixed_message && (
                  <p className="text-[10px] text-[var(--ca-text-secondary)] line-clamp-2 pt-1 font-sans">
                    Message: {c.fixed_message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--ca-border-subtle)] pt-2.5 text-[11px]">
              <span className="text-[var(--ca-text-muted)] font-medium">
                {c.totalSent ? `${c.totalSent} sent` : "0 sent"}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onEditCampaign(c)}
                  className="rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-1.5 text-[var(--ca-text-secondary)] hover:border-emerald-500"
                  title="Edit Campaign"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCampaign(c)}
                  className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 p-1.5 text-red-600 hover:bg-red-100"
                  title="Delete Campaign"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
