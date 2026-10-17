import { ButtonLink } from "@/components/button-link";
import { Sparkles } from "lucide-react";
import styles from "./about.module.css";

export function AboutHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.eyebrow}>
        <Sparkles size={14} /> Product Philosophy &amp; Scope
      </div>
      <h1 className={styles.heroTitle}>
        Building a More Practical Way to Run <span style={{ color: "var(--ca-brand)" }}>WhatsApp Sales and Support</span>
      </h1>
      <p className={styles.heroText}>
        BlackArrow combines business-configured AI replies, customer records, operational workflows, and human control in one dedicated WhatsApp workspace.
      </p>
      <div className={styles.heroActions}>
        <ButtonLink href="/features" showArrow>
          Explore Features
        </ButtonLink>
        <ButtonLink href="/contact" variant="secondary">
          Contact BlackArrow
        </ButtonLink>
      </div>
    </section>
  );
}
