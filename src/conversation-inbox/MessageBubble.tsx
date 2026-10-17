import React from "react";
import { Check, CheckCheck, AlertCircle, Bot } from "lucide-react";
import type { MessageItem } from "./conversation-model";
import { MessageAttachment } from "./MessageAttachment";

export interface MessageBubbleProps {
  message: MessageItem;
  formatTimestamp?: (ts?: number | string) => string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  formatTimestamp = (ts) => (ts ? String(ts) : ""),
}) => {
  const isOutgoing = message.sender === "bot" || message.sender === "user";
  const isSystem = message.sender === "system";

  if (isSystem) {
    return (
      <div className="my-3 flex justify-center">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
          {message.text}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-1 ${
        isOutgoing ? "items-end" : "items-start"
      }`}
    >
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] font-black text-gray-500 dark:text-neutral-400">
          {message.senderName || (isOutgoing ? "AI Assistant" : "Customer")}
        </span>
        {message.sender === "bot" && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.2 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Bot className="h-2.5 w-2.5" />
            <span>Bot</span>
          </span>
        )}
        {message.timestamp && (
          <span className="text-[9px] font-medium text-gray-400 dark:text-neutral-500">
            {formatTimestamp(message.timestamp)}
          </span>
        )}
      </div>

      <div
        className={`relative max-w-[85%] rounded-2xl p-3.5 shadow-sm text-xs leading-relaxed font-medium ${
          isOutgoing
            ? "bg-emerald-600 text-white rounded-tr-none"
            : "bg-white text-gray-800 border border-gray-100 rounded-tl-none dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200"
        }`}
      >
        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

        {message.mediaType && (
          <MessageAttachment
            mediaType={message.mediaType}
            mediaUrl={message.mediaUrl}
            fileName={message.fileName}
            fileSize={message.fileSize}
          />
        )}

        {isOutgoing && message.status && (
          <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-white/80">
            {message.status === "sending" && <span>Sending...</span>}
            {message.status === "sent" && <Check className="h-3 w-3" />}
            {(message.status === "delivered" || message.status === "read") && (
              <CheckCheck className="h-3 w-3" />
            )}
            {message.status === "failed" && (
              <span className="flex items-center gap-1 text-rose-200">
                <AlertCircle className="h-3 w-3 text-rose-300" />
                <span>Failed</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
