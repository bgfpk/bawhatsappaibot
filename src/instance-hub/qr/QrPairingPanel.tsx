import React from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { QrInstructions } from "./QrInstructions";
import { normalizeConnectionState, type NormalizeConnectionStateInput } from "../connection-state";

export interface QrPairingPanelProps {
  evidence?: "verified" | "synthetic" | "unavailable";
  statusInput: NormalizeConnectionStateInput;
  qrCode?: string | null;
  instanceName?: string;
  onResetLogin?: () => void;
  onOpenDashboard?: () => void;
}

export const QrPairingPanel: React.FC<QrPairingPanelProps> = ({
  statusInput,
  evidence,
  qrCode,
  instanceName = "WhatsApp Instance",
  onResetLogin,
  onOpenDashboard,
}) => {
  if(evidence==='synthetic'||evidence==='unavailable')return <div className="workspace-card"><h4>{evidence==='synthetic'?'Synthetic test session':'QR pairing unavailable'}</h4><p>{evidence==='synthetic'?'No real QR pairing or customer connection is represented.':'Linked Devices QR pairing requires an eligible, verified authorized transport and separate owner activation approval.'}</p><p>On your phone: WhatsApp → Linked Devices → Link a Device. Scan only a current code supplied by the authorized transport.</p></div>;
  if(statusInput.status==='unpaired'||statusInput.status==='repairing'||statusInput.status==='disconnected')return <div className="workspace-card"><h4>{statusInput.status==='unpaired'?'Not paired':statusInput.status==='repairing'?'Re-pairing required':'Disconnected'}</h4><p>A fresh, authorized Linked Devices QR session is required before this number can receive or send messages.</p></div>;
  const normalized = normalizeConnectionState({
    ...statusInput,
    qrCode,
  });

  if (normalized.key === "connected") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-lg font-black text-emerald-950 dark:text-emerald-100">
          WhatsApp Connected
        </h3>
        <p className="mt-1 max-w-sm text-xs font-medium text-emerald-800 dark:text-emerald-300 leading-relaxed">
          {instanceName} is active and paired with WhatsApp Linked Devices.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Active Session Protected</span>
        </div>
        {onOpenDashboard && (
          <button
            type="button"
            onClick={onOpenDashboard}
            className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
          >
            Open Assistant Workspace
          </button>
        )}
      </div>
    );
  }

  if (normalized.key === "qr_required" && qrCode) {
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight text-[var(--ca-text-primary)]">
              Scan WhatsApp QR Code
            </h3>
            <p className="mt-0.5 text-xs text-[var(--ca-text-secondary)]">
              Identity: <strong className="font-semibold">{instanceName}</strong>
            </p>
          </div>
          {onResetLogin && (
            <button
              type="button"
              onClick={onResetLogin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Session</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-center">
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--ca-border-default)] bg-white p-4 shadow-inner dark:bg-neutral-900">
            <img
              src={qrCode}
              alt="WhatsApp QR Code for pairing"
              className="aspect-square w-full max-w-[280px] rounded-xl object-contain"
            />
            <p className="mt-3 text-[11px] font-bold text-gray-500 dark:text-neutral-400">
              Refresh if code expires on phone screen
            </p>
          </div>

          <QrInstructions />
        </div>
      </div>
    );
  }

  if (normalized.key === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-10 text-center shadow-sm">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
          Preparing WhatsApp Connection
        </h3>
        <p className="mt-2 max-w-sm text-xs text-[var(--ca-text-secondary)] leading-relaxed">
          BlackArrow is initializing the session for <strong className="font-semibold">{instanceName}</strong>. A fresh QR code will appear shortly.
        </p>
      </div>
    );
  }

  if (normalized.key === "error") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50">
          <AlertTriangle className="h-8 w-8 text-rose-600 dark:text-rose-400" />
        </div>
        <h3 className="text-base font-bold text-rose-950 dark:text-rose-100">
          WhatsApp Connection Issue
        </h3>
        <p className="mt-1 max-w-sm text-xs font-medium text-rose-800 dark:text-rose-300 leading-relaxed">
          The session encountered an issue or was disconnected from WhatsApp. Reset login to re-authenticate with a fresh QR code.
        </p>
        {onResetLogin && (
          <button
            type="button"
            onClick={onResetLogin}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-amber-700 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset Login & Re-pair</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-8 text-center">
      <Smartphone className="mb-3 h-10 w-10 text-[var(--ca-text-muted)]" />
      <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
        WhatsApp Session Status
      </h3>
      <p className="mt-1 max-w-sm text-xs text-[var(--ca-text-secondary)]">
        Select an instance or reset login to begin WhatsApp QR pairing.
      </p>
      {onResetLogin && (
        <button
          type="button"
          onClick={onResetLogin}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-4 py-2 text-xs font-bold transition-colors hover:border-emerald-400"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Login</span>
        </button>
      )}
    </div>
  );
};
