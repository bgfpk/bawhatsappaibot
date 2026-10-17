import { ButtonLink } from "@/components/button-link";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { APP_TRIAL_DAYS, APP_TRIAL_AI_CREDIT_USD } from "../../../../src/config/billing-access";
import { FULL_SETUP_PRICE } from "@/lib/public-content";
import { Sparkles, Wrench, CheckCircle2 } from "lucide-react";
import styles from "./pricing.module.css";

export function TrialSetupSection() {
  return (
    <section id="trial-setup" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Sparkles size={14} /> Low-Risk Onboarding
        </div>
        <h2 className={styles.title}>Free Trial &amp; Optional Assisted Setup</h2>
        <p className={styles.subtitle}>
          Test BlackArrow risk-free before choosing a plan, or opt for assisted account configuration when your business needs hands-on help.
        </p>
      </div>

      <div className={styles.pillarsGrid}>
        <div className={styles.pillarCard} style={{ borderColor: "rgba(16, 185, 129, 0.3)" }}>
          <div className={styles.pillarHeader}>
            <div className={styles.pillarIconWrapper}>
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className={styles.pillarTitle}>{APP_TRIAL_DAYS}-Day Free Trial</h3>
              <span style={{ fontSize: "0.875rem", color: "var(--ca-brand-strong)", fontWeight: 600 }}>
                Includes ${APP_TRIAL_AI_CREDIT_USD} AI Test Credit
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.9375rem", color: "var(--ca-text-muted)", lineHeight: 1.5 }}>
            Experience the full platform capacity on one WhatsApp number before committing to a monthly subscription.
          </p>
          <ul className={styles.pillarList}>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Full test access to AI replies, order capture, and Customer 360</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>${APP_TRIAL_AI_CREDIT_USD} complimentary AI wallet credit for testing customer interaction</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>No paid subscription required during the initial 7-day trial period</span>
            </li>
          </ul>
          <div style={{ marginTop: "1rem" }}>
            <ButtonLink href={CURRENT_CTA_LINKS.startTrial} showArrow>
              Start Free Trial
            </ButtonLink>
          </div>
        </div>

        <div className={styles.pillarCard}>
          <div className={styles.pillarHeader}>
            <div className={styles.pillarIconWrapper}>
              <Wrench size={24} />
            </div>
            <div>
              <h3 className={styles.pillarTitle}>Optional Full Setup</h3>
              <span style={{ fontSize: "0.875rem", color: "var(--ca-brand-strong)", fontWeight: 600 }}>
                ${FULL_SETUP_PRICE} One-Time Fee
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.9375rem", color: "var(--ca-text-muted)", lineHeight: 1.5 }}>
            For busy teams that prefer expert assistance in preparing business knowledge and workflow rules.
          </p>
          <ul className={styles.pillarList}>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Assisted account setup &amp; business knowledge configuration</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Product catalog structure and shipping policy alignment</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Separate from monthly subscription and wallet balances</span>
            </li>
          </ul>
          <div style={{ marginTop: "1rem" }}>
            <ButtonLink href="mailto:contact-086473cbd844@example.invalid" variant="secondary">
              Request Setup Assistance
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
