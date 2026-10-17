import React, { useState } from "react";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  MessageSquare,
  Package,
  PauseCircle,
  QrCode,
  Send,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  Wifi,
} from "lucide-react";
import {
  AI_USAGE_EXAMPLES,
  AI_USAGE_RATES,
  AUTOMATION_USAGE_EXAMPLES,
  BETA_PLAN_DISCOUNT_EXPLANATION,
  BETA_PLAN_DISCOUNT_LABEL,
  BILLING_PLAN_DETAILS,
  BILLING_PLAN_IDS,
  getPlanDisplayPricing,
} from "../../config/pricing";

type IconComponent = React.ComponentType<{ className?: string }>;

export function FloatingChip({
  icon: Icon,
  label,
  className = "",
}: {
  icon: IconComponent;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`public-float absolute z-20 hidden items-center gap-2 rounded-full border border-white/70 bg-white/88 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 shadow-[0_16px_32px_rgba(2,6,23,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/82 dark:text-emerald-300 sm:flex ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

export function PhoneChatMockup() {
  return (
    <div className="public-tilt relative w-[15.2rem] rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,#fbfffc,#e7f6ec)] p-2.5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[linear-gradient(180deg,#141b17,#07100b)] sm:w-[17rem]">
      <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-black/12 dark:bg-white/12" />
      <div className="overflow-hidden rounded-[1.65rem] border border-black/5 bg-[#edf7f0] p-3 dark:border-white/5 dark:bg-[#0a120e]">
        <div className="flex items-center justify-between rounded-[1.15rem] bg-white/82 px-3 py-2 shadow-sm dark:bg-white/6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#25D366] text-white">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-black text-gray-950 dark:text-white">BlackArrow</p>
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 public-pulse-soft" />
                Active
              </p>
            </div>
          </div>
          <Wifi className="h-4 w-4 text-emerald-500" />
        </div>

        <div className="mt-3 space-y-2.5">
          <div className="ml-auto max-w-[82%] rounded-[1.1rem] rounded-br-md bg-[#dcf8c6] px-3 py-2 text-xs font-bold text-gray-900 dark:bg-emerald-900/45 dark:text-emerald-50">
            Need price, photos, and delivery time.
          </div>
          <div className="max-w-[86%] rounded-[1.1rem] rounded-bl-md bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm dark:bg-neutral-900 dark:text-neutral-200">
            Sure. I sent the catalog and captured the order details.
          </div>
          <div className="max-w-[72%] rounded-[1.1rem] rounded-bl-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/35">
            <div className="flex items-center gap-2">
              <AudioLines className="h-4 w-4 text-emerald-500" />
              <div className="flex flex-1 items-end gap-1">
                {[2, 5, 8, 4, 7].map((height, index) => (
                  <span
                    key={index}
                    className="public-wave-bar w-1 rounded-full bg-emerald-500"
                    style={{ height, animationDelay: `${index * 110}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStatus icon={ShoppingCart} label="Order captured" />
            <MiniStatus icon={PauseCircle} label="Handoff ready" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`public-tilt public-saas-panel relative rounded-[1.8rem] p-4 ${compact ? "w-[19rem] sm:w-[22rem]" : ""}`}>
      <div className="flex items-center justify-between rounded-[1.25rem] border border-black/5 bg-white/78 px-4 py-3 dark:border-white/5 dark:bg-white/5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Live workspace</p>
          <h3 className="text-base font-black text-gray-950 dark:text-white">Chats, orders, wallet</h3>
        </div>
        <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
          Synced
        </span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "lg:grid-cols-[1.08fr_0.92fr]"}`}>
        <div className="rounded-[1.35rem] border border-black/5 bg-[#f8fbf8] p-3 dark:border-white/5 dark:bg-[#0d1410]">
          <div className="grid gap-3 sm:grid-cols-2">
            <PanelMetric icon={MessageSquare} label="Live conversations" value="24 active" />
            <PanelMetric icon={Wallet} label="Wallet usage" value="$7.20 today" />
          </div>
          <div className="mt-3 rounded-[1.1rem] bg-white p-3 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 dark:text-neutral-400">Live console</p>
                <h4 className="mt-1 text-sm font-black text-gray-950 dark:text-white">Intent, reply mode, next action</h4>
              </div>
              <BrainCircuit className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="mt-3 h-2 rounded-full bg-emerald-500/20">
              <div className="h-full w-2/3 rounded-full bg-[#25D366] public-shimmer" />
            </div>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-emerald-200 bg-emerald-50/75 p-4 dark:border-emerald-900 dark:bg-emerald-950/28">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Order capture</p>
              <h4 className="mt-1 text-base font-black text-gray-950 dark:text-white">Sana Malik</h4>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
          </div>
          <div className="mt-3 space-y-2 text-xs font-black text-gray-700 dark:text-neutral-100">
            <DataLine label="City" value="Lahore" />
            <DataLine label="Product" value="Serum bundle" />
            <DataLine label="Courier" value="PostEx" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroProductMockup() {
  return (
    <div className="public-saas-panel relative mx-auto h-[26rem] w-full max-w-[40rem] overflow-hidden rounded-[2rem] px-4 py-7 sm:h-[30rem]">
      <FloatingChip icon={QrCode} label="QR connected" className="left-6 top-8" />
      <FloatingChip icon={AudioLines} label="Voice note" className="right-6 top-12" />
      <FloatingChip icon={ShoppingCart} label="Order captured" className="bottom-16 left-7" />
      <FloatingChip icon={Wallet} label="Usage visible" className="bottom-8 right-8" />
      <FloatingChip icon={ShieldCheck} label="Human handoff" className="right-20 top-[46%]" />

      <div className="absolute left-1/2 top-8 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative z-10 flex h-full items-center justify-center">
        <div className="relative flex w-full max-w-[34rem] items-center justify-center">
          <div className="absolute bottom-3 right-1 hidden sm:block">
            <DashboardMockup compact />
          </div>
          <div className="absolute bottom-2 right-1 block w-[13rem] sm:hidden">
            <DashboardMockup compact />
          </div>
          <div className="relative z-20 -translate-x-8 sm:-translate-x-20">
            <PhoneChatMockup />
          </div>
        </div>
      </div>
    </div>
  );
}

export const Hero3DMockup = HeroProductMockup;
export const Dashboard3DMockup = DashboardMockup;

export function FeatureCard({
  icon: Icon,
  title,
  body,
  variant = "default",
}: {
  icon: IconComponent;
  title: string;
  body: string;
  variant?: "default" | "highlight" | "wide" | string;
}) {
  const featured = variant === "highlight" || variant === "wide";

  return (
    <article className={`public-card-hover rounded-[1.4rem] border p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${featured ? "border-emerald-200 bg-emerald-50/72 dark:border-emerald-900 dark:bg-emerald-950/24" : "border-gray-200 bg-white/88 dark:border-white/10 dark:bg-white/[0.035]"}`}>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-black text-gray-950 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{body}</p>
    </article>
  );
}

export function IntegrationCard({
  name,
  status,
}: {
  name: string;
  status: "Active" | "Coming soon";
}) {
  const active = status === "Active";
  return (
    <article className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-gray-200 bg-white/78 p-4 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300"}`}>
          <Send className="h-4 w-4" />
        </div>
        <h3 className="text-base font-black text-gray-950 dark:text-white">{name}</h3>
      </div>
      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${active ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/12 text-amber-700 dark:text-amber-300"}`}>
        {status}
      </span>
    </article>
  );
}

export function PricingSection({
  onStart,
  compact = false,
  showUsageSection = true,
}: {
  onStart: () => void;
  compact?: boolean;
  showUsageSection?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-sm font-bold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">{BETA_PLAN_DISCOUNT_LABEL}</p>
        <p className="mt-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">{BETA_PLAN_DISCOUNT_EXPLANATION}</p>
      </div>
      <div className={`grid gap-4 ${compact ? "lg:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {BILLING_PLAN_IDS.map((id) => {
          const plan = BILLING_PLAN_DETAILS[id];
          const displayPricing = getPlanDisplayPricing(id);
          return (
            <article
              key={id}
              className={`public-card-hover rounded-[1.25rem] border p-5 shadow-[0_10px_26px_rgba(15,23,42,0.045)] ${
                plan.popular
                  ? "border-emerald-300 bg-emerald-50/78 dark:border-emerald-800 dark:bg-emerald-950/24"
                  : "border-gray-200 bg-white/90 dark:border-white/10 dark:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-gray-950 dark:text-white">{plan.name}</h3>
                  <p className="mt-2 text-sm font-black text-gray-400 line-through dark:text-neutral-500">
                    Regular ${displayPricing.regularMonthlyPrice}/mo
                  </p>
                  <div className="mt-1 text-3xl font-black text-gray-950 dark:text-white">
                    Now ${displayPricing.currentMonthlyPrice}
                    <span className="text-sm font-bold text-gray-500 dark:text-neutral-400">/mo</span>
                  </div>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">
                    {displayPricing.betaDiscountPercent}% off until {displayPricing.betaDiscountEndsLabel}
                  </p>
                  <p className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">{displayPricing.foundingYearlyCta}</p>
                </div>
                {plan.popular && (
                  <span className="rounded-full bg-[#25D366] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                    Popular
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {plan.highlights.slice(0, 3).map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm font-semibold text-gray-700 dark:text-neutral-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <details className="mt-3 rounded-2xl border border-gray-200 bg-white/62 px-4 py-3 dark:border-white/10 dark:bg-black/12">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                  View details
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-gray-600 dark:text-neutral-300">
                  <MetricBox label="Instances" value={String(plan.max_instances)} />
                  <MetricBox label="Orders" value={plan.ordersPerMonth.toLocaleString()} />
                  <MetricBox label="Customers" value={plan.customers.toLocaleString()} />
                  <MetricBox label="Templates" value={plan.mediaTemplates.toLocaleString()} />
                </div>
              </details>

              <button
                onClick={onStart}
                className="public-primary-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black transition-colors"
              >
                Start trial <ArrowRight className="h-4 w-4" />
              </button>
            </article>
          );
        })}
      </div>

      {showUsageSection ? <WalletRatesSection /> : null}
    </div>
  );
}

export function WalletRatesSection() {
  return (
    <section className="rounded-[1.5rem] border border-gray-200 bg-white/88 p-5 dark:border-white/10 dark:bg-white/[0.035] md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 dark:text-neutral-400">Usage</p>
            <h3 className="text-lg font-black text-gray-950 dark:text-white">Wallet rates and examples</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {AI_USAGE_RATES.map((rate) => (
            <div key={rate.label} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-700 dark:border-white/10 dark:bg-black/20 dark:text-neutral-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {rate.badge ? <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">{rate.badge}</p> : null}
                  <p className="font-black text-gray-900 dark:text-white">{rate.label}</p>
                </div>
                <div className="text-right">
                  <p className="font-black whitespace-nowrap text-emerald-700 dark:text-emerald-300">{rate.price}</p>
                  {rate.regularPrice ? <p className="mt-1 text-[11px] font-bold text-gray-400 dark:text-neutral-500">{rate.regularPrice}</p> : null}
                  {rate.savings ? <p className="text-[11px] font-black text-amber-600 dark:text-amber-300">{rate.savings}</p> : null}
                </div>
              </div>
              {rate.compactCharge ? (
                <p className="mt-2 text-[11px] font-bold text-gray-600 dark:text-neutral-300">{rate.compactCharge}</p>
              ) : null}
              {rate.note ? (
                <p className="mt-2 text-xs font-medium text-gray-500 dark:text-neutral-500">{rate.note}</p>
              ) : null}
            </div>
          ))}
        </div>
        <details className="mt-5 rounded-[1.25rem] border border-gray-200 bg-white/82 p-4 text-sm font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300 md:p-5">
          <summary className="cursor-pointer font-black text-gray-700 dark:text-neutral-200">AI usage examples</summary>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {AI_USAGE_EXAMPLES.map((example) => (
              <div key={example.label} className="rounded-xl bg-gray-50/90 px-4 py-3 dark:bg-black/20">
                <p className="font-black text-gray-900 dark:text-white">{example.label}</p>
                <div className="mt-2 space-y-1.5">
                  {example.lines.map((line) => (
                    <div key={`${example.label}-${line.action}`} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span>{line.label}</span>
                      <span className="text-emerald-700 dark:text-emerald-300">{line.price}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-0.5 border-t border-gray-200 pt-2 text-gray-900 dark:border-white/10 dark:text-white sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <span className="font-black">Total</span>
                  <span className="font-black text-emerald-700 dark:text-emerald-300">{example.total}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {AUTOMATION_USAGE_EXAMPLES.map((example) => (
              <div key={example.label} className="rounded-xl bg-emerald-50/80 px-4 py-3 dark:bg-emerald-950/20">
                <p className="font-black text-gray-900 dark:text-white">{example.label}</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <span>{example.detail}</span>
                  <span className="font-black text-emerald-700 dark:text-emerald-300">{example.total}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

export function FAQSection({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="grid gap-3">
      {items.map((item, index) => {
        const open = index === openFaq;
        return (
          <button
            key={item.question}
            type="button"
            onClick={() => setOpenFaq(open ? -1 : index)}
            className="rounded-[1.25rem] border border-gray-200 bg-white/82 p-4 text-left transition-colors hover:border-emerald-300 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-emerald-800"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-black text-gray-950 dark:text-white">{item.question}</h3>
              <ChevronDown className={`h-4 w-4 shrink-0 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
            <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <p className="mt-3 overflow-hidden text-sm font-medium leading-relaxed text-gray-600 dark:text-neutral-300">{item.answer}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MiniStatus({ icon: Icon, label }: { icon: IconComponent; label: string }) {
  return (
    <div className="rounded-xl bg-white/72 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.11em] text-gray-700 dark:bg-white/6 dark:text-neutral-200">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-emerald-500" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function PanelMetric({ icon: Icon, label, value }: { icon: IconComponent; label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] bg-white p-3 dark:bg-white/5">
      <Icon className="h-4 w-4 text-emerald-500" />
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-base font-black text-gray-950 dark:text-white">{value}</p>
    </div>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 dark:bg-white/6">
      <span className="text-gray-500 dark:text-neutral-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/5">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-neutral-500">{label}</div>
      <div className="mt-0.5 text-sm font-black text-gray-950 dark:text-white">{value}</div>
    </div>
  );
}
