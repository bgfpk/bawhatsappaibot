import { ButtonLink } from "@/components/button-link";
import { Mail, CreditCard, Wrench, UserCheck, HelpCircle } from "lucide-react";
import styles from "./contact.module.css";

export function ContactOptions() {
  const options = [
    {
      category: "Sales Questions",
      title: "Sales & Account Fit",
      desc: "Discuss plan selection, rollout planning, and account fit with support.",
      href: "mailto:contact-086473cbd844@example.invalid?subject=BlackArrow%20Sales%20Inquiry",
      action: "Email Support About Sales",
      icon: <HelpCircle size={20} />,
    },
    {
      category: "Setup Assistance",
      title: "Onboarding Guidance",
      desc: "Get guidance on connecting WhatsApp, training AI instructions, and organizing catalogs.",
      href: "mailto:contact-086473cbd844@example.invalid?subject=BlackArrow%20Setup%20Question",
      action: "Email Support About Setup",
      icon: <Mail size={20} />,
    },
    {
      category: "Account and Billing",
      title: "Billing & Subscriptions",
      desc: "Ask questions about monthly plans, wallet balance top-ups, add-ons, or custom options.",
      href: "mailto:contact-086473cbd844@example.invalid?subject=BlackArrow%20Billing%20Question",
      action: "Email Support About Billing",
      icon: <CreditCard size={20} />,
    },
    {
      category: "Technical Support",
      title: "API & Webhook Assistance",
      desc: "Get technical guidance on REST API dispatches, webhook configurations, or documentation questions.",
      href: "mailto:contact-086473cbd844@example.invalid?subject=BlackArrow%20Technical%20Support%20Question",
      action: "Email Support About Technical Issues",
      icon: <Wrench size={20} />,
    },
    {
      category: "Existing Customers",
      title: "Account Dashboard & Docs",
      desc: "Existing customers can log into their dashboard or review technical documentation.",
      href: "/login",
      action: "Open Account Dashboard",
      icon: <UserCheck size={20} />,
    },
  ];

  return (
    <section id="contact-options" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Mail size={14} /> Support Channels
        </div>
        <h2 className={styles.title}>Choose Your Inquiry Topic</h2>
        <p className={styles.subtitle}>
          Select the topic that matches your question to send a pre-formatted email to contact-086473cbd844@example.invalid.
        </p>
      </div>

      <div className={styles.optionsGrid}>
        {options.map((opt) => (
          <div key={opt.category} className={styles.optionCard}>
            <div>
              <div className={styles.optionCategory}>{opt.category}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.75rem 0 0.5rem 0" }}>
                <div style={{ color: "var(--ca-brand)" }}>{opt.icon}</div>
                <h3 className={styles.optionTitle}>{opt.title}</h3>
              </div>
              <p className={styles.optionDesc}>{opt.desc}</p>
            </div>
            <div>
              <ButtonLink href={opt.href} variant="secondary">
                {opt.action}
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
