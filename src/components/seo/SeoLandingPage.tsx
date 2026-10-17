import React from "react";
import { ArrowRight, CheckCircle2, ChevronRight, FileText, Link2, MessageSquareQuote, ShieldCheck, Sparkles } from "lucide-react";
import { getBlogPath, getBlogPostBySlug } from "../../content/blog-posts";
import { SeoLandingPage as SeoLandingPageType } from "../../content/seo-landing-pages";

type SeoLandingPageProps = {
  page: SeoLandingPageType;
  isLoggedIn: boolean;
  onPrimaryAction: () => void;
};

export function SeoLandingPage({ page, isLoggedIn, onPrimaryAction }: SeoLandingPageProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f9f6,#eef5ef)] text-gray-900 dark:bg-[linear-gradient(180deg,#050806,#0a100c)] dark:text-white">
      <section className="relative overflow-hidden px-5 pb-12 pt-12 md:px-6 md:pb-16 md:pt-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_10%,rgba(37,211,102,0.18),transparent_26%),radial-gradient(circle_at_82%_14%,rgba(16,185,129,0.12),transparent_24%)]" />
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/86 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-white/[0.04] dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              {page.heroLabel}
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl md:text-6xl">
              {page.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300 md:text-lg">
              {page.heroSubtitle}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onPrimaryAction}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
              >
                {isLoggedIn ? "Go to dashboard" : "Start 7-day free trial"} <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/82 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
              >
                View pricing
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              <Chip>{page.primaryKeyword}</Chip>
              {page.secondaryKeywords.map((keyword) => (
                <div key={keyword}>
                  <Chip>{keyword}</Chip>
                </div>
              ))}
            </div>
          </div>

          <HeroVisual page={page} />
        </div>
      </section>

      <section className="px-5 py-8 md:px-6 md:py-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.9rem] border border-gray-200 bg-white/88 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] md:p-7">
            <SectionEyebrow>Overview</SectionEyebrow>
            <div className="mt-4 space-y-4">
              {page.intro.map((paragraph) => (
                <p key={paragraph} className="text-base font-medium leading-8 text-gray-700 dark:text-neutral-300">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.94))] p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))] md:p-7">
            <SectionEyebrow>Why teams look for this</SectionEyebrow>
            <div className="mt-4 grid gap-3">
              {page.problemPoints.map((point) => (
                <div key={point}>
                  <PointCard icon={MessageSquareQuote} text={point} tone="problem" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-8 md:px-6 md:py-10">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-gray-200 bg-white/90 p-6 shadow-[0_20px_48px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] md:p-8">
          <SectionEyebrow>How BlackArrow helps</SectionEyebrow>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {page.solutionPoints.map((point) => (
              <div key={point}>
                <PointCard icon={CheckCircle2} text={point} tone="solution" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-8 md:px-6 md:py-10">
        <div className="mx-auto max-w-7xl">
          <SectionEyebrow>Feature and use-case fit</SectionEyebrow>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">What this workflow can support</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {page.featureSections.map((feature) => (
              <article
                key={feature.title}
                className="public-card-hover rounded-[1.6rem] border border-gray-200 bg-white/88 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-xl font-black tracking-tight text-gray-950 dark:text-white">{feature.title}</h3>
                <p className="mt-3 text-sm font-medium leading-7 text-gray-600 dark:text-neutral-300">{feature.description}</p>
              </article>
            ))}
          </div>
          <p className="mt-6 max-w-4xl text-base font-medium leading-8 text-gray-600 dark:text-neutral-300">{page.useCaseSummary}</p>
        </div>
      </section>

      <section className="px-5 py-8 md:px-6 md:py-10">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-gray-200 bg-white/88 p-6 shadow-[0_20px_48px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] md:p-8">
          <SectionEyebrow>How it works</SectionEyebrow>
          <p className="mt-4 max-w-4xl text-base font-medium leading-8 text-gray-600 dark:text-neutral-300">{page.workflowIntro}</p>
          <div className="relative mt-7 grid gap-4 lg:grid-cols-4">
            <div className="public-connector absolute left-[8%] right-[8%] top-1/2 hidden h-px -translate-y-1/2 lg:block" />
            {[
              ["Connect WhatsApp", "Attach the business number and prepare the conversation workflow."],
              ["Train AI", "Set the business rules, product guidance, and response direction."],
              ["Reply and capture", "Handle repeated questions and gather the details that matter."],
              ["Monitor and handoff", "Review activity, pause when needed, and keep humans involved where it counts."],
            ].map(([title, body], index) => (
              <article key={title} className="relative rounded-[1.5rem] border border-gray-200 bg-gray-50/80 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">0{index + 1}</span>
                </div>
                <h3 className="text-lg font-black text-gray-950 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-7 text-gray-600 dark:text-neutral-300">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-8 md:px-6 md:py-10">
        <div className="mx-auto max-w-7xl grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-[1.8rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.94))] p-6 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))]">
            <SectionEyebrow>Important note</SectionEyebrow>
            <p className="mt-4 text-base font-medium leading-8 text-gray-700 dark:text-neutral-300">{page.complianceNote}</p>
          </div>

          <div className="rounded-[1.8rem] border border-gray-200 bg-white/90 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035]">
            <SectionEyebrow>Related resources</SectionEyebrow>
            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              <ResourceGroup icon={Link2} title="Core links" links={page.internalLinks} />
              <ResourceGroup icon={ChevronRight} title="Related solutions" links={page.relatedSolutionLinks} />
              <ResourceGroup
                icon={FileText}
                title="Related blog posts"
                links={page.relatedBlogPosts.map((slug) => {
                  const post = getBlogPostBySlug(slug);
                  return {
                    href: getBlogPath(slug),
                    label: post?.title || slug,
                  };
                })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-8 md:px-6 md:py-10">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-gray-200 bg-white/90 p-6 shadow-[0_20px_48px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] md:p-8">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white">Common questions</h2>
          <p className="mt-4 max-w-4xl text-base font-medium leading-8 text-gray-600 dark:text-neutral-300">{page.faqIntro}</p>
          <div className="mt-6 grid gap-4">
            {page.faqs.map((faq) => (
              <article key={faq.question} className="rounded-[1.4rem] border border-gray-200 bg-gray-50/85 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">{faq.question}</h3>
                <p className="mt-3 text-sm font-medium leading-7 text-gray-600 dark:text-neutral-300">{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-8 md:px-6 md:pb-20">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.95))] p-6 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))] md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.46fr] lg:items-center">
            <div>
              <SectionEyebrow>Final CTA</SectionEyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-5xl">{page.ctaText}</h2>
              <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">
                Start with a narrow workflow, review live results carefully, and expand only after your team is comfortable with the process.
              </p>
            </div>
            <div className="grid gap-3">
              <button
                onClick={onPrimaryAction}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
              >
                {isLoggedIn ? "Go to dashboard" : "Start 7-day free trial"} <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="/docs"
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/82 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
              >
                Read docs
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroVisual({ page }: { page: SeoLandingPageType }) {
  return (
    <div className="public-tilt rounded-[2rem] border border-gray-200 bg-white/88 p-5 shadow-[0_22px_52px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.04] md:p-6">
      <div className="rounded-[1.6rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-5 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(7,24,15,0.96),rgba(8,13,10,0.98))]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">{page.primaryKeyword}</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">Conversation workflow snapshot</h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
            <MessageSquareQuote className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-6 grid gap-3">
          {[
            "Customer asks a question or sends a voice note",
            "AI replies using business context and reusable guidance",
            "Missing details are collected for support or orders",
            "Team reviews, pauses, or hands off when needed",
          ].map((row, index) => (
            <div key={row} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/84 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
                0{index + 1}
              </span>
              <span className="text-sm font-bold text-gray-800 dark:text-neutral-100">{row}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResourceGroup({
  icon: Icon,
  title,
  links,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="rounded-[1.4rem] border border-gray-200 bg-gray-50/85 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-800 dark:text-neutral-100">{title}</h3>
      </div>
      <div className="mt-4 grid gap-3">
        {links.map((link) => (
          <a
            key={`${title}-${link.href}`}
            href={link.href}
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 transition-colors hover:text-emerald-700 dark:text-neutral-300 dark:hover:text-emerald-300"
          >
            <ArrowRight className="h-4 w-4" />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function PointCard({
  icon: Icon,
  text,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: "problem" | "solution";
}) {
  return (
    <div
      className={`rounded-[1.4rem] border px-4 py-4 ${
        tone === "solution"
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/25"
          : "border-gray-200 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "solution" ? "text-emerald-600 dark:text-emerald-300" : "text-gray-500 dark:text-neutral-400"}`} />
        <span className="text-sm font-bold leading-7 text-gray-800 dark:text-neutral-100">{text}</span>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200">
      {children}
    </span>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">{children}</p>;
}
