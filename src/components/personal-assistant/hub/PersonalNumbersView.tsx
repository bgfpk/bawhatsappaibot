import React, { useState } from "react";
import {
  Radio,
  ShieldCheck,
  Phone,
  Settings,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Bot,
  Activity,
  Info,
} from "lucide-react";
import type { PersonalInstanceSummary } from "./hub-types.ts";
import { IncomingAssistantSettingsView } from "../settings/IncomingAssistantSettingsView.tsx";

interface PersonalNumbersViewProps {
  numbers: PersonalInstanceSummary[];
  onSelectInstance?: (instanceId: string) => void;
}

export const PersonalNumbersView: React.FC<PersonalNumbersViewProps> = ({
  numbers,
  onSelectInstance,
}) => {
  const [configuringInstanceId, setConfiguringInstanceId] = useState<string | null>(null);

  return (
    <div className="space-y-6" data-testid="personal-numbers-container">
      {/* Control Channel Reminder (Section 59) */}
      <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-sky-300">How Personal Assistant Control Works:</span>
          <p className="text-[var(--ca-text-secondary)] leading-relaxed">
            Owner commands (such as "What are my tasks?", "Pause assistant", or "Update my address") are sent to your <strong className="text-[var(--ca-text-primary)]">controlling Business WhatsApp number</strong>.
            Your <strong className="text-[var(--ca-text-primary)]">Personal number</strong> is used exclusively for assistant conversations with your external contacts.
          </p>
        </div>
      </div>

      {/* Instances List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ca-text-secondary)]">
            Personal WhatsApp Numbers ({numbers.length})
          </h3>
          <a
            href="/instances"
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline"
          >
            <span>Pair New Number in Instance Hub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {numbers.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-3">
            <Radio className="w-8 h-8 text-[var(--ca-text-muted)] mx-auto" />
            <h4 className="text-sm font-semibold text-[var(--ca-text-primary)]">No Personal Numbers Configured</h4>
            <p className="text-xs text-[var(--ca-text-secondary)] max-w-md mx-auto">
              You haven't designated a Personal WhatsApp instance yet. You can create or convert an instance in the Instance Hub.
            </p>
            <a
              href="/instances"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <span>Go to Instance Hub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {numbers.map((num) => {
              const isConnected = num.status === "connected";

              return (
                <div
                  key={num.instanceId}
                  data-testid={`personal-number-card-${num.instanceId}`}
                  className="p-5 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${
                        isConnected
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}>
                        <Radio className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[var(--ca-text-primary)]">{num.name}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            isConnected
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {num.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--ca-text-secondary)] font-mono mt-0.5">
                          {num.phone ? (num.phone.startsWith("+") ? num.phone : `+${num.phone}`) : "No WhatsApp number paired"} • ID: {num.instanceId}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setConfiguringInstanceId(num.instanceId)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-[var(--ca-border-subtle)] hover:bg-white/5 transition self-start sm:self-center"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configure Assistant</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[var(--ca-border-subtle)] text-xs">
                    <div>
                      <span className="text-[11px] text-[var(--ca-text-muted)]">Controlling Business Channel:</span>
                      <div className="font-semibold text-[var(--ca-text-primary)] mt-0.5 font-mono">
                        {num.controllingBusinessInstanceName || num.controllingBusinessInstanceId || "Primary Business"}
                        {num.controllingBusinessPhone && (
                          <span className="text-[11px] text-[var(--ca-text-secondary)] ml-1.5 font-normal">
                            ({num.controllingBusinessPhone})
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--ca-text-muted)]">Incoming AI Assistant:</span>
                      <div className="font-semibold text-[var(--ca-text-primary)] mt-0.5 flex items-center gap-1.5">
                        <Bot className={`w-3.5 h-3.5 ${
                          !num.incomingAssistantEnabled
                            ? "text-[var(--ca-text-muted)]"
                            : isConnected
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }`} />
                        <span>
                          {!num.incomingAssistantEnabled
                            ? "Disabled"
                            : isConnected
                            ? "Enabled (Auto-replying)"
                            : "Enabled • Waiting for WhatsApp connection"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--ca-text-muted)]">Active Missions & Tasks:</span>
                      <div className="font-semibold text-[var(--ca-text-primary)] mt-0.5 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-teal-400" />
                        <span>{num.activeTasksCount} Active</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal for configuring instance assistant settings */}
      {configuringInstanceId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--ca-border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">Incoming Assistant Settings</h3>
              <button
                onClick={() => setConfiguringInstanceId(null)}
                className="text-xs text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]"
              >
                Close
              </button>
            </div>
            <IncomingAssistantSettingsView personalInstanceId={configuringInstanceId} />
          </div>
        </div>
      )}
    </div>
  );
};
