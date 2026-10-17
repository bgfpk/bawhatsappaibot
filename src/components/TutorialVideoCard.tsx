import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, PlayCircle, X } from "lucide-react";
import { trackAnalyticsEvent } from "../lib/analytics";

const YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v=4-47Ursh0Fo";
const YOUTUBE_EMBED_URL = "https://www.youtube-nocookie.com/embed/4-47Ursh0Fo?autoplay=1&rel=0";

type TutorialVideoCardProps = {
  title?: string;
  description?: string;
  eyebrow?: string;
  variant?: "public" | "dashboard";
  className?: string;
};

export function TutorialVideoCard({
  title = "Watch Setup Tutorial",
  description = "Learn how to create your account, configure your AI assistant, and connect WhatsApp with BlackArrow.",
  eyebrow = "Onboarding",
  variant = "public",
  className = "",
}: TutorialVideoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDashboard = variant === "dashboard";

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const openVideo = () => {
    setIsOpen(true);
    trackAnalyticsEvent("setup_tutorial_open", { placement: variant });
  };

  const openOnYoutube = () => {
    trackAnalyticsEvent("setup_tutorial_youtube_click", { placement: variant });
  };

  return (
    <>
      <div
        className={`rounded-[1.5rem] border p-5 shadow-sm ${
          isDashboard
            ? "border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.035]"
            : "border-emerald-200 bg-white/84 dark:border-emerald-900 dark:bg-white/[0.04]"
        } ${className}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p
              className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                isDashboard ? "text-[var(--ca-violet)]" : "text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {eyebrow}
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{description}</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[220px]">
            <button
              type="button"
              onClick={openVideo}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition-colors ${
                isDashboard
                  ? "ca-button-secondary rounded-[var(--ca-radius-control)] text-[var(--ca-violet)]"
                  : "public-primary-button"
              }`}
            >
              <PlayCircle className="h-4 w-4" />
              Watch Setup Tutorial
            </button>
            <a
              href={YOUTUBE_WATCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openOnYoutube}
              className="inline-flex items-center justify-center gap-2 text-sm font-bold text-gray-600 transition-colors hover:text-emerald-600 dark:text-neutral-300 dark:hover:text-emerald-300"
            >
              Open on YouTube <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {isOpen ? <TutorialVideoModal onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

function TutorialVideoModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4">
      <button
        type="button"
        aria-label="Close setup tutorial"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-[121] w-full max-w-5xl rounded-[1.6rem] border border-white/10 bg-[#050806] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Setup tutorial</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-white md:text-2xl">BlackArrow guided setup walkthrough</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white transition-colors hover:border-emerald-700 hover:text-emerald-300"
            aria-label="Close video modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
          <div className="relative aspect-video w-full">
            <iframe
              className="absolute inset-0 h-full w-full"
              src={YOUTUBE_EMBED_URL}
              title="BlackArrow setup tutorial video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-neutral-300">
            Prefer the YouTube page? Open the tutorial in a new tab.
          </p>
          <a
            href={YOUTUBE_WATCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAnalyticsEvent("setup_tutorial_youtube_click", { placement: "modal" })}
            className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 transition-colors hover:text-emerald-200"
          >
            Open on YouTube <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
