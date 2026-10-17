import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { SectionCard } from "@/components/section";
import styles from "./pricing.module.css";

export function PricingFinalCtaSection() {
  return (
    <div style={{ padding: "0 1.5rem 5rem", maxWidth: "1280px", margin: "0 auto" }}>
      <SectionCard className="site-section final-cta-card">
        <p className={styles.eyebrow} style={{ justifyContent: "center" }}>
          Ready to Automate Your WhatsApp Workflow?
        </p>
        <h2 style={{ fontSize: "2.25rem", fontWeight: 800, color: "var(--ca-text-bright)", marginBottom: "1rem" }}>
          Start with the Plan That Fits Your WhatsApp Workflow
        </h2>
        <p style={{ fontSize: "1.125rem", color: "var(--ca-text-muted)", maxWidth: "600px", margin: "0 auto 2rem" }}>
          Begin your 7-day free trial with $1 AI test credit included. Upgrade, downgrade, or adjust add-ons whenever your team needs them.
        </p>
        <div className={styles.actions}>
          <ButtonLink href={CURRENT_CTA_LINKS.startTrial} showArrow>
            Start Free
          </ButtonLink>
          <ButtonLink href="/features" variant="secondary">
            Explore Features
          </ButtonLink>
        </div>
      </SectionCard>
    </div>
  );
}
