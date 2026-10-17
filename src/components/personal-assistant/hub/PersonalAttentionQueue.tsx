import React from "react";
import {
  AlertTriangle,
  HelpCircle,
  ShieldAlert,
  Radio,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import type { AttentionItem } from "./hub-types.ts";
import { sortAttentionQueue, formatRelativeTime } from "./hub-utils.ts";

interface PersonalAttentionQueueProps {
  items: AttentionItem[];
  onOpenTask: (taskId: string) => void;
  onOpenGoogleSettings: () => void;
  onOpenConversation?: (jid: string) => void;
}

export const PersonalAttentionQueue: React.FC<PersonalAttentionQueueProps> = ({
  items,
  onOpenTask,
  onOpenGoogleSettings,
  onOpenConversation,
}) => {
  const sorted = sortAttentionQueue(items);

  if (sorted.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--ca-text-primary)]">All clear</h3>
        <p className="text-xs text-[var(--ca-text-secondary)] mt-1">
          Your Personal Assistant has no pending approvals, owner questions, or connection alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="attention-queue">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-secondary)] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          Attention Required ({sorted.length})
        </h3>
        <span className="text-[11px] text-[var(--ca-text-muted)]">Deterministic Priority</span>
      </div>

      <div className="space-y-2">
        {sorted.map((item) => {
          const isApproval = item.type === "approval_required";
          const isQuestion = item.type === "owner_question_required";
          const isGoogle = item.type === "google_issue";
          const isTakeover = item.type === "manual_takeover";

          return (
            <div
              key={item.id}
              data-testid={`attention-item-${item.type}`}
              className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isApproval
                  ? "bg-amber-500/10 border-amber-500/30 text-[var(--ca-text-primary)]"
                  : isQuestion
                  ? "bg-sky-500/10 border-sky-500/30 text-[var(--ca-text-primary)]"
                  : isGoogle
                  ? "bg-rose-500/10 border-rose-500/30 text-[var(--ca-text-primary)]"
                  : "bg-[var(--ca-bg-card)] border-[var(--ca-border-subtle)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white/10 shrink-0 mt-0.5">
                  {isApproval && <ShieldAlert className="w-4 h-4 text-amber-400" />}
                  {isQuestion && <HelpCircle className="w-4 h-4 text-sky-400" />}
                  {isGoogle && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  {isTakeover && <Radio className="w-4 h-4 text-indigo-400" />}
                  {!isApproval && !isQuestion && !isGoogle && !isTakeover && (
                    <Clock className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{item.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-[var(--ca-text-secondary)] font-mono">
                      P{item.priority}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">{item.description}</p>
                  {item.contactName && (
                    <span className="text-[11px] text-[var(--ca-text-muted)] mt-1 block">
                      Target contact: <span className="font-semibold text-[var(--ca-text-primary)]">{item.contactName}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <span className="text-[10px] text-[var(--ca-text-muted)]">
                  {formatRelativeTime(item.timestamp)}
                </span>
                {item.taskId && (
                  <button
                    onClick={() => onOpenTask(item.taskId!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
                  >
                    <span>{isApproval ? "Review Action" : isQuestion ? "Answer Question" : "View Task"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {isGoogle && (
                  <button
                    onClick={onOpenGoogleSettings}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm"
                  >
                    <span>Reconnect</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                {isTakeover && item.contactJid && onOpenConversation && (
                  <button
                    onClick={() => onOpenConversation(item.contactJid!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
                  >
                    <span>View Chat</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
