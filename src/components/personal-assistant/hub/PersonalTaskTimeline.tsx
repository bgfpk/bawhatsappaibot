import React from "react";
import { Clock } from "lucide-react";
import type { PersonalTaskEvent } from "../../../services/personal-task-types.ts";
import { formatRelativeTime } from "./hub-utils.ts";

interface PersonalTaskTimelineProps {
  events?: PersonalTaskEvent[];
}

export const PersonalTaskTimeline: React.FC<PersonalTaskTimelineProps> = ({ events }) => {
  const renderTimelineEventLabel = (evt: PersonalTaskEvent) => {
    const eventType = evt.type || (evt as any).eventType;
    switch (eventType) {
      case "TASK_CREATED":
        return "Task initiated by owner";
      case "TASK_STARTED":
        return "Task execution started";
      case "MESSAGE_SENT":
        return "Message sent to target contact";
      case "CONTACT_REPLIED":
        return "Target contact replied";
      case "OWNER_QUESTION_CREATED":
        return "Question asked to owner";
      case "OWNER_ANSWER_RECEIVED":
        return "You answered question";
      case "APPROVAL_REQUESTED":
        return "Action approval requested";
      case "APPROVAL_GRANTED":
        return "You approved external action";
      case "APPROVAL_REJECTED":
        return "You rejected proposed action";
      case "FOLLOWUP_SCHEDULED":
        return "Follow-up scheduled";
      case "FOLLOWUP_SENT":
        return "Follow-up sent";
      case "TASK_PAUSED":
        return "Task paused";
      case "TASK_RESUMED":
        return "Task resumed";
      case "TASK_CANCELLED":
        return "Task cancelled";
      case "TASK_COMPLETED":
        return "Task successfully completed";
      case "TASK_FAILED":
        return "Task failed execution";
      default:
        return String(eventType || "Event").replace(/_/g, " ");
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-secondary)] flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-emerald-400" />
        Task Event Timeline
      </h3>

      {!events || events.length === 0 ? (
        <p className="text-xs text-[var(--ca-text-muted)]">No timeline events recorded.</p>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--ca-border-subtle)]">
          {events.map((evt, idx) => {
            const summary =
              (evt as any).summary ||
              (evt.metadata?.summary as string) ||
              (evt.metadata?.description as string) ||
              (evt.metadata?.prompt as string);

            return (
              <div key={evt.eventId || idx} className="relative flex items-start justify-between gap-3 text-xs">
                <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-[var(--ca-bg-card)]" />
                <div>
                  <span className="font-semibold text-[var(--ca-text-primary)]">
                    {renderTimelineEventLabel(evt)}
                  </span>
                  {summary && (
                    <p className="text-[11px] text-[var(--ca-text-secondary)] mt-0.5">{summary}</p>
                  )}
                </div>
                <span className="text-[10px] text-[var(--ca-text-muted)] shrink-0 font-mono">
                  {formatRelativeTime(evt.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
