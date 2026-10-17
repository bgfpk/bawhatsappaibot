import React, { useState } from "react";
import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

type PublicSiteHeaderProps = {
  isDarkMode: boolean;
  isLoggedIn: boolean;
  onToggleDarkMode?: () => void;
  onSignIn?: () => void;
  onPrimaryAction: () => void;
};

const primaryLinks = [
  { href: "/features", label: "Features" },
  { href: "/#integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
];

const footerLinkGroups = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/whatsapp-automation", label: "WhatsApp Automation" },
      { href: "/ai-whatsapp-bot", label: "AI WhatsApp Bot" },
      { href: "/whatsapp-customer-support", label: "Customer Support" },
      { href: "/ecommerce-whatsapp-bot", label: "Ecommerce Bot" },
      { href: "/whatsapp-order-capture", label: "Order Capture" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/whatsapp-automation-for-small-business", label: "Small Business" },
      { href: "/whatsapp-ai-bot-for-ecommerce", label: "AI for Ecommerce" },
      { href: "/whatsapp-bot-pricing", label: "Bot Pricing" },
      { href: "/best-whatsapp-automation-tool", label: "Best Tool" },
      { href: "/blackarrow-vs-manual-whatsapp-support", label: "Manual vs Automation" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export function PublicSiteHeader({
  isDarkMode,
  isLoggedIn,
  onToggleDarkMode,
  onSignIn,
  onPrimaryAction,
}: PublicSiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/76 backdrop-blur-2xl dark:border-white/10 dark:bg-[#050806]/76">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
        <a className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-90" href="/" aria-label="BlackArrow home">
          <BrandLogo isDarkMode={isDarkMode} imageClassName="h-9 w-auto md:h-10" />
        </a>

        <nav className="hidden items-center gap-1 rounded-full border border-gray-200 bg-white/72 px-2 py-1.5 shadow-sm backdrop-blur-xl lg:flex dark:border-white/10 dark:bg-white/[0.035]">
          {primaryLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:text-neutral-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {onToggleDarkMode && (
            <button
              onClick={onToggleDarkMode}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/72 text-gray-600 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-neutral-300 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {isLoggedIn ? (
            <a
              href="/dashboard"
              className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition-colors"
            >
              Dashboard <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <>
              <a
                href="/login"
                onClick={(e) => {
                  if (onSignIn) {
                    e.preventDefault();
                    onSignIn();
                  }
                }}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:text-emerald-600 dark:text-neutral-200 dark:hover:text-emerald-400"
              >
                Sign In
              </a>
              <button
                onClick={onPrimaryAction}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition-colors"
              >
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white/72 text-gray-700 shadow-sm lg:hidden dark:border-white/10 dark:bg-white/[0.035] dark:text-neutral-100"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={`grid border-t border-gray-200/70 bg-white/90 px-4 backdrop-blur-2xl transition-all duration-200 lg:hidden dark:border-white/10 dark:bg-[#050806]/92 ${
          menuOpen ? "grid-rows-[1fr] py-4 opacity-100" : "grid-rows-[0fr] py-0 opacity-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 overflow-hidden">
          {primaryLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-gray-200 bg-white/72 px-4 py-3 text-sm font-black text-gray-800 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-neutral-100"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {onToggleDarkMode && (
              <button
                onClick={onToggleDarkMode}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/72 px-5 py-3 text-sm font-black text-gray-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-neutral-100"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDarkMode ? "Switch to light" : "Switch to dark"}
              </button>
            )}
            {isLoggedIn ? (
              <a
                href="/dashboard"
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition-colors text-center"
              >
                Dashboard <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  onClick={(e) => {
                    if (onSignIn) {
                      e.preventDefault();
                      onSignIn();
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/72 px-5 py-3 text-sm font-black text-gray-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-neutral-100"
                >
                  Sign In
                </a>
                <button
                  onClick={onPrimaryAction}
                  className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition-colors"
                >
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function PublicSiteFooter({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#050806] px-5 py-12 text-white md:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.12),transparent_30%)]" />
      <div className="relative mx-auto grid w-full max-w-7xl gap-9 lg:grid-cols-[1fr_0.9fr]">
        <div className="max-w-xl">
          <BrandLogo isDarkMode={isDarkMode} imageClassName="h-11 w-auto" />
          <p className="mt-5 text-sm font-medium leading-relaxed text-white/68">
            WhatsApp AI automation for faster replies, cleaner order capture, practical handoff, and visible usage.
          </p>
          <p className="mt-5 text-sm font-bold text-emerald-200/90">
            Support:{" "}
            <a href="mailto:contact-086473cbd844@example.invalid" className="transition-colors hover:text-emerald-300">
              contact-086473cbd844@example.invalid
            </a>
            {" "}or{" "}
            <a href="https://wa.me/923136923129" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-emerald-300">
              WhatsApp sales chat
            </a>
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {footerLinkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">{group.title}</h3>
              <div className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="block text-sm font-bold text-white/66 transition-colors hover:text-emerald-300"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mx-auto mt-10 flex w-full max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/50 md:flex-row md:items-center md:justify-between">
        <span>(c) 2026 BlackArrow. All rights reserved.</span>
        <span>No official WhatsApp API claim is made unless explicitly implemented.</span>
      </div>
    </footer>
  );
}
