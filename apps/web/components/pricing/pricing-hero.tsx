import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { Layers, Sparkles, Wallet, CheckCircle2 } from "lucide-react";
import styles from "./pricing.module.css";

export function PricingHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.eyebrow}>
        <Sparkles size={14} /> Clear Commercial Structure
      </div>
      <h1 className={styles.heroTitle}>
        Simple Plans for Your <span className="mint">WhatsApp AI Workspace</span>
      </h1>
      <p className={styles.heroSubtitle}>
        Monthly subscription plans cover platform workspace access and included capacity.
        Pay-as-you-go AI understanding, replies, and automation usage are deducted transparently from your prepaid wallet.
      </p>
      <div className={styles.actions}>
        <ButtonLink href={CURRENT_CTA_LINKS.startTrial} showArrow>
          Start Free
        </ButtonLink>
        <ButtonLink href="#comparison" variant="secondary">
          Compare Plans
        </ButtonLink>
      </div>
      <div className={styles.trustRow}>
        <div className={styles.trustItem}>
          <CheckCircle2 size={14} style={{ color: "var(--ca-brand)" }} />
          <span>7-Day Free Trial</span>
        </div>
        <div className={styles.trustItem}>
          <Sparkles size={14} style={{ color: "var(--ca-brand)" }} />
          <span>$1 AI Credit Included</span>
        </div>
        <div className={styles.trustItem}>
          <Wallet size={14} style={{ color: "var(--ca-brand)" }} />
          <span>Min. Wallet Top-Up $5</span>
        </div>
        <div className={styles.trustItem}>
          <Layers size={14} style={{ color: "var(--ca-brand)" }} />
          <span>Usage Visible in Dashboard</span>
        </div>
      </div>
    </section>
  );
}
