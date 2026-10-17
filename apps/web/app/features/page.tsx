import { StructuredData, buildBreadcrumbSchema, buildWebPageSchema } from "@/components/structured-data";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";
import { FeaturesHero } from "@/components/features/features-hero";
import { FeaturesNav } from "@/components/features/features-nav";
import { MultimodalSection } from "@/components/features/multimodal-section";
import { BusinessKnowledgeSection } from "@/components/features/business-knowledge-section";
import { CustomerCrmSection } from "@/components/features/customer-crm-section";
import { CrmPipelineSection } from "@/components/features/crm-pipeline-section";
import { OrdersLifecycleSection } from "@/components/features/orders-lifecycle-section";
import { MediaGroupsSection } from "@/components/features/media-groups-section";
import { SequenceGroupsSection } from "@/components/features/sequence-groups-section";
import { HumanTakeoverSection } from "@/components/features/human-takeover-section";
import { InstanceConnectionSection } from "@/components/features/instance-connection-section";
import { IntegrationsHubSection } from "@/components/features/integrations-hub-section";
import { WalletVisibilitySection } from "@/components/features/wallet-visibility-section";
import { BusinessWorkflowsSection } from "@/components/features/business-workflows-section";
import { SystemSummarySection } from "@/components/features/system-summary-section";
import { FeaturesCta } from "@/components/features/features-cta";
import styles from "@/components/features/features.module.css";

export const metadata = buildPageMetadata("/features");

export default function FeaturesPage() {
  return (
    <div className={`features-page ${styles.featuresRoot}`}>
      <StructuredData
        data={buildWebPageSchema({
          path: "/features",
          name: "BlackArrow Features | Multimodal AI, Orders, CRM & WhatsApp Controls",
          description:
            "Explore BlackArrow features for WhatsApp AI automation, voice notes, product photos, customer records, order summaries, and human takeover controls.",
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Features", url: `${PUBLIC_SITE_CONFIG.siteUrl}/features` },
        ])}
      />

      {/* 1. Product-Led Hero */}
      <FeaturesHero />

      {/* 2. Compact Sticky Category Bar */}
      <FeaturesNav />

      {/* 3. Understand Customer Messages (Multimodal AI) */}
      <MultimodalSection />

      {/* 4. Business-Trained AI Responses */}
      <BusinessKnowledgeSection />

      {/* 5. From Chat to Customer 360 */}
      <CustomerCrmSection />

      {/* 6. CRM Pipeline */}
      <CrmPipelineSection />

      {/* 7. Orders, Follow-Ups, and Customer Updates */}
      <OrdersLifecycleSection />

      {/* 8. Media Groups */}
      <MediaGroupsSection />

      {/* 9. Sequence Groups */}
      <SequenceGroupsSection />

      {/* 10. Human Takeover and AI Controls */}
      <HumanTakeoverSection />

      {/* 11. WhatsApp Connection and Instance Control */}
      <InstanceConnectionSection />

      {/* 12. Integrations, API, and Webhooks */}
      <IntegrationsHubSection />

      {/* 13. Wallet, Usage, and Cost Visibility */}
      <WalletVisibilitySection />

      {/* 14. Features by Business Workflow */}
      <BusinessWorkflowsSection />

      {/* 15. Final Feature Summary Matrix */}
      <SystemSummarySection />

      {/* 16. Final CTA */}
      <FeaturesCta />
    </div>
  );
}
