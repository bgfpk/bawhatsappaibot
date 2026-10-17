import { Faq } from "@/components/faq";
import { HelpCircle } from "lucide-react";
import { FULL_SETUP_PRICE } from "@/lib/public-content";
import styles from "./pricing.module.css";

export const PRICING_FAQS = [
  {
    question: "What does the monthly subscription cover?",
    answer:
      "The monthly subscription covers your workspace platform access, included WhatsApp instances, catalog storage, customer 360 profile management, and dashboard operational controls.",
  },
  {
    question: "Why is the AI usage wallet separate from the subscription?",
    answer:
      "A separate wallet ensures you only pay for the exact AI replies, image processing, voice notes, and automation messages your business actually uses, instead of paying for fixed artificial chat quotas.",
  },
  {
    question: "What is the minimum wallet top-up amount?",
    answer: "The minimum prepaid wallet top-up is $5. Wallet balance never expires while your account remains active.",
  },
  {
    question: "How does the 7-day free trial work?",
    answer:
      "New accounts receive 7 days of free platform access with $1 of complimentary AI wallet credit to test automated replies, order capture, and customer profile creation on a single WhatsApp number.",
  },
  {
    question: "What happens if my wallet balance runs low?",
    answer:
      "If your wallet balance reaches zero, automated AI replies and paid sequence dispatches pause until you top up your wallet. Your workspace access and customer data remain safely intact.",
  },
  {
    question: "Can I upgrade or downgrade my plan at any time?",
    answer:
      "Yes. You can switch between Starter ($9/mo), Growth ($29/mo), and Pro ($89/mo) plans directly from your account settings.",
  },
  {
    question: "What is included in the optional $49 full setup?",
    answer: `The optional $${FULL_SETUP_PRICE} full setup is a one-time assisted onboarding service where our team helps configure your business knowledge base, catalog parameters, and initial response rules.`,
  },
  {
    question: "Are courier and system integrations included?",
    answer:
      "Growth and Pro plans include support for integrated courier tracking services (such as PostEx and Leopards where supported) and API access.",
  },
  {
    question: "Is WhatsApp account safety guaranteed?",
    answer:
      "No platform can guarantee zero risk or zero bans. BlackArrow connects through Linked Devices QR pairing. Businesses remain responsible for complying with WhatsApp Terms of Service and avoiding unauthorized bulk spamming.",
  },
];

export function PricingFaqSection() {
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <HelpCircle size={14} /> Clear Answers
        </div>
        <h2 className={styles.title}>Pricing &amp; Commercial FAQ</h2>
        <p className={styles.subtitle}>
          Everything you need to know about plans, wallet deduction, trial credit, and account safety.
        </p>
      </div>

      <Faq items={PRICING_FAQS} compact />
    </section>
  );
}
