import { Compass, Check } from "lucide-react";
import styles from "./about.module.css";

export function ProductPrinciples() {
  const principles = [
    {
      title: "Business Context Must Guide AI Replies",
      text: "AI responses should strictly draw from configured store knowledge, catalogs, and operational rules rather than ungrounded general models.",
    },
    {
      title: "Humans Must Retain Interventions & Supervision",
      text: "Support teams can pause automation, take over a conversation, or resume replies whenever a customer conversation requires human judgment.",
    },
    {
      title: "Usage & Operational Costs Must Remain Visible",
      text: "Plan capacities, wallet balances, and AI usage rates are displayed transparently in the workspace dashboard with zero hidden fees.",
    },
    {
      title: "Integrations Must Be Described Accurately",
      text: "Supported connectors (WooCommerce catalog details, PostEx, Leopards, Public API, Webhooks) are presented with factual implementation bounds.",
    },
    {
      title: "Automation Must Remain Controlled & Guarded",
      text: "Businesses can set strict response boundaries, language preferences, and safety rules to prevent unauthorized or unintended replies.",
    },
    {
      title: "Clients Retain Legal & Compliance Responsibility",
      text: "Businesses using BlackArrow remain responsible for customer consent, lawful messaging practices, refund policies, and WhatsApp terms compliance.",
    },
  ];

  return (
    <section id="principles" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Compass size={14} /> Product Foundations
        </div>
        <h2 className={styles.title}>Core Operating Principles</h2>
        <p className={styles.subtitle}>
          Our product design decisions are guided by practical engineering, transparency, and respect for business operations.
        </p>
      </div>

      <div className={styles.cardGrid}>
        {principles.map((prin, i) => (
          <div key={i} className={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)" }}>
              <Check size={18} />
              <h3 className={styles.cardTitle} style={{ fontSize: "1.125rem" }}>
                {prin.title}
              </h3>
            </div>
            <p className={styles.cardText}>{prin.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
