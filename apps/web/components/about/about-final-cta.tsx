import { ButtonLink } from "@/components/button-link";
import { ArrowRight, Bot } from "lucide-react";
import styles from "./about.module.css";

export function AboutFinalCta() {
  return (
    <section className={styles.section} style={{ paddingTop: "2rem" }}>
      <div
        className={styles.card}
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          textAlign: "center",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(10, 15, 13, 0.9) 100%)",
          borderColor: "rgba(16, 185, 129, 0.3)",
          padding: "3rem 2rem",
        }}
      >
        <div className={styles.eyebrow}>
          <Bot size={14} /> Get Started
        </div>
        <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--ca-text-bright)" }}>
          See How BlackArrow Fits Your WhatsApp Workflow
        </h2>
        <p className={styles.cardText} style={{ maxWidth: "680px" }}>
          Explore our product features, review transparent plan pricing, or speak directly with our team about your operational goals.
        </p>

        <div className={styles.heroActions} style={{ marginTop: "1rem" }}>
          <ButtonLink href="/features" showArrow>
            Explore Features
          </ButtonLink>
          <ButtonLink href="/pricing" variant="secondary">
            View Pricing
          </ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Contact BlackArrow
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
