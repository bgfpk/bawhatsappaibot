import React from "react";
import { ArrowRight, HelpCircle } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import styles from "./docs.module.css";

export function DocsFinalCta() {
  return (
    <section id="docs-cta" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.ctaBox}>
          <div className={styles.eyebrow} style={{ margin: "0 auto 1.25rem" }}>
            Get Started Today
          </div>
          <h2 className={styles.title} style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>
            Ready to Configure Your BlackArrow Workspace?
          </h2>
          <p className={styles.subtitle} style={{ margin: "0 auto 2rem" }}>
            Start your 7-day trial with $1 AI credit or reach out to official support for custom onboarding guidance.
          </p>

          <div className={styles.buttonRow}>
            <ButtonLink href={CURRENT_CTA_LINKS.startTrial}>
              Start Free <ArrowRight size={16} />
            </ButtonLink>
            <ButtonLink href="/features" variant="secondary">
              View Features
            </ButtonLink>
            <ButtonLink href="/contact" variant="ghost">
              Contact Support
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
