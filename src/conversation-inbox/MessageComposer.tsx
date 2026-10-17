import React, { useState } from "react";
import { Send, Bot, PauseCircle, PlayCircle, AlertCircle } from "lucide-react";

export interface MessageComposerProps {
  onSendMessage: (text: string) => Promise<void> | void;
  isAiPaused?: boolean;
  botReplyControl?: "active" | "paused_temp" | "paused_permanent";
  onSetAiControl?: (action: "resume" | "pause_temp" | "pause_permanent") => Promise<void> | void;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  isAiPaused = false,
  botReplyControl = "active",
  onSetAiControl,
  disabled = false,
}) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSendMessage(trimmed);
      setText("");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3 space-y-2">
      {/* Quick AI Control Bar */}
      {onSetAiControl && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--ca-surface-2)] px-3 py-1.5 text-[11px] font-bold">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[var(--ca-text-secondary)]">
              AI Status: <strong className="text-[var(--ca-text-primary)]">{isAiPaused ? `Paused (${botReplyControl})` : "Active"}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isAiPaused ? (
              <button
                type="button"
                onClick={() => onSetAiControl("resume")}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white hover:bg-emerald-700 transition-colors"
                title="Resume AI replies (.1)"
              >
                <PlayCircle className="h-3 w-3" />
                <span>Resume AI (.1)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSetAiControl("pause_temp")}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] px-2 py-0.5 text-[10px] font-black text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-3)]"
                  title="Temporarily pause AI (.0)"
                >
                  <PauseCircle className="h-3 w-3" />
                  <span>Pause (.0)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetAiControl("pause_permanent")}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2 py-0.5 text-[10px] font-black text-white hover:bg-amber-700"
                  title="Stop AI until manual resume (.00)"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>Stop (.00)</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Press Enter to send, Shift+Enter for line break)"
          rows={2}
          disabled={disabled || isSending}
          className="w-full resize-none rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || isSending || disabled}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
