import React, { useState } from "react";
import { BookOpen, Plus, RefreshCw, Trash2, Globe, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar, DashboardEmptyState, ToneBadge } from "../components/dashboard/DashboardPrimitives";
import { normalizeKnowledgeSource, type KnowledgeSourceItem } from "./knowledge-model";

export interface KnowledgePageProps {
  sources?: any[];
  onAddUrl?: (url: string) => Promise<void> | void;
  onRemoveUrl?: (sourceId: string) => Promise<void> | void;
  onRefreshUrl?: (sourceId: string) => Promise<void> | void;
  formatDate?: (ts?: number | string) => string;
}

export const KnowledgePage: React.FC<KnowledgePageProps> = ({
  sources = [],
  onAddUrl,
  onRemoveUrl,
  onRefreshUrl,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [newUrlInput, setNewUrlInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalized = (sources || []).map(normalizeKnowledgeSource);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrlInput.trim() || !onAddUrl) return;
    setIsSubmitting(true);
    try {
      await onAddUrl(newUrlInput.trim());
      setNewUrlInput("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Intelligence"
        title="Knowledge Center"
        description="Manage website URLs and documentation sources that feed your AI assistant's answers."
        icon={BookOpen}
      />

      {/* Add URL Form */}
      {onAddUrl && (
        <form onSubmit={handleAdd} className="flex gap-2 rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm">
          <div className="relative flex-1">
            <Globe className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="url"
              required
              value={newUrlInput}
              onChange={(e) => setNewUrlInput(e.target.value)}
              placeholder="https://example.com/faq"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-10 pr-4 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>{isSubmitting ? "Adding..." : "Add Website Source"}</span>
          </button>
        </form>
      )}

      {normalized.length === 0 ? (
        <DashboardEmptyState
          icon={BookOpen}
          title="No Knowledge Sources Added"
          body="Connect a website URL to let the assistant learn your FAQ, products, and store policies."
          tone="neutral"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {normalized.map((item, idx) => (
            <div
              key={item.id || item.url || idx}
              className="flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[200px]">
                    {item.url}
                  </span>
                  {item.status === "ready" ? (
                    <ToneBadge tone="teal">Ready</ToneBadge>
                  ) : item.status === "processing" ? (
                    <ToneBadge tone="amber">Crawling</ToneBadge>
                  ) : item.status === "error" ? (
                    <ToneBadge tone="rose">Error</ToneBadge>
                  ) : (
                    <ToneBadge tone="neutral">Unknown</ToneBadge>
                  )}
                </div>
                <h4 className="mt-2 text-xs font-bold text-[var(--ca-text-primary)] truncate">
                  {item.title}
                </h4>
                {item.lastCrawledAt && (
                  <p className="mt-1 text-[10px] text-[var(--ca-text-muted)]">
                    Last updated: {formatDate(item.lastCrawledAt)}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--ca-border-subtle)] pt-3">
                {onRefreshUrl && item.id && (
                  <button
                    type="button"
                    onClick={() => onRefreshUrl(item.id!)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Refresh</span>
                  </button>
                )}
                {onRemoveUrl && item.id && (
                  <button
                    type="button"
                    onClick={() => onRemoveUrl(item.id!)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
