import React from "react";
import { Bot, CheckCircle2, QrCode, Smartphone, Wallet, WifiOff } from "lucide-react";
import { MetricTile } from "../components/dashboard/DashboardPrimitives";

export interface OverviewStatusStripProps {
  connectionStatus: string;
  connectionTone: "teal" | "amber" | "rose" | "neutral";
  selectedBotLabel: string;
  isAiRepliesEnabled: boolean;
  walletBalance: number;
  launchReady: boolean;
  completedCoreCount: number;
}

export const OverviewStatusStrip: React.FC<OverviewStatusStripProps> = ({
  connectionStatus,
  connectionTone,
  selectedBotLabel,
  isAiRepliesEnabled,
  walletBalance,
  launchReady,
  completedCoreCount,
}) => {
  const isConnected = connectionTone === "teal";
  const isConnectingOrQr = connectionTone === "amber";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricTile
        label="WhatsApp Assistant"
        value={isConnected ? "Connected" : isConnectingOrQr ? connectionStatus : "Needs Attention"}
        helper={selectedBotLabel}
        icon={Smartphone}
        tone={connectionTone as any}
      />
      <MetricTile
        label="AI Auto-Replies"
        value={isAiRepliesEnabled ? "Active" : "Disabled"}
        helper={
          isAiRepliesEnabled
            ? "Bot responds automatically to customer chats"
            : "Replies paused; manual takeover active"
        }
        icon={Bot}
        tone={isAiRepliesEnabled ? "violet" : "neutral"}
      />
      <MetricTile
        label="Launch Setup"
        value={launchReady ? "Setup Complete" : `${completedCoreCount} of 6 Complete`}
        helper={launchReady ? "All core milestones verified" : "Complete remaining setup steps"}
        icon={CheckCircle2}
        tone={launchReady ? "brand" : "amber"}
      />
      <MetricTile
        label="Wallet Balance"
        value={`$${Math.max(0, walletBalance).toFixed(2)}`}
        helper={walletBalance < 5 ? "Low credit balance" : "Available for AI processing"}
        icon={Wallet}
        tone={walletBalance < 5 ? "amber" : "teal"}
      />
    </div>
  );
};
