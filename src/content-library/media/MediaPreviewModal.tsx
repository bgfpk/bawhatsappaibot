import React, { useState, useEffect, useMemo } from "react";
import { Dialog } from "../../design-system/primitives/Overlays";
import {
  FileText,
  Image as ImageIcon,
  Video,
  File,
  Smile,
  Download,
  Volume2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { MediaLibraryItem } from "../content-library-model";

export interface MediaPreviewModalProps {
  item: MediaLibraryItem | null;
  isOpen: boolean;
  onClose: () => void;
  selectedBotId?: string;
  formatDate?: (ts?: number | string) => string;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  item,
  isOpen,
  onClose,
  selectedBotId,
  formatDate,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Compute secure media URL
  const mediaUrl = useMemo(() => {
    if (!item) return "";
    // If previewUrl is an authenticated server URL or blob, use it directly
    if (
      item.previewUrl &&
      (item.previewUrl.startsWith("/api/user/content-library/media") ||
        item.previewUrl.startsWith("blob:") ||
        (!item.previewUrl.includes("whatsapp.net") && !item.previewUrl.includes("directPath")))
    ) {
      return item.previewUrl;
    }
    const msgId = item.messageId || item.id;
    if (selectedBotId && msgId) {
      const groupParam = item.sourceGroupJid ? `&groupJid=${encodeURIComponent(item.sourceGroupJid)}` : "";
      return `/api/user/content-library/media/${encodeURIComponent(msgId)}?botId=${encodeURIComponent(selectedBotId)}${groupParam}`;
    }
    return item.previewUrl || "";
  }, [item, selectedBotId]);

  // Reset loading and error states when item or url changes
  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [item?.id, mediaUrl, retryKey]);

  if (!item) return null;

  const isPdf = Boolean(
    item.mimeType?.includes("pdf") ||
    item.fileName?.toLowerCase().endsWith(".pdf") ||
    item.name?.toLowerCase().endsWith(".pdf")
  );

  const formatFileSize = (bytes?: number) => {
    if (!bytes || typeof bytes !== "number" || isNaN(bytes)) return undefined;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatCapturedAt = (ts?: number | string) => {
    if (!ts) return "—";
    const formatted = formatDate ? formatDate(ts) : "";
    if (formatted && formatted !== String(ts) && !/^\d{9,12}$/.test(formatted)) {
      return formatted;
    }
    const num = typeof ts === "number" ? ts : Number(ts);
    if (!isNaN(num) && num > 0) {
      const ms = num < 10000000000 ? num * 1000 : num;
      return new Date(ms).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
    return String(ts);
  };

  const formattedSize = formatFileSize(item.fileSize);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={item.name || item.fileName || "Media Preview"}
    >
      <div className="space-y-4 text-xs font-medium text-[var(--ca-text-primary)]">
        {/* Media Container */}
        <div className="relative flex flex-col justify-center rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] p-4 min-h-[200px] items-center overflow-hidden">
          {/* Loading state indicator */}
          {loading && !error && (
            <div className="flex flex-col items-center justify-center p-8 gap-2.5">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
              <span className="text-xs font-medium text-[var(--ca-text-muted)]">
                Retrieving media preview...
              </span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center justify-center p-6 text-center gap-2.5">
              <AlertCircle className="h-9 w-9 text-amber-500" />
              <p className="font-bold text-sm text-[var(--ca-text-primary)]">
                Media preview unavailable
              </p>
              <p className="text-xs text-[var(--ca-text-muted)] max-w-sm leading-relaxed">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] px-3.5 py-1.5 text-xs font-bold text-[var(--ca-text-primary)] shadow-sm hover:border-emerald-500 transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* IMAGE */}
          {item.type === "image" && mediaUrl && (
            <img
              key={`img_${retryKey}`}
              src={mediaUrl}
              alt={item.name}
              style={{ display: loading || error ? "none" : "block" }}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError("The original WhatsApp media could no longer be downloaded.");
              }}
              className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-sm"
            />
          )}

          {/* VIDEO */}
          {item.type === "video" && mediaUrl && (
            <div className={`w-full ${loading || error ? "hidden" : "block"}`}>
              <video
                key={`vid_${retryKey}`}
                src={mediaUrl}
                controls
                preload="metadata"
                autoPlay={false}
                onLoadedData={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError("The original WhatsApp media could no longer be downloaded.");
                }}
                className="max-h-[60vh] w-full rounded-xl shadow-sm"
              />
            </div>
          )}

          {/* AUDIO */}
          {item.type === "audio" && mediaUrl && (
            <div
              className={`flex flex-col items-center gap-3 py-4 w-full ${
                loading || error ? "hidden" : "flex"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                <Volume2 className="h-6 w-6" />
              </div>
              <p className="font-bold text-xs text-[var(--ca-text-primary)]">
                {item.fileName || item.name}
              </p>
              <audio
                key={`aud_${retryKey}`}
                src={mediaUrl}
                controls
                preload="metadata"
                onLoadedData={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError("The original WhatsApp media could no longer be downloaded.");
                }}
                className="w-full max-w-md mt-2"
              />
            </div>
          )}

          {/* STICKER */}
          {item.type === "sticker" && mediaUrl && (
            <img
              key={`stk_${retryKey}`}
              src={mediaUrl}
              alt="WhatsApp Sticker"
              style={{ display: loading || error ? "none" : "block" }}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError("The original WhatsApp media could no longer be downloaded.");
              }}
              className="h-36 w-36 object-contain"
            />
          )}

          {/* DOCUMENT */}
          {item.type === "document" && (
            <div
              className={`flex flex-col items-center gap-3 py-4 w-full ${
                loading && !isPdf ? "hidden" : "flex"
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                <FileText className="h-7 w-7" />
              </div>
              <p className="font-bold text-sm text-center break-words max-w-md text-[var(--ca-text-primary)]">
                {item.fileName || item.name}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--ca-text-muted)]">
                {item.mimeType && <span className="font-mono">{item.mimeType}</span>}
                {formattedSize && <span>• {formattedSize}</span>}
              </div>

              {/* Inline PDF Preview */}
              {isPdf && mediaUrl && (
                <div className="w-full h-80 rounded-xl border border-[var(--ca-border-subtle)] overflow-hidden mt-2 bg-white">
                  <iframe
                    src={mediaUrl}
                    title={item.name}
                    className="w-full h-full border-0"
                    onLoad={() => setLoading(false)}
                    onError={() => setLoading(false)}
                  />
                </div>
              )}

              {/* Download / Open Action */}
              {mediaUrl && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={mediaUrl}
                    download={item.fileName || item.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setLoading(false)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{isPdf ? "Open / Download PDF" : "Download File"}</span>
                  </a>
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] px-3.5 py-2 text-xs font-bold text-[var(--ca-text-primary)] hover:border-emerald-500 transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open in New Tab</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Fallback for text or missing media */}
          {!["image", "video", "audio", "sticker", "document"].includes(item.type) && (
            <div className="w-full whitespace-pre-wrap leading-relaxed font-sans text-xs p-2">
              {item.name}
            </div>
          )}
        </div>

        {/* Dedicated Caption Section */}
        {item.caption && (
          <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3.5 space-y-1.5">
            <h4 className="font-bold text-[11px] uppercase tracking-wider text-[var(--ca-text-muted)]">
              Caption
            </h4>
            <p className="text-xs text-[var(--ca-text-primary)] whitespace-pre-wrap break-words leading-relaxed font-normal">
              {item.caption}
            </p>
          </div>
        )}

        {/* Source Group & Timestamp Metadata */}
        <div className="rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-3 space-y-2 text-[11px]">
          {item.fileName && item.fileName !== item.name && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-[var(--ca-text-muted)] font-bold">File Name:</span>
              <span className="font-mono font-medium text-[var(--ca-text-primary)] truncate max-w-xs">
                {item.fileName}
              </span>
            </div>
          )}
          {formattedSize && (
            <div className="flex justify-between items-center">
              <span className="text-[var(--ca-text-muted)] font-bold">File Size:</span>
              <span className="font-mono text-[var(--ca-text-secondary)]">{formattedSize}</span>
            </div>
          )}
          {item.mimeType && (
            <div className="flex justify-between items-center">
              <span className="text-[var(--ca-text-muted)] font-bold">MIME Type:</span>
              <span className="font-mono text-[var(--ca-text-secondary)]">{item.mimeType}</span>
            </div>
          )}
          {item.sourceGroupName && (
            <div className="flex justify-between items-center">
              <span className="text-[var(--ca-text-muted)] font-bold">Source Group:</span>
              <span className="font-bold text-[var(--ca-text-primary)]">{item.sourceGroupName}</span>
            </div>
          )}
          {item.capturedAt && (
            <div className="flex justify-between items-center">
              <span className="text-[var(--ca-text-muted)] font-bold">Captured:</span>
              <span className="font-medium text-[var(--ca-text-secondary)]">
                {formatCapturedAt(item.capturedAt)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[var(--ca-text-muted)] font-bold">Content Type:</span>
            <span className="font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {item.type}
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
