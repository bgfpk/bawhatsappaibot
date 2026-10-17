import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Book,
  Bot,
  CheckCircle2,
  Globe,
  Link2,
  MessageSquare,
  Package,
  Shield,
  ShoppingCart,
  Users,
  Wallet,
  Workflow,
  Zap,
} from "lucide-react";
import {
  AI_USAGE_EXAMPLES,
  AI_USAGE_RATES,
  AUTOMATION_USAGE_EXAMPLES,
  BETA_PLAN_DISCOUNT_EXPLANATION,
  BETA_PLAN_DISCOUNT_LABEL,
  BILLING_ADDONS,
  BILLING_PLAN_DETAILS,
  BILLING_PLAN_IDS,
  FOUNDING_YEARLY_DISCOUNT_LABEL,
  FULL_SETUP_PRICE,
  getPlanDisplayPricing,
  WALLET_TOPUP_AMOUNTS,
} from "../config/pricing";
import { DOCS_PAGES, DocsPage, getDocsPageFromPath, getDocsPagePath } from "../content/docs-pages";
import { CRM_UI_ENABLED, CRM_UI_PAUSED_MESSAGE } from "../config/product-flags";

const planCards = BILLING_PLAN_IDS.map((id) => BILLING_PLAN_DETAILS[id]);
const visibleDocsPages = CRM_UI_ENABLED ? DOCS_PAGES : DOCS_PAGES.filter((page) => page.slug !== "crm-pipeline-smart-actions");
const docsIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "getting-started": Zap,
  "whatsapp-setup": Link2,
  "intelligence-reply-behavior": Bot,
  "products-services-media-sequences": Package,
  "crm-pipeline-smart-actions": Users,
  "followups-customer-updates": Workflow,
  "api-webhooks": Link2,
  "website-knowledge-wordpress": Globe,
  "daily-operations-safe-controls": Shield,
  "plans-wallet-source-values": Wallet,
  "launch-safety-client-responsibility": AlertTriangle,
};

export default function HelpDocs({ onBack }: { onBack?: () => void }) {
  const pathname = typeof window === "undefined" ? "/docs" : window.location.pathname;
  const currentPage = getDocsPageFromPath(pathname);

  if (!CRM_UI_ENABLED && currentPage?.slug === "crm-pipeline-smart-actions") {
    return <PausedDocsPage onBack={onBack} />;
  }

  if (currentPage) {
    return <DocsDetailPage page={currentPage} onBack={onBack} />;
  }

  return <DocsIndexPage onBack={onBack} />;
}

function DocsIndexPage({ onBack }: { onBack?: () => void }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 selection:bg-emerald-500/20 dark:bg-neutral-950 dark:text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:px-10 md:py-14">
        <header className="rounded-[2rem] border border-gray-200 bg-gradient-to-br from-white via-emerald-50 to-lime-50 p-6 shadow-sm dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-emerald-950/30 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-800 dark:bg-neutral-900/80 dark:text-emerald-300">
                <Book className="h-4 w-4" />
                Client Documentation
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">BlackArrow practical docs for clients</h1>
              <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
                Open a full guide for setup, WhatsApp connection, AI configuration, follow-ups, customer updates, API/webhooks, WooCommerce, WordPress Website Connector, Website Knowledge, billing, troubleshooting, and launch safety.
              </p>
              <p className="mt-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                Need strategy examples too? Read the{" "}
                <a href="/blog" className="underline decoration-emerald-300 underline-offset-4 hover:text-emerald-600 dark:decoration-emerald-800 dark:hover:text-emerald-200">
                  BlackArrow blog
                </a>
                {" "}or explore the{" "}
                <a href="/whatsapp-automation" className="underline decoration-emerald-300 underline-offset-4 hover:text-emerald-600 dark:decoration-emerald-800 dark:hover:text-emerald-200">
                  solution pages
                </a>
                .
              </p>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
              >
                Back
              </button>
            )}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <StatCard icon={MessageSquare} label="WhatsApp setup" text="Instance Hub, QR scan, reconnect, and connection states" />
            <StatCard icon={Users} label="Customer context" text="Profiles, follow-up signals, lead capture, and conversation history" />
            <StatCard icon={Globe} label="Integrations" text="API/webhooks, WooCommerce, WordPress, and Website Knowledge" />
            <StatCard icon={Wallet} label="Billing" text="Trial, plans, wallet usage, and successful-send charging" />
          </div>
        </header>

        <section>
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Docs index</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">Open the full guide you need</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {visibleDocsPages.map((page) => {
              const Icon = docsIconMap[page.slug] || Book;
              return (
                <a
                  key={page.slug}
                  href={getDocsPagePath(page.slug)}
                  className="public-card-hover rounded-[1.8rem] border border-gray-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900 md:p-7"
                >
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-2xl font-black tracking-tight text-gray-950 dark:text-white">{page.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-gray-600 dark:text-neutral-300">{page.summary}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                    Open guide <ArrowRight className="h-4 w-4" />
                  </span>
                </a>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-gray-200 bg-gray-50 p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:p-7">
          <div className="flex items-center gap-3">
            <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-2xl font-black tracking-tight">Plans, wallet, and current source values</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
            These values are rendered from the pricing configuration used by the app. If your own Billing page shows account-specific totals after add-ons, follow the values shown there.
          </p>
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
            {BETA_PLAN_DISCOUNT_LABEL} {BETA_PLAN_DISCOUNT_EXPLANATION}
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {planCards.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black">{plan.name}</h3>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Beta pricing</span>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-black text-gray-400 line-through dark:text-neutral-500">
                    Regular ${getPlanDisplayPricing(plan.id).regularMonthlyPrice}/mo
                  </p>
                  <p className="text-2xl font-black text-gray-950 dark:text-white">
                    Now ${getPlanDisplayPricing(plan.id).currentMonthlyPrice}/mo
                  </p>
                  <p className="mt-1 text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">
                    {getPlanDisplayPricing(plan.id).betaDiscountPercent}% off until {getPlanDisplayPricing(plan.id).betaDiscountEndsLabel}
                  </p>
                  <p className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">{FOUNDING_YEARLY_DISCOUNT_LABEL}</p>
                </div>
                <div className="mt-4 space-y-2 text-sm font-medium text-gray-700 dark:text-neutral-300">
                  <PlanLine icon={MessageSquare} text={`${plan.included_instances} included instances, up to ${plan.max_instances} max`} />
                  <PlanLine icon={Package} text={`${plan.included_products} included products/services, up to ${plan.max_products} max`} />
                  <PlanLine icon={Users} text={`${plan.customers.toLocaleString()} customers`} />
                  <PlanLine icon={ShoppingCart} text={`${plan.ordersPerMonth.toLocaleString()} orders/month`} />
                  <PlanLine icon={Workflow} text={`${plan.mediaTemplates.toLocaleString()} media templates, ${plan.mediaGroups} media groups, ${plan.sequenceGroups} sequence groups`} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <SafetyCard
            icon={AlertTriangle}
            title="Launch safely"
            text="Test with a separate WhatsApp number first. Confirm connection, reply mode, wallet balance, products, media groups, welcome flow, and at least one real order path before going live."
          />
          <SafetyCard
            icon={Shield}
            title="Client responsibility"
            text="Clients remain responsible for messaging compliance, customer consent, pricing accuracy, delivery promises, and safe WhatsApp behavior. BlackArrow provides the tooling, but you control how it is used."
          />
        </section>
      </div>
    </div>
  );
}

function DocsDetailPage({ page, onBack }: { page: DocsPage; onBack?: () => void }) {
  const currentIndex = visibleDocsPages.findIndex((entry) => entry.slug === page.slug);
  const previousPage = currentIndex > 0 ? visibleDocsPages[currentIndex - 1] : null;
  const nextPage = currentIndex < visibleDocsPages.length - 1 ? visibleDocsPages[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-white text-gray-900 selection:bg-emerald-500/20 dark:bg-neutral-950 dark:text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <a
          href="/docs"
          className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to docs
        </a>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-[2rem] border border-gray-200 bg-gradient-to-br from-white via-emerald-50 to-lime-50 p-6 shadow-sm dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-emerald-950/30 md:p-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white/85 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-800 dark:bg-neutral-900/80 dark:text-emerald-300">
              <Book className="h-4 w-4" />
              Docs Detail
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">{page.title}</h1>
            <p className="mt-4 max-w-3xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{page.summary}</p>
            <div className="mt-6 space-y-4">
              {page.intro.map((paragraph) => (
                <p key={paragraph} className="text-base font-medium leading-8 text-gray-700 dark:text-neutral-300">
                  {paragraph}
                </p>
              ))}
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              >
                Go to dashboard
              </button>
            )}
          </div>

          <aside className="h-fit rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 xl:sticky xl:top-28">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-500 dark:text-neutral-400">Table of contents</h2>
            <div className="mt-4 grid gap-3">
              {page.sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
                >
                  <span className="mr-2 text-xs text-gray-400 dark:text-neutral-500">0{index + 1}</span>
                  {section.title}
                </a>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <article className="rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:p-8">
            <div className="space-y-10">
              {page.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white md:text-3xl">{section.title}</h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph) => (
                      <p key={paragraph} className="text-base font-medium leading-8 text-gray-700 dark:text-neutral-300">
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {section.steps?.length ? (
                    <div className="mt-5 rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5 dark:border-neutral-800 dark:bg-neutral-950">
                        <h3 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">Steps</h3>
                        <div className="mt-4 grid gap-3">
                          {section.steps.map((step, index) => (
                            <div key={step}>
                              <StepLine index={index + 1} text={step} />
                            </div>
                          ))}
                        </div>
                      </div>
                  ) : null}

                  {section.warnings?.length ? (
                    <div className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
                        <h3 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">Warnings</h3>
                        <div className="mt-4 grid gap-3">
                          {section.warnings.map((warning) => (
                            <div key={warning}>
                              <CalloutLine icon={AlertTriangle} tone="warning" text={warning} />
                            </div>
                          ))}
                        </div>
                      </div>
                  ) : null}

                  {section.bestPractices?.length ? (
                    <div className="mt-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
                        <h3 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">Best practices</h3>
                        <div className="mt-4 grid gap-3">
                          {section.bestPractices.map((tip) => (
                            <div key={tip}>
                              <CalloutLine icon={CheckCircle2} tone="success" text={tip} />
                            </div>
                          ))}
                        </div>
                      </div>
                  ) : null}
                </section>
              ))}
            </div>

            {page.slug === "plans-wallet-source-values" ? <PricingReferenceBlock /> : null}

            <div className="mt-10 rounded-[1.8rem] border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <h2 className="text-2xl font-black tracking-tight">{page.ctaTitle}</h2>
              <p className="mt-3 text-base font-medium leading-8 text-emerald-950/80 dark:text-emerald-100/80">{page.ctaBody}</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/"
                  className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-black text-white"
                >
                  Start 7-day free trial <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="https://wa.me/923136923129"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-6 py-3 text-sm font-black text-gray-900 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100"
                >
                  Contact support
                </a>
              </div>
            </div>
          </article>

          <aside className="space-y-5">
            <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-500 dark:text-neutral-400">Related docs</h2>
              <div className="mt-4 grid gap-3">
                {page.relatedDocs.filter((slug) => CRM_UI_ENABLED || slug !== "crm-pipeline-smart-actions").map((slug) => {
                  const related = visibleDocsPages.find((entry) => entry.slug === slug);
                  if (!related) return null;
                  return (
                    <a
                      key={slug}
                      href={getDocsPagePath(slug)}
                      className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300"
                    >
                      {related.title}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-500 dark:text-neutral-400">Related links</h2>
              <div className="mt-4 grid gap-3">
                {page.relatedLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 transition-colors hover:text-emerald-700 dark:text-neutral-300 dark:hover:text-emerald-300"
                  >
                    <ArrowRight className="h-4 w-4" />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-gray-500 dark:text-neutral-400">Docs navigation</h2>
              <div className="mt-4 grid gap-3">
                {previousPage ? (
                  <a href={getDocsPagePath(previousPage.slug)} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                    Previous: {previousPage.shortLabel}
                  </a>
                ) : null}
                {nextPage ? (
                  <a href={getDocsPagePath(nextPage.slug)} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                    Next: {nextPage.shortLabel}
                  </a>
                ) : null}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function PricingReferenceBlock() {
  return (
    <section className="mt-10 rounded-[1.75rem] border border-gray-200 bg-gray-50 p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 md:p-7">
      <div className="flex items-center gap-3">
        <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
        <h2 className="text-2xl font-black tracking-tight">Current visible pricing references</h2>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {planCards.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-black">{plan.name}</h3>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Beta pricing</span>
            </div>
            <div className="mt-4">
              <p className="text-sm font-black text-gray-400 line-through dark:text-neutral-500">
                Regular ${getPlanDisplayPricing(plan.id).regularMonthlyPrice}/mo
              </p>
              <p className="text-2xl font-black text-gray-950 dark:text-white">
                Now ${getPlanDisplayPricing(plan.id).currentMonthlyPrice}/mo
              </p>
              <p className="mt-1 text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">
                {getPlanDisplayPricing(plan.id).betaDiscountPercent}% off until {getPlanDisplayPricing(plan.id).betaDiscountEndsLabel}
              </p>
              <p className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">{FOUNDING_YEARLY_DISCOUNT_LABEL}</p>
            </div>
            <div className="mt-4 space-y-2 text-sm font-medium text-gray-700 dark:text-neutral-300">
              <PlanLine icon={MessageSquare} text={`${plan.included_instances} included instances, up to ${plan.max_instances} max`} />
              <PlanLine icon={Package} text={`${plan.included_products} included products/services, up to ${plan.max_products} max`} />
              <PlanLine icon={Users} text={`${plan.customers.toLocaleString()} customers`} />
              <PlanLine icon={ShoppingCart} text={`${plan.ordersPerMonth.toLocaleString()} orders/month`} />
            </div>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-lg font-black">Wallet usage rates shown in source</h3>
          <div className="mt-4 space-y-3">
            {AI_USAGE_RATES.map((rate) => (
              <div key={rate.label} className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-neutral-950">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    {rate.badge ? <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">{rate.badge}</p> : null}
                    <span>{rate.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-600 dark:text-emerald-300">{rate.price}</span>
                    {rate.regularPrice ? <p className="mt-1 text-[11px] font-bold text-gray-400 dark:text-neutral-500">{rate.regularPrice}</p> : null}
                    {rate.savings ? <p className="text-[11px] font-black text-amber-600 dark:text-amber-300">{rate.savings}</p> : null}
                  </div>
                </div>
                {rate.compactCharge ? <p className="mt-1 text-[11px] font-bold text-gray-600 dark:text-neutral-300">{rate.compactCharge}</p> : null}
                {rate.note ? <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400 dark:text-neutral-500">{rate.note}</p> : null}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-neutral-950">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-neutral-500">Common AI charging examples</p>
            <div className="mt-3 space-y-3 text-sm font-medium text-gray-700 dark:text-neutral-300">
              {AI_USAGE_EXAMPLES.map((example) => (
                <div key={example.label} className="rounded-xl bg-white px-4 py-3 dark:bg-neutral-900">
                  <p className="font-black text-gray-900 dark:text-white">{example.label}</p>
                  <div className="mt-2 space-y-1.5">
                    {example.lines.map((line) => (
                      <div key={`${example.label}-${line.action}`} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <span>{line.label}</span>
                        <span className="text-emerald-600 dark:text-emerald-300">{line.price}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-col gap-0.5 border-t border-gray-200 pt-2 font-black text-gray-900 dark:border-neutral-800 dark:text-white sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span>Total</span>
                    <span className="text-emerald-600 dark:text-emerald-300">{example.total}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {AUTOMATION_USAGE_EXAMPLES.map((example) => (
                <div key={example.label} className="rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20">
                  <p className="font-black text-gray-900 dark:text-white">{example.label}</p>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <span>{example.detail}</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-300">{example.total}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-lg font-black">Add-ons and wallet</h3>
          <div className="mt-4 space-y-3">
            {BILLING_ADDONS.map((addon) => (
              <div key={addon.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-neutral-950">
                <span>{addon.name}</span>
                <span className="text-emerald-600 dark:text-emerald-300">{addon.price}</span>
              </div>
            ))}
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-neutral-950">Full account setup: ${FULL_SETUP_PRICE} one-time</div>
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-bold break-words dark:bg-neutral-950">
              Wallet top-up amounts: {WALLET_TOPUP_AMOUNTS.map((amount) => `$${amount}`).join(", ")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, text }: { icon: React.ComponentType<{ className?: string }>; label: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
      <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
      <p className="mt-3 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-500">{label}</p>
      <p className="mt-2 text-sm font-medium leading-relaxed text-gray-700 dark:text-neutral-300">{text}</p>
    </div>
  );
}

function PausedDocsPage({ onBack }: { onBack?: () => void }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 selection:bg-emerald-500/20 dark:bg-neutral-950 dark:text-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 md:px-10">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Paused guide</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">CRM is currently paused</h1>
          <p className="mt-3 text-base font-medium leading-relaxed text-gray-700 dark:text-neutral-300">{CRM_UI_PAUSED_MESSAGE}</p>
          {onBack ? (
            <button
              onClick={onBack}
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
            >
              Back
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PlanLine({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <span>{text}</span>
    </div>
  );
}

function SafetyCard({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
      <h3 className="mt-4 text-xl font-black tracking-tight">{title}</h3>
      <p className="mt-3 text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{text}</p>
    </div>
  );
}

function StepLine({ index, text }: { index: number; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        {index}
      </span>
      <span className="text-sm font-medium leading-7 text-gray-700 dark:text-neutral-300">{text}</span>
    </div>
  );
}

function CalloutLine({
  icon: Icon,
  tone,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "warning" | "success";
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-white/70 px-4 py-3 dark:bg-white/[0.04]">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "warning" ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}`} />
      <span className="text-sm font-medium leading-7 text-gray-700 dark:text-neutral-300">{text}</span>
    </div>
  );
}
