import React from "react";
import { CheckCircle2, MessageSquare, Smartphone } from "lucide-react";
import { buildAiStudioV2Status, type AiStudioStatusInput } from "../../../services/ai-studio-v2-service";

type Props = {
  children: React.ReactNode;
  statusInput?: AiStudioStatusInput & {
    whatsappConnected?: boolean;
    aiRepliesEnabled?: boolean;
  };
  title?: string;
  description?: string;
};

export function AiStudioV2Page({
  children,
  statusInput = {},
  title = "Bot Setup",
  description = "Control how your bot replies, what it knows, and what customer information it collects.",
}: Props) {
  const status = buildAiStudioV2Status(statusInput);
  const setupReady = status.readyCount >= 3;
  const whatsappStatus = statusInput.whatsappConnected === true ? "Connected" : statusInput.whatsappConnected === false ? "Needs attention" : "Unknown / Loading";
  const aiStatus = statusInput.aiRepliesEnabled === true ? "On" : statusInput.aiRepliesEnabled === false ? "Off" : "Unknown / Loading";
  const setupStatus = statusInput.whatsappConnected === undefined || statusInput.aiRepliesEnabled === undefined ? "Unknown" : setupReady ? "Ready" : "Needs attention";

  const summaries = [
    { label: "WhatsApp", value: whatsappStatus, icon: Smartphone },
    { label: "AI replies", value: aiStatus, icon: MessageSquare },
    { label: "Setup", value: setupStatus, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-neutral-300">{description}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {summaries.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-neutral-950/60">
              <Icon className={`h-4 w-4 ${value === "Needs attention" ? "text-amber-500" : "text-emerald-600 dark:text-emerald-300"}`} />
              <div><p className="text-xs text-gray-500 dark:text-neutral-400">{label}</p><p className="text-sm font-bold text-gray-900 dark:text-neutral-100">{value}</p></div>
            </div>
          ))}
        </div>
      </header>
      {children}
    </div>
  );
}
