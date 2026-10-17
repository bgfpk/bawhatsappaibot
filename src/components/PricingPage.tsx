import React from "react";
import { ShieldCheck, Wallet, Zap } from "lucide-react";
import {
  BETA_PLAN_DISCOUNT_EXPLANATION,
  BETA_PLAN_DISCOUNT_LABEL,
  BILLING_ADDONS,
  FOUNDING_YEARLY_DISCOUNT_CTA,
  FOUNDING_YEARLY_DISCOUNT_LABEL,
  FULL_SETUP_PRICE,
} from "../config/pricing";
import { Dashboard3DMockup, PricingSection } from "./public/PublicVisuals";

export function PricingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f8f6,#edf3ef)] text-gray-900 dark:bg-[linear-gradient(180deg,#050706,#0a0f0c)] dark:text-white">
      <section className="public-saas-hero px-6 pt-20 pb-14 md:pt-28 md:pb-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="max-w-4xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#25D366]/25 bg-[#25D366]/8 px-4 py-2 text-xs font-semibold text-[#148f4d] dark:text-[#25D366]">
                <span className="h-2 w-2 rounded-full bg-[#25D366]" />
                {BETA_PLAN_DISCOUNT_LABEL}
              </div>
              <h1 className="text-4xl font-black tracking-tight leading-tight md:text-5xl lg:text-6xl">
                Simple, scalable WhatsApp AI automation pricing.
              </h1>
              <p className="mt-5 max-w-3xl text-lg font-medium leading-8 text-gray-600 dark:text-gray-300 md:text-xl">
                Start with beta pricing, connect your WhatsApp number, and pay only for the AI usage your business actually consumes.
              </p>
              <p className="mt-4 text-sm font-bold text-gray-600 dark:text-gray-300">
                Start with a 7-day free trial, no card required, including $1 AI test credit. Checkout starts only when you choose a paid plan, add-on, setup service, or wallet top-up.
              </p>
              <p className="mt-5 max-w-4xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {BETA_PLAN_DISCOUNT_EXPLANATION} Early customers get discounted access, flexible add-ons, direct support, and one shared wallet view for AI usage plus paid outgoing automation sends.
              </p>
            </div>

            <Dashboard3DMockup compact />
          </div>
        </div>
      </section>

      <section className="public-saas-section mx-auto max-w-7xl px-6">
        <PricingSection onStart={onStart} compact showUsageSection />
      </section>

      <section className="border-y border-gray-200 bg-white/80 dark:border-white/10 dark:bg-white/5">
        <div className="public-saas-section mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-2">
          <InfoBlock icon={Zap} title="Need more? Add only what you need.">
            <div className="grid gap-3 sm:grid-cols-2">
              {BILLING_ADDONS.map((addon) => (
                <div key={addon.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/70">
                  <div className="font-black">{addon.name}</div>
                  <div className="mt-1 text-sm font-bold text-[#25D366]">{addon.price}</div>
                </div>
              ))}
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="font-black">Full account setup</div>
                <div className="mt-1 text-sm font-bold text-[#25D366]">${FULL_SETUP_PRICE} one-time</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="font-black">AI wallet top-up</div>
                <div className="mt-1 text-sm font-bold text-[#25D366]">minimum $5</div>
              </div>
            </div>
          </InfoBlock>

          <InfoBlock icon={Wallet} title="Billing and wallet">
            Monthly and yearly subscriptions, add-ons, setup service, and wallet top-ups are paid through checkout. The BlackArrow wallet covers AI usage and paid outgoing automation sends such as sequence/template items and Media Group files. If wallet balance is empty, AI replies and paid automation sends may stop until you top up. Plan discounts do not apply to wallet usage, and billing changes should only activate after verified backend confirmation.
          </InfoBlock>
        </div>
      </section>

      <section className="public-saas-section mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-2">
        <InfoBlock icon={ShieldCheck} title="Founding annual offer">
          {FOUNDING_YEARLY_DISCOUNT_LABEL} {FOUNDING_YEARLY_DISCOUNT_CTA} AI usage costs are not included in the discount and the discount remains active only while the subscription stays active.
        </InfoBlock>
        <InfoBlock icon={ShieldCheck} title="FAQ and safety">
          One account is for one business only. BlackArrow helps automate WhatsApp replies, but customers remain responsible for how their WhatsApp account is used. Avoid spam, cold bulk outreach, repeated unsolicited messages, or abusive automation.
        </InfoBlock>
      </section>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="public-saas-panel rounded-[1.6rem] p-6">
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-black">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#25D366] dark:bg-emerald-950/40">
          <Icon className="h-5 w-5" />
        </span>
        {title}
      </h2>
      <div className="text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-300">{children}</div>
    </div>
  );
}
