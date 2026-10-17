import { MessageSquare } from "lucide-react";
import styles from "./contact.module.css";

export function ContactHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.eyebrow}>
        <MessageSquare size={14} /> Official Support &amp; Sales Channels
      </div>
      <h1 className={styles.heroTitle}>
        Talk to BlackArrow About Your <span style={{ color: "var(--ca-brand)" }}>WhatsApp Workflow</span>
      </h1>
      <p className={styles.heroText}>
        Reach out to our team for product questions, onboarding guidance, billing assistance, technical support, or enterprise workflow discussions.
      </p>
    </section>
  );
}
