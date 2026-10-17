import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Plug, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { IntegrationCard, StatusBadge } from "../DashboardPrimitives";
import { IntegrationLeadCaptureExperience } from "./IntegrationLeadCaptureExperience";

const API_SCOPES = [
  "read:account",
  "read:customers",
  "write:customers",
  "read:orders",
  "write:orders",
  "read:products",
  "write:products",
  "read:messages",
  "write:messages",
  "write:leads",
  "write:knowledge",
];

const PLANNED_CONNECTORS = [
  { label: "Website / WooCommerce", status: "Ready now", detail: "Use website lead capture and WooCommerce product/webhook setup today.", tone: "green" as const },
  { label: "Google Sheets", status: "Planned", detail: "Sheet sync and automation-friendly setup will be added later.", tone: "gray" as const },
  { label: "Shopify", status: "Planned", detail: "Direct Shopify connector is not active in this sprint.", tone: "gray" as const },
  { label: "Webhooks / Zapier / Make", status: "Ready via webhook", detail: "Use webhooks today. Direct no-code connector setup can come later.", tone: "blue" as const },
  { label: "Calendar / bookings", status: "Planned", detail: "Booking sync and calendar actions are not active yet.", tone: "gray" as const },
  { label: "Meta inboxes", status: "Coming soon", detail: "Meta inbox connection is reserved for a later phase.", tone: "gray" as const },
];

async function apiJson(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

type IntegrationFoundationSection = "all" | "commerce" | "api" | "webhooks";

export function IntegrationFoundationPage({ section = "all" }: { section?: IntegrationFoundationSection }) {
  const [state, setState] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [wooForm, setWooForm] = useState({ storeUrl: "", consumerKey: "", consumerSecret: "" });
  const [previewProducts, setPreviewProducts] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [overwriteWoo, setOverwriteWoo] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("Default integration key");
  const [apiScopes, setApiScopes] = useState<Record<string, boolean>>({ "read:account": true, "write:leads": true });
  const [createdApiKey, setCreatedApiKey] = useState("");
  const [webhookForm, setWebhookForm] = useState({ name: "Primary webhook", url: "", events: { "test.ping": true } as Record<string, boolean> });
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState("");

  const load = async () => {
    try {
      const data = await apiJson("/api/user/integrations/foundation");
      setState(data);
      const connection = data.wooCommerce?.connection || {};
      setWooForm((prev) => ({ ...prev, storeUrl: connection.storeUrl || prev.storeUrl, consumerKey: "", consumerSecret: "" }));
    } catch {
      // Gracefully handle unauthenticated load for public /integrations route
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (action: () => Promise<any>, success: string) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      setMessage(success);
      await load();
      return result;
    } catch (e: any) {
      setError(e.message || "Request failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPreviewItems = useMemo(() => previewProducts.filter((product) => selectedProducts[product.wooProductId]), [previewProducts, selectedProducts]);
  const connection = state?.wooCommerce?.connection || {};
  const publicApiRateLimits = state?.publicApiRateLimits || {};
  const showCommerce = section === "all" || section === "commerce";
  const showApi = section === "all" || section === "api";
  const showWebhooks = section === "all" || section === "webhooks";

  return (
    <div className="grid grid-cols-1 gap-5">
      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
          {error || message}
        </div>
      )}

      {(section === "all" || section === "api" || section === "commerce") && (
        <IntegrationLeadCaptureExperience state={state} isLoading={isLoading} run={run} />
      )}

      {section === "all" && (
        <IntegrationCard title="Integration categories" description="See what is ready now and what is planned next. Planned items are not active yet.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PLANNED_CONNECTORS.map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-gray-900 dark:text-neutral-50">{item.label}</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500 dark:text-neutral-500">{item.detail}</p>
                  </div>
                  <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </IntegrationCard>
      )}

      {showCommerce && (
      <IntegrationCard title="WooCommerce product import" description="Preview and sync selected WooCommerce products into Products / Services. This is separate from webhook lead capture." icon={Plug} status={<StatusBadge tone={connection.enabled ? "green" : connection.status === "error" ? "red" : "gray"}>{connection.status || "not connected"}</StatusBadge>}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div><label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Store URL</label><input value={wooForm.storeUrl} onChange={(e) => setWooForm({ ...wooForm, storeUrl: e.target.value })} placeholder="https://example.com" className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" /></div>
          <div><label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Consumer key</label><input type="password" value={wooForm.consumerKey} onChange={(e) => setWooForm({ ...wooForm, consumerKey: e.target.value })} placeholder={connection.hasCredentials ? connection.maskedConsumerKey || "Saved" : "ck_..."} className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" /></div>
          <div><label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Consumer secret</label><input type="password" value={wooForm.consumerSecret} onChange={(e) => setWooForm({ ...wooForm, consumerSecret: e.target.value })} placeholder={connection.hasCredentials ? "Leave blank to keep saved value" : "cs_..."} className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" /></div>
        </div>
        <div className="flex flex-wrap gap-2"><button disabled={isLoading} onClick={() => run(() => apiJson("/api/user/integrations/woocommerce/save", { method: "POST", body: JSON.stringify(wooForm) }), "WooCommerce connection saved.")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Save connection</button><button disabled={isLoading || !connection.hasCredentials} onClick={() => run(() => apiJson("/api/user/integrations/woocommerce/test", { method: "POST", body: "{}" }), "WooCommerce connection test passed.")} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 dark:border-neutral-800 dark:text-neutral-200 disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Test</button><button disabled={isLoading || !connection.hasCredentials} onClick={() => run(() => apiJson("/api/user/integrations/woocommerce", { method: "DELETE" }), "WooCommerce connection removed.")} className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 disabled:opacity-60"><Trash2 className="h-4 w-4" /> Remove</button></div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/60"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-gray-900 dark:text-neutral-50">Product import preview</p><p className="mt-1 text-xs font-medium text-gray-500 dark:text-neutral-500">Preview does not save products. Sync selected products manually when ready.</p></div><div className="flex flex-wrap gap-2"><button disabled={isLoading || !connection.hasCredentials} onClick={() => run(async () => { const data = await apiJson("/api/user/integrations/woocommerce/products/preview", { method: "POST", body: JSON.stringify({ limit: 20 }) }); setPreviewProducts(data.products || []); setSelectedProducts({}); return data; }, "WooCommerce product preview loaded.")} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold dark:border-neutral-800 dark:bg-neutral-900 disabled:opacity-60">Load preview</button><label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-900"><input type="checkbox" checked={overwriteWoo} onChange={(e) => setOverwriteWoo(e.target.checked)} /> overwrite existing synced fields</label><button disabled={isLoading || selectedPreviewItems.length === 0} onClick={() => run(() => apiJson("/api/user/integrations/woocommerce/products/sync", { method: "POST", body: JSON.stringify({ products: selectedPreviewItems, overwrite: overwriteWoo }) }), "Selected WooCommerce products synced.")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Sync selected</button></div></div><div className="custom-scrollbar mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-gray-400 dark:text-neutral-500"><tr><th className="p-2">Sync</th><th className="p-2">Product</th><th className="p-2">SKU</th><th className="p-2">Price</th><th className="p-2">Stock</th><th className="p-2">Categories</th></tr></thead><tbody>{previewProducts.length === 0 ? (<tr><td className="p-4 text-center text-gray-500" colSpan={6}>No preview loaded.</td></tr>) : previewProducts.map((product) => (<tr key={product.wooProductId} className="border-t border-gray-100 dark:border-neutral-800"><td className="p-2"><input type="checkbox" checked={Boolean(selectedProducts[product.wooProductId])} onChange={(e) => setSelectedProducts({ ...selectedProducts, [product.wooProductId]: e.target.checked })} /></td><td className="p-2 font-bold text-gray-900 dark:text-neutral-50">{product.name}</td><td className="p-2">{product.sku || "-"}</td><td className="p-2">${Number(product.salePrice ?? product.price ?? 0).toFixed(2)}</td><td className="p-2">{product.stockStatus || "-"}</td><td className="p-2">{(product.categories || []).join(", ") || "-"}</td></tr>))}</tbody></table></div></div>
      </IntegrationCard>
      )}

      {showApi && (
      <IntegrationCard title="Public API Keys" description="Generate scoped account API keys. Values are shown once, stored hashed, and can be revoked." icon={KeyRound}>
        {createdApiKey && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">New API key, shown once: <span className="font-mono">{createdApiKey}</span></div>}
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr_auto]"><input value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} className="rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" /><div className="flex flex-wrap gap-2">{API_SCOPES.map((scope) => (<label key={scope} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-950"><input type="checkbox" checked={Boolean(apiScopes[scope])} onChange={(e) => setApiScopes({ ...apiScopes, [scope]: e.target.checked })} />{scope}</label>))}</div><button disabled={isLoading} onClick={() => run(async () => { const data = await apiJson("/api/user/integrations/api-keys", { method: "POST", body: JSON.stringify({ name: apiKeyName, scopes: Object.keys(apiScopes).filter((scope) => apiScopes[scope]) }) }); setCreatedApiKey(data.key || ""); return data; }, "API key created.")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">Create key</button></div>
        <div className="grid gap-2">{(state?.apiKeys || []).map((key: any) => (<div key={key.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/60 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-gray-900 dark:text-neutral-50">{key.name}</p><p className="text-xs text-gray-500">{key.maskedKey} / {key.scopes?.join(", ")}</p></div><button disabled={key.status === "revoked" || isLoading} onClick={() => run(() => apiJson(`/api/user/integrations/api-keys/${key.id}`, { method: "DELETE" }), "API key revoked.")} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 disabled:opacity-60">Revoke</button></div>))}</div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/60"><p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-neutral-600">Safe test endpoint</p><p className="mt-1 break-all font-mono text-xs font-bold text-gray-700 dark:text-neutral-300">GET /api/public/v1/account/status</p><p className="mt-2 text-xs font-medium text-gray-500 dark:text-neutral-500">Requests are scoped to the owning account and logged without full payloads. Message-send scopes remain separate from lead capture.</p></div>
      </IntegrationCard>
      )}

      {showWebhooks && (
      <IntegrationCard title="Outbound Webhooks" description="Create signed outbound webhook endpoints, subscribe to events, and send a test delivery." icon={Webhook}>
        {createdWebhookSecret && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">New webhook signing value, shown once: <span className="font-mono">{createdWebhookSecret}</span></div>}
        <p className="text-xs font-medium text-gray-500 dark:text-neutral-500">Webhook URLs must be public HTTPS endpoints in production. Local/private/internal URLs are blocked for safety.</p>
        <div className="grid gap-3 lg:grid-cols-[0.8fr_1.4fr]"><input value={webhookForm.name} onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })} className="rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" /><input value={webhookForm.url} onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })} placeholder="https://example.com/webhooks/blackarrow" className="rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" /></div>
        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">{(state?.webhookEvents || []).map((event: string) => (<label key={event} className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold dark:bg-neutral-900"><input type="checkbox" checked={Boolean(webhookForm.events[event])} onChange={(e) => setWebhookForm({ ...webhookForm, events: { ...webhookForm.events, [event]: e.target.checked } })} />{event}</label>))}</div>
        <button disabled={isLoading} onClick={() => run(async () => { const data = await apiJson("/api/user/integrations/webhooks", { method: "POST", body: JSON.stringify({ name: webhookForm.name, url: webhookForm.url, events: Object.keys(webhookForm.events).filter((event) => webhookForm.events[event]) }) }); setCreatedWebhookSecret(data.secret || ""); return data; }, "Webhook endpoint created.")} className="w-fit rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">Create webhook</button>
        <div className="grid gap-2">{(state?.webhookEndpoints || []).map((endpoint: any) => (<div key={endpoint.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/60"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-black text-gray-900 dark:text-neutral-50">{endpoint.name}</p><p className="break-all text-xs text-gray-500">{endpoint.url}</p><p className="mt-1 text-xs text-gray-500">{endpoint.events?.join(", ")}</p></div><div className="flex flex-wrap gap-2"><button disabled={isLoading} onClick={() => run(() => apiJson(`/api/user/integrations/webhooks/${endpoint.id}/test`, { method: "POST", body: "{}" }), "Webhook test delivery attempted.")} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-900"><Send className="h-3.5 w-3.5" /> Test</button><button disabled={isLoading} onClick={() => run(() => apiJson(`/api/user/integrations/webhooks/${endpoint.id}`, { method: "PATCH", body: JSON.stringify({ enabled: endpoint.enabled === false }) }), endpoint.enabled === false ? "Webhook enabled." : "Webhook disabled.")} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-900">{endpoint.enabled === false ? "Enable" : "Disable"}</button><button disabled={isLoading} onClick={() => run(async () => { const data = await apiJson(`/api/user/integrations/webhooks/${endpoint.id}/regenerate-secret`, { method: "POST", body: "{}" }); setCreatedWebhookSecret(data.secret || ""); return data; }, "Webhook signing value regenerated.")} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold dark:border-neutral-800 dark:bg-neutral-900">Regenerate</button><button disabled={isLoading} onClick={() => run(() => apiJson(`/api/user/integrations/webhooks/${endpoint.id}`, { method: "DELETE" }), "Webhook endpoint deleted.")} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">Delete</button></div></div><p className="mt-2 text-xs text-gray-500">Stored key: {endpoint.maskedSecret} / last status: {endpoint.lastStatus || "none"} {endpoint.lastError ? `(${endpoint.lastError})` : ""}</p></div>))}</div>
      </IntegrationCard>
      )}
    </div>
  );
}
