import { AboutHero } from "@/components/about/about-hero";
import { WhyBlackArrowExists } from "@/components/about/why-blackarrow-exists";
import { OperationalLayers } from "@/components/about/operational-layers";
import { ProductPrinciples } from "@/components/about/product-principles";
import { HumanControlSection } from "@/components/about/human-control-section";
import { CurrentProductScope } from "@/components/about/current-product-scope";
import { RestrainedTransparencySection } from "@/components/about/restrained-transparency-section";
import { AboutFinalCta } from "@/components/about/about-final-cta";
import { StructuredData, buildBreadcrumbSchema, buildWebPageSchema } from "@/components/structured-data";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export const metadata = buildPageMetadata("/about");

export default function AboutPage() {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: "/about",
          name: "About BlackArrow | Product Philosophy, Architecture & Principles",
          description:
            "Learn about BlackArrow's product principles, architectural layers, and human-in-the-loop engineering for WhatsApp automation.",
          type: "AboutPage",
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "About", url: `${PUBLIC_SITE_CONFIG.siteUrl}/about` },
        ])}
      />

      <AboutHero />
      <WhyBlackArrowExists />
      <OperationalLayers />
      <ProductPrinciples />
      <HumanControlSection />
      <CurrentProductScope />
      <RestrainedTransparencySection />
      <AboutFinalCta />
    </>
  );
}
