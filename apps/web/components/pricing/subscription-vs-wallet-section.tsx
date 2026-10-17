import { CheckCircle2, Layers, Wallet } from "lucide-react";
import styles from "./pricing.module.css";

export function SubscriptionVsWalletSection() {
  return (
    <section id="billing-structure" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Layers size={14} /> Clear Cost Separation
        </div>
        <h2 className={styles.title}>What Your Subscription & Wallet Cover</h2>
        <p className={styles.subtitle}>
          BlackArrow separates fixed workspace infrastructure from variable pay-as-you-go AI usage so you never pay for unused message estimates.
        </p>
      </div>

      <div className={styles.pillarsGrid}>
        <div className={styles.pillarCard}>
          <div className={styles.pillarHeader}>
            <div className={styles.pillarIconWrapper}>
              <Layers size={24} />
            </div>
            <div>
              <h3 className={styles.pillarTitle}>1. Monthly Subscription</h3>
              <span style={{ fontSize: "0.875rem", color: "var(--ca-brand-strong)", fontWeight: 600 }}>
                Fixed Monthly Access
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.9375rem", color: "var(--ca-text-muted)", lineHeight: 1.5 }}>
            Covers your team&apos;s workspace infrastructure, included WhatsApp instances, catalog storage, and operational dashboard.
          </p>
          <ul className={styles.pillarList}>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>WhatsApp instance capacity &amp; multi-device session management</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Products &amp; services catalog storage</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Structured Customer 360 profiles &amp; order history storage</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Media groups, templates, &amp; reusable sequence builders</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Live conversation dashboard, pause/resume, and human handoff controls</span>
            </li>
          </ul>
        </div>

        <div className={styles.pillarCard}>
          <div className={styles.pillarHeader}>
            <div className={styles.pillarIconWrapper}>
              <Wallet size={24} />
            </div>
            <div>
              <h3 className={styles.pillarTitle}>2. Prepaid Wallet</h3>
              <span style={{ fontSize: "0.875rem", color: "var(--ca-brand-strong)", fontWeight: 600 }}>
                Pay-As-You-Go AI &amp; Automation
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.9375rem", color: "var(--ca-text-muted)", lineHeight: 1.5 }}>
            Covers actual AI understanding, automated replies, voice notes, and sequence message dispatches as they happen.
          </p>
          <ul className={styles.pillarList}>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>AI text responses ($0.003 / reply)</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Image understanding ($0.007 / image) &amp; voice notes ($0.010 / voice note)</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Generated voice replies (from $0.020 / reply)</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Sequence template sends ($0.0005 / item) &amp; media file sends ($0.001 / file)</span>
            </li>
            <li className={styles.pillarItem}>
              <CheckCircle2 size={16} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.2rem" }} />
              <span>Prepaid top-ups starting from $5 with itemized deduction log transparency</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
