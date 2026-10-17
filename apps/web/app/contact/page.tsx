import { ContactHero } from "@/components/contact/contact-hero";
import { ContactOptions } from "@/components/contact/contact-options";
import { EmailContactInterface } from "@/components/contact/email-contact-interface";
import { ContactGuidanceSection } from "@/components/contact/contact-guidance-section";
import { ExistingCustomerPaths } from "@/components/contact/existing-customer-paths";
import { WhatHappensNext } from "@/components/contact/what-happens-next";
import { ContactFaqSection } from "@/components/contact/contact-faq-section";
import { ContactFinalCta } from "@/components/contact/contact-final-cta";
import { StructuredData, buildBreadcrumbSchema, buildContactPageSchema, buildWebPageSchema } from "@/components/structured-data";
import { buildPageMetadata } from "@/lib/metadata";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export const metadata = buildPageMetadata("/contact");

export default function ContactPage() {
  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Contact", url: `${PUBLIC_SITE_CONFIG.siteUrl}/contact` },
        ])}
      />
      <StructuredData data={buildContactPageSchema()} />

      <ContactHero />
      <ContactOptions />
      <EmailContactInterface />
      <ContactGuidanceSection />
      <ExistingCustomerPaths />
      <WhatHappensNext />
      <ContactFaqSection />
      <ContactFinalCta />
    </>
  );
}
