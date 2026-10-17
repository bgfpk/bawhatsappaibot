import React, { useState } from "react";
import { Server, Save, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";
import type { ProxyConfig } from "./platform-model";

interface Props {
  proxy?: ProxyConfig;
  onSaveProxy?: (host: string, port: number, user: string, pass: string) => Promise<void>;
  onTestProxy?: () => Promise<{ success: boolean; message?: string }>;
}

export const ProxySettings: React.FC<Props> = ({
  proxy = {
    isConfigured: false,
    status: "disabled",
    host: "",
    port: 8080,
    usernameMasked: "",
  },
  onSaveProxy,
  onTestProxy,
}) => {
  const [host, setHost] = useState(proxy.host || "");
  const [port, setPort] = useState<number>(proxy.port || 8080);
  const [username, setUsername] = useState(proxy.usernameMasked || "");
  const [password, setPassword] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveProxy) return;
    setIsSaving(true);
    try {
      await onSaveProxy(host.trim(), Number(port), username.trim(), password);
      setPassword("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!onTestProxy) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestProxy();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Proxy connection failed." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm max-w-3xl">
        {!onSaveProxy && (
          <div className="mb-5 p-3 rounded-xl bg-neutral-500/10 text-[var(--ca-text-secondary)] text-xs font-medium border border-[var(--ca-border-subtle)]">
            Proxy configuration is read-only in this view.
          </div>
        )}

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">WhatsApp Proxy & Connection</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Configure custom IP proxies for WhatsApp session connections to improve stability.
              </p>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase px-2.5 py-1 rounded-full ${
            proxy.isConfigured
              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
              : "bg-neutral-500/10 text-[var(--ca-text-muted)] border border-[var(--ca-border-subtle)]"
          }`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {proxy.isConfigured ? "Proxy Active" : "No Proxy Configured"}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Proxy Host / IP Address
              </label>
              <input
                type="text"
                disabled={!onSaveProxy}
                placeholder="e.g. 192.168.1.100 or proxy.mycompany.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Port
              </label>
              <input
                type="number"
                required
                disabled={!onSaveProxy}
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 8080)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Proxy Username
            </label>
            <input
              type="text"
              disabled={!onSaveProxy}
              placeholder="Optional proxy username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Proxy Password
            </label>
            <input
              type="password"
              disabled={!onSaveProxy}
              placeholder={proxy.isConfigured ? "Leave blank to preserve saved password" : "Optional proxy password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          {testResult && (
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
              onClick={handleTest}
              disabled={isTesting || !onTestProxy}
              className="ca-button-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isTesting ? "animate-spin" : ""}`} />
              {isTesting ? "Testing..." : "Test Connection"}
            </button>

            <button
              type="submit"
              disabled={isSaving || !onSaveProxy}
              className="ca-button-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {isSaving ? "Saving..." : "Save Proxy Credentials"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
