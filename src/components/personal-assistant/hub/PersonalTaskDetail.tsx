import React, { useState } from "react";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  XCircle,
  ShieldCheck,
  Send,
  HelpCircle,
  User,
  Radio,
  FileText,
} from "lucide-react";
import type { PersonalTask, PersonalTaskEvent } from "../../../services/personal-task-types.ts";
import { executeTaskAction } from "./hub-api.ts";
import { formatRelativeTime } from "./hub-utils.ts";
import { PersonalTaskTimeline } from "./PersonalTaskTimeline.tsx";
import { PersonalTaskCancelModal } from "./PersonalTaskCancelModal.tsx";

interface PersonalTaskDetailProps {
  task: PersonalTask;
  onBack: () => void;
  onTaskUpdated: (task: PersonalTask) => void;
}

export const PersonalTaskDetail: React.FC<PersonalTaskDetailProps> = ({
  task,
  onBack,
  onTaskUpdated,
}) => {
  const [answerInput, setAnswerInput] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleAnswerQuestion = async () => {
    if (!answerInput.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await executeTaskAction(task.taskId, "answer", { answer: answerInput.trim() });
      setAnswerInput("");
      onTaskUpdated(res.task);
    } catch (err: any) {
      setActionError(err.message || "Failed to submit answer.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    const fingerprint = task.approvalFingerprint || task.actionPlan?.approvalFingerprint;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await executeTaskAction(task.taskId, "approve", { fingerprint });
      onTaskUpdated(res.task);
    } catch (err: any) {
      setActionError(err.message || "Approval failed. The action parameters may have changed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason?: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await executeTaskAction(task.taskId, "reject", { reason: reason || "Owner rejected proposal in dashboard." });
      onTaskUpdated(res.task);
    } catch (err: any) {
      setActionError(err.message || "Rejection failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await executeTaskAction(task.taskId, "pause");
      onTaskUpdated(res.task);
    } catch (err: any) {
      setActionError(err.message || "Failed to pause task.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await executeTaskAction(task.taskId, "resume");
      onTaskUpdated(res.task);
    } catch (err: any) {
      setActionError(err.message || "Failed to resume task.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await executeTaskAction(task.taskId, "cancel");
      setShowCancelModal(false);
      onTaskUpdated(res.task);
    } catch (err: any) {
      setActionError(err.message || "Failed to cancel task.");
    } finally {
      setActionLoading(false);
    }
  };

  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(task.status);
  const pendingApproval = task.status === "WAITING_FOR_APPROVAL";
  const pendingQuestion = task.status === "WAITING_FOR_OWNER";

  return (
    <div className="space-y-6" data-testid="task-detail-container">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tasks</span>
        </button>

        <div className="flex items-center gap-2">
          {!isTerminal && task.status !== "PAUSED" && (
            <button
              onClick={handlePause}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--ca-border-subtle)] hover:bg-[var(--ca-bg-card)] transition"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {!isTerminal && task.status === "PAUSED" && (
            <button
              onClick={handleResume}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )}

          {!isTerminal && (
            <button
              onClick={() => setShowCancelModal(true)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Task</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Task Summary Card */}
      <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/10 text-[var(--ca-text-secondary)]">
                {task.taskId}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                task.status === "COMPLETED"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : task.status === "WAITING_FOR_APPROVAL"
                  ? "bg-amber-500/20 text-amber-400 animate-pulse"
                  : task.status === "WAITING_FOR_OWNER"
                  ? "bg-sky-500/20 text-sky-400"
                  : task.status === "PAUSED"
                  ? "bg-slate-500/20 text-slate-400"
                  : task.status === "CANCELLED"
                  ? "bg-rose-500/20 text-rose-400"
                  : "bg-teal-500/20 text-teal-400"
              }`}>
                {task.status.replace(/_/g, " ")}
              </span>
            </div>
            <h2 className="text-base font-bold text-[var(--ca-text-primary)] mt-1.5">{task.goal}</h2>
          </div>

          <div className="text-right text-xs text-[var(--ca-text-secondary)] shrink-0">
            <div>Created {formatRelativeTime(task.createdAt)}</div>
            <div className="text-[11px] text-[var(--ca-text-muted)]">Active {formatRelativeTime(task.updatedAt)}</div>
          </div>
        </div>

        {/* Target & Instance Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-black/20 border border-[var(--ca-border-subtle)]">
            <span className="text-[11px] text-[var(--ca-text-muted)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Target Contact
            </span>
            <div className="font-semibold text-[var(--ca-text-primary)] mt-1">
              {task.target?.displayName || task.target?.phone || "Personal Contact"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/20 border border-[var(--ca-border-subtle)]">
            <span className="text-[11px] text-[var(--ca-text-muted)] flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" /> Personal Number
            </span>
            <div className="font-semibold text-[var(--ca-text-primary)] mt-1 font-mono">
              {task.personalInstanceId || "default"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/20 border border-[var(--ca-border-subtle)]">
            <span className="text-[11px] text-[var(--ca-text-muted)] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Control Business
            </span>
            <div className="font-semibold text-[var(--ca-text-primary)] mt-1 font-mono">
              {task.controllingBusinessInstanceId || "Primary Business"}
            </div>
          </div>
        </div>

        {/* OWNER QUESTION INTERFACE (Section 11) */}
        {pendingQuestion && (
          <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-3" data-testid="owner-question-box">
            <div className="flex items-center gap-2 text-sky-400 text-xs font-bold">
              <HelpCircle className="w-4 h-4" />
              <span>Personal Assistant needs your answer:</span>
            </div>
            <p className="text-sm font-semibold text-[var(--ca-text-primary)] bg-black/20 p-3 rounded-lg border border-sky-500/20">
              "{task.pendingQuestion || "What would you like me to do next?"}"
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnswerQuestion()}
                placeholder="Type your answer here..."
                className="flex-1 px-3 py-2 rounded-xl text-xs bg-[var(--ca-bg-main)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleAnswerQuestion}
                disabled={actionLoading || !answerInput.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Answer</span>
              </button>
            </div>
          </div>
        )}

        {/* APPROVAL INTERFACE (Sections 12 & 13) */}
        {pendingApproval && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3" data-testid="approval-box">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Action Approval Requested</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--ca-text-muted)]">
                Fingerprint: {(task.approvalFingerprint || "std_fp").slice(0, 12)}...
              </span>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-amber-500/20 space-y-2 text-xs">
              <span className="font-semibold text-amber-200">Proposed External Action:</span>
              <p className="text-[var(--ca-text-primary)]">
                {task.actionPlan?.proposedAction?.description || "Order / commitment requires your explicit confirmation."}
              </p>
              {task.actionPlan?.proposedAction?.details && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-white/10 text-[11px]">
                  {Object.entries(task.actionPlan.proposedAction.details).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-[var(--ca-text-muted)] capitalize">{k}:</span>{" "}
                      <span className="font-semibold text-[var(--ca-text-primary)]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => handleReject()}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition"
              >
                Reject Action
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
              >
                Approve & Execute
              </button>
            </div>
          </div>
        )}

        {/* Structured Result if Completed */}
        {task.status === "COMPLETED" && task.resultSummary && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Result Summary:</span>
            </div>
            <p className="text-xs text-[var(--ca-text-primary)]">{task.resultSummary}</p>
          </div>
        )}
      </div>

      {/* Human-Readable Event Timeline */}
      <PersonalTaskTimeline events={task.events} />

      {/* Cancel Confirmation Modal */}
      <PersonalTaskCancelModal
        isOpen={showCancelModal}
        isLoading={actionLoading}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
};
