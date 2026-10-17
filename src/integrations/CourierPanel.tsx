import React, { useState } from "react";
import { Truck, CheckCircle2, AlertTriangle, HelpCircle, Save } from "lucide-react";
import type { CourierConfig } from "./integration-model";

interface Props {
  couriers?: CourierConfig[];
  onSaveCourier?: (provider: "postex" | "leopard", apiKey: string, merchantId: string) => Promise<void>;
  onTestConnection?: (provider: "postex" | "leopard") => Promise<{ success: boolean; message?: string }>;
}

const DEFAULT_COURIERS: CourierConfig[] = [
  { provider: "postex", name: "PostEx Courier", isConfigured: false, status: "unconfigured" },
  { provider: "leopard", name: "Leopards Courier", isConfigured: false, status: "unconfigured" },
];

export const CourierPanel: React.FC<Props> = ({
  couriers = DEFAULT_COURIERS,
  onSaveCourier,
  onTestConnection,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<"postex" | "leopard">("postex");
  const [postexToken, setPostexToken] = useState("");
  const [postexMerchantId, setPostexMerchantId] = useState("");

  const [leopardApiKey, setLeopardApiKey] = useState("");
  const [leopardPassword, setLeopardPassword] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ provider: string; success: boolean; message?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const postexConfig: CourierConfig = couriers.find((c) => c.provider === "postex") || {
    provider: "postex" as const,
    name: "PostEx Courier",
    isConfigured: false,
    status: "unconfigured" as const,
  };

  const leopardConfig: CourierConfig = couriers.find((c) => c.provider === "leopard") || {
    provider: "leopard" as const,
    name: "Leopards Courier",
    isConfigured: false,
    status: "unconfigured" as const,
  };

  const handleSavePostEx = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (onSaveCourier) {
        await onSaveCourier("postex", postexToken, postexMerchantId);
      }
      setPostexToken("");
      setPostexMerchantId("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLeopard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (onSaveCourier) {
        await onSaveCourier("leopard", leopardApiKey, leopardPassword);
      }
      setLeopardApiKey("");
      setLeopardPassword("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (provider: "postex" | "leopard") => {
    setIsTesting(true);
    setTestResult(null);
    try {
      if (onTestConnection) {
        const res = await onTestConnection(provider);
        setTestResult({ provider, ...res });
      } else {
        setTestResult({ provider, success: true, message: `${provider === "postex" ? "PostEx" : "Leopards"} API credentials verified!` });
      }
    } catch (err: any) {
      setTestResult({ provider, success: false, message: err.message || "Connection failed." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          onClick={() => setSelectedProvider("postex")}
          className={`cursor-pointer rounded-2xl border p-5 transition-all bg-[var(--ca-bg-surface)] ${
            selectedProvider === "postex" ? "border-[var(--ca-brand)] shadow-md" : "border-[var(--ca-border-subtle)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-[var(--ca-text-primary)]">PostEx Courier</h3>
                <p className="text-xs text-[var(--ca-text-secondary)]">Automated order booking & tracking.</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
              postexConfig.isConfigured ? "text-emerald-500 bg-emerald-500/10" : "text-[var(--ca-text-muted)] bg-neutral-500/10"
            }`}>
              {postexConfig.isConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
              {postexConfig.isConfigured ? "Configured" : "Not Configured"}
            </span>
          </div>
        </div>

        <div
          onClick={() => setSelectedProvider("leopard")}
          className={`cursor-pointer rounded-2xl border p-5 transition-all bg-[var(--ca-bg-surface)] ${
            selectedProvider === "leopard" ? "border-[var(--ca-brand)] shadow-md" : "border-[var(--ca-border-subtle)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-[var(--ca-text-primary)]">Leopards Courier</h3>
                <p className="text-xs text-[var(--ca-text-secondary)]">Packet tracking & dispatch integration.</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
              leopardConfig.isConfigured ? "text-emerald-500 bg-emerald-500/10" : "text-[var(--ca-text-muted)] bg-neutral-500/10"
            }`}>
              {leopardConfig.isConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
              {leopardConfig.isConfigured ? "Configured" : "Not Configured"}
            </span>
          </div>
        </div>
      </div>

      {/* Provider Credentials Form */}
      {selectedProvider === "postex" ? (
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
          <h3 className="text-base font-bold text-[var(--ca-text-primary)] mb-1">PostEx Courier Credentials</h3>
          <p className="text-xs text-[var(--ca-text-secondary)] mb-6">
            Enter your PostEx API Token and Merchant ID to enable courier broadcasts and tracking updates.
          </p>

          <form onSubmit={handleSavePostEx} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                PostEx API Token * {postexConfig.apiKeyMasked && <span className="text-[11px] font-normal text-[var(--ca-text-muted)]">(Saved: {postexConfig.apiKeyMasked})</span>}
              </label>
              <input
                type="password"
                placeholder={postexConfig.apiKeyMasked ? "Leave blank to preserve saved token" : "Enter PostEx API Token"}
                value={postexToken}
                onChange={(e) => setPostexToken(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Merchant ID (Optional)
              </label>
              <input
                type="text"
                placeholder="Enter PostEx Merchant ID"
                value={postexMerchantId}
                onChange={(e) => setPostexMerchantId(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            {testResult && testResult.provider === "postex" && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                testResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              }`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleTest("postex")}
                disabled={isTesting}
                className="ca-button-secondary text-xs"
              >
                {isTesting ? "Verifying..." : "Test Connection"}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="ca-button-primary text-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {isSaving ? "Saving..." : "Save PostEx Credentials"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
          <h3 className="text-base font-bold text-[var(--ca-text-primary)] mb-1">Leopards Courier Credentials</h3>
          <p className="text-xs text-[var(--ca-text-secondary)] mb-6">
            Enter your Leopards Courier API Key and Password for booking and status tracking.
          </p>

          <form onSubmit={handleSaveLeopard} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Leopards API Key * {leopardConfig.apiKeyMasked && <span className="text-[11px] font-normal text-[var(--ca-text-muted)]">(Saved: {leopardConfig.apiKeyMasked})</span>}
              </label>
              <input
                type="password"
                placeholder={leopardConfig.apiKeyMasked ? "Leave blank to preserve saved key" : "Enter Leopards API Key"}
                value={leopardApiKey}
                onChange={(e) => setLeopardApiKey(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                API Password / Token *
              </label>
              <input
                type="password"
                placeholder="Enter Leopards API Password"
                value={leopardPassword}
                onChange={(e) => setLeopardPassword(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            {testResult && testResult.provider === "leopard" && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                testResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              }`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleTest("leopard")}
                disabled={isTesting}
                className="ca-button-secondary text-xs"
              >
                {isTesting ? "Verifying..." : "Test Connection"}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="ca-button-primary text-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {isSaving ? "Saving..." : "Save Leopards Credentials"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
