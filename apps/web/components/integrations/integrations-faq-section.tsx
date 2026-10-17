import { Faq } from "@/components/faq";
import { HelpCircle } from "lucide-react";
import styles from "./integrations.module.css";

export const INTEGRATIONS_FAQS = [
  {
    question: "Which integrations are currently supported by BlackArrow?",
    answer:
      "BlackArrow currently supports WooCommerce product catalog configuration, WordPress & website knowledge base configuration, PostEx courier tracking, Leopards courier tracking, a public REST API, and webhook configuration.",
  },
  {
    question: "Does every integration connect automatically after signup?",
    answer:
      "No. Integrations require configuration in your dashboard (such as configuring product catalog data, uploading website knowledge documents, or configuring merchant courier API credentials).",
  },
  {
    question: "How does WooCommerce store integration work?",
    answer:
      "BlackArrow uses configured WooCommerce product information and BlackArrow workspace order records where available to assist WhatsApp customers with product availability and order inquiries.",
  },
  {
    question: "How does Website Knowledge work?",
    answer:
      "You can configure website pages, policy documents, and FAQs in your dashboard as business knowledge sources. BlackArrow uses these sources to generate grounded, context-aware WhatsApp customer replies.",
  },
  {
    question: "Which courier integrations are supported for tracking updates?",
    answer:
      "PostEx and Leopards Courier integrations are supported where merchant credentials are configured. BlackArrow queries these APIs to provide available tracking status or tracking links for WhatsApp customer inquiries.",
  },
  {
    question: "Does courier integration guarantee delivery status accuracy?",
    answer:
      "Delivery tracking data is retrieved directly from the courier's API. Delivery timeframes and tracking status accuracy depend entirely on the third-party courier service.",
  },
  {
    question: "What can technical teams do with the Public API and Webhooks?",
    answer:
      "Developers can use REST API endpoints to send customer data into BlackArrow, or configure webhook parameters for spreadsheet destinations and receive inbound billing callbacks.",
  },
  {
    question: "Is Shopify supported as a direct connector?",
    answer:
      "Shopify is not currently claimed or supported as a direct native connector. Technical teams can use the Public API or Webhooks to connect custom store events.",
  },
  {
    question: "Are integrations official third-party partnerships?",
    answer:
      "All product and service names (such as WooCommerce, WordPress, PostEx, Leopards, or Meta) are trademarks of their respective owners. Integration support indicates technical compatibility and does not imply official partnership or Meta endorsement unless explicitly stated.",
  },
];

export function IntegrationsFaqSection() {
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <HelpCircle size={14} /> Clear Answers
        </div>
        <h2 className={styles.title}>Integrations &amp; Technical FAQ</h2>
        <p className={styles.subtitle}>
          Find transparent answers about connected store tools, courier APIs, webhooks, and third-party compatibility.
        </p>
      </div>

      <Faq items={INTEGRATIONS_FAQS} compact />
    </section>
  );
}
