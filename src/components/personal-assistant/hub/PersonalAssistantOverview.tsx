import React from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import type { HubOverviewResponse } from "./hub-api.ts";
import { PersonalAttentionQueue } from "./PersonalAttentionQueue.tsx";
import { formatRelativeTime } from "./hub-utils.ts";

interface PersonalAssistantOverviewProps {
  data: HubOverviewResponse | null;
  loading: boolean;
  onNavigateTab: (tab: any) => void;
  onOpenTask: (taskId: string) => void;
}

export const PersonalAssistantOverview: React.FC<PersonalAssistantOverviewProps> = ({
  data,
  loading,
  onNavigateTab,
  onOpenTask,
}) => {
  if (loading && !data) {
    return (
      <div className="p-8 text-center text-[var(--ca-text-secondary)]">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-xs">Loading Personal Assistant overview...</p>
      </div>
    );
  }

  const metrics = data?.metrics || {
    activeTasksCount: 0,
    waitingOwnerCount: 0,
    pendingApprovalsCount: 0,
    personalContactsCount: 0,
    connectedNumbersCount: 0,
    googleIssuesCount: 0,
    delegatedCommitmentTodayPkr: 0,
    delegatedCommitmentLimitPkr: 5000,
  };

  const hasNumbers = (data?.personalNumbers || []).length > 0;

  return (
    <div className="space-y-6">
      {/* Onboarding Banner if no Personal instances configured */}
      {!hasNumbers && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[var(--ca-text-primary)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Welcome to your Personal Assistant Hub
            </h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-1 max-w-2xl">
              Get started by pairing your Personal WhatsApp number, setting up your Owner Profile, and configuring delegation safety controls.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab("numbers")}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shrink-0 flex items-center gap-2"
          >
            <span>Setup Personal Number</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => onNavigateTab("tasks")}
          className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-emerald-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-[var(--ca-text-secondary)]">
            <span className="text-[11px] font-semibold">Active Tasks</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-[var(--ca-text-primary)] mt-2">
            {metrics.activeTasksCount}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">Running autonomously</span>
        </div>

        <div
          onClick={() => onNavigateTab("tasks")}
          className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-sky-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-[var(--ca-text-secondary)]">
            <span className="text-[11px] font-semibold">Waiting on You</span>
            <Clock className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-[var(--ca-text-primary)] mt-2">
            {metrics.waitingOwnerCount}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">Questions pending</span>
        </div>

        <div
          onClick={() => onNavigateTab("tasks")}
          className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-amber-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-[var(--ca-text-secondary)]">
            <span className="text-[11px] font-semibold">Approvals</span>
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-[var(--ca-text-primary)] mt-2">
            {metrics.pendingApprovalsCount}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">External orders / data</span>
        </div>

        <div
          onClick={() => onNavigateTab("numbers")}
          className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-teal-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-[var(--ca-text-secondary)]">
            <span className="text-[11px] font-semibold">Personal Numbers</span>
            <Radio className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="text-xl font-bold text-[var(--ca-text-primary)] mt-2">
            {metrics.connectedNumbersCount}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">WhatsApp instances</span>
        </div>

        <div
          onClick={() => onNavigateTab("contacts")}
          className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-indigo-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-[var(--ca-text-secondary)]">
            <span className="text-[11px] font-semibold">Contacts</span>
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-[var(--ca-text-primary)] mt-2">
            {metrics.personalContactsCount}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">With durable memory</span>
        </div>

        <div
          onClick={() => onNavigateTab("connected_apps")}
          className="p-3.5 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-rose-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-[var(--ca-text-secondary)]">
            <span className="text-[11px] font-semibold">Google Tools</span>
            <Calendar className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-[var(--ca-text-primary)] mt-2">
            {data?.googleStatus?.status === "CONNECTED" ? "Connected" : "Not Linked"}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">
            {data?.googleStatus?.hasIssues ? "Needs Reauth" : "Free Tools Only"}
          </span>
        </div>
      </div>

      {/* Delegated Commitment Ledger Status (Section 33: NOT BlackArrow wallet) */}
      <div className="p-4 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[var(--ca-text-primary)]">
              Personal Assistant Purchase Limit (Delegation Safety)
            </div>
            <p className="text-[11px] text-[var(--ca-text-secondary)]">
              This governs what your assistant is allowed to commit autonomously per day. It is completely independent from your BlackArrow billing wallet balance.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold font-mono text-emerald-400">
            PKR {metrics.delegatedCommitmentTodayPkr.toLocaleString()} / PKR {metrics.delegatedCommitmentLimitPkr.toLocaleString()}
          </div>
          <span className="text-[10px] text-[var(--ca-text-muted)]">Today's Delegated Spending</span>
        </div>
      </div>

      {/* Deterministic Attention Queue */}
      <PersonalAttentionQueue
        items={data?.attentionQueue || []}
        onOpenTask={onOpenTask}
        onOpenGoogleSettings={() => onNavigateTab("connected_apps")}
        onOpenConversation={(jid) => onNavigateTab("conversations")}
      />

      {/* Recent Activity Timeline */}
      <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-secondary)] flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          Recent Assistant Activity
        </h3>

        {(data?.recentActivity || []).length === 0 ? (
          <p className="text-xs text-[var(--ca-text-muted)] py-3">No activity logged yet today.</p>
        ) : (
          <div className="divide-y divide-[var(--ca-border-subtle)]">
            {(data?.recentActivity || []).slice(0, 8).map((evt) => (
              <div key={evt.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-[var(--ca-text-primary)]">{evt.title}</span>
                  <p className="text-[11px] text-[var(--ca-text-secondary)] mt-0.5">{evt.summary}</p>
                </div>
                <span className="text-[10px] text-[var(--ca-text-muted)] shrink-0 font-mono">
                  {formatRelativeTime(evt.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
