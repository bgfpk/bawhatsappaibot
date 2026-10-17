import React from "react";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Globe2,
  Link2,
  Megaphone,
  MessageSquare,
  Mic,
  Package,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import { Dashboard3DMockup, FeatureCard } from "./public/PublicVisuals";
import { CRM_UI_ENABLED } from "../config/product-flags";

type Feature = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

type FeatureGroup = {
  eyebrow: string;
  title: string;
  summary: string;
  features: Feature[];
};

type FeaturesPageProps = {
  onShowHome: () => void;
  onShowPricing: () => void;
  onStartTrial: () => void;
  primaryCtaLabel: string;
};

const featureGroups: FeatureGroup[] = [
  {
    eyebrow: "WhatsApp AI assistant",
    title: "AI sales and support replies for active WhatsApp conversations",
    summary: "Connect a client-controlled WhatsApp identity, shape reply behavior, and keep staff in charge of sensitive moments.",
    features: [
      { title: "Instance Hub", description: "Connect, monitor, reset, and reconnect WhatsApp instances with clear connection states.", icon: Link2 },
      { title: "Reply modes", description: "Choose Always Text, Always Voice, Customer Preference, or Text Preferred for safer launch control.", icon: Bot },
      { title: "Voice and image understanding", description: "Handle voice notes and images where supported while keeping staff review available for unclear cases.", icon: Mic },
      { title: "Human handoff", description: "Pause, stop, or resume customer-level automation when staff need to take over.", icon: ShieldCheck },
    ],
  },
  {
    eyebrow: "Lead capture",
    title: "Turn WhatsApp and website conversations into tracked leads",
    summary: "Lead capture, follow-up readiness, assignment signals, and source tracking stay visible without overclaiming a larger workflow suite.",
    features: [
      { title: "Lead detail drawer", description: "Open full lead details without squeezing the customer list or conversation workspace.", icon: Users },
      { title: "Follow-up readiness", description: "Track which customers need replies, follow-ups, or a handoff from AI to staff.", icon: Workflow },
      { title: "Source tracking", description: "Keep WhatsApp, website, WooCommerce, API, and manual lead sources visible.", icon: Sparkles },
      { title: "Operational visibility", description: "Review conversation context, captured details, and next-step signals from one view.", icon: BrainCircuit },
    ],
  },
  {
    eyebrow: "Lead intelligence",
    title: "Smart actions suggest the next useful move",
    summary: "Rule-based suggestions use lead data, summaries, notes, follow-ups, missing fields, and timeline context without auto-sending WhatsApp messages.",
    features: [
      { title: "Temperature and health", description: "See whether a lead is hot, warm, overdue, needs reply, won, lost, or missing key details.", icon: Sparkles },
      { title: "Suggested actions", description: "Create follow-ups, assign staff, mark contacted, move quotation stages, or review order/lost outcomes.", icon: BrainCircuit },
      { title: "Missing-field capture", description: "Spot missing city, interest, quantity, budget, next follow-up, or assigned user.", icon: MessageSquare },
      { title: "Drafts without auto-send", description: "Review suggested follow-up wording while keeping WhatsApp sending under human control.", icon: ShieldCheck },
    ],
  },
  {
    eyebrow: "Customer context",
    title: "Profiles, summaries, products, and customer history stay connected",
    summary: "The assistant can use structured knowledge and customer context so replies are less generic and easier for staff to review.",
    features: [
      { title: "Customer profiles and summaries", description: "Preserve useful customer context, summaries, and preferences for future chats.", icon: Users },
      { title: "Products and services catalog", description: "Store descriptions, prices, photos, options, and policy notes for better AI answers.", icon: Package },
      { title: "Media groups", description: "Use saved WhatsApp-native photos, PDFs, videos, captions, menus, and portfolio files.", icon: MessageSquare },
      { title: "Sequence groups", description: "Build welcome, keyword, and shortcut sequences for repeated customer journeys.", icon: Workflow },
    ],
  },
  {
    eyebrow: "Follow-ups and updates",
    title: "Keep conversations moving after the first reply",
    summary: "Use fixed follow-ups, AI Smart Follow-ups, customer updates, saved lists, and safe scheduled communication.",
    features: [
      { title: "Follow-up Center", description: "Track overdue, today, due soon, upcoming, and completed follow-up work.", icon: Workflow },
      { title: "AI Smart Follow-ups", description: "Prepare context-aware next-step messages from existing summaries and conversation state.", icon: Sparkles },
      { title: "Customer updates", description: "Send or schedule expected updates to saved lists or manual recipient lists.", icon: Megaphone },
      { title: "Successful-send billing", description: "Failed, skipped, duplicate, cancelled, invalid, and insufficient-wallet attempts are not charged as successful sends.", icon: Wallet },
    ],
  },
  {
    eyebrow: "Website and store knowledge",
    title: "Bring website and WooCommerce context into replies and lead capture",
    summary: "Sync useful content into Products/Services and Website Knowledge so the assistant can answer from current business material.",
    features: [
      { title: "Website Knowledge", description: "Review synced and failed website rows, source URLs, timestamps, and failure reasons.", icon: Globe2 },
      { title: "WordPress Website Connector", description: "Sync pages/posts with a Bot ID, API URL, and write:knowledge API key.", icon: Link2 },
      { title: "WooCommerce integration", description: "Connect, test, preview, and sync selected products into the catalog.", icon: ShoppingCart },
      { title: "Source tracking", description: "Track leads from WhatsApp, Website, WordPress, WooCommerce, API, and manual sources.", icon: BrainCircuit },
    ],
  },
  {
    eyebrow: "Developer integrations",
    title: "Public API and webhooks for connected workflows",
    summary: "Technical teams can connect forms, external tools, and event workflows while keeping keys scoped and secure.",
    features: [
      { title: "Public lead intake", description: "Capture leads from websites, forms, or external systems.", icon: Link2 },
      { title: "Message APIs", description: "Use message, bulk message, and status lookup flows where enabled for the client account.", icon: MessageSquare },
      { title: "Webhook endpoints", description: "Receive supported events and delivery records in your own system.", icon: Workflow },
      { title: "Idempotent retries", description: "Retry safely without creating duplicate leads or repeated sends.", icon: ShieldCheck },
    ],
  },
  {
    eyebrow: "Safety controls",
    title: "Built for responsible client operations",
    summary: "BlackArrow keeps usage, billing, and handoff visible while clients remain responsible for WhatsApp behavior and customer promises.",
    features: [
      { title: "Wallet safety", description: "Track wallet balance, subscription state, trial usage, and pause conditions.", icon: Wallet },
      { title: "Chat shortcuts", description: "Use .0 to pause, .00 to stop, and .1 to resume bot replies for a customer.", icon: MessageSquare },
      { title: "Launch monitoring", description: "Review replies, pricing, delivery, privacy, and refund details before scaling automation.", icon: ShieldCheck },
      { title: "No overclaiming", description: "Avoid spam, misleading offers, or unsupported WhatsApp safety guarantees.", icon: Sparkles },
    ],
  },
];

export function FeaturesPage({ onShowHome, onShowPricing, onStartTrial, primaryCtaLabel }: FeaturesPageProps) {
  const visibleFeatureGroups = CRM_UI_ENABLED
    ? featureGroups
    : featureGroups.filter((group) => group.eyebrow !== "Lead intelligence" && group.eyebrow !== "Lead capture");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-16 md:py-24">
      <section className="overflow-hidden rounded-[2.3rem] border border-gray-200 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,255,247,0.98))] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.14),transparent_30%),linear-gradient(135deg,rgba(19,25,20,0.98),rgba(10,16,12,0.98))] md:p-8">
        <div className="grid items-center gap-8 lg:grid-cols-[0.84fr_1.16fr]">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              Public Features
            </div>
            <h1 className="text-4xl font-black tracking-tight text-gray-950 dark:text-neutral-50 md:text-6xl">
              WhatsApp AI and integrations for active client operations
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-gray-700 dark:text-neutral-300">
              BlackArrow combines WhatsApp AI replies, products/services, media and sequences, Website Knowledge, WooCommerce, API/webhooks, follow-ups, customer updates, reports, and wallet-safe billing in one client-facing platform.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onStartTrial}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(37,211,102,0.24)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(37,211,102,0.3)]"
              >
                {primaryCtaLabel} <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={onShowPricing}
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/88 px-6 py-3 text-sm font-black text-emerald-700 transition-colors hover:border-emerald-400 dark:border-emerald-900 dark:bg-neutral-900/80 dark:text-emerald-300"
              >
                View Pricing
              </button>
            </div>
          </div>

          <Dashboard3DMockup compact />
        </div>
      </section>

      <section className="grid gap-6">
        {visibleFeatureGroups.map((group) => (
          <div key={group.title} className="rounded-[2rem] border border-gray-200 bg-white/92 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] dark:border-neutral-800 dark:bg-neutral-900/88 md:p-7">
            <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-5 dark:border-neutral-800 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">{group.eyebrow}</p>
                <h3 className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-neutral-50">{group.title}</h3>
              </div>
              <p className="max-w-xl text-sm font-medium leading-relaxed text-gray-500 dark:text-neutral-400">{group.summary}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {group.features.map((feature, index) => (
                <div key={feature.title}>
                  <FeatureCard
                    icon={feature.icon}
                    title={feature.title}
                    body={feature.description}
                    variant={index === 0 ? "highlight" : "default"}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-5 rounded-[2rem] border border-gray-200 bg-white/80 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-neutral-400">Platform promise</p>
          <h3 className="mt-1 text-lg font-black tracking-tight text-gray-950 dark:text-neutral-50">
            One public feature map for the full client journey
          </h3>
          <div className="mt-3 grid gap-2 text-sm font-bold text-gray-600 dark:text-neutral-300 sm:grid-cols-2">
            <Proof text="Client-safe public docs focused on setup, usage, safety, and billing" />
            <Proof text="WhatsApp setup, AI, products, Website Knowledge, and billing together" />
            <Proof text="Smart actions with suggested drafts and no automatic WhatsApp sends" />
            <Proof text="API, webhooks, WooCommerce, and WordPress connector coverage" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <button
            onClick={onShowHome}
            className="rounded-full border border-gray-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
          >
            Back Home
          </button>
          <button
            onClick={onStartTrial}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            {primaryCtaLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function Proof({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      {text}
    </div>
  );
}
