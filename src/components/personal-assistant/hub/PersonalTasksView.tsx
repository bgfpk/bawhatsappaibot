import React, { useState, useEffect } from "react";
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  HelpCircle,
  Pause,
  ChevronLeft,
  ChevronRight,
  User,
  Radio,
  Calendar,
} from "lucide-react";
import type { PersonalTask } from "../../../services/personal-task-types.ts";
import type { TaskFilterOptions } from "./hub-types.ts";
import { fetchHubTasks } from "./hub-api.ts";
import { formatRelativeTime } from "./hub-utils.ts";

interface PersonalTasksViewProps {
  onSelectTask: (task: PersonalTask) => void;
  selectedInstanceId?: string;
}

export const PersonalTasksView: React.FC<PersonalTasksViewProps> = ({
  onSelectTask,
  selectedInstanceId,
}) => {
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<TaskFilterOptions["statusCategory"]>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHubTasks({
        statusCategory: category,
        personalInstanceId: selectedInstanceId,
        search: searchTerm.trim() || undefined,
        page,
        limit: 15,
      });
      setTasks(res.tasks);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [category, selectedInstanceId, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTasks();
  };

  const categories = [
    { id: "all", label: "All Tasks" },
    { id: "active", label: "Active" },
    { id: "waiting", label: "Waiting" },
    { id: "needs_approval", label: "Needs Approval" },
    { id: "paused", label: "Paused" },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
  ] as const;

  const totalPages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="space-y-4" data-testid="tasks-view-container">
      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-[var(--ca-border-subtle)] pb-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setCategory(cat.id);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              category === cat.id
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] hover:bg-[var(--ca-bg-card)]"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search & Meta Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tasks by goal or contact..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] text-[var(--ca-text-primary)] focus:outline-none focus:border-emerald-500"
          />
        </form>

        <span className="text-xs text-[var(--ca-text-secondary)] self-end sm:self-center">
          Showing <span className="font-semibold text-[var(--ca-text-primary)]">{tasks.length}</span> of {total} tasks
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tasks List */}
      {loading ? (
        <div className="p-12 text-center text-[var(--ca-text-secondary)]">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
          <span className="text-xs">Loading tasks...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)]">
          <p className="text-xs text-[var(--ca-text-secondary)]">No tasks found matching your filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => {
            const rawStatus = task.status || (task as any).currentState || "UNKNOWN";
            const isApproval = rawStatus === "WAITING_FOR_APPROVAL" || rawStatus === "NEEDS_APPROVAL";
            const isQuestion = rawStatus === "WAITING_FOR_OWNER";
            const isPaused = rawStatus === "PAUSED";
            const isCompleted = rawStatus === "COMPLETED";

            return (
              <div
                key={task.taskId}
                onClick={() => onSelectTask(task)}
                data-testid={`task-row-${task.taskId}`}
                className="p-4 rounded-xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] hover:border-emerald-500/40 cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-[var(--ca-text-primary)] truncate">
                      {task.goal}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      isCompleted
                        ? "bg-emerald-500/10 text-emerald-400"
                        : isApproval
                        ? "bg-amber-500/10 text-amber-400 animate-pulse"
                        : isQuestion
                        ? "bg-sky-500/10 text-sky-400"
                        : isPaused
                        ? "bg-slate-500/10 text-slate-400"
                        : "bg-teal-500/10 text-teal-400"
                    }`}>
                      {rawStatus.replace(/_/g, " ")}
                    </span>
                    {task.target?.displayName && (
                      <span className="text-[11px] text-[var(--ca-text-muted)] flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {task.target.displayName}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-[var(--ca-text-muted)] flex-wrap">
                    <span className="flex items-center gap-1">
                      <Radio className="w-3 h-3" />
                      Instance: {task.personalInstanceId || "default"}
                    </span>
                    {isApproval && (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Action Approval Required
                      </span>
                    )}
                    {isQuestion && (
                      <span className="text-sky-400 font-semibold flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" />
                        Owner Question Pending
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right text-[11px] text-[var(--ca-text-muted)] shrink-0 font-mono">
                  {formatRelativeTime(task.updatedAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-[var(--ca-border-subtle)]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--ca-border-subtle)] disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <span className="text-xs text-[var(--ca-text-secondary)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--ca-border-subtle)] disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
