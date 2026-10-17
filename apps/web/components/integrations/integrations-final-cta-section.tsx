import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { ArrowRight, Bot } from "lucide-react";
import styles from "./integrations.module.css";

export function IntegrationsFinalCtaSection() {
  return (
    <section className={styles.section} style={{ paddingTop: "2rem" }}>
      <div
        className={styles.featureCard}
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          textAlign: "center",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(10, 15, 13, 0.9) 100%)",
          borderColor: "rgba(16, 185, 129, 0.3)",
        }}
      >
        <div className={styles.eyebrow}>
          <Bot size={14} /> Get Started Today
        </div>
        <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--ca-text-bright)" }}>
          Connect Your WhatsApp Workflow to the Systems Your Business Already Uses
        </h2>
        <p className={styles.cardDescription} style={{ maxWidth: "680px" }}>
          Start your 7-day free trial with $1 included AI credit. Connect your WhatsApp number, store catalog, and courier APIs today.
        </p>

        <div className={styles.actions} style={{ marginBottom: 0 }}>
          <ButtonLink href={CURRENT_CTA_LINKS.startTrial} showArrow>
            Start Free
          </ButtonLink>
          <ButtonLink href="/docs" variant="secondary">
            Open Technical Docs
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
