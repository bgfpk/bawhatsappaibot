import { Faq } from "@/components/faq";
import { HelpCircle } from "lucide-react";
import styles from "./contact.module.css";

export const CONTACT_FAQS = [
  {
    question: "How do I contact BlackArrow support?",
    answer:
      "Send your questions directly to contact-086473cbd844@example.invalid with a clear subject line describing your topic (Sales, Setup, Billing, or Technical).",
  },
  {
    question: "Can BlackArrow help configure my account?",
    answer:
      "Yes. Technical documentation and onboarding guidance are available to help you pair WhatsApp via Linked Devices QR, configure instructions, organize product catalogs, and connect webhook endpoints.",
  },
  {
    question: "Where can I ask billing questions?",
    answer:
      "Send billing questions to contact-086473cbd844@example.invalid with your registered account email and workspace details.",
  },
  {
    question: "Can I send API keys or private credentials through support?",
    answer:
      "No. Never send account passwords, OTPs, API keys, payment card details, WhatsApp QR codes, or private credentials in any support message.",
  },
  {
    question: "Can I request a custom integration?",
    answer:
      "You can discuss technical requirements via contact-086473cbd844@example.invalid. Technical teams can also connect custom systems using our Public REST API or Webhooks.",
  },
  {
    question: "Where can existing customers get support?",
    answer:
      "Existing customers can access account resources via the account dashboard, review technical documentation at /docs, or email contact-086473cbd844@example.invalid.",
  },
  {
    question: "Does submitting an inquiry guarantee setup or custom development?",
    answer:
      "Inquiries are evaluated based on product compatibility and current plan offerings. Submitting an inquiry does not constitute a legal contract or guarantee custom feature development.",
  },
  {
    question: "Is BlackArrow officially partnered with WhatsApp or Meta?",
    answer:
      "No. BlackArrow is an independent software platform. All product names, logos, and brands are property of their respective owners. Compatibility indicates technical integration capabilities.",
  },
];

export function ContactFaqSection() {
  return (
    <section id="faq" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <HelpCircle size={14} /> Clear Answers
        </div>
        <h2 className={styles.title}>Contact FAQ</h2>
        <p className={styles.subtitle}>
          Fact-checked answers about support contact channels, inquiry handling, and security practices.
        </p>
      </div>

      <Faq items={CONTACT_FAQS} compact />
    </section>
  );
}
