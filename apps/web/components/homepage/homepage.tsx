import { HeroSection } from "./hero-section";
import { ProductProofSection } from "./product-proof-section";
import { WorkflowSection } from "./workflow-section";
import { KnowledgeAiSection } from "./knowledge-ai-section";
import { SequencesMediaSection } from "./sequences-media-section";
import { CustomerOperationsSection } from "./customer-operations-section";
import { HumanControlSection } from "./human-control-section";
import { IntegrationsSection } from "./integrations-section";
import { UseCasesSection } from "./use-cases-section";
import { PricingFaqSection } from "./pricing-faq-section";
import styles from "./homepage.module.css";

export function Homepage() {
  return (
    <div className={`homepage-route ${styles.homepageRoot}`}>
      {/* 2. Product-Led Hero */}
      <HeroSection />

      {/* 3. Real Product Proof Showcase */}
      <ProductProofSection />

      {/* 4. Problem & Three-Step Workflow */}
      <WorkflowSection />

      {/* 5. Business Knowledge & Multimodal AI */}
      <KnowledgeAiSection />

      {/* 6. Sequences, Media & Reusable Content */}
      <SequencesMediaSection />

      {/* 7. Customer Records, Follow-ups & Orders */}
      <CustomerOperationsSection />

      {/* 8. Human Control & WhatsApp Safety */}
      <HumanControlSection />

      {/* 9. Verified Integrations */}
      <IntegrationsSection />

      {/* 10. Industry Use Cases */}
      <UseCasesSection />

      {/* 11. Pricing & FAQ */}
      <PricingFaqSection />
    </div>
  );
}

