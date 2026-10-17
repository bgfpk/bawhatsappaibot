import React from "react";
import { Download, FileText, Image as ImageIcon, Music, Video } from "lucide-react";

export interface MessageAttachmentProps {
  mediaType: "image" | "video" | "audio" | "document" | "sticker" | "text";
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
}

export const MessageAttachment: React.FC<MessageAttachmentProps> = ({
  mediaType,
  mediaUrl,
  fileName = "Attachment",
  fileSize,
}) => {
  if (!mediaUrl) return null;

  if (mediaType === "image") {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <img
          src={mediaUrl}
          alt={fileName || "Customer image"}
          className="max-h-64 max-w-full object-contain bg-black/5"
          loading="lazy"
        />
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <video
          src={mediaUrl}
          controls
          className="max-h-64 max-w-full object-contain"
          preload="metadata"
        />
      </div>
    );
  }

  if (mediaType === "audio") {
    return (
      <div className="mt-2 rounded-xl bg-black/5 p-2 dark:bg-white/5">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
          <Music className="h-3.5 w-3.5" />
          <span>Voice Note</span>
        </div>
        <audio src={mediaUrl} controls className="w-full h-8" preload="metadata" />
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-gray-900 dark:text-neutral-100" title={fileName}>
          {fileName}
        </p>
        {fileSize && (
          <p className="text-[10px] font-medium text-gray-400 dark:text-neutral-500">{fileSize}</p>
        )}
      </div>
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName}
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-emerald-600 dark:hover:bg-neutral-800"
        title="Download file"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
};
