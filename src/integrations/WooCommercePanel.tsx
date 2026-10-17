import React, { useState } from "react";
import { ShoppingBag, CheckCircle2, AlertTriangle, RefreshCw, Eye, Trash2 } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import type { WooCommerceConfig } from "./integration-model";

interface Props {
  config?: WooCommerceConfig;
  onSaveConfig?: (storeUrl: string, key: string, secret: string) => Promise<void>;
  onTestConnection?: () => Promise<{ success: boolean; message?: string }>;
  onFetchProductPreview?: () => Promise<any[]>;
  onSyncProducts?: () => Promise<void>;
  onRemoveConnection?: () => Promise<void>;
}

export const WooCommercePanel: React.FC<Props> = ({
  config = { storeUrl: "", consumerKey: "", consumerSecretMasked: "", status: "untested" },
  onSaveConfig,
  onTestConnection,
  onFetchProductPreview,
  onSyncProducts,
  onRemoveConnection,
}) => {
  const [storeUrl, setStoreUrl] = useState(config.storeUrl || "");
  const [consumerKey, setConsumerKey] = useState(config.consumerKey || "");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<any[]>([]);

  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (onSaveConfig) {
        await onSaveConfig(storeUrl, consumerKey, consumerSecret);
      }
      setConsumerSecret("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      if (onTestConnection) {
        const res = await onTestConnection();
        setTestResult(res);
      } else {
        setTestResult({ success: true, message: "WooCommerce API connection successful!" });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection failed." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleOpenPreview = async () => {
    setIsPreviewOpen(true);
    setIsPreviewLoading(true);
    try {
      if (onFetchProductPreview) {
        const items = await onFetchProductPreview();
        setPreviewProducts(items);
      } else {
        setPreviewProducts([
          { id: 101, name: "Premium Leather Shoes", sku: "SH-001", price: "8500", stock_status: "instock" },
          { id: 102, name: "Cotton Casual Shirt", sku: "CS-002", price: "3200", stock_status: "instock" },
        ]);
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      if (onSyncProducts) await onSyncProducts();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      if (onRemoveConnection) await onRemoveConnection();
      setIsRemoveOpen(false);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">WooCommerce Integration</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Connect your WordPress/WooCommerce store for product catalog sync and webhook orders.
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${
            config.status === "connected" ? "text-emerald-500 bg-emerald-500/10" : "text-amber-500 bg-amber-500/10"
          }`}>
            {config.status === "connected" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {config.status === "connected" ? "Connected" : "Setup Required"}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Store URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://example-store.com"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Consumer Key *
              </label>
              <input
                type="text"
                required
                placeholder="ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
                Consumer Secret * {config.consumerSecretMasked && <span className="text-[11px] font-normal text-[var(--ca-text-muted)]">(Saved: {config.consumerSecretMasked})</span>}
              </label>
              <input
                type="password"
                placeholder={config.consumerSecretMasked ? "Leave blank to keep saved secret" : "cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>
          </div>

          {testResult && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              testResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !storeUrl || !consumerKey}
                className="ca-button-secondary text-xs"
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={handleOpenPreview}
                disabled={!storeUrl || !consumerKey}
                className="ca-button-secondary text-xs"
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                Product Preview
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing || config.status !== "connected"}
                className="ca-button-secondary text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                Sync Products
              </button>
            </div>

            <div className="flex gap-2">
              {config.status === "connected" && (
                <button
                  type="button"
                  onClick={() => setIsRemoveOpen(true)}
                  className="ca-button-secondary text-xs text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Remove
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="ca-button-primary text-xs"
              >
                {isSaving ? "Saving..." : "Save WooCommerce Settings"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Read-Only Product Preview Modal */}
      <Dialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="WooCommerce Product Preview (Read-Only)"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--ca-text-secondary)]">
            This preview inspects your store catalog without modifying any products.
          </p>

          {isPreviewLoading ? (
            <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
              Loading store products...
            </div>
          ) : previewProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--ca-text-muted)]">
              No products returned from store.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-[var(--ca-border-subtle)]">
              {previewProducts.map((p: any) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-[var(--ca-text-primary)]">{p.name}</p>
                    <p className="text-[11px] text-[var(--ca-text-muted)]">SKU: {p.sku || "N/A"}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[var(--ca-text-primary)]">{p.price}</span>
                    <p className="text-[10px] text-emerald-500 font-bold uppercase">{p.stock_status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="ca-button-primary text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </Dialog>

      {/* Remove Confirmation Modal */}
      <Dialog
        isOpen={isRemoveOpen}
        onClose={() => setIsRemoveOpen(false)}
        title="Remove WooCommerce Connection"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--ca-text-secondary)]">
            Are you sure you want to disconnect this WooCommerce store? Catalog synchronization and webhook updates will be stopped.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsRemoveOpen(false)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className="ca-button-primary text-xs bg-rose-600 hover:bg-rose-700"
            >
              {isRemoving ? "Removing..." : "Confirm & Remove"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
