import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Send,
  Plus,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Sliders,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import {
  DashboardSurface,
  DashboardPageHeader,
  MetricTile,
  ToneBadge,
  ProgressTrack,
  ActionPanel,
} from "../components/dashboard/DashboardPrimitives";

export interface CampaignModel {
  id: string;
  name: string;
  contactListId: string;
  contactListName?: string;
  sendingInstanceId: string;
  messageMode: "FIXED" | "AI_PERSONALIZED";
  campaignInstructions?: string;
  campaignFixedMessage?: string;
  timingMode: "FIXED_DELAY" | "RANDOM_RANGE";
  fixedDelaySeconds?: number;
  randomMinSeconds?: number;
  randomMaxSeconds?: number;
  timezone: string;
  sendingWindowStart?: string;
  sendingWindowEnd?: string;
  startAt?: number;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface RecipientLogItem {
  id: string;
  name: string;
  normalizedPhone: string;
  status: string;
  statusReason?: string;
  sentMessageText?: string;
  generatedMessageText?: string;
  messageId?: string;
  scheduledAt?: number;
  sentAt?: number;
  attemptCount: number;
}

export interface CampaignEventItem {
  id: string;
  eventType: string;
  recipientId?: string;
  details?: any;
  createdAt: number;
}

interface Props {
  bots?: any[];
  formatDate?: (ts?: any) => string;
}

export const CampaignsPage: React.FC<Props> = ({
  bots = [],
  formatDate = (ts) => (ts ? new Date(ts).toLocaleString() : "-"),
}) => {
  const [campaigns, setCampaigns] = useState<CampaignModel[]>([]);
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Selected Campaign & Live Logs Drawer
  const [activeCampaign, setActiveCampaign] = useState<CampaignModel | null>(null);
  const [recipientLogs, setRecipientLogs] = useState<RecipientLogItem[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState("all");
  const [campaignEvents, setCampaignEvents] = useState<CampaignEventItem[]>([]);
  const [activeDrawerTab, setActiveDrawerTab] = useState<"recipients" | "events">("recipients");

  // Create Campaign Modal State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3>(1);
  const [newCampName, setNewCampName] = useState("");
  const [newCampListId, setNewCampListId] = useState("");
  const [newCampBotId, setNewCampBotId] = useState("");
  const [newCampMode, setNewCampMode] = useState<"FIXED" | "AI_PERSONALIZED">("FIXED");
  const [newCampFixedMessage, setNewCampFixedMessage] = useState("");
  const [newCampInstructions, setNewCampInstructions] = useState("");
  const [newCampTimingMode, setNewCampTimingMode] = useState<"FIXED_DELAY" | "RANDOM_RANGE">("FIXED_DELAY");
  const [newCampFixedDelay, setNewCampFixedDelay] = useState(30);
  const [newCampRandomMin, setNewCampRandomMin] = useState(30);
  const [newCampRandomMax, setNewCampRandomMax] = useState(90);
  const [newCampTimezone, setNewCampTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [newCampWindowStart, setNewCampWindowStart] = useState("09:00");
  const [newCampWindowEnd, setNewCampWindowEnd] = useState("21:00");
  const [newCampStartLater, setNewCampStartLater] = useState(false);
  const [newCampScheduledTime, setNewCampScheduledTime] = useState("");
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Change Instance Modal State
  const [isChangeSenderOpen, setIsChangeSenderOpen] = useState(false);
  const [targetCampaignForSender, setTargetCampaignForSender] = useState<CampaignModel | null>(null);
  const [replacementBotId, setReplacementBotId] = useState("");

  // Start Confirmation Modal
  const [confirmStartCampaign, setConfirmStartCampaign] = useState<CampaignModel | null>(null);

  // Fetch campaigns
  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/user/campaigns");
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json();
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch campaigns");
    } finally {
      setLoading(false);
    }
  };

  // Fetch available contact lists
  const fetchLists = async () => {
    try {
      const res = await fetch("/api/user/contact-lists");
      if (res.ok) {
        const data = await res.json();
        setContactLists(Array.isArray(data.lists) ? data.lists : []);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchCampaigns();
    fetchLists();
  }, []);

  // Fetch recipient logs for active campaign
  const fetchRecipientLogs = async (campaignId: string, page = 1) => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        status: recipientStatusFilter,
      });
      const res = await fetch(`/api/user/campaigns/${campaignId}/recipients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipientLogs(data.recipients || []);
        setRecipientTotal(data.total || 0);
        setRecipientPage(data.page || 1);
      }
    } catch (err) {}
  };

  // Fetch campaign events
  const fetchCampaignEvents = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/user/campaigns/${campaignId}/events`);
      if (res.ok) {
        const data = await res.json();
        setCampaignEvents(data.events || []);
      }
    } catch (err) {}
  };

  // Live auto-polling while campaign detail drawer is open
  useEffect(() => {
    if (!activeCampaign) return;
    fetchRecipientLogs(activeCampaign.id, recipientPage);
    fetchCampaignEvents(activeCampaign.id);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/user/campaigns/${activeCampaign.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.campaign) {
            setActiveCampaign(data.campaign);
            setCampaigns((cur) => cur.map((c) => (c.id === data.campaign.id ? data.campaign : c)));
          }
        }
        fetchRecipientLogs(activeCampaign.id, recipientPage);
      } catch (err) {}
    }, 4000);

    return () => clearInterval(interval);
  }, [activeCampaign?.id, recipientPage, recipientStatusFilter]);

  // Campaign Actions
  const handleCampaignAction = async (campaignId: string, action: "start" | "pause" | "resume" | "cancel") => {
    try {
      setError(null);
      const res = await fetch(`/api/user/campaigns/${campaignId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentAcknowledged: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} campaign`);

      setSuccess(`Campaign ${action}ed successfully.`);
      fetchCampaigns();
      if (activeCampaign?.id === campaignId && data.campaign) {
        setActiveCampaign(data.campaign);
      }
    } catch (err: any) {
      setError(err.message || `Failed to execute ${action}`);
    }
  };

  // Create Campaign
  const handleCreateCampaign = async () => {
    if (!newCampName.trim() || !newCampListId || !newCampBotId) {
      setError("Please specify campaign name, contact list, and sending WhatsApp instance.");
      return;
    }
    if (newCampMode === "FIXED" && !newCampFixedMessage.trim()) {
      setError("Please provide a default fixed message.");
      return;
    }
    if (newCampMode === "AI_PERSONALIZED" && !newCampInstructions.trim()) {
      setError("Please provide AI campaign instructions.");
      return;
    }
    if (!consentAcknowledged) {
      setError("You must acknowledge that you have permission to message these recipients.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const startAt = newCampStartLater && newCampScheduledTime ? new Date(newCampScheduledTime).getTime() : undefined;

      // 1. Create campaign
      const createRes = await fetch("/api/user/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampName,
          contactListId: newCampListId,
          sendingInstanceId: newCampBotId,
          messageMode: newCampMode,
          campaignFixedMessage: newCampFixedMessage || undefined,
          campaignInstructions: newCampInstructions || undefined,
          timingMode: newCampTimingMode,
          fixedDelaySeconds: newCampTimingMode === "FIXED_DELAY" ? newCampFixedDelay : undefined,
          randomMinSeconds: newCampTimingMode === "RANDOM_RANGE" ? newCampRandomMin : undefined,
          randomMaxSeconds: newCampTimingMode === "RANDOM_RANGE" ? newCampRandomMax : undefined,
          timezone: newCampTimezone,
          sendingWindowStart: newCampWindowStart,
          sendingWindowEnd: newCampWindowEnd,
          startAt,
        }),
      });

      const campData = await createRes.json();
      if (!createRes.ok) throw new Error(campData.error || "Failed to create campaign");

      // 2. Start campaign immediately
      const startRes = await fetch(`/api/user/campaigns/${campData.campaign.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentAcknowledged: true, startAt }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Failed to launch campaign");

      setIsBuilderOpen(false);
      fetchCampaigns();
      setSuccess(`Campaign "${newCampName}" launched successfully!`);
    } catch (err: any) {
      setError(err.message || "Failed to complete campaign launch");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reassign Sender
  const handleChangeSender = async () => {
    if (!targetCampaignForSender || !replacementBotId) return;
    try {
      const res = await fetch(`/api/user/campaigns/${targetCampaignForSender.id}/change-instance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newInstanceId: replacementBotId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change sending instance");

      setIsChangeSenderOpen(false);
      fetchCampaigns();
      if (activeCampaign?.id === targetCampaignForSender.id && data.campaign) {
        setActiveCampaign(data.campaign);
      }
      setSuccess("Sending instance updated successfully.");
    } catch (err: any) {
      setError(err.message || "Failed to update sender");
    }
  };

  // Selected List Stats for Builder Summary
  const selectedListObj = contactLists.find((l) => l.id === newCampListId);

  // Filtered campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <DashboardPageHeader
        eyebrow="Audience Messaging"
        title="Campaigns"
        description="Launch targeted Fixed or AI-Personalized WhatsApp campaigns with durable delay pacing, daily sending windows, and recipient-level transport receipts."
        icon={Send}
        actions={
          <button
            type="button"
            onClick={() => {
              setBuilderStep(1);
              setNewCampName("");
              setNewCampFixedMessage("");
              setNewCampInstructions("");
              setConsentAcknowledged(false);
              setIsBuilderOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        }
      />

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-medium text-rose-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter Tabs Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-1 text-xs">
          {["all", "running", "paused", "scheduled", "completed", "needs_sending_instance", "cancelled"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded-lg px-3 py-1.5 font-bold capitalize transition-all ${
                statusFilter === tab
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
              }`}
            >
              {tab.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] pl-9 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none"
          />
        </div>
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[var(--ca-text-secondary)]">Loading campaigns...</div>
      ) : filteredCampaigns.length === 0 ? (
        <DashboardSurface className="py-12 text-center flex flex-col items-center justify-center p-6">
          <Send className="w-12 h-12 text-[var(--ca-text-muted)] mb-3" />
          <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">No Campaigns Found</h3>
          <p className="text-xs text-[var(--ca-text-secondary)] max-w-sm mt-1">
            Build your first campaign using an imported contact list with pacing controls and AI personalization.
          </p>
        </DashboardSurface>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((camp) => {
            const botObj = bots.find((b: any) => (b.$id || b.id) === camp.sendingInstanceId);
            const listObj = contactLists.find((l) => l.id === camp.contactListId);
            const progressPercent = camp.totalRecipients > 0 ? Math.round((camp.sentCount / camp.totalRecipients) * 100) : 0;

            return (
              <div key={camp.id} className="h-full">
                <DashboardSurface className="p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-colors h-full">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-sm text-[var(--ca-text-primary)] truncate" title={camp.name}>{camp.name}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        camp.status === "RUNNING"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : camp.status === "PAUSED"
                          ? "bg-amber-500/10 text-amber-500"
                          : camp.status === "NEEDS_SENDING_INSTANCE"
                          ? "bg-rose-500/10 text-rose-500"
                          : camp.status === "COMPLETED"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-gray-500/10 text-gray-400"
                      }`}
                    >
                      {camp.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[var(--ca-text-muted)] mb-3">
                    <span>{listObj?.name || "Contact List"}</span>
                    <span>•</span>
                    <span className="font-semibold text-indigo-400">
                      {camp.messageMode === "AI_PERSONALIZED" ? "AI Personalized" : "Fixed Message"}
                    </span>
                  </div>

                  {/* Sender info */}
                  <div className="rounded-xl bg-[var(--ca-bg-hover)] p-2.5 mb-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-medium text-[var(--ca-text-primary)] truncate max-w-[140px]">
                        {botObj?.name || botObj?.phone || camp.sendingInstanceId || "Unknown Sender"}
                      </span>
                    </div>
                    {camp.status === "NEEDS_SENDING_INSTANCE" && (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetCampaignForSender(camp);
                          setIsChangeSenderOpen(true);
                        }}
                        className="text-[10px] font-bold text-rose-500 underline"
                      >
                        Assign Sender
                      </button>
                    )}
                  </div>

                  {/* Progress track */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--ca-text-muted)]">Progress</span>
                      <span className="font-bold text-[var(--ca-text-primary)]">{progressPercent}%</span>
                    </div>
                    <ProgressTrack value={progressPercent} />
                    <div className="flex justify-between text-[10px] text-[var(--ca-text-muted)] pt-0.5">
                      <span>{camp.sentCount} sent</span>
                      {camp.failedCount > 0 && <span className="text-rose-500">{camp.failedCount} failed</span>}
                      {camp.skippedCount > 0 && <span>{camp.skippedCount} skipped</span>}
                      <span>{camp.totalRecipients} total</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--ca-border-subtle)] mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCampaign(camp);
                      setRecipientPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ca-text-secondary)] hover:text-emerald-500"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Live Details
                  </button>

                  <div className="flex items-center gap-1.5">
                    {camp.status === "RUNNING" && (
                      <button
                        type="button"
                        onClick={() => handleCampaignAction(camp.id, "pause")}
                        className="p-1.5 rounded-lg bg-[var(--ca-bg-hover)] text-amber-500 hover:bg-amber-500/10"
                        title="Pause Campaign"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {camp.status === "PAUSED" && (
                      <button
                        type="button"
                        onClick={() => handleCampaignAction(camp.id, "resume")}
                        className="p-1.5 rounded-lg bg-[var(--ca-bg-hover)] text-emerald-500 hover:bg-emerald-500/10"
                        title="Resume Campaign"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(camp.status === "RUNNING" || camp.status === "PAUSED" || camp.status === "SCHEDULED") && (
                      <button
                        type="button"
                        onClick={() => handleCampaignAction(camp.id, "cancel")}
                        className="p-1.5 rounded-lg bg-[var(--ca-bg-hover)] text-rose-500 hover:bg-rose-500/10"
                        title="Cancel Campaign"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </DashboardSurface>
            </div>
          );
          })}
        </div>
      )}

      {/* Campaign Details & Recipient Log Drawer */}
      {activeCampaign && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-[var(--ca-bg-surface)] border-l border-[var(--ca-border-subtle)] p-6 overflow-y-auto flex flex-col h-full shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--ca-border-subtle)]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[var(--ca-text-primary)]">{activeCampaign.name}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 uppercase">
                    {activeCampaign.status}
                  </span>
                </div>
                <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                  Started: {formatDate(activeCampaign.startedAt || activeCampaign.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCampaign(null)}
                className="rounded-lg p-1.5 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metric Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-4">
              <div className="rounded-xl bg-[var(--ca-bg-hover)] p-3">
                <div className="text-[10px] text-[var(--ca-text-muted)] font-bold uppercase">Total</div>
                <div className="text-base font-bold text-[var(--ca-text-primary)]">{activeCampaign.totalRecipients}</div>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <div className="text-[10px] text-emerald-500 font-bold uppercase">Sent</div>
                <div className="text-base font-bold text-emerald-500">{activeCampaign.sentCount}</div>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-3">
                <div className="text-[10px] text-amber-500 font-bold uppercase">Pending</div>
                <div className="text-base font-bold text-amber-500">
                  {Math.max(0, activeCampaign.totalRecipients - activeCampaign.sentCount - activeCampaign.failedCount - activeCampaign.skippedCount)}
                </div>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-3">
                <div className="text-[10px] text-rose-500 font-bold uppercase">Failed</div>
                <div className="text-base font-bold text-rose-500">{activeCampaign.failedCount}</div>
              </div>
              <div className="rounded-xl bg-gray-500/10 p-3">
                <div className="text-[10px] text-[var(--ca-text-muted)] font-bold uppercase">Skipped</div>
                <div className="text-base font-bold text-[var(--ca-text-primary)]">{activeCampaign.skippedCount}</div>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--ca-border-subtle)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDrawerTab("recipients")}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                    activeDrawerTab === "recipients" ? "bg-emerald-600 text-white" : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
                  }`}
                >
                  Recipients Log ({recipientTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDrawerTab("events")}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                    activeDrawerTab === "events" ? "bg-emerald-600 text-white" : "text-[var(--ca-text-secondary)] hover:bg-[var(--ca-bg-hover)]"
                  }`}
                >
                  Events Audit Trail ({campaignEvents.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                {activeCampaign.status === "RUNNING" && (
                  <button
                    type="button"
                    onClick={() => handleCampaignAction(activeCampaign.id, "pause")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 border border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-500/10"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                )}
                {activeCampaign.status === "PAUSED" && (
                  <button
                    type="button"
                    onClick={() => handleCampaignAction(activeCampaign.id, "resume")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10"
                  >
                    <Play className="w-3.5 h-3.5" /> Resume
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTargetCampaignForSender(activeCampaign);
                    setIsChangeSenderOpen(true);
                  }}
                  className="text-xs font-semibold border border-[var(--ca-border-subtle)] px-3 py-1.5 rounded-lg hover:bg-[var(--ca-bg-hover)]"
                >
                  Change Sender
                </button>
              </div>
            </div>

            {/* Drawer Tab Content */}
            {activeDrawerTab === "recipients" ? (
              <div className="flex-1 flex flex-col pt-3">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs text-[var(--ca-text-secondary)]">
                    <thead className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Recipient</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Receipt / ID</th>
                        <th className="py-2.5 px-3">Message Preview</th>
                        <th className="py-2.5 px-3">Sent / Scheduled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                      {recipientLogs.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8">No recipient logs found.</td></tr>
                      ) : (
                        recipientLogs.map((r) => (
                          <tr key={r.id} className="hover:bg-[var(--ca-bg-hover)]">
                            <td className="py-2.5 px-3 font-bold text-[var(--ca-text-primary)]">{r.name || "-"}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">{r.normalizedPhone}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-semibold ${
                                  r.status === "SENT"
                                    ? "text-emerald-500"
                                    : r.status.startsWith("SKIPPED")
                                    ? "text-gray-400"
                                    : r.status === "FAILED"
                                    ? "text-rose-500"
                                    : "text-amber-500"
                                }`}
                              >
                                {r.status}
                              </span>
                              {r.statusReason && <div className="text-[10px] text-rose-400 truncate max-w-[120px]">{r.statusReason}</div>}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-[var(--ca-text-muted)]">
                              {r.messageId ? r.messageId.slice(0, 16) + "..." : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] truncate max-w-[180px]" title={r.sentMessageText || r.generatedMessageText}>
                              {r.sentMessageText || r.generatedMessageText || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-[var(--ca-text-muted)]">
                              {formatDate(r.sentAt || r.scheduledAt)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--ca-border-subtle)] mt-2">
                  <span className="text-xs text-[var(--ca-text-muted)]">
                    Page {recipientPage} of {Math.max(1, Math.ceil(recipientTotal / 25))}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={recipientPage <= 1}
                      onClick={() => setRecipientPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded border border-[var(--ca-border-subtle)] disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={recipientPage >= Math.ceil(recipientTotal / 25)}
                      onClick={() => setRecipientPage((p) => p + 1)}
                      className="p-1 rounded border border-[var(--ca-border-subtle)] disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-[var(--ca-border-subtle)] pt-2">
                {campaignEvents.map((ev) => (
                  <div key={ev.id} className="py-3 text-xs flex items-start justify-between">
                    <div>
                      <div className="font-bold text-[var(--ca-text-primary)]">{ev.eventType}</div>
                      {ev.details && (
                        <div className="font-mono text-[11px] text-[var(--ca-text-muted)] mt-0.5">
                          {JSON.stringify(ev.details)}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--ca-text-muted)]">{formatDate(ev.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Builder Modal */}
      {isBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-[var(--ca-bg-surface)] border border-[var(--ca-border-subtle)] rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ca-border-subtle)]">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Create Audience Campaign</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBuilderOpen(false)}
                className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Basics */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. Eid Mega Sale Outreach"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Select Contact List</label>
                  <select
                    value={newCampListId}
                    onChange={(e) => setNewCampListId(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none"
                  >
                    <option value="">-- Choose Contact List --</option>
                    {contactLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.readyContacts || l.validContacts || l.totalRows} contacts)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Sending WhatsApp Instance</label>
                  <select
                    value={newCampBotId}
                    onChange={(e) => setNewCampBotId(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none"
                  >
                    <option value="">-- Choose WhatsApp Number --</option>
                    {bots.map((b: any) => (
                      <option key={b.$id || b.id} value={b.$id || b.id}>
                        {b.name || b.phone || "WhatsApp Instance"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">Message Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setNewCampMode("FIXED")}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      newCampMode === "FIXED"
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]"
                    }`}
                  >
                    <div className="font-bold text-xs text-[var(--ca-text-primary)]">Fixed Message</div>
                    <div className="text-[11px] text-[var(--ca-text-muted)] mt-1">
                      Static text. Row Fixed Message takes precedence over campaign fallback. No AI fee.
                    </div>
                  </div>

                  <div
                    onClick={() => setNewCampMode("AI_PERSONALIZED")}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      newCampMode === "AI_PERSONALIZED"
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)]"
                    }`}
                  >
                    <div className="font-bold text-xs text-[var(--ca-text-primary)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      AI Personalized
                    </div>
                    <div className="text-[11px] text-[var(--ca-text-muted)] mt-1">
                      Custom tailored message per recipient combining your prompt + recipient name + row AI instructions.
                    </div>
                  </div>
                </div>
              </div>

              {/* Mode Specific Textarea */}
              {newCampMode === "FIXED" ? (
                <div>
                  <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
                    Campaign Fixed Message Fallback
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter the default fixed message to deliver to recipients..."
                    value={newCampFixedMessage}
                    onChange={(e) => setNewCampFixedMessage(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] p-3 text-xs text-[var(--ca-text-primary)] outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">
                    AI Campaign Objective & Instructions
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Instructions for the AI on how to write each recipient's personalized outreach..."
                    value={newCampInstructions}
                    onChange={(e) => setNewCampInstructions(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] p-3 text-xs text-[var(--ca-text-primary)] outline-none"
                  />
                </div>
              )}

              {/* Pacing & Timing Settings */}
              <div className="border-t border-[var(--ca-border-subtle)] pt-4 space-y-3">
                <h4 className="text-xs font-bold text-[var(--ca-text-primary)]">Timing & Sending Window</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Delay Pacing</label>
                    <select
                      value={newCampTimingMode}
                      onChange={(e) => setNewCampTimingMode(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs font-semibold text-[var(--ca-text-primary)] outline-none"
                    >
                      <option value="FIXED_DELAY">Fixed Delay Between Messages</option>
                      <option value="RANDOM_RANGE">Random Delay Range (Persisted)</option>
                    </select>
                  </div>

                  {newCampTimingMode === "FIXED_DELAY" ? (
                    <div>
                      <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Delay (seconds)</label>
                      <input
                        type="number"
                        min={5}
                        max={3600}
                        value={newCampFixedDelay}
                        onChange={(e) => setNewCampFixedDelay(Number(e.target.value))}
                        className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Min (sec)</label>
                        <input
                          type="number"
                          min={5}
                          value={newCampRandomMin}
                          onChange={(e) => setNewCampRandomMin(Number(e.target.value))}
                          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Max (sec)</label>
                        <input
                          type="number"
                          min={10}
                          value={newCampRandomMax}
                          onChange={(e) => setNewCampRandomMax(Number(e.target.value))}
                          className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Daily Start Window</label>
                    <input
                      type="time"
                      value={newCampWindowStart}
                      onChange={(e) => setNewCampWindowStart(e.target.value)}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Daily End Window</label>
                    <input
                      type="time"
                      value={newCampWindowEnd}
                      onChange={(e) => setNewCampWindowEnd(e.target.value)}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--ca-text-muted)] mb-1">Timezone</label>
                    <input
                      type="text"
                      value={newCampTimezone}
                      onChange={(e) => setNewCampTimezone(e.target.value)}
                      className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Safety Summary Box (Requirements 37 & 50) */}
              <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] p-4 space-y-3">
                <h4 className="text-xs font-bold text-[var(--ca-text-primary)] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Pre-Launch Safety & Recipient Snapshot
                </h4>
                {selectedListObj ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[var(--ca-text-muted)]">Unique:</span>{" "}
                      <strong className="text-[var(--ca-text-primary)]">{selectedListObj.uniqueContacts}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--ca-text-muted)]">Verified:</span>{" "}
                      <strong className="text-emerald-500">{selectedListObj.validContacts}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--ca-text-muted)]">Suppressed:</span>{" "}
                      <strong className="text-amber-500">{selectedListObj.suppressedContacts}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--ca-text-muted)]">Ready to Send:</span>{" "}
                      <strong className="text-emerald-500">{selectedListObj.readyContacts}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--ca-text-muted)]">Select a contact list above to view recipient counts.</p>
                )}

                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-[11px] text-amber-500 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Compliance Notice:</strong> Pacing controls reduce burst traffic but do not guarantee protection from WhatsApp restrictions. Only message contacts you have explicit permission to contact.
                  </span>
                </div>

                <label className="flex items-start gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={consentAcknowledged}
                    onChange={(e) => setConsentAcknowledged(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-xs font-medium text-[var(--ca-text-primary)]">
                    I confirm and acknowledge that I have explicit consent and permission to message these recipients under applicable laws and WhatsApp messaging policies.
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--ca-border-subtle)]">
              <button
                type="button"
                onClick={() => setIsBuilderOpen(false)}
                className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCampaign}
                disabled={isSubmitting || !consentAcknowledged || !newCampName.trim() || !newCampListId || !newCampBotId}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Launching...
                  </>
                ) : (
                  "Launch Campaign"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Sending Instance Modal */}
      {isChangeSenderOpen && targetCampaignForSender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[var(--ca-bg-surface)] border border-[var(--ca-border-subtle)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ca-border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">Assign Sending WhatsApp Instance</h3>
              <button
                type="button"
                onClick={() => setIsChangeSenderOpen(false)}
                className="rounded-lg p-1 text-[var(--ca-text-muted)] hover:bg-[var(--ca-bg-hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--ca-text-secondary)]">
              Select an active WhatsApp number to send remaining recipients in campaign:{" "}
              <strong>{targetCampaignForSender.name}</strong>. Previously sent messages preserve their original sender metadata.
            </p>

            <div>
              <label className="block text-xs font-bold text-[var(--ca-text-primary)] mb-1">New WhatsApp Instance</label>
              <select
                value={replacementBotId}
                onChange={(e) => setReplacementBotId(e.target.value)}
                className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-hover)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none"
              >
                <option value="">-- Choose Replacement Number --</option>
                {bots.map((b: any) => (
                  <option key={b.$id || b.id} value={b.$id || b.id}>
                    {b.name || b.phone || "WhatsApp Instance"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsChangeSenderOpen(false)}
                className="rounded-xl border border-[var(--ca-border-subtle)] px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangeSender}
                disabled={!replacementBotId}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Confirm Reassignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
