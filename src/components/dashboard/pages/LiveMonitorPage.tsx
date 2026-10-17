import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Activity,
  Terminal,
  Radio,
  Bot,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  Zap,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { DashboardPageHeader } from "../DashboardPrimitives";

export interface LiveMonitorPageProps {
  selectedBotId?: string | null;
  selectedBot?: any;
  bots?: any[];
  onSelectBot?: (botId: string) => void;
  connectionStatus?: string;
  connectionRetry?: {
    retryCount: number;
    reason: string;
    detail: string;
    nextRetrySeconds: number;
  };
  isAutoReplyEnabled?: boolean;
  walletBalance?: number;
  billingAccess?: any;
  logs?: Array<{ type: string; msg: string; timestamp: number }>;
  onClearLogs?: () => void;
  formatDate?: (ts: any, includeTime?: boolean) => string;
}

interface LiveConsoleEventItem {
  id: string;
  type: string;
  level: "info" | "warn" | "error" | "success";
  category?: string;
  title?: string;
  message?: string;
  reason?: string;
  customerJid?: string;
  botId?: string;
  accountId?: string;
  timestamp: number;
}

function maskContact(jidOrPhone?: string): string {
  const clean = String(jidOrPhone || "").trim();
  if (!clean) return "—";
  const rawNumber = clean.split("@")[0].replace(/\D/g, "");
  if (!rawNumber) return clean;
  if (rawNumber.length <= 4) return "***";
  if (rawNumber.length <= 8) return `${rawNumber.slice(0, 2)}***${rawNumber.slice(-2)}`;
  return `+${rawNumber.slice(0, 3)} *** ${rawNumber.slice(-3)}`;
}

export const LiveMonitorPage: React.FC<LiveMonitorPageProps> = ({
  selectedBotId,
  selectedBot,
  bots = [],
  onSelectBot,
  connectionStatus = "disconnected",
  connectionRetry,
  isAutoReplyEnabled = true,
  walletBalance = 0,
  billingAccess,
  logs = [],
  onClearLogs,
  formatDate = (ts: any, _includeTime?: boolean) => new Date(Number(ts) * 1000 || Date.now()).toLocaleTimeString(),
}) => {
  const [activeTab, setActiveTab] = useState<"all" | "ai" | "traffic" | "issues">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveEvents, setLiveEvents] = useState<LiveConsoleEventItem[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [bufferLimit, setBufferLimit] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("blackarrow_live_monitor_buffer_limit"));
      return saved >= 10 && saved <= 1000 ? saved : 100;
    } catch {
      return 100;
    }
  });

  const logContainerRef = useRef<HTMLDivElement>(null);
  const modalLogContainerRef = useRef<HTMLDivElement>(null);

  const updateBufferLimit = (val: number) => {
    const clamped = Math.max(10, Math.min(1000, isNaN(val) ? 100 : val));
    setBufferLimit(clamped);
    try {
      localStorage.setItem("blackarrow_live_monitor_buffer_limit", String(clamped));
    } catch {
      // Non-fatal
    }
  };

  const displayedLogs = useMemo(() => {
    return logs.slice(0, bufferLimit);
  }, [logs, bufferLimit]);

  const handleCopyAll = async () => {
    try {
      const text = displayedLogs
        .map(
          (log) =>
            `${new Date(log.timestamp || Date.now()).toLocaleTimeString()} [${(log.type || "info").toUpperCase()}] ${log.msg}`,
        )
        .join("\n");
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (e) {
      console.error("Failed to copy logs to clipboard", e);
    }
  };

  const handleCopySingle = async (log: { type: string; msg: string; timestamp?: number }, index: number) => {
    try {
      const text = `${new Date(log.timestamp || Date.now()).toLocaleTimeString()} [${(log.type || "info").toUpperCase()}] ${log.msg}`;
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (e) {
      console.error("Failed to copy log entry", e);
    }
  };

  const renderLogEntries = (containerRef: React.RefObject<HTMLDivElement | null>, heightClass: string) => {
    return (
      <div
        ref={containerRef}
        className={`flex-1 ${heightClass} bg-neutral-950 rounded-xl p-3 font-mono text-[11px] text-neutral-300 overflow-y-auto space-y-1 shadow-inner border border-neutral-800 select-text`}
      >
        {displayedLogs.length === 0 ? (
          <div className="text-neutral-500 italic py-16 text-center select-none">
            Waiting for engine messages...
          </div>
        ) : (
          displayedLogs.map((log, index) => {
            const isErr = log.type === "error";
            const isWarn = log.type === "warning";
            const isAi = log.type === "ai";
            const isWa = log.type === "wa";

            const textTone = isErr
              ? "text-rose-400"
              : isWarn
              ? "text-amber-400"
              : isAi
              ? "text-purple-300"
              : isWa
              ? "text-emerald-400"
              : "text-neutral-300";

            return (
              <div
                key={index}
                className="group flex items-start justify-between gap-2 leading-tight break-all hover:bg-neutral-900/60 p-0.5 rounded transition-colors"
              >
                <div className="flex items-start gap-1 flex-1">
                  <span className="text-neutral-500 select-none mr-2 shrink-0">
                    {new Date(log.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                  <span className={`${textTone} whitespace-pre-wrap`}>{log.msg}</span>
                </div>
                <button
                  type="button"
                  title="Copy log entry"
                  onClick={() => handleCopySingle(log, index)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-opacity shrink-0"
                >
                  {copiedIndex === index ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const fetchLiveEvents = async () => {
    if (!selectedBotId) return;
    setIsLoadingEvents(true);
    try {
      const res = await fetch(`/api/live-events?botId=${encodeURIComponent(selectedBotId)}&limit=100`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.events)) {
          setLiveEvents(data.events);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchLiveEvents();
    const interval = window.setInterval(fetchLiveEvents, 5000);
    return () => window.clearInterval(interval);
  }, [selectedBotId]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, liveEvents, autoScroll]);

  const filteredEvents = useMemo(() => {
    return liveEvents.filter((ev) => {
      if (activeTab === "ai") {
        const isAi = ev.category === "AI" || ev.type.startsWith("ai_") || ev.reason?.includes("ai");
        if (!isAi) return false;
      } else if (activeTab === "traffic") {
        const isTraffic = ev.type.includes("message") || ev.type.includes("inbound") || ev.type.includes("outbound") || ev.type.includes("send");
        if (!isTraffic) return false;
      } else if (activeTab === "issues") {
        const isIssue = ev.level === "error" || ev.level === "warn" || ev.type.includes("blocked") || ev.type.includes("skipped") || ev.type.includes("failed");
        if (!isIssue) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = ev.title?.toLowerCase().includes(q);
        const matchesMsg = ev.message?.toLowerCase().includes(q);
        const matchesReason = ev.reason?.toLowerCase().includes(q);
        const matchesContact = ev.customerJid?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg && !matchesReason && !matchesContact) return false;
      }

      return true;
    });
  }, [liveEvents, activeTab, searchQuery]);

  const statusColor = connectionStatus === "connected"
    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
    : connectionStatus === "connecting" || connectionStatus === "retrying"
    ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
    : "text-rose-500 bg-rose-500/10 border-rose-500/20";

  const entitlementStatus = billingAccess?.paidActive
    ? { label: "Active Paid Plan", color: "text-emerald-500 bg-emerald-500/10" }
    : billingAccess?.trialActive
    ? { label: `Free Trial (${billingAccess.trialAiRepliesRemaining ?? 0} AI replies left)`, color: "text-blue-500 bg-blue-500/10" }
    : billingAccess?.trialRepliesUsed
    ? { label: "Trial Reply Limit Reached", color: "text-amber-500 bg-amber-500/10" }
    : billingAccess?.trialExpired
    ? { label: "Free Trial Expired", color: "text-rose-500 bg-rose-500/10" }
    : { label: "Subscription Required", color: "text-rose-500 bg-rose-500/10" };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <DashboardPageHeader
        eyebrow="Realtime Console"
        title="Live Monitor"
        description="Safe, real-time operational visibility for your selected WhatsApp instance: connection state, AI reply decision telemetry, and live traffic."
        icon={Activity}
      />

      {/* Instance Selector & Live Status Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Instance Card */}
        <div className="p-4 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] block mb-1">
              Active WhatsApp Instance
            </span>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--ca-brand)] shrink-0" />
              {bots.length > 1 && onSelectBot ? (
                <select
                  value={selectedBotId || ""}
                  onChange={(e) => onSelectBot(e.target.value)}
                  className="bg-transparent font-bold text-sm text-[var(--ca-text-primary)] outline-none cursor-pointer w-full"
                >
                  {bots.map((b) => (
                    <option key={b.id || b.$id} value={b.id || b.$id}>
                      {b.name || b.jid || "Unnamed Bot"}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-bold text-sm text-[var(--ca-text-primary)] truncate">
                  {selectedBot?.name || selectedBot?.jid || (selectedBotId ? `Instance ${selectedBotId.slice(0, 8)}` : "No Instance Selected")}
                </span>
              )}
            </div>
            {selectedBot?.jid && (
              <span className="text-xs text-[var(--ca-text-secondary)] font-mono mt-1 block">
                {maskContact(selectedBot.jid)}
              </span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--ca-border-subtle)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--ca-text-secondary)]">Engine Status</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusColor} capitalize`}>
              {connectionStatus}
            </span>
          </div>
        </div>

        {/* AI Reply State Card */}
        <div className="p-4 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] block mb-1">
              AI Chat Replies
            </span>
            <div className="flex items-center gap-2">
              <Bot className={`w-4 h-4 ${isAutoReplyEnabled ? "text-emerald-500" : "text-amber-500"}`} />
              <span className="font-bold text-sm text-[var(--ca-text-primary)]">
                {isAutoReplyEnabled ? "Active & Responding" : "Paused / Manual Only"}
              </span>
            </div>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
              {isAutoReplyEnabled ? "Incoming customer messages trigger AI" : "Bot will not reply automatically"}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--ca-border-subtle)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--ca-text-secondary)]">Provider</span>
            <span className="text-[11px] font-bold text-[var(--ca-text-primary)]">
              WhatsApp Web
            </span>
          </div>
        </div>

        {/* Entitlement & Plan Card */}
        <div className="p-4 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] block mb-1">
              Account Entitlement
            </span>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="font-bold text-sm text-[var(--ca-text-primary)] truncate">
                {billingAccess?.paidActive ? "Paid Subscription" : "7-Day Free Trial"}
              </span>
            </div>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${entitlementStatus.color}`}>
              {entitlementStatus.label}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--ca-border-subtle)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--ca-text-secondary)]">AI Reply Gate</span>
            <span className="text-[11px] font-bold text-emerald-500">
              {billingAccess?.paidActive || billingAccess?.trialActive ? "Unlocked" : "Locked"}
            </span>
          </div>
        </div>

        {/* Wallet Balance Card */}
        <div className="p-4 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ca-text-muted)] block mb-1">
              Wallet Balance
            </span>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="font-bold text-lg text-[var(--ca-text-primary)] font-mono">
                ${Number(walletBalance || 0).toFixed(3)} <span className="text-xs font-normal text-[var(--ca-text-muted)]">USD</span>
              </span>
            </div>
            <p className="text-[11px] text-[var(--ca-text-secondary)] mt-1">
              {billingAccess?.trialActive ? "Free trial AI replies included" : "Meters AI replies on paid plan"}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--ca-border-subtle)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--ca-text-secondary)]">Min per reply</span>
            <span className="text-[11px] font-bold text-[var(--ca-text-primary)] font-mono">$0.003 USD</span>
          </div>
        </div>
      </div>

      {/* Retry Alert Banner if retrying */}
      {connectionRetry && connectionRetry.retryCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">WhatsApp Engine Connection Retry #{connectionRetry.retryCount}</strong>
            <p className="mt-0.5">{connectionRetry.reason || "Engine is reconnecting..."}</p>
            {connectionRetry.detail && <p className="mt-0.5 text-xs opacity-80">{connectionRetry.detail}</p>}
          </div>
        </div>
      )}

      {/* Main Console and Live Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Telemetry & Decisions Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
              <div>
                <h3 className="font-bold text-sm text-[var(--ca-text-primary)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--ca-brand)]" />
                  Live Operational Events & AI Telemetry
                </h3>
                <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                  Recent inbound messages, AI reply gates, and dispatch decisions.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[var(--ca-bg-surface-hover)] p-1 rounded-xl border border-[var(--ca-border-subtle)] text-xs">
                  {(["all", "ai", "traffic", "issues"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all capitalize ${
                        activeTab === tab
                          ? "bg-[var(--ca-bg-surface)] text-[var(--ca-text-primary)] shadow-sm"
                          : "text-[var(--ca-text-muted)] hover:text-[var(--ca-text-secondary)]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={fetchLiveEvents}
                  disabled={isLoadingEvents}
                  className="ca-button-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                  title="Refresh events"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event type, customer, reason, or message..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--ca-bg-surface-hover)] border border-[var(--ca-border-subtle)] rounded-xl text-xs text-[var(--ca-text-primary)] focus:outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-16 text-[var(--ca-text-muted)] text-xs italic">
                  {isLoadingEvents ? "Fetching live engine events..." : "No matching engine events recorded recently."}
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  const isErr = ev.level === "error";
                  const isWarn = ev.level === "warn";
                  const isSuccess = ev.level === "success";
                  const badgeBg = isErr
                    ? "bg-rose-500/10 text-rose-600 border-rose-200"
                    : isWarn
                    ? "bg-amber-500/10 text-amber-600 border-amber-200"
                    : isSuccess
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                    : "bg-blue-500/10 text-blue-600 border-blue-200";

                  return (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface-hover)] hover:border-[var(--ca-border-strong)] transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeBg}`}>
                            {ev.title || ev.type}
                          </span>
                          {ev.category && (
                            <span className="text-[10px] font-semibold text-[var(--ca-text-muted)] uppercase tracking-wider">
                              {ev.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--ca-text-muted)] font-mono">
                          {formatDate(ev.timestamp, true)}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--ca-text-primary)] font-medium leading-relaxed">
                        {ev.message || ev.type}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-[var(--ca-text-secondary)] font-mono">
                        {ev.customerJid && (
                          <span className="flex items-center gap-1">
                            <span className="text-[var(--ca-text-muted)]">Customer:</span>
                            <span className="font-bold text-[var(--ca-text-primary)]">
                              {maskContact(ev.customerJid)}
                            </span>
                          </span>
                        )}
                        {ev.reason && (
                          <span className="flex items-center gap-1">
                            <span className="text-[var(--ca-text-muted)]">Reason:</span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              {ev.reason}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-5 shadow-sm space-y-3 flex flex-col h-full">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--ca-text-primary)] flex items-center gap-2"><Terminal className="w-4 h-4 text-emerald-500" /> Live Engine Stream</h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--ca-text-secondary)] cursor-pointer">
                  <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-[var(--ca-brand)] rounded text-[10px]" /> <span>Auto-scroll</span>
                </label>
                <button type="button" onClick={handleCopyAll} className="inline-flex items-center gap-1 text-[11px] text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] font-bold ml-1" title="Copy all buffered logs">
                  {copiedAll ? <><Check className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-500 font-semibold">Copied</span></> : <><Copy className="w-3 h-3" /> <span>Copy All</span></>}
                </button>
                {onClearLogs && <button type="button" onClick={onClearLogs} className="text-[11px] text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] font-bold ml-1">Clear</button>}
                <button type="button" onClick={() => setIsExpanded(true)} title="Expand to fullscreen" className="p-1 rounded-lg border border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-surface-hover)] transition-colors ml-1">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {renderLogEntries(logContainerRef, "min-h-[420px] max-h-[480px]")}
            <div className="text-[10px] text-[var(--ca-text-muted)] flex items-center justify-between pt-1">
              <span>Tenant Scoped & Sanitized</span>
              <div className="flex items-center gap-2">
                <span>Entries Buffered:</span>
                <input type="number" min={10} max={1000} value={bufferLimit} onChange={(e) => updateBufferLimit(parseInt(e.target.value, 10))} className="w-14 px-1.5 py-0.5 bg-[var(--ca-bg-surface-hover)] border border-[var(--ca-border-subtle)] rounded text-[10px] text-center font-mono font-bold text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-emerald-500" />
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">Live Engine Stream {selectedBot?.name && <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 font-normal">{selectedBot.name}</span>}</h2>
                  <p className="text-xs text-neutral-400">Real-time execution telemetry and worker system stream.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
                  <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-emerald-500 rounded text-xs" /> <span>Auto-scroll</span>
                </label>
                <button type="button" onClick={handleCopyAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors">
                  {copiedAll ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> <span className="text-emerald-400">Copied</span></> : <><Copy className="w-3.5 h-3.5" /> <span>Copy All</span></>}
                </button>
                {onClearLogs && <button type="button" onClick={onClearLogs} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition-colors">Clear</button>}
                <button type="button" onClick={() => setIsExpanded(false)} title="Close expanded view" className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            {renderLogEntries(modalLogContainerRef, "h-[calc(85vh-160px)]")}
            <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-800">
              <span className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Tenant Scoped & Sanitized</span>
              <div className="flex items-center gap-3">
                <span>Entries Buffered:</span>
                <input type="number" min={10} max={1000} value={bufferLimit} onChange={(e) => updateBufferLimit(parseInt(e.target.value, 10))} className="w-16 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-center font-mono font-bold text-white focus:outline-none focus:border-emerald-500" />
                <span className="text-neutral-500">({displayedLogs.length} shown of {logs.length} in buffer)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
