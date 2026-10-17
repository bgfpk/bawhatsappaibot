import React, { useState } from "react";
import { CalendarClock, Plus, RefreshCw, Layers, ListChecks, BarChart3, Clock, Sparkles, Bot, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar, MetricTile } from "../../components/dashboard/DashboardPrimitives";
import { FollowupCampaignList } from "./FollowupCampaignList";
import { FollowupCampaignEditor } from "./FollowupCampaignEditor";
import { FollowupLogsPanel } from "./FollowupLogsPanel";
import { normalizeFollowupCampaign, type FollowupCampaign, type FollowupActivityLog } from "./followup-model";

export type FollowupTabId = "overview" | "auto_followup" | "logs" | "analytics";

export interface FollowupCenterProps {
  followups: any[];
  marketingStats?: any;
  selectedBotId?: string | null;
  autoFollowupEnabled?: boolean;
  onToggleAutoFollowup?: (enabled: boolean) => Promise<void> | void;
  autoFollowupSchedules?: Array<{
    id: string;
    customerName?: string;
    customerPhone?: string;
    currentObjective?: string;
    followupState?: string;
    attemptIndex?: number;
    lastFollowupAt?: number;
    nextFollowupAt?: number;
    decisionReason?: string;
  }>;
  onSaveCampaign?: (campaignData: Partial<FollowupCampaign>) => Promise<void> | void;
  onDeleteCampaign?: (campaignId: string) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const FollowupCenter: React.FC<FollowupCenterProps> = ({
  followups = [],
  marketingStats,
  selectedBotId,
  autoFollowupEnabled = false,
  onToggleAutoFollowup,
  autoFollowupSchedules = [],
  onSaveCampaign,
  onDeleteCampaign,
  onRefresh,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [activeTab, setActiveTab] = useState<FollowupTabId>("overview");
  const [isTogglingAutoFollowup, setIsTogglingAutoFollowup] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorType, setEditorType] = useState<"fixed_message" | "ai_smart_followup">("fixed_message");
  const [editingCampaign, setEditingCampaign] = useState<FollowupCampaign | null>(null);

  const normalizedCampaigns = (followups || []).map(normalizeFollowupCampaign);
  const stats = marketingStats?.stats || {};
  const logsList: FollowupActivityLog[] = (marketingStats?.logs || []).map((l: any, idx: number) => {
    const rawId = l.id || l._id || l.eventId || l.key?.id;
    const fallbackId = `log_${l.timestamp || l.createdAt || idx}_${l.phone || l.customerPhone || "event"}`;
    return {
      id: String(rawId || fallbackId),
      customerName: l.customerName || l.name,
      customerPhone: l.customerPhone || l.phone,
      campaignName: l.campaignName || l.campaign,
      campaignType: l.campaignType,
      timestamp: l.timestamp || l.createdAt || undefined,
      status: l.status === "sent" ? "sent" : l.status === "failed" ? "failed" : l.status === "skipped" ? "skipped" : "pending",
      reason: l.reason || l.fallbackReason,
      instanceName: l.instanceName || l.botName,
      cost: typeof l.cost === "number" ? l.cost : undefined,
    };
  });

  const handleCreateNew = (type: "fixed_message" | "ai_smart_followup") => {
    setEditingCampaign(null);
    setEditorType(type);
    setIsEditorOpen(true);
  };

  const handleEdit = (campaign: FollowupCampaign) => {
    setEditingCampaign(campaign);
    setEditorType(campaign.campaign_type === "ai_smart_followup" ? "ai_smart_followup" : "fixed_message");
    setIsEditorOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Automation"
        title="Follow-up Center"
        description="Configure automated Fixed Message and AI Smart Follow-up campaigns to re-engage quiet leads."
        icon={CalendarClock}
      />

      {/* Metric Tiles Overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="Active Campaigns"
          value={normalizedCampaigns.filter((c) => c.is_active).length}
          tone="teal"
        />
        <MetricTile
          label="Total Delivered"
          value={stats.total_sent !== undefined ? Number(stats.total_sent) : logsList.filter((l) => l.status === "sent").length}
          tone="neutral"
        />
        <MetricTile
          label="Skipped Rules"
          value={logsList.filter((l) => l.status === "skipped").length}
          tone="neutral"
        />
        <MetricTile
          label="Failed Attempts"
          value={logsList.filter((l) => l.status === "failed").length}
          tone="rose"
        />
      </div>

      {/* Navigation & Action Bar */}
      <DashboardToolbar>
        <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "overview"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Campaigns ({normalizedCampaigns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("auto_followup")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "auto_followup"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Auto Follow-up {autoFollowupEnabled ? "(ON)" : "(OFF)"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "logs"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            }`}
          >
            Execution Logs ({logsList.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onToggleAutoFollowup && (
            <button
              type="button"
              disabled={isTogglingAutoFollowup}
              onClick={async () => {
                setIsTogglingAutoFollowup(true);
                try {
                  await onToggleAutoFollowup(!autoFollowupEnabled);
                } finally {
                  setIsTogglingAutoFollowup(false);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                autoFollowupEnabled
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] text-[var(--ca-text-secondary)] hover:border-emerald-500 hover:text-[var(--ca-text-primary)]"
              }`}
              title="Toggle Intelligent Auto Follow-up"
            >
              <Bot className="h-4 w-4" />
              <span>Auto Follow-up: {autoFollowupEnabled ? "ON" : "OFF"}</span>
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh()}
              className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2 text-[var(--ca-text-secondary)] hover:border-emerald-500 hover:text-[var(--ca-text-primary)]"
              title="Refresh Campaigns"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleCreateNew("fixed_message")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
          >
            <Plus className="h-4 w-4 text-emerald-600" />
            <span>Fixed Message</span>
          </button>

          <button
            type="button"
            onClick={() => handleCreateNew("ai_smart_followup")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            <span>AI Smart Follow-up</span>
          </button>
        </div>
      </DashboardToolbar>

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <FollowupCampaignList
          campaigns={normalizedCampaigns}
          onEditCampaign={handleEdit}
          onDeleteCampaign={(c) => onDeleteCampaign && onDeleteCampaign(c.id)}
          onToggleActive={(c, isActive) => onSaveCampaign && onSaveCampaign({ id: c.id, is_active: isActive, raw: c.raw })}
          onCreateNew={handleCreateNew}
          formatDate={formatDate}
        />
      )}

      {activeTab === "auto_followup" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
                  <Bot className="h-4 w-4 text-emerald-600" />
                  Intelligent Auto Follow-up
                </h3>
                <p className="mt-1 text-xs text-[var(--ca-text-secondary)]">
                  When the bot successfully replies and the conversation is waiting for the customer, BlackArrow schedules intelligent follow-ups using semantic chat reasoning (default 1h &rarr; 2h &rarr; 4h &rarr; 8h &rarr; 16h doubling progression, or customer-stated timing).
                </p>
              </div>
              {onToggleAutoFollowup && (
                <button
                  type="button"
                  disabled={isTogglingAutoFollowup}
                  onClick={async () => {
                    setIsTogglingAutoFollowup(true);
                    try {
                      await onToggleAutoFollowup(!autoFollowupEnabled);
                    } finally {
                      setIsTogglingAutoFollowup(false);
                    }
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm ${
                    autoFollowupEnabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  }`}
                >
                  Auto Follow-up is {autoFollowupEnabled ? "ACTIVE (ON)" : "PAUSED (OFF)"}
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-[var(--ca-border-subtle)] pt-4 text-xs">
              <div>
                <span className="font-bold text-[var(--ca-text-primary)]">Default Sequence:</span>
                <p className="text-[var(--ca-text-secondary)]">1h &rarr; 2h &rarr; 4h &rarr; 8h &rarr; 16h</p>
              </div>
              <div>
                <span className="font-bold text-[var(--ca-text-primary)]">Chat Timing:</span>
                <p className="text-[var(--ca-text-secondary)]">Honors "tomorrow", "next week", etc.</p>
              </div>
              <div>
                <span className="font-bold text-[var(--ca-text-primary)]">Cancellation:</span>
                <p className="text-[var(--ca-text-secondary)]">Cancelled on new customer message</p>
              </div>
              <div>
                <span className="font-bold text-[var(--ca-text-primary)]">Billing:</span>
                <p className="text-[var(--ca-text-secondary)]">$0.003 only on successful delivery</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-secondary)] mb-3">
              Active Schedules ({autoFollowupSchedules.length})
            </h4>
            {autoFollowupSchedules.length === 0 ? (
              <p className="text-xs text-[var(--ca-text-secondary)] py-4 text-center">
                No active follow-up schedules. Schedules are created automatically after the bot successfully responds to eligible customer inquiries.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-secondary)] font-bold">
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Objective</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Attempt</th>
                      <th className="pb-2">Next Follow-up</th>
                      <th className="pb-2">Last Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                    {autoFollowupSchedules.map((schedule) => (
                      <tr key={schedule.id} className="hover:bg-[var(--ca-surface-2)]">
                        <td className="py-2.5 font-bold text-[var(--ca-text-primary)]">
                          {schedule.customerName || schedule.customerPhone || "WhatsApp contact"}
                        </td>
                        <td className="py-2.5 text-[var(--ca-text-secondary)]">
                          {schedule.currentObjective || "Inquiry continuation"}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              schedule.followupState === "SCHEDULED"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                : schedule.followupState === "SENT"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : schedule.followupState === "STOPPED" || schedule.followupState === "CANCELLED"
                                ? "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                                : "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                            }`}
                          >
                            {schedule.followupState || "SCHEDULED"}
                          </span>
                        </td>
                        <td className="py-2.5 text-[var(--ca-text-secondary)]">
                          {(schedule.attemptIndex || 0) + 1}
                        </td>
                        <td className="py-2.5 text-[var(--ca-text-secondary)]">
                          {schedule.nextFollowupAt ? formatDate(schedule.nextFollowupAt) : "None"}
                        </td>
                        <td className="py-2.5 text-[var(--ca-text-secondary)]">
                          {schedule.lastFollowupAt ? formatDate(schedule.lastFollowupAt) : "Not yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <FollowupLogsPanel
          logs={logsList}
          formatDate={formatDate}
        />
      )}

      <FollowupCampaignEditor
        campaign={editingCampaign}
        initialType={editorType}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingCampaign(null);
        }}
        onSave={async (data) => {
          if (onSaveCampaign) await onSaveCampaign(data);
        }}
      />
    </div>
  );
};
