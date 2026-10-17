// src/instance-hub/meta/MetaOfficialApiConnectCard.tsx
//
// Meta Official WhatsApp API Connection & Provider Management Component.
// Manages self-service Embedded Signup flow, 6-digit PIN registration modal,
// authoritative asset display, and truthful status indicators.

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Lock,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unlink,
  Zap,
} from "lucide-react";
import {
  launchMetaEmbeddedSignup,
  MetaEmbeddedSignupSessionInfo,
} from "../../services/meta-embedded-signup-service";

export interface MetaProviderConfigSummary {
  providerType?: string;
  providerStatus?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  connectedAt?: number;
}

export interface MetaOfficialApiConnectCardProps {
  botId: string;
  instanceName: string;
  providerConfig?: MetaProviderConfigSummary | null;
  onRefreshInstance?: () => Promise<void> | void;
}

export const MetaOfficialApiConnectCard: React.FC<MetaOfficialApiConnectCardProps> = ({
  botId,
  instanceName,
  providerConfig,
  onRefreshInstance,
}) => {
  const [platformConfig, setPlatformConfig] = useState<{
    available: boolean;
    appId: string;
    configId: string;
    graphVersion: string;
    missing: string[];
  } | null>(null);

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  // Registration PIN Modal State
  const [pendingSignupData, setPendingSignupData] = useState<{
    code: string;
    sessionInfo: MetaEmbeddedSignupSessionInfo;
    attemptId: string;
    state: string;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);

  // Disconnect Confirmation State
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        setIsLoadingConfig(true);
        const res = await fetch("/api/meta-onboarding/config");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setPlatformConfig(data);
        }
      } catch (err) {
        console.warn("[MetaConnectCard] Failed to fetch public config:", err);
      } finally {
        if (isMounted) setIsLoadingConfig(false);
      }
    };
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const isConfigured =
    providerConfig?.providerType === "whatsapp_cloud_api" &&
    providerConfig?.providerStatus === "configured" &&
    Boolean(providerConfig?.phoneNumberId);

  const handleStartEmbeddedSignup = async () => {
    if (!platformConfig || !platformConfig.available) {
      setOnboardingError("Meta Official API onboarding is temporarily unavailable.");
      return;
    }

    setOnboardingError(null);
    setIsOnboarding(true);

    try {
      // 1. Request secure short-lived onboarding attempt from server
      const startRes = await fetch("/api/meta-onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, purpose: isConfigured ? "reconnect" : "onboard" }),
      });

      if (!startRes.ok) {
        const errJson = await startRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to start onboarding session");
      }

      const startData = await startRes.json();
      const { attemptId, state } = startData;

      // 2. Launch Meta Embedded Signup via Facebook SDK
      await launchMetaEmbeddedSignup({
        appId: platformConfig.appId,
        configId: platformConfig.configId,
        graphVersion: platformConfig.graphVersion,
        state,
        onSuccess: (result) => {
          setIsOnboarding(false);
          // Store pending data and prompt customer for 6-digit registration PIN
          setPendingSignupData({
            code: result.code,
            sessionInfo: result.sessionInfo,
            attemptId,
            state,
          });
          setPin("");
          setConfirmPin("");
          setPinError(null);
        },
        onError: (err) => {
          setIsOnboarding(false);
          setOnboardingError(err.message || "Meta Embedded Signup failed.");
        },
        onCancel: () => {
          setIsOnboarding(false);
        },
      });
    } catch (err: any) {
      setIsOnboarding(false);
      setOnboardingError(err.message || "Unable to launch Meta signup.");
    }
  };

  const handleCompleteWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSignupData) return;

    if (!/^\d{6}$/.test(pin)) {
      setPinError("PIN must be exactly 6 numeric digits.");
      return;
    }

    if (pin !== confirmPin) {
      setPinError("Registration PINs do not match.");
      return;
    }

    setPinError(null);
    setIsSubmittingPin(true);

    try {
      const completeRes = await fetch("/api/meta-onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          attemptId: pendingSignupData.attemptId,
          state: pendingSignupData.state,
          code: pendingSignupData.code,
          wabaId: pendingSignupData.sessionInfo.wabaId,
          phoneNumberId: pendingSignupData.sessionInfo.phoneNumberId,
          businessId: pendingSignupData.sessionInfo.businessId,
          pin,
        }),
      });

      if (!completeRes.ok) {
        const errJson = await completeRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to validate and register phone with Meta");
      }

      setPendingSignupData(null);
      if (onRefreshInstance) {
        await onRefreshInstance();
      }
    } catch (err: any) {
      setPinError(err.message || "Failed to complete onboarding registration.");
    } finally {
      setIsSubmittingPin(false);
    }
  };

  const [healthData, setHealthData] = useState<any | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [isSyncingTemplates, setIsSyncingTemplates] = useState(false);
  const [templateSyncResult, setTemplateSyncResult] = useState<{ count?: number; error?: string } | null>(null);

  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    setHealthError(null);
    try {
      const res = await fetch("/api/bots/meta-health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHealthData(data.health);
      } else {
        setHealthError(data.error || "Health check failed");
      }
    } catch (err: any) {
      setHealthError(err?.message || "Health check network error");
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleSyncTemplates = async () => {
    setIsSyncingTemplates(true);
    setTemplateSyncResult(null);
    try {
      const res = await fetch("/api/whatsapp-templates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTemplateSyncResult({ count: data.count || (data.templates ? data.templates.length : 0) });
      } else {
        setTemplateSyncResult({ error: data.error || "Template sync failed" });
      }
    } catch (err: any) {
      setTemplateSyncResult({ error: err?.message || "Template sync network error" });
    } finally {
      setIsSyncingTemplates(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/meta-onboarding/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      if (res.ok) {
        setShowDisconnectConfirm(false);
        if (onRefreshInstance) {
          await onRefreshInstance();
        }
      }
    } catch (err) {
      console.error("[MetaConnectCard] Disconnect error:", err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const maskId = (id?: string) => {
    if (!id) return "N/A";
    if (id.length <= 8) return id;
    return `${id.slice(0, 4)}****${id.slice(-4)}`;
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--ca-text-primary)]">
              Meta Official WhatsApp API
            </h3>
            <p className="text-xs text-[var(--ca-text-secondary)] font-medium">
              Enterprise Cloud API integration directly managed through your Meta Business Account.
            </p>
          </div>
        </div>

        <div>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Official API Configured</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Setup Required</span>
            </span>
          )}
        </div>
      </div>

      {/* Errors / Warnings */}
      {onboardingError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <strong className="block font-bold">Onboarding Notice</strong>
          <p className="mt-1">{onboardingError}</p>
        </div>
      )}

      {/* Platform unavailable warning */}
      {platformConfig && !platformConfig.available && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <strong className="block font-bold">Official API Onboarding Unavailable</strong>
          <p className="mt-1">
            Workspace administrator has not completed Meta Platform configuration. Missing: {platformConfig.missing.join(", ")}.
          </p>
        </div>
      )}

      {/* Main Body */}
      {isConfigured ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5">
              <div className="flex items-center gap-2 text-[var(--ca-text-muted)] text-[11px] font-bold uppercase tracking-wider">
                <Phone className="h-3.5 w-3.5" />
                <span>Display Number</span>
              </div>
              <p className="mt-1 text-sm font-black text-[var(--ca-text-primary)]">
                {providerConfig?.displayPhoneNumber || "Verified Number"}
              </p>
              {providerConfig?.verifiedName && (
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  {providerConfig.verifiedName}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5">
              <div className="flex items-center gap-2 text-[var(--ca-text-muted)] text-[11px] font-bold uppercase tracking-wider">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Phone Number ID</span>
              </div>
              <p className="mt-1 font-mono text-xs font-bold text-[var(--ca-text-primary)]">
                {maskId(providerConfig?.phoneNumberId)}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-3.5">
              <div className="flex items-center gap-2 text-[var(--ca-text-muted)] text-[11px] font-bold uppercase tracking-wider">
                <Building2 className="h-3.5 w-3.5" />
                <span>WhatsApp Business Account</span>
              </div>
              <p className="mt-1 font-mono text-xs font-bold text-[var(--ca-text-primary)]">
                {maskId(providerConfig?.businessAccountId)}
              </p>
            </div>
          </div>

          {/* Health Diagnostics / Template Status Badges */}
          {healthData && (
            <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)]/60 p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ca-border-subtle)] pb-2">
                <span className="font-bold text-[var(--ca-text-primary)]">Provider Health Diagnostics</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                  healthData.status === "active" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                  healthData.status === "reauth_required" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" :
                  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}>
                  Status: {healthData.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-[var(--ca-text-muted)] font-semibold block">Quality Rating</span>
                  <span className="font-bold text-[var(--ca-text-primary)]">{healthData.dimensions?.phoneQuality?.rating || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--ca-text-muted)] font-semibold block">API Access</span>
                  <span className="font-bold text-[var(--ca-text-primary)]">{healthData.dimensions?.apiAccess?.status || "Unknown"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--ca-text-muted)] font-semibold block">Webhook Ingestion</span>
                  <span className="font-bold text-[var(--ca-text-primary)]">{healthData.dimensions?.webhook?.status || "Awaiting"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--ca-text-muted)] font-semibold block">Approved Templates</span>
                  <span className="font-bold text-[var(--ca-text-primary)]">{healthData.dimensions?.templates?.approvedCount ?? "N/A"}</span>
                </div>
              </div>
            </div>
          )}

          {healthError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {healthError}
            </div>
          )}

          {templateSyncResult && (
            <div className={`rounded-xl p-3 text-xs ${
              templateSyncResult.error
                ? "border border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                : "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            }`}>
              {templateSyncResult.error || `Successfully synchronized ${templateSyncResult.count} templates from Meta.`}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCheckHealth}
                disabled={isCheckingHealth}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3.5 py-2 text-xs font-bold text-[var(--ca-text-primary)] transition-all hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50"
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${isCheckingHealth ? "animate-spin" : ""}`} />
                <span>{isCheckingHealth ? "Checking..." : "Check Connection"}</span>
              </button>

              <button
                type="button"
                onClick={handleSyncTemplates}
                disabled={isSyncingTemplates}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3.5 py-2 text-xs font-bold text-[var(--ca-text-primary)] transition-all hover:border-blue-500 hover:text-blue-600 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingTemplates ? "animate-spin" : ""}`} />
                <span>{isSyncingTemplates ? "Syncing..." : "Sync Templates"}</span>
              </button>

              <button
                type="button"
                onClick={handleStartEmbeddedSignup}
                disabled={isOnboarding || !platformConfig?.available}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3.5 py-2 text-xs font-bold text-[var(--ca-text-primary)] transition-all hover:border-blue-500 hover:text-blue-600 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isOnboarding ? "animate-spin" : ""}`} />
                <span>{isOnboarding ? "Launching Meta..." : "Reconnect with Meta"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <Unlink className="h-3.5 w-3.5" />
                <span>Disconnect</span>
              </button>
            </div>

            <p className="text-[11px] text-[var(--ca-text-muted)]">
              Official API credentials are encrypted with AES-256-GCM.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--ca-border-default)] bg-[var(--ca-surface-2)]/40 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-sm font-bold text-[var(--ca-text-primary)]">
            Connect Official WhatsApp Business Number
          </h4>
          <p className="mt-1 max-w-md text-xs text-[var(--ca-text-secondary)] font-medium leading-relaxed">
            Link your phone number directly via Meta Embedded Signup. You will log in with your Meta account, select your business, and authorize messaging in a single step.
          </p>

          <button
            type="button"
            onClick={handleStartEmbeddedSignup}
            disabled={isOnboarding || isLoadingConfig || !platformConfig?.available}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-black text-white shadow-md transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          >
            {isOnboarding ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Connecting to Meta...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Connect with Meta</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 6-Digit Registration PIN Modal */}
      {pendingSignupData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meta-pin-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--ca-border-subtle)] pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 id="meta-pin-modal-title" className="text-base font-black text-[var(--ca-text-primary)]">
                  Set 6-Digit Registration PIN
                </h3>
                <p className="text-xs text-[var(--ca-text-secondary)]">
                  Protect two-step verification for this WhatsApp Official number.
                </p>
              </div>
            </div>

            <form onSubmit={handleCompleteWithPin} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
                  6-Digit Registration PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  required
                  autoFocus
                  className="mt-1 w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-4 py-2.5 text-center font-mono text-base tracking-widest outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ca-text-muted)]">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  required
                  className="mt-1 w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-4 py-2.5 text-center font-mono text-base tracking-widest outline-none focus:border-emerald-500"
                />
                <p className="mt-1 text-[11px] text-[var(--ca-text-muted)]">
                  This PIN is required by Meta to complete official phone registration.
                </p>
              </div>

              {pinError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  {pinError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingSignupData(null)}
                  disabled={isSubmittingPin}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pin.length !== 6 || confirmPin.length !== 6 || isSubmittingPin}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmittingPin ? (
                    <span>Registering...</span>
                  ) : (
                    <span>Complete Registration</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-6 shadow-2xl">
            <h3 className="text-base font-black text-[var(--ca-text-primary)]">
              Disconnect Meta Official API?
            </h3>
            <p className="mt-2 text-xs text-[var(--ca-text-secondary)] leading-relaxed font-medium">
              This will remove BlackArrow's access to this WhatsApp number. Your Meta Business Account and phone number will remain intact in your Meta Business Suite.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(false)}
                disabled={isDisconnecting}
                className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
              >
                Keep Connected
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDisconnecting ? "Disconnecting..." : "Confirm Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
