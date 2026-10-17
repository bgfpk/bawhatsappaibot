import { StructuredData, buildBreadcrumbSchema, buildPricingOffersSchema, buildWebPageSchema } from "@/components/structured-data";
import { PRICING_PLANS } from "@/lib/marketing-content";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";
import { PricingHero } from "@/components/pricing/pricing-hero";
import { MonthlyPlansSection } from "@/components/pricing/monthly-plans-section";
import { SubscriptionVsWalletSection } from "@/components/pricing/subscription-vs-wallet-section";
import { PlanComparisonSection } from "@/components/pricing/plan-comparison-section";
import { WalletRatesSection } from "@/components/pricing/wallet-rates-section";
import { TrialSetupSection } from "@/components/pricing/trial-setup-section";
import { AddonsSection } from "@/components/pricing/addons-section";
import { BusinessFitSection } from "@/components/pricing/business-fit-section";
import { BillingStructureSection } from "@/components/pricing/billing-structure-section";
import { PricingFaqSection } from "@/components/pricing/pricing-faq-section";
import { PricingFinalCtaSection } from "@/components/pricing/pricing-final-cta-section";

export const metadata = buildPageMetadata("/pricing");

export default function PricingPage() {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: "/pricing",
          name: "BlackArrow Pricing | Simple Plans & Transparent Wallet Usage",
          description:
            "View BlackArrow monthly plans and itemized usage wallet rates. Includes a 7-day trial and $1 test credit for WhatsApp AI automation.",
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Pricing", url: `${PUBLIC_SITE_CONFIG.siteUrl}/pricing` },
        ])}
      />
      <StructuredData data={buildPricingOffersSchema(PRICING_PLANS)} />

      <main>
        <PricingHero />
        <MonthlyPlansSection />
        <SubscriptionVsWalletSection />
        <PlanComparisonSection />
        <WalletRatesSection />
        <TrialSetupSection />
        <AddonsSection />
        <BusinessFitSection />
        <BillingStructureSection />
        <PricingFaqSection />
        <PricingFinalCtaSection />
      </main>
    </>
  );
}
