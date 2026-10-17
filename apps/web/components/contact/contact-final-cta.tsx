import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { ArrowRight, Bot } from "lucide-react";
import styles from "./contact.module.css";

export function ContactFinalCta() {
  return (
    <section className={styles.section} style={{ paddingTop: "2rem" }}>
      <div
        className={styles.contactBox}
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
          <Bot size={14} /> Ready to Begin?
        </div>
        <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--ca-text-bright)" }}>
          Start with the Right BlackArrow Conversation
        </h2>
        <p className={styles.optionDesc} style={{ maxWidth: "680px" }}>
          Start your 7-day free trial, explore detailed platform features, or review technical documentation to prepare your team.
        </p>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "1rem" }}>
          <ButtonLink href={CURRENT_CTA_LINKS.startTrial} showArrow>
            Start Free
          </ButtonLink>
          <ButtonLink href="/features" variant="secondary">
            Explore Features
          </ButtonLink>
          <ButtonLink href="/docs" variant="secondary">
            View Documentation
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
