import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Globe2, RefreshCw, ShieldCheck, ShoppingCart } from "lucide-react";
import { IntegrationCard, StatusBadge } from "../DashboardPrimitives";

const SAMPLE_LEAD_JSON = `{
  "externalId": "lead-1001",
  "name": "Ali Khan",
  "phone": "15811061380",
  "email": "contact-9d86ec2b59bb@example.invalid",
  "productInterest": "Growth plan",
  "message": "I want details about WhatsApp automation.",
  "pageUrl": "https://example.com/pricing",
  "campaign": "summer-launch"
}`;

async function apiJson(path: string, options: RequestInit = {}) {
  const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function appOrigin() {
  if (typeof window === "undefined") return "https://blackarrow-source.offline.invalid";
  return window.location.origin;
}

function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(value).catch(() => {});
}

function formatTime(value: any) {
  const seconds = Number(value || 0);
  return seconds ? new Date(seconds * 1000).toLocaleString() : "No activity yet";
}

function statusTone(status: any) {
  const text = String(status || "").toLowerCase();
  if (["success", "ready", "configured", "healthy"].includes(text)) return "green";
  if (["failed", "error", "attention"].includes(text)) return "red";
  if (["duplicate", "skipped", "pending"].includes(text)) return "amber";
  return "gray";
}

function CopyBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/70">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">{label}</p>
        <button type="button" onClick={() => copyText(value)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"><Copy className="h-3 w-3" /> Copy</button>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-all font-mono text-xs font-bold text-gray-800 dark:text-neutral-200">{value}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"><p className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">{label}</p><p className="mt-1 text-lg font-black text-gray-950 dark:text-neutral-50">{value}</p>{hint && <p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">{hint}</p>}</div>;
}

function SetupStep({ number, title, detail }: { number: number; title: string; detail: string }) {
  return <div className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950/70"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{number}</span><div><p className="text-sm font-black text-gray-900 dark:text-neutral-50">{title}</p><p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-neutral-500">{detail}</p></div></div>;
}

export function IntegrationLeadCaptureExperience({ state, isLoading, run }: { state?: any; isLoading?: boolean; run: (action: () => Promise<any>, success: string) => Promise<any> }) {
  const [createdSigningValue, setCreatedSigningValue] = useState("");
  const base = appOrigin();
  const leadCapture = state?.leadCapture || {};
  const auth = leadCapture.auth || {};
  const summary = leadCapture.summary || { counts: {}, recentCount: 0 };
  const events = Array.isArray(leadCapture.events) ? leadCapture.events : [];
  const lastSuccess = summary.lastSuccess;
  const lastFailure = summary.lastFailure;
  const websiteEndpoint = `${base}/api/integrations/leads`;
  const wooEndpoint = `${base}/api/integrations/woocommerce/webhook`;
  const topEvents = useMemo(() => events.slice(0, 12), [events]);

  const regenerate = () => run(async () => {
    if (!window.confirm("Regenerate the WooCommerce capture signing value? Existing webhooks using the old value may stop working.")) return null;
    const data = await apiJson("/api/user/integrations/lead-capture/regenerate-secret", { method: "POST", body: "{}" });
    setCreatedSigningValue(data.secret || "");
    return data;
  }, "WooCommerce capture signing value regenerated.");

  return (
    <div className="grid gap-5">
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5 dark:border-neutral-800 dark:from-neutral-950 dark:to-neutral-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">Integrations</p><h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-neutral-50">Capture customer leads from your website and store.</h2><p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-gray-500 dark:text-neutral-400">Use this area to bring customer interest into BlackArrow from website forms, WooCommerce, and API sources. This setup does not send WhatsApp messages or trigger wallet charges.</p></div>
            <StatusBadge tone={lastFailure ? "red" : lastSuccess ? "green" : "gray"}>{lastFailure ? "attention" : lastSuccess ? "healthy" : "not configured"}</StatusBadge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4"><Stat label="Recent events" value={summary.recentCount || 0} /><Stat label="Last success" value={formatTime(lastSuccess?.createdAt)} /><Stat label="Last failure" value={formatTime(lastFailure?.createdAt)} /><Stat label="WooCommerce key" value={auth.configured ? "Configured" : "Needed"} hint={auth.maskedWebhookSecret || "Generate before setup"} /></div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <IntegrationCard title="Website lead capture" description="Send website forms and landing-page submissions into BlackArrow with source tracking and retry dedupe." icon={Globe2} status={<StatusBadge tone={(summary.counts?.success || 0) > 0 ? "green" : "gray"}>{(summary.counts?.success || 0) > 0 ? "receiving" : "ready"}</StatusBadge>}>
          <CopyBox label="Endpoint URL" value={`POST ${websiteEndpoint}`} />
          <CopyBox label="Sample lead JSON" value={SAMPLE_LEAD_JSON} />
          <div className="grid gap-3 md:grid-cols-3"><SetupStep number={1} title="Create key" detail="Use write:leads scope. Full value is shown once only." /><SetupStep number={2} title="Send payload" detail="Include phone or email and a stable idempotency key." /><SetupStep number={3} title="Check results" detail="Website leads appear with Website API source." /></div>
        </IntegrationCard>

        <IntegrationCard title="WooCommerce capture" description="Receive WooCommerce customer and order webhooks as captured leads. Full store sync remains planned." icon={ShoppingCart} status={<StatusBadge tone={auth.configured ? "green" : "gray"}>{auth.configured ? "configured" : "setup needed"}</StatusBadge>}>
          {createdSigningValue && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">New signing value, shown once: <span className="font-mono">{createdSigningValue}</span></div>}
          {auth.needsRegenerationForHmac && !createdSigningValue && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Legacy secret detected. Please click Regenerate to enable verified native WooCommerce HMAC-SHA256 signatures.
            </div>
          )}
          <CopyBox label="Webhook URL" value={`POST ${wooEndpoint}`} />
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/70"><p className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Signing value metadata</p><p className="mt-2 font-mono text-sm font-bold text-gray-900 dark:text-neutral-100">{auth.maskedWebhookSecret || "Not generated yet"}</p><button type="button" disabled={isLoading} onClick={regenerate} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Regenerate</button><p className="mt-2 text-xs font-medium text-gray-500 dark:text-neutral-500">Full value appears only immediately after regeneration. After refresh, only masked metadata is shown.</p></div>
          <div className="grid gap-3 md:grid-cols-3"><SetupStep number={1} title="Generate value" detail="Paste it into WooCommerce Webhook Secret field." /><SetupStep number={2} title="Subscribe events" detail="In WooCommerce > Advanced > Webhooks, choose Order created or Customer created." /><SetupStep number={3} title="Automatic HMAC" detail="WooCommerce signs requests using X-WC-Webhook-Signature." /></div>
        </IntegrationCard>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-gray-950 dark:text-neutral-50">Recent integration events</p><p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">Safe status log only. Full message bodies and raw values are not shown here.</p></div>{lastFailure ? <StatusBadge tone="red"><AlertTriangle className="mr-1 h-3 w-3" /> attention</StatusBadge> : <StatusBadge tone="green"><ShieldCheck className="mr-1 h-3 w-3" /> safe capture</StatusBadge>}</div>
        {topEvents.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-950/60"><p className="font-black text-gray-900 dark:text-neutral-100">No integration activity yet.</p><p className="mt-1 text-sm font-medium text-gray-500 dark:text-neutral-500">This area shows incoming website or WooCommerce events. Create an API key or signing value, send a test event, then refresh this page to confirm the setup.</p></div> : <div className="custom-scrollbar mt-4 overflow-x-auto rounded-2xl border border-gray-100 dark:border-neutral-800"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-gray-50 uppercase text-gray-400 dark:bg-neutral-950/60 dark:text-neutral-500"><tr><th className="p-3">Status</th><th className="p-3">Source</th><th className="p-3">Event</th><th className="p-3">Time</th><th className="p-3">Reason</th><th className="p-3">Reference</th></tr></thead><tbody>{topEvents.map((event: any) => <tr key={event.id} className="border-t border-gray-100 dark:border-neutral-800"><td className="p-3"><StatusBadge tone={statusTone(event.status)}>{event.status}</StatusBadge></td><td className="p-3 font-bold text-gray-900 dark:text-neutral-100">{event.source || event.provider || "integration"}</td><td className="p-3">{event.eventType || "lead.capture"}</td><td className="p-3">{formatTime(event.createdAt)}</td><td className="p-3">{event.reason || "-"}</td><td className="p-3 font-mono">{event.externalId || event.idempotencyKey || event.leadId || "-"}</td></tr>)}</tbody></table></div>}
      </div>

      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /><div><p className="font-black text-emerald-900 dark:text-emerald-100">QA checklist</p><p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-200">Send sample website JSON, confirm a lead appears with Website API source, send a WooCommerce order/customer event, confirm source is WooCommerce, retry with the same idempotency key, and confirm the retry logs as duplicate.</p></div></div></div>
    </div>
  );
}
