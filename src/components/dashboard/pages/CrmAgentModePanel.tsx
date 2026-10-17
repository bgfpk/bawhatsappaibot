import React from "react";
import { Bot, Play, ShieldCheck } from "lucide-react";
import { normalizeCrmAgentModeSettings } from "../../../services/crm-agent-mode-settings-service";

const CATEGORY_LABELS = [
  ["updateStageStatus", "Update stage/status"],
  ["fillMissingFields", "Fill missing fields"],
  ["createFollowUps", "Create follow-ups"],
  ["assignLeads", "Assign leads"],
];

export function CrmAgentModePanel({
  settings,
  logs,
  auditSummary,
  isRunning,
  walletBalance,
  onChange,
  onRun,
}: {
  settings: any;
  logs: any[];
  auditSummary?: any;
  isRunning: boolean;
  walletBalance?: number;
  onChange: (settings: any) => void;
  onRun: () => void;
}) {
  const normalized = normalizeCrmAgentModeSettings(settings);
  const walletBlocked = normalized.mode === "advanced" && Number(walletBalance || 0) < 0.003;
  const skippedReasons = ["wallet_blocked", "duplicate", "unsafe", "no_op"]
    .map((key) => [key, Number(auditSummary?.reasonBreakdown?.[key] || 0)] as const)
    .filter(([, count]) => count > 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-black text-gray-950 dark:text-neutral-50">CRM Agent Mode</h2>
              <p className="mt-0.5 text-xs font-bold text-gray-500 dark:text-neutral-500">Basic rule actions are free; limited-time AI text discount applies to advanced AI actions too: regular $0.005, now $0.003 after success, saving $0.002 (40% off).</p>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-neutral-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Agent Mode updates CRM records only. It does not send customer WhatsApp messages. Keep limits conservative until audit history is clean.
          </p>
          {walletBlocked ? <p className="mt-2 text-xs font-black text-amber-700 dark:text-amber-300">Wallet balance is below $0.003, so Advanced AI Agent actions will be skipped.</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...normalized, enabled: !normalized.enabled })}
            className={`rounded-lg px-3 py-2 text-xs font-black ${normalized.enabled ? "bg-emerald-600 text-white" : "border border-gray-200 text-gray-600 dark:border-neutral-800 dark:text-neutral-300"}`}
          >
            {normalized.enabled ? "Agent ON" : "Agent OFF"}
          </button>
          <button
            type="button"
            disabled={!normalized.enabled || isRunning}
            onClick={onRun}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950"
          >
            <Play className="h-3.5 w-3.5" />
            {isRunning ? "Running..." : "Run Agent now"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["basic", "advanced"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...normalized, mode })}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black ${normalized.mode === mode ? "bg-emerald-600 text-white" : "border border-gray-200 text-gray-600 dark:border-neutral-800 dark:text-neutral-300"}`}
            title={mode === "basic" ? "Rule-based actions, lower cost" : "AI-assisted actions when eligible"}
          >
            {mode === "basic" ? "Basic" : "Advanced"}
          </button>
        ))}
        {CATEGORY_LABELS.map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={(normalized.categories as any)[key] !== false}
              onChange={(event) => onChange({ ...normalized, categories: { ...normalized.categories, [key]: event.target.checked } })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600"
            />
            {label}
          </label>
        ))}
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-black text-gray-600 dark:border-neutral-800 dark:text-neutral-300">
          <span>Max actions/run</span>
          <select
            value={normalized.maxActions}
            onChange={(event) => onChange({ ...normalized, maxActions: Number(event.target.value) })}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] font-black text-gray-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-gray-900 dark:text-neutral-100">Agent Mode audit</h3>
          <span className="font-bold text-gray-500 dark:text-neutral-400">Charged: ${Number(auditSummary?.totalChargedCost || 0).toFixed(3)}</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {[
            ["Applied", auditSummary?.applied || 0],
            ["Skipped", auditSummary?.skipped || 0],
            ["Failed", auditSummary?.failed || 0],
            ["Charged actions", auditSummary?.charged || 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-md bg-white px-2.5 py-2 font-bold text-gray-700 dark:bg-neutral-900 dark:text-neutral-200">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-neutral-500">{label}</span>
              <p className="mt-1 text-sm font-black text-gray-950 dark:text-neutral-50">{value as number}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs font-bold text-gray-600 dark:text-neutral-300">
          Top skipped reasons: {skippedReasons.length ? skippedReasons.map(([key]) => key).join(", ") : "none"}
        </p>
        <p className="mt-1 text-xs font-bold text-gray-600 dark:text-neutral-300">
          Recommendation: {auditSummary?.recommendation || "Agent Mode has no recent audit data yet."}
        </p>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {(logs || []).slice(0, 3).length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs font-bold text-gray-400 dark:border-neutral-800 lg:col-span-3">No Agent Mode actions yet.</p>
        ) : (logs || []).slice(0, 3).map((log) => (
          <div key={log.id || log.actionKey} className="rounded-lg border border-gray-100 p-2.5 text-xs dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-black ${log.status === "success" ? "text-emerald-700 dark:text-emerald-300" : log.status === "failed" ? "text-red-600 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>{log.status}</span>
              <span className="font-bold text-gray-400">{log.charged ? `$${Number(log.cost || 0).toFixed(3)}` : "No charge"}</span>
            </div>
            <p className="mt-1 truncate font-bold text-gray-600 dark:text-neutral-300">{log.title || log.reason || log.actionId}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
