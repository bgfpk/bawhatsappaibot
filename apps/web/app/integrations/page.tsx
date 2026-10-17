import type { Metadata } from "next";

import { StructuredData, buildBreadcrumbSchema, buildWebPageSchema } from "@/components/structured-data";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";
import { IntegrationsHero } from "@/components/integrations/integrations-hero";
import { StatusExplanationSection } from "@/components/integrations/status-explanation-section";
import { WooCommerceSection } from "@/components/integrations/woocommerce-section";
import { WebsiteKnowledgeSection } from "@/components/integrations/website-knowledge-section";
import { CourierIntegrationsSection } from "@/components/integrations/courier-integrations-section";
import { ApiWebhooksSection } from "@/components/integrations/api-webhooks-section";
import { DataFlowExamplesSection } from "@/components/integrations/data-flow-examples-section";
import { IntegrationControlSection } from "@/components/integrations/integration-control-section";
import { SupportedVsUnclaimedSection } from "@/components/integrations/supported-vs-unclaimed-section";
import { IntegrationsFaqSection } from "@/components/integrations/integrations-faq-section";
import { IntegrationsFinalCtaSection } from "@/components/integrations/integrations-final-cta-section";

export const metadata: Metadata = buildPageMetadata("/integrations");

export default function IntegrationsPage() {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: "/integrations",
          name: "BlackArrow Integrations | WooCommerce, Webhooks, Couriers & APIs",
          description:
            "Connect BlackArrow to WooCommerce, website knowledge, PostEx/TCS courier lookups, and custom webhooks for automated WhatsApp workflows.",
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Integrations", url: `${PUBLIC_SITE_CONFIG.siteUrl}/integrations` },
        ])}
      />

      <main id="integrations-hub">
        <IntegrationsHero />
        <StatusExplanationSection />
        <WooCommerceSection />
        <WebsiteKnowledgeSection />
        <CourierIntegrationsSection />
        <ApiWebhooksSection />
        <DataFlowExamplesSection />
        <IntegrationControlSection />
        <SupportedVsUnclaimedSection />
        <IntegrationsFaqSection />
        <IntegrationsFinalCtaSection />
      </main>
    </>
  );
}
