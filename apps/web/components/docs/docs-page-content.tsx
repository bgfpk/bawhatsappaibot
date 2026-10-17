import React from "react";
import { DocsHero } from "./docs-hero";
import { DocsSearch } from "./docs-search";
import { QuickStartJourney } from "./quick-start-journey";
import { DocsCategoriesSection } from "./docs-categories-section";
import { InstanceConnectionGuide } from "./instance-connection-guide";
import { AiConfigurationGuide } from "./ai-configuration-guide";
import { MediaSequencesGuide } from "./media-sequences-guide";
import { CustomerOperationsGuide } from "./customer-operations-guide";
import { IntegrationDeveloperGuide } from "./integration-developer-guide";
import { WalletBillingGuide } from "./wallet-billing-guide";
import { SafetyResponsibilitySection } from "./safety-responsibility-section";
import { TroubleshootingGuide } from "./troubleshooting-guide";
import { DocsFaqSection } from "./docs-faq-section";
import { DocsFinalCta } from "./docs-final-cta";

import styles from "./docs.module.css";

export function DocsPageContent() {
  return (
    <>
      <DocsHero />
      
      <section className={styles.searchSection}>
        <DocsSearch />
      </section>

      <QuickStartJourney />
      <DocsCategoriesSection />
      <InstanceConnectionGuide />
      <AiConfigurationGuide />
      <MediaSequencesGuide />
      <CustomerOperationsGuide />
      <IntegrationDeveloperGuide />
      <WalletBillingGuide />
      <SafetyResponsibilitySection />
      <TroubleshootingGuide />
      <DocsFaqSection />
      <DocsFinalCta />
    </>
  );
}

