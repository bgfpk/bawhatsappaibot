import type { DashboardTone } from "../components/dashboard/dashboard-tone";

export type UIConnectionStateKey =
  | "connected"
  | "connecting"
  | "qr_required"
  | "disconnected"
  | "error"
  | "paused"
  | "unknown";

export interface NormalizedConnectionState {
  key: UIConnectionStateKey;
  label: string;
  description: string;
  tone: DashboardTone;
  iconName: string;
  showQr: boolean;
  allowReset: boolean;
  allowToggle: boolean;
  recommendedAction: string;
}

export interface NormalizeConnectionStateInput {
  status?: string;
  is_active?: number;
  jid?: string;
  qrCode?: string | null;
  hasSavedToken?: boolean;
}

export function normalizeConnectionState(
  input?: NormalizeConnectionStateInput,
): NormalizedConnectionState {
  if (!input) {
    return {
      key: "unknown",
      label: "Unknown Status",
      description: "Checking WhatsApp connection status...",
      tone: "neutral",
      iconName: "Smartphone",
      showQr: false,
      allowReset: false,
      allowToggle: false,
      recommendedAction: "Refresh Status",
    };
  }

  const { status = "", is_active = 1, jid = "", qrCode = null } = input;
  const rawStatus = String(status).toLowerCase().trim();

  if (is_active === 0) {
    return {
      key: "paused",
      label: "Instance Paused",
      description: "Automated replies and messaging are currently paused for this instance.",
      tone: "neutral",
      iconName: "PauseCircle",
      showQr: false,
      allowReset: true,
      allowToggle: true,
      recommendedAction: "Resume Instance",
    };
  }

  if (rawStatus === "connected" || Boolean(jid && rawStatus !== "qr-ready" && rawStatus !== "error")) {
    return {
      key: "connected",
      label: "Connected",
      description: "WhatsApp session is active and ready to handle incoming customer messages.",
      tone: "teal",
      iconName: "CheckCircle2",
      showQr: false,
      allowReset: true,
      allowToggle: true,
      recommendedAction: "Open Dashboard",
    };
  }

  if (rawStatus === "qr-ready" || Boolean(qrCode)) {
    return {
      key: "qr_required",
      label: "QR Scan Required",
      description: "Scan the QR code using WhatsApp Linked Devices on your phone to connect.",
      tone: "amber",
      iconName: "QrCode",
      showQr: true,
      allowReset: true,
      allowToggle: true,
      recommendedAction: "Scan QR Code",
    };
  }

  if (rawStatus === "connecting" || rawStatus === "proxy-connecting" || rawStatus === "retrying") {
    return {
      key: "connecting",
      label: rawStatus === "proxy-connecting" ? "Securing Connection" : rawStatus === "retrying" ? "Reconnecting" : "Connecting",
      description: "BlackArrow is establishing a safe WhatsApp connection for this identity.",
      tone: "amber",
      iconName: "RefreshCw",
      showQr: false,
      allowReset: true,
      allowToggle: true,
      recommendedAction: "Wait for QR",
    };
  }

  if (rawStatus === "error") {
    return {
      key: "error",
      label: "Connection Issue",
      description: "WhatsApp connection encountered an issue. Reconnect or reset login to generate a fresh QR.",
      tone: "rose",
      iconName: "AlertTriangle",
      showQr: false,
      allowReset: true,
      allowToggle: true,
      recommendedAction: "Reset Login",
    };
  }

  if (rawStatus === "disconnected") {
    return {
      key: "disconnected",
      label: "Disconnected",
      description: "WhatsApp session is disconnected. Connect or reset login to pair again.",
      tone: "neutral",
      iconName: "Smartphone",
      showQr: false,
      allowReset: true,
      allowToggle: true,
      recommendedAction: "Connect WhatsApp",
    };
  }

  return {
    key: "unknown",
    label: "Status Pending",
    description: "Checking WhatsApp connection status...",
    tone: "neutral",
    iconName: "Smartphone",
    showQr: false,
    allowReset: true,
    allowToggle: true,
    recommendedAction: "Check Connection",
  };
}
