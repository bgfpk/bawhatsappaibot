import React from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { ToneBadge } from "../components/dashboard/DashboardPrimitives";
import { normalizeConnectionState, type NormalizeConnectionStateInput } from "./connection-state";

export interface ConnectionStateBadgeProps {
  statusInput?: NormalizeConnectionStateInput;
  className?: string;
}

const ICON_MAP = {
  CheckCircle2,
  QrCode,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  Smartphone,
};

export const ConnectionStateBadge: React.FC<ConnectionStateBadgeProps> = ({
  statusInput,
  className = "",
}) => {
  const normalized = normalizeConnectionState(statusInput);
  const IconComponent = ICON_MAP[normalized.iconName as keyof typeof ICON_MAP] || Smartphone;

  return (
    <ToneBadge tone={normalized.tone} className={`inline-flex items-center gap-1.5 font-bold ${className}`}>
      <IconComponent className={`h-3.5 w-3.5 ${normalized.key === "connecting" ? "animate-spin" : ""}`} />
      <span>{normalized.label}</span>
    </ToneBadge>
  );
};
