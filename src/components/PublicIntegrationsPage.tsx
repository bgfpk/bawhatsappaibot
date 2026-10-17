import React from "react";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  HelpCircle,
  Key,
  Layers,
  Link2,
  Lock,
  MessageSquare,
  Package,
  Puzzle,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Webhook,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";

type PublicIntegrationsPageProps = {
  onStartTrial: () => void;
  onShowHome?: () => void;
  onShowPricing?: () => void;
  onShowFeatures?: () => void;
  onShowDocs?: () => void;
  primaryCtaLabel?: string;
};

export function PublicIntegrationsPage({
  onStartTrial,
  onShowHome,
  onShowPricing,
  onShowFeatures,
  onShowDocs,
  primaryCtaLabel = "Start Free Trial",
}: PublicIntegrationsPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 py-16 md:py-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-gray-200 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,255,247,0.98))] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.14),transparent_30%),linear-gradient(135deg,rgba(19,25,20,0.98),rgba(10,16,12,0.98))] md:p-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Puzzle className="h-4 w-4" />
              Ecosystem & Integrations
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-6xl md:leading-[1.1]">
              Connect BlackArrow to Your Store, Website, Couriers, and Business Systems
            </h1>
            <p className="mt-5 text-base font-medium leading-relaxed text-gray-700 dark:text-neutral-300 md:text-lg">
              Turn incoming store orders, customer inquiries, and courier tracking into automated WhatsApp workflows. BlackArrow links with WooCommerce, WordPress knowledge bases, courier APIs, and custom webhooks without messy middleware.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onStartTrial}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-8 py-3.5 text-sm font-black text-white shadow-[0_16px_34px_rgba(37,211,102,0.24)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(37,211,102,0.3)]"
              >
                {primaryCtaLabel} <ArrowRight className="h-4 w-4" />
              </button>
              {onShowPricing && (
                <button
                  type="button"
                  onClick={onShowPricing}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/88 px-7 py-3.5 text-sm font-black text-emerald-700 transition-colors hover:border-emerald-400 dark:border-emerald-900 dark:bg-neutral-900/80 dark:text-emerald-300"
                >
                  View Plans & Pricing
                </button>
              )}
            </div>
          </div>

          {/* Flow Visual Mockup */}
          <div className="relative rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-neutral-800">
                <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-neutral-400">Data Flow Architecture</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Operational Bridge
                </span>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5 dark:border-neutral-800 dark:bg-neutral-950/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-neutral-100">WooCommerce Store</div>
                      <div className="text-[11px] text-gray-500 dark:text-neutral-400">Orders, Catalog & COD Verification</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">REST API</span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5 dark:border-neutral-800 dark:bg-neutral-950/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-neutral-100">Couriers (PostEx, Leopards, DHL)</div>
                      <div className="text-[11px] text-gray-500 dark:text-neutral-400">Live Parcel Tracking & Status Lookup</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">Tracking API</span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5 dark:border-neutral-800 dark:bg-neutral-950/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-neutral-100">WordPress & Website Knowledge</div>
                      <div className="text-[11px] text-gray-500 dark:text-neutral-400">Sitemap & Knowledge Base Learning</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">Knowledge Sync</span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5 dark:border-neutral-800 dark:bg-neutral-950/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Webhook className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-neutral-100">Public REST API & Webhooks</div>
                      <div className="text-[11px] text-gray-500 dark:text-neutral-400">Inbound Leads & Outbound Event Relays</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">Webhooks</span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 p-3.5 text-center dark:border-emerald-900/60 dark:bg-emerald-950/40">
                <div className="flex items-center justify-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-200">
                  <Bot className="h-4 w-4 text-emerald-600" />
                  BlackArrow Unified Real-Time Engine
                </div>
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                  Customer WhatsApp Chats & Automated Sequences
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Status Explanation Section */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="mb-6 border-b border-gray-100 pb-5 dark:border-neutral-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Transparency</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
            Understanding Integration Availability
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
            BlackArrow uses clear, honest status labels for every integration capability so your operations team always knows what is ready to use today.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="inline-flex rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-neutral-100">Supported</h3>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Core platform capability available natively across all standard accounts without custom engineering.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="inline-flex rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Key className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-neutral-100">Where Configured</h3>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Functions when you provide your own API keys, website URLs, or external courier credentials in the dashboard.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="inline-flex rounded-xl bg-purple-100 p-2.5 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <Server className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-neutral-100">Developer Interface</h3>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Public REST endpoints and signed webhooks for engineering teams building custom integrations.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="inline-flex rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-neutral-100">Tenant-Isolated</h3>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              All credentials, tokens, and data payloads are strictly encrypted and separated per customer account.
            </p>
          </div>
        </div>
      </section>

      {/* WooCommerce Section */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300">
              <ShoppingCart className="h-3.5 w-3.5" />
              E-Commerce Connection
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
              WooCommerce Integration
            </h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Connect your WooCommerce store using read/write REST API keys. BlackArrow automatically pulls product catalogs, keeps pricing up to date, and lets your WhatsApp bot verify orders in real time.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Automatic catalog synchronization with descriptions, pricing, and stock status</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Cash-on-Delivery (COD) WhatsApp order verification flows to reduce return-to-origin (RTO)</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Real-time order status checks when customers ask &quot;where is my order?&quot;</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 dark:text-neutral-300">WooCommerce Sync Status</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Where Configured</span>
            </div>
            <div className="space-y-2.5 font-mono text-xs">
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-gray-400">Endpoint:</div>
                <div className="text-gray-900 dark:text-neutral-100 font-bold">https://yourstore.com/wp-json/wc/v3</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-gray-400">Permissions Required:</div>
                <div className="text-emerald-600 font-bold">Read / Write (Orders & Products)</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-gray-400">Security:</div>
                <div className="text-gray-900 dark:text-neutral-100">Consumer Key & Secret encrypted at rest</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WordPress & Website Knowledge Section */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="order-2 lg:order-1 rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 dark:text-neutral-300">Website Knowledge Synced</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">Auto Ingest</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs dark:bg-neutral-900">
                <span className="truncate font-medium text-gray-700 dark:text-neutral-300">/policies/shipping-and-returns</span>
                <span className="text-[10px] font-bold text-emerald-600">Synced</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs dark:bg-neutral-900">
                <span className="truncate font-medium text-gray-700 dark:text-neutral-300">/faq/delivery-timelines</span>
                <span className="text-[10px] font-bold text-emerald-600">Synced</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs dark:bg-neutral-900">
                <span className="truncate font-medium text-gray-700 dark:text-neutral-300">/about/company-information</span>
                <span className="text-[10px] font-bold text-emerald-600">Synced</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs dark:bg-neutral-900">
                <span className="truncate font-medium text-gray-700 dark:text-neutral-300">/services/custom-orders</span>
                <span className="text-[10px] font-bold text-emerald-600">Synced</span>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              <Globe className="h-3.5 w-3.5" />
              Website Knowledge Ingestion
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
              WordPress & Website Knowledge
            </h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Allow BlackArrow to learn your company policies, FAQs, service descriptions, and blog posts directly from your website or WordPress sitemap. Your AI assistant answers questions using your real published knowledge.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Automatic sitemap crawling with smart content extraction</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Instant AI grounding on delivery policies, warranty terms, and pricing FAQs</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Live preview & sync control in the authenticated dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Courier Integrations Section */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="mb-6 border-b border-gray-100 pb-5 dark:border-neutral-800">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <Truck className="h-3.5 w-3.5" />
            Logistics & Delivery
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
            Supported Courier System Integrations
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
            Provide your courier API credentials to enable live tracking lookups, automatic parcel status replies, and delivery updates for customers on WhatsApp.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-gray-900 dark:text-neutral-100">PostEx Courier</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-neutral-400">
              Live tracking API integration with PostEx. Enables tracking status queries, order lookup by tracking number, and automated status alerts.
            </p>
            <div className="mt-4 border-t border-gray-200/60 pt-3 text-[11px] text-gray-500 dark:border-neutral-800">
              Auth: PostEx API Token
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-gray-900 dark:text-neutral-100">Leopards Courier</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-neutral-400">
              Direct connection with Leopards COD and tracking systems. Automatically verifies parcel delivery stage for active customer chats.
            </p>
            <div className="mt-4 border-t border-gray-200/60 pt-3 text-[11px] text-gray-500 dark:border-neutral-800">
              Auth: Leopards API Key & Password
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-gray-900 dark:text-neutral-100">DHL Express / Global</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-neutral-400">
              Global parcel tracking via DHL Express Tracking API. Provides international shipment milestone tracking directly in WhatsApp conversations.
            </p>
            <div className="mt-4 border-t border-gray-200/60 pt-3 text-[11px] text-gray-500 dark:border-neutral-800">
              Auth: DHL Client ID & Secret
            </div>
          </div>
        </div>
      </section>

      {/* API & Webhooks Section */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <Webhook className="h-3.5 w-3.5" />
              Developer Tools
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
              Public REST API & Webhooks
            </h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Integrate your own CRM, lead forms, landing pages, or ERP with BlackArrow. Use scoped API keys for programmatic lead creation and receive HMAC-signed webhook events when customer conversations progress.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Inbound Lead Capture API: POST /api/public/v1/leads</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Outbound Webhook Relays: HMAC-SHA256 signature verification</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Idempotency protection to prevent duplicate sends and replay attacks</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-950 p-5 text-gray-200 shadow-xl dark:border-neutral-800">
            <div className="mb-3 flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="font-mono text-xs text-gray-400">POST /api/public/v1/leads</span>
              <span className="text-[10px] font-bold text-emerald-400">JSON Payload</span>
            </div>
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-gray-300">
{`{
  "name": "Ayesha Khan",
  "phone": "+144225232320",
  "city": "Lahore",
  "product_interest": "Winter Silk Collection",
  "source": "Landing Page Lead Form",
  "custom_fields": {
    "size": "Medium",
    "delivery_city": "Lahore"
  }
}`}
            </pre>
            <div className="mt-4 border-t border-gray-800 pt-3 text-[11px] text-gray-400">
              Headers: <span className="font-mono text-emerald-400">Authorization: Bearer bai_sec_***</span>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Matrix: Supported vs Not Claimed */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="mb-6 border-b border-gray-100 pb-5 dark:border-neutral-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Clarity & Governance</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
            Supported Integrations vs. Unclaimed Scope
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
            We are clear about what BlackArrow handles directly versus what requires standard webhook or developer configuration.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-gray-700 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-neutral-300">
                <th className="p-3.5 font-black">Feature / System</th>
                <th className="p-3.5 font-black">BlackArrow Status</th>
                <th className="p-3.5 font-black">Configuration Method</th>
                <th className="p-3.5 font-black">Operational Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              <tr>
                <td className="p-3.5 font-bold text-gray-900 dark:text-neutral-100">WooCommerce REST API</td>
                <td className="p-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span></td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Dashboard Consumer Key / Secret</td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Product sync, order verify, COD checks</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-gray-900 dark:text-neutral-100">WordPress Sitemap / FAQ Ingest</td>
                <td className="p-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span></td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Website URL in Website Knowledge</td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Crawl & extract business knowledge</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-gray-900 dark:text-neutral-100">PostEx & Leopards Courier API</td>
                <td className="p-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span></td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Courier API Token in Dashboard</td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Live parcel tracking in WhatsApp chats</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-gray-900 dark:text-neutral-100">Public Lead Intake API</td>
                <td className="p-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Supported</span></td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">REST API Key with write:leads</td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Connect web forms, landing pages</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-gray-900 dark:text-neutral-100">Custom Webhook Dispatch</td>
                <td className="p-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">Where Configured</span></td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Webhook Endpoint URL & Signing Secret</td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Dispatches order/lead events to external systems</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-gray-900 dark:text-neutral-100">Proprietary Closed ERPs</td>
                <td className="p-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 font-bold text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">Via Webhook/API</span></td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Custom middleware or webhook consumer</td>
                <td className="p-3.5 text-gray-600 dark:text-neutral-400">Use our REST API to push/pull records</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="rounded-[2rem] border border-gray-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/90 md:p-8">
        <div className="mb-6 border-b border-gray-100 pb-5 dark:border-neutral-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Questions & Answers</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-3xl">
            Integrations FAQ
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <h3 className="text-sm font-black text-gray-900 dark:text-neutral-100">Do I need developer skills to connect WooCommerce?</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              No. In WooCommerce Settings &rarr; Advanced &rarr; REST API, generate a Consumer Key and Consumer Secret, then paste them into the BlackArrow Integrations tab. The catalog sync runs automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <h3 className="text-sm font-black text-gray-900 dark:text-neutral-100">How often does Website Knowledge refresh?</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              You can trigger a fresh sync at any time with one click from the dashboard. Any updated policies, new products, or changed FAQs are re-indexed for your AI model instantly.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <h3 className="text-sm font-black text-gray-900 dark:text-neutral-100">How are courier tracking lookups handled?</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              When a customer inquires about their parcel, BlackArrow queries the configured courier API using the tracking number attached to their order or phone number and returns the exact milestone status.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 dark:border-neutral-800 dark:bg-neutral-950/50">
            <h3 className="text-sm font-black text-gray-900 dark:text-neutral-100">Are API keys and secrets secure?</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
              Yes. All third-party credentials (WooCommerce keys, courier tokens, webhook secrets) are encrypted at rest using AES-256 and never exposed on public endpoints.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="flex flex-col gap-6 rounded-[2.5rem] border border-emerald-200 bg-[radial-gradient(circle_at_top_right,rgba(37,211,102,0.18),transparent_40%),linear-gradient(135deg,rgba(240,253,244,0.98),rgba(255,255,255,0.98))] p-8 shadow-xl dark:border-emerald-900 dark:bg-[radial-gradient(circle_at_top_right,rgba(37,211,102,0.14),transparent_40%),linear-gradient(135deg,rgba(10,25,16,0.98),rgba(15,20,18,0.98))] md:flex-row md:items-center md:justify-between md:p-12">
        <div className="max-w-2xl">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Ready to Get Started?</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-4xl">
            Automate Your Store and Couriers with BlackArrow
          </h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-gray-700 dark:text-neutral-300">
            Start a 7-day free trial today. Connect your WhatsApp number, import your store catalog, and launch automated customer support in minutes.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row md:shrink-0">
          {onShowHome && (
            <button
              type="button"
              onClick={onShowHome}
              className="rounded-full border border-gray-300 bg-white px-6 py-3.5 text-xs font-black uppercase tracking-widest text-gray-800 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              Back Home
            </button>
          )}
          <button
            type="button"
            onClick={onStartTrial}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 transition-transform hover:-translate-y-0.5"
          >
            {primaryCtaLabel} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
