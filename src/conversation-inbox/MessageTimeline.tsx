import React, { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { MessageItem } from "./conversation-model";
import { DashboardEmptyState } from "../components/dashboard/DashboardPrimitives";
import { MessageSquare } from "lucide-react";

export interface MessageTimelineProps {
  messages: MessageItem[];
  isLoading?: boolean;
  formatTimestamp?: (ts?: number | string) => string;
}

export const MessageTimeline: React.FC<MessageTimelineProps> = ({
  messages,
  isLoading = false,
  formatTimestamp,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-16 w-3/4 animate-pulse rounded-2xl bg-[var(--ca-surface-2)] ${
              i % 2 === 0 ? "ml-auto" : ""
            }`}
          />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <DashboardEmptyState
          icon={MessageSquare}
          title="No Messages Yet"
          body="Start the conversation or wait for the customer to send a message."
          tone="neutral"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          formatTimestamp={formatTimestamp}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
