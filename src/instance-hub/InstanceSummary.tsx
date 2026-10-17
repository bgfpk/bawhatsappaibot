import React from "react";
import { AlertTriangle, CheckCircle2, QrCode, Smartphone } from "lucide-react";
import { MetricTile } from "../components/dashboard/DashboardPrimitives";

export interface InstanceSummaryProps {
  totalCount: number;
  connectedCount: number;
  qrRequiredCount: number;
  attentionCount: number;
}

export const InstanceSummary: React.FC<InstanceSummaryProps> = ({
  totalCount,
  connectedCount,
  qrRequiredCount,
  attentionCount,
}) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricTile
        label="Total Identities"
        value={totalCount}
        helper="Configured WhatsApp instances"
        icon={Smartphone}
        tone="blue"
      />
      <MetricTile
        label="Connected"
        value={connectedCount}
        helper="Active WhatsApp sessions"
        icon={CheckCircle2}
        tone="teal"
      />
      <MetricTile
        label="QR Required"
        value={qrRequiredCount}
        helper="Awaiting phone pairing scan"
        icon={QrCode}
        tone={qrRequiredCount > 0 ? "amber" : "neutral"}
      />
      <MetricTile
        label="Needs Attention"
        value={attentionCount}
        helper="Connection issues or paused"
        icon={AlertTriangle}
        tone={attentionCount > 0 ? "rose" : "neutral"}
      />
    </div>
  );
};
