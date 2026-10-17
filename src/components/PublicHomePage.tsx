import React from "react";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  CheckCircle2,
  ImageIcon,
  MessageSquare,
  Package,
  PauseCircle,
  QrCode,
  Send,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import {
  DashboardMockup,
  FAQSection,
  FeatureCard,
  HeroProductMockup,
  IntegrationCard,
  PricingSection,
} from "./public/PublicVisuals";
import { trackAnalyticsEvent } from "../lib/analytics";
import { TutorialVideoCard } from "./TutorialVideoCard";

type PublicHomePageProps = {
  isDarkMode?: boolean;
  isLoggedIn: boolean;
  onStartTrial: () => void;
  onShowPricing: () => void;
  onShowFeatures: () => void;
};

const trustPoints = [
  { label: "QR connection", icon: QrCode },
  { label: "Text, voice, image", icon: AudioLines },
  { label: "Order capture", icon: ShoppingCart },
  { label: "Wallet visibility", icon: Wallet },
  { label: "Pause and handoff", icon: PauseCircle },
];

const problemPoints = ["Missed leads", "Slow replies", "Manual order collection"];
const solutionPoints = ["Faster replies", "Captured orders", "Clear dashboard"];

const howItWorks = [
  { title: "Connect WhatsApp", body: "Scan QR and attach a number.", icon: QrCode },
  { title: "Train AI", body: "Add products, rules, and templates.", icon: BrainCircuit },
  { title: "Reply and capture", body: "Answer chats and save order details.", icon: Send },
  { title: "Monitor and handoff", body: "Pause automation when a human is needed.", icon: ShieldCheck },
];

const featureCards = [
  {
    title: "Text, image, and voice understanding",
    body: "Handle common customer message formats in one workflow.",
    icon: ImageIcon,
  },
  {
    title: "Voice reply modes",
    body: "Choose when replies should stay text-first or use voice.",
    icon: AudioLines,
  },
  {
    title: "Products and templates",
    body: "Send clean product details, photos, and reusable answers.",
    icon: Package,
  },
  {
    title: "Order and customer capture",
    body: "Turn important chat details into structured records.",
    icon: ShoppingCart,
  },
  {
    title: "Billing and wallet visibility",
    body: "Keep plan limits, usage, and wallet spend easy to see.",
    icon: Wallet,
  },
  {
    title: "Pause and human handoff",
    body: "Step in quickly when a conversation needs your team.",
    icon: PauseCircle,
  },
];

const integrations = [
  { name: "PostEx", status: "Active" as const },
  { name: "Leopards", status: "Active" as const },
  { name: "FedEx", status: "Coming soon" as const },
  { name: "DHL", status: "Coming soon" as const },
  { name: "Aramex", status: "Coming soon" as const },
  { name: "SMSA Express", status: "Coming soon" as const },
];

const faqs = [
  {
    question: "Is it official WhatsApp API?",
    answer:
      "BlackArrow should only be described as official API based when that setup is explicitly live for the account.",
  },
  {
    question: "Can it reply to voice notes?",
    answer: "Yes. Voice behavior is controlled by reply mode settings so cost and experience stay predictable.",
  },
  {
    question: "Can it send product photos and templates?",
    answer: "Yes. Products, media, and reusable templates can support faster customer replies.",
  },
  {
    question: "Can I pause the bot?",
    answer: "Yes. You can pause automation and hand the chat to a human when needed.",
  },
  {
    question: "How does billing work?",
    answer: "Plans and usage rates come from the shared pricing source, with wallet usage shown separately.",
  },
];

const PRODUCT_HUNT_BADGE_HREF =
  "https://www.producthunt.com/products/blackarrow?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-blackarrow";
const PRODUCT_HUNT_BADGE_SRC =
  "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1164315&theme=light&t=1780748841342";

export function PublicHomePage({
  isLoggedIn,
  onStartTrial,
  onShowPricing,
  onShowFeatures,
}: PublicHomePageProps) {
  return (
    <>
      <section className="public-saas-hero relative overflow-hidden px-5 pb-12 pt-8 md:px-6 md:pb-16 md:pt-14">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-9 xl:grid-cols-[0.86fr_1.14fr]">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/78 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm backdrop-blur-xl dark:border-emerald-900 dark:bg-white/[0.04] dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Built for WhatsApp sales teams
            </div>

            <h1 className="text-4xl font-black leading-[0.98] tracking-tight text-gray-950 dark:text-white sm:text-5xl md:text-6xl">
              Turn WhatsApp Chats Into Orders, Support, and Follow-ups Automatically
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300 md:text-lg">
              BlackArrow connects your WhatsApp number with an AI assistant that replies to customers, handles voice notes, sends product/media templates, captures order details, and keeps usage visible.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onStartTrial}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
              >
                {isLoggedIn ? "Go to dashboard" : "Start 7-day free trial"} <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/78 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
              >
                See how it works
              </button>
            </div>

            <div className="mt-5">
              <TutorialVideoCard className="max-w-2xl" eyebrow="Tutorial" />
            </div>

            <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <ProductHuntBadge size="hero" />
              <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
                Follow the launch on Product Hunt.
              </p>
            </div>

            <button
              onClick={onShowFeatures}
              className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:text-emerald-500 dark:text-emerald-300"
            >
              Explore features <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <a
              href="/blog"
              className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-gray-600 transition-colors hover:text-emerald-600 dark:text-neutral-300 dark:hover:text-emerald-300"
            >
              Read the blog <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <HeroProductMockup />
        </div>
      </section>

      <section className="px-5 py-8 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {trustPoints.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="public-saas-panel flex items-center gap-3 rounded-2xl px-4 py-3">
                <Icon className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-black text-gray-800 dark:text-neutral-100">{item.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-5 py-4 md:px-6 md:py-6">
        <div className="public-saas-panel mx-auto max-w-7xl rounded-[1.7rem] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Solution pages</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">Explore buyer-focused WhatsApp workflows</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { href: "/whatsapp-automation", label: "WhatsApp Automation" },
                { href: "/ai-whatsapp-bot", label: "AI WhatsApp Bot" },
                { href: "/whatsapp-customer-support", label: "Customer Support" },
                { href: "/ecommerce-whatsapp-bot", label: "Ecommerce Bot" },
                { href: "/whatsapp-order-capture", label: "Order Capture" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-black text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-200 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
          <ProblemCard title="Manual WhatsApp gets messy" points={problemPoints} tone="problem" />
          <ProblemCard title="BlackArrow keeps it organized" points={solutionPoints} tone="solution" />
        </div>
      </section>

      <section id="how-it-works" className="px-5 py-12 md:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="How it works" title="Four steps from chat chaos to clear operations" />
          <div className="relative mt-7 grid gap-4 lg:grid-cols-4">
            <div className="public-connector absolute left-[8%] right-[8%] top-1/2 hidden h-px -translate-y-1/2 lg:block" />
            {howItWorks.map((item, index) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="public-card-hover relative rounded-[1.45rem] border border-gray-200 bg-white/84 p-5 dark:border-white/10 dark:bg-white/[0.035]">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">0{index + 1}</span>
                  </div>
                  <h3 className="text-lg font-black text-gray-950 dark:text-white">{item.title}</h3>
                  <p className="mt-2 text-sm font-medium text-gray-600 dark:text-neutral-300">{item.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 md:px-6">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <SectionHeading
            eyebrow="Product"
            title="One workspace for chats, orders, wallet, and reply control"
            body="Large readable panels show what matters without forcing buyers to inspect tiny screenshots."
          />
          <DashboardMockup />
        </div>
      </section>

      <section id="features" className="px-5 py-12 md:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Features" title="The essentials without the clutter" />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((card) => (
              <div key={card.title}>
                <FeatureCard icon={card.icon} title={card.title} body={card.body} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="integrations" className="px-5 py-12 md:px-6">
        <div className="mx-auto max-w-7xl rounded-[1.8rem] border border-gray-200 bg-white/72 p-5 dark:border-white/10 dark:bg-white/[0.035] md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <SectionHeading eyebrow="Integrations" title="Courier support, clearly labeled" />
            <p className="max-w-md text-sm font-medium text-gray-600 dark:text-neutral-300">
              Planned integrations are shown as coming soon, not live.
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => (
              <div key={integration.name}>
                <IntegrationCard name={integration.name} status={integration.status} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-5 py-12 md:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="Pricing" title="Simple plans with usage kept visible" />
          <div className="mt-7">
            <PricingSection onStart={onStartTrial} showUsageSection={false} />
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-[1.35rem] border border-gray-200 bg-white/82 px-4 py-4 text-sm font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-neutral-300 md:flex-row md:items-center md:justify-between">
            <p>Wallet billing covers AI usage plus paid outgoing automation sends. Full rates and examples are on the pricing page.</p>
            <button
              onClick={onShowPricing}
              className="inline-flex items-center gap-2 self-start text-xs font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:text-emerald-500 dark:text-emerald-300"
            >
              View full pricing <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-500 dark:text-neutral-400">Pricing is shown in USD from the shared app configuration.</p>
        </div>
      </section>

      <section className="px-5 py-12 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.58fr_1fr]">
          <SectionHeading eyebrow="FAQ" title="Quick answers before you start" />
          <FAQSection items={faqs} />
        </div>
      </section>

      <section className="px-5 py-14 md:px-6">
        <div className="mx-auto max-w-7xl rounded-[1.9rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(255,255,255,0.96))] p-6 dark:border-emerald-900 dark:bg-[linear-gradient(135deg,rgba(5,28,16,0.96),rgba(7,12,10,0.98))] md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.55fr] lg:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Ready to launch</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-5xl">
                Ready to automate your WhatsApp support and sales?
              </h2>
            </div>
            <div className="grid gap-3">
              <button
                onClick={onStartTrial}
                className="public-primary-button inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-black transition-colors"
              >
                {isLoggedIn ? "Go to dashboard" : "Start 7-day free trial"} <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={onShowPricing}
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/78 px-6 py-3.5 text-sm font-black text-gray-900 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-100"
              >
                View pricing
              </button>
              <div className="pt-1">
                <ProductHuntBadge size="compact" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductHuntBadge({ size }: { size: "hero" | "compact" }) {
  const compact = size === "compact";

  return (
    <a
      href={PRODUCT_HUNT_BADGE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAnalyticsEvent("product_hunt_badge_click", { placement: size })}
      className={`inline-flex rounded-2xl border border-gray-200 bg-white/88 p-2 shadow-sm transition-transform transition-colors hover:-translate-y-0.5 hover:border-orange-300 dark:border-white/10 dark:bg-white/[0.06] ${
        compact ? "self-start" : ""
      }`}
      aria-label="Open BlackArrow on Product Hunt"
    >
      <img
        alt="BlackArrow - WhatsApp AI assistant for sales and support | Product Hunt"
        width="250"
        height="54"
        src={PRODUCT_HUNT_BADGE_SRC}
        className={compact ? "h-auto w-[200px] max-w-full" : "h-auto w-[230px] max-w-full sm:w-[250px]"}
        loading="eager"
        decoding="async"
      />
    </a>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-base font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{body}</p>}
    </div>
  );
}

function ProblemCard({
  title,
  points,
  tone,
}: {
  title: string;
  points: string[];
  tone: "problem" | "solution";
}) {
  const positive = tone === "solution";
  return (
    <article className={`rounded-[1.7rem] border p-6 ${positive ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/25" : "border-gray-200 bg-white/78 dark:border-white/10 dark:bg-white/[0.035]"}`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">{title}</h2>
        {positive ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <MessageSquare className="h-6 w-6 text-rose-500" />}
      </div>
      <div className="mt-5 grid gap-3">
        {points.map((point) => (
          <div key={point} className="flex items-center gap-3 rounded-2xl bg-white/72 px-4 py-3 dark:bg-white/6">
            {positive ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <ArrowRight className="h-4 w-4 text-rose-500" />}
            <span className="text-sm font-black text-gray-800 dark:text-neutral-100">{point}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
