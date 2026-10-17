import React, { useMemo, useState } from "react";
import { BarChart3, BrainCircuit, Clock3, ListChecks, Loader2, Plus, RefreshCw, Send, Trash2, Wallet } from "lucide-react";
import { buildUsageCompactChargeLabel, buildUsageDiscountHeroLabel, buildUsageRegularPriceLabel, buildUsageSavingsLabel } from "../config/pricing-display";
import { getFollowupCampaignCost, getFollowupCampaignTypeLabel, normalizeFollowupCampaignType } from "../services/followup-campaign-type-service";
import {
  buildFollowupDeleteConfirmation,
  removeFollowupCampaignAt,
  updateFollowupCampaignAt,
} from "../services/followup-campaign-editor-service";
import { TextLimitCounter } from "./TextLimitCounter";
import { DashboardPageHeader, MetricTile } from "./dashboard/DashboardPrimitives";

type Props = {
  followups: any[];
  setFollowups: (items: any[]) => void;
  bots?: any[];
  selectedBotId?: string | null;
  marketingStats: any;
  onSave: (items?: any[]) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
  onSelectInstance?: (botId: string) => void;
};

const tabs = ["overview", "campaigns", "logs", "analytics"] as const;
type TabId = (typeof tabs)[number];
const FOLLOWUP_CONTEXT_MAX_CHARS = 100000;

function money(value: any) {
  return `$${Number(value || 0).toFixed(3)}`;
}

function when(value: any) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString();
}

export function FollowupCenterPage({ followups, setFollowups, bots = [], selectedBotId, marketingStats, onSave, onRefresh, onSelectInstance }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [savingCampaignId, setSavingCampaignId] = useState("");
  const [isSavingAll, setIsSavingAll] = useState(false);
  const selectedBot = bots.find((bot: any) => bot.id === selectedBotId || bot.$id === selectedBotId);
  const hasSelectedInstance = Boolean(selectedBotId && selectedBot);
  const stats = marketingStats?.stats || {};
  const campaigns = Array.isArray(marketingStats?.campaigns) ? marketingStats.campaigns : [];
  const logs = Array.isArray(marketingStats?.logs) ? marketingStats.logs : [];
  const summary = useMemo(() => ({
    totalSent: Number(stats.total_sent || 0),
    totalFailed: logs.filter((log: any) => log.status === "failed").length,
    totalSkipped: logs.filter((log: any) => log.status === "skipped").length,
    walletSpent: campaigns.reduce((sum: number, campaign: any) => sum + Number(campaign.totalCost || 0), 0),
  }), [campaigns, logs, stats.total_sent]);

  const updateFollowup = (index: number, patch: any) => {
    if (!hasSelectedInstance) return;
    setFollowups(updateFollowupCampaignAt(followups, index, patch));
  };

  const persistFollowups = async (items: any[], savingKey: string) => {
    if (!hasSelectedInstance) throw new Error("Select a WhatsApp instance first.");
    setSavingCampaignId(savingKey);
    try {
      setFollowups(items);
      await onSave(items);
    } finally {
      setSavingCampaignId("");
    }
  };

  const addCampaign = (campaignType: "fixed_message" | "ai_smart_followup") => {
    if (!hasSelectedInstance) return;
    setFollowups([
      ...followups,
      {
        id: `f-${Date.now()}`,
        name: campaignType === "ai_smart_followup" ? "AI Smart Follow-up" : "Fixed Message Campaign",
        campaign_type: campaignType,
        is_active: 0,
        hours: 24,
        window_hours: 1,
        audience: "not_ordered",
        offer_context: "",
        defaultBotId: selectedBotId || "",
        sendFromMode: "default_only",
      },
    ]);
    setActiveTab("campaigns");
  };

  const toggleCampaignActive = async (index: number) => {
    if (!hasSelectedInstance) return;
    const campaign = followups[index] || {};
    const campaignId = String(campaign.id || index);
    const next = updateFollowupCampaignAt(followups, index, {
      is_active: campaign.is_active === 0 ? 1 : 0,
    });
    await persistFollowups(next, campaignId);
  };

  const deleteCampaign = async (index: number) => {
    if (!hasSelectedInstance) return;
    const campaign = followups[index] || {};
    const campaignId = String(campaign.id || index);
    if (!window.confirm(buildFollowupDeleteConfirmation(campaign, index))) return;
    await persistFollowups(removeFollowupCampaignAt(followups, index), `delete:${campaignId}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Outreach"
        title="Follow-up Campaigns"
        description="Automate fixed campaign messages or AI-written smart follow-ups when customers stop replying."
        icon={ListChecks}
        actions={
          <>
            <button disabled={!hasSelectedInstance} onClick={() => addCampaign("fixed_message")} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Plus className="w-4 h-4" /> Fixed Message
            </button>
            <button disabled={!hasSelectedInstance} onClick={() => addCampaign("ai_smart_followup")} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <BrainCircuit className="w-4 h-4" /> AI Smart Follow-up
            </button>
            <button onClick={() => onRefresh()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </>
        }
        guide={
            <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Selected instance</span>
              <select
                value={selectedBotId || ""}
                onChange={(event) => onSelectInstance?.(event.target.value)}
                className="min-w-[14rem] rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200"
              >
                <option value="">Select a WhatsApp instance</option>
                {bots.map((bot: any) => (
                  <option key={bot.id || bot.$id} value={bot.id || bot.$id}>
                    {bot.name || bot.jid || bot.id || bot.$id}
                  </option>
                ))}
              </select>
              {selectedBot ? (
                <span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Saving to {selectedBot.name || selectedBot.jid || "selected instance"}
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  Select a WhatsApp instance first.
                </span>
              )}
            </div>
        }
      />
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <MetricTile label="Total Sent" value={summary.totalSent} icon={Send} tone="green" />
          <MetricTile label="Failed" value={summary.totalFailed} icon={Trash2} tone="red" />
          <MetricTile label="Skipped" value={summary.totalSkipped} icon={Clock3} tone="amber" />
          <MetricTile label="Wallet Spent" value={money(summary.walletSpent)} icon={Wallet} tone="blue" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white/90 p-2 shadow-sm dark:border-white/10 dark:bg-neutral-900/88">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest ${activeTab === tab ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"}`}>
              {tab === "overview" ? "Overview" : tab === "campaigns" ? "Campaigns" : tab === "logs" ? "Activity Logs" : "Costs & Analytics"}
            </button>
          ))}
        </div>

      {activeTab === "overview" && (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5"><div className="flex items-center gap-2 text-emerald-600"><Clock3 className="w-4 h-4" /><span className="text-xs font-black uppercase tracking-widest">Scheduler</span></div><p className="mt-3 text-sm font-bold text-gray-900 dark:text-neutral-50">{stats.status || "Status unavailable"}</p><p className="mt-2 text-xs text-gray-500 dark:text-neutral-500">Next scan: {stats.next_scan || "Unknown"}</p></div>
          <div className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5"><div className="flex items-center gap-2 text-blue-600"><Send className="w-4 h-4" /><span className="text-xs font-black uppercase tracking-widest">Last Scan</span></div><p className="mt-3 text-sm font-bold text-gray-900 dark:text-neutral-50">Found {stats.last_scan_found || 0} / Sent {stats.last_scan_sent || 0} / Failed {stats.last_scan_failed || 0} / Skipped {stats.last_scan_skipped || 0}</p><p className="mt-2 text-xs text-gray-500 dark:text-neutral-500">{stats.last_scan_reason || "No extra scan detail available."}</p></div>
          <div className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5"><div className="flex items-center gap-2 text-amber-600"><Wallet className="w-4 h-4" /><span className="text-xs font-black uppercase tracking-widest">Modes</span></div><div className="mt-3 space-y-3 text-sm font-bold text-gray-900 dark:text-neutral-50"><div><p>Fixed Message: {money(0.001)} per successful sent message</p></div><div><p>{buildUsageDiscountHeroLabel("ai_smart_followup_text")}</p><p className="mt-1 text-[11px] font-bold text-gray-500 dark:text-neutral-400">{buildUsageRegularPriceLabel("ai_smart_followup_text")} · {buildUsageSavingsLabel("ai_smart_followup_text")}</p><p className="mt-1 text-[11px] font-black text-amber-600 dark:text-amber-300">{buildUsageCompactChargeLabel("ai_smart_followup_text")}</p></div></div><p className="mt-2 text-[11px] text-gray-500 dark:text-neutral-500">Wallet charges only after successful WhatsApp send/receipt. Failed or skipped sends are not charged.</p></div>
        </section>
      )}

      {activeTab === "campaigns" && (
        <section className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          {!hasSelectedInstance && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-200">
              Select a WhatsApp instance first.
            </div>
          )}
          {followups.map((campaign, index) => {
            const campaignType = normalizeFollowupCampaignType(campaign.campaign_type);
            const campaignId = String(campaign.id || index);
            const isDeleting = savingCampaignId === `delete:${campaignId}`;
            const isSavingCampaign = savingCampaignId === campaignId || isDeleting;
            const isActive = campaign.is_active === 1 || campaign.is_active === true || campaign.is_active === "1";
            return (
              <div key={campaign.id || index} className="rounded-2xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <input disabled={!hasSelectedInstance} value={campaign.name || ""} onChange={(e) => updateFollowup(index, { name: e.target.value })} placeholder="Campaign name" className="flex-1 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-bold text-gray-800 disabled:opacity-60 dark:text-neutral-200" />
                  <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
                    <select disabled={!hasSelectedInstance} value={campaignType} onChange={(e) => updateFollowup(index, { campaign_type: e.target.value })} className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-black text-gray-700 disabled:opacity-60 dark:text-neutral-300">
                      <option value="fixed_message">fixed_message</option>
                      <option value="ai_smart_followup">ai_smart_followup</option>
                    </select>
                    <span className={`rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-widest ${isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200" : "bg-gray-200 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"}`}>{isActive ? "Active" : "Paused"}</span>
                    <button type="button" onClick={() => toggleCampaignActive(index)} disabled={!hasSelectedInstance || isSavingCampaign} className={`inline-flex min-w-[8.5rem] items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60 ${isActive ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                      <span className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? "bg-emerald-200/60" : "bg-gray-300 dark:bg-neutral-700"}`}>
                        <span className={`absolute top-[2px] h-5 w-5 rounded-full bg-white transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                      </span>
                      {isSavingCampaign && !isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {isActive ? "Pause" : "Activate"}
                    </button>
                    <button type="button" onClick={() => deleteCampaign(index)} disabled={!hasSelectedInstance || isSavingCampaign} className="inline-flex min-w-[6rem] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 dark:border-rose-900 dark:bg-neutral-900 dark:text-rose-300 disabled:opacity-60">
                      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <input disabled={!hasSelectedInstance} type="number" min="1" value={campaign.hours || 24} onChange={(e) => updateFollowup(index, { hours: Number(e.target.value) || 24 })} className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-bold text-gray-800 disabled:opacity-60 dark:text-neutral-200" />
                  <select disabled={!hasSelectedInstance} value={campaign.audience || "not_ordered"} onChange={(e) => updateFollowup(index, { audience: e.target.value })} className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-bold text-gray-800 disabled:opacity-60 dark:text-neutral-200">
                    <option value="not_ordered">Customers who did not order</option>
                    <option value="incomplete_lead">Customers with incomplete lead/order</option>
                    <option value="ordered">Customers who already ordered</option>
                    <option value="all">All customers</option>
                  </select>
                  <input disabled={!hasSelectedInstance} type="number" min="1" max="6" value={campaign.window_hours ?? 1} onChange={(e) => updateFollowup(index, { window_hours: Number(e.target.value) || 1 })} className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-bold text-gray-800 disabled:opacity-60 dark:text-neutral-200" />
                  <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm font-black leading-snug text-blue-700 dark:text-blue-300">{campaignType === "ai_smart_followup" ? `${buildUsageDiscountHeroLabel("ai_smart_followup_text")} · ${buildUsageSavingsLabel("ai_smart_followup_text")}` : `${getFollowupCampaignTypeLabel(campaignType)} - ${money(getFollowupCampaignCost(campaignType))} per successful sent message`}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Default WhatsApp instance</label>
                    <select
                      disabled={!hasSelectedInstance}
                      value={campaign.defaultBotId || selectedBotId || ""}
                      onChange={(e) => updateFollowup(index, { defaultBotId: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-bold text-gray-800 disabled:opacity-60 dark:text-neutral-200"
                    >
                      <option value="">Use selected instance</option>
                      {bots.map((bot: any) => (
                        <option key={bot.id || bot.$id} value={bot.id || bot.$id}>
                          {bot.name || bot.jid || bot.id || bot.$id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Send mode</label>
                    <select
                      disabled={!hasSelectedInstance}
                      value={campaign.sendFromMode || "default_only"}
                      onChange={(e) => updateFollowup(index, { sendFromMode: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-bold text-gray-800 disabled:opacity-60 dark:text-neutral-200"
                    >
                      <option value="default_only">Default instance only</option>
                      <option value="customer_origin_then_default">Customer origin, then default</option>
                    </select>
                    <p className="mt-1 text-[11px] font-medium text-gray-500 dark:text-neutral-500">Customer origin uses the WhatsApp number where the customer first or recently messaged. If unavailable, default instance is used.</p>
                  </div>
                </div>
                <textarea disabled={!hasSelectedInstance} value={campaign.offer_context || ""} onChange={(e) => updateFollowup(index, { offer_context: e.target.value })} rows={3} placeholder={campaignType === "ai_smart_followup" ? "AI instruction/context" : "Exact fixed message to send"} className="w-full rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-3 text-sm font-medium text-gray-800 disabled:opacity-60 dark:text-neutral-200" />
              </div>
            );
          })}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 dark:text-neutral-500">Existing old campaigns load as `fixed_message` unless changed. Paused campaigns are skipped by the scheduler.</p>
            <button
              onClick={async () => {
                setIsSavingAll(true);
                try {
                  await onSave(followups);
                } finally {
                  setIsSavingAll(false);
                }
              }}
              disabled={!hasSelectedInstance || isSavingAll}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-60"
            >
              {isSavingAll ? "Saving..." : "Save Follow-up Campaigns"}
            </button>
          </div>
        </section>
      )}

      {activeTab === "logs" && (
        <section className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr><th className="py-3">Contact</th><th className="py-3">Campaign</th><th className="py-3">Type</th><th className="py-3">Status</th><th className="py-3">Cost</th><th className="py-3">Reason</th><th className="py-3 text-right">Time</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {logs.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-xs font-bold text-gray-400">No follow-up activity yet.</td></tr> : logs.map((log: any, idx: number) => (
                <tr key={idx} className="text-gray-700 dark:text-neutral-300">
                  <td className="py-3">{log.phone || log.customer || log.jid || "-"}</td>
                  <td className="py-3">{log.campaignName || log.followupId || "-"}</td>
                  <td className="py-3">{getFollowupCampaignTypeLabel(log.campaignType)}</td>
                  <td className="py-3 font-black">{log.status}</td>
                  <td className="py-3">{log.costCharged ? money(log.costCharged) : "-"}</td>
                  <td className="py-3 max-w-[16rem] truncate">{log.reason || "-"}</td>
                  <td className="py-3 text-right text-xs">{when(log.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "analytics" && (
        <section className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign: any) => (
            <div key={campaign.key} className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-gray-900 dark:text-neutral-50">{campaign.name || campaign.followupId}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-400">{campaign.campaignType === "ai_smart_followup" ? `${buildUsageDiscountHeroLabel("ai_smart_followup_text")} · ${buildUsageSavingsLabel("ai_smart_followup_text")}` : `${getFollowupCampaignTypeLabel(campaign.campaignType)} - ${money(campaign.costPerMessage || getFollowupCampaignCost(campaign.campaignType))} per successful sent message`}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${campaign.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200" : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500"}`}>{campaign.isActive ? "Active" : "Paused"}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sent</p><p className="mt-1 text-xl font-black text-emerald-600">{campaign.sent || 0}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Failed/Skipped</p><p className="mt-1 text-xl font-black text-amber-600">{Number(campaign.failed || 0) + Number(campaign.skipped || 0)}</p></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ratio</p><p className="mt-1 text-xl font-black text-blue-600">{campaign.orderRatio || 0}%</p></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-bold text-gray-500 dark:text-neutral-500">
                <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 p-3"><BarChart3 className="w-4 h-4 mb-2 text-emerald-500" /> Total cost: {money(campaign.totalCost || 0)}</div>
                <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 p-3"><ListChecks className="w-4 h-4 mb-2 text-blue-500" /> Last sent: {campaign.lastSentAt ? when(campaign.lastSentAt) : "Not yet"}</div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
