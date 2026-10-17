import { Calculator } from "lucide-react";
import styles from "./pricing.module.css";

export function BillingStructureSection() {
  return (
    <section id="illustrative-billing" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Calculator size={14} /> Illustrative Billing Structure
        </div>
        <h2 className={styles.title}>How Your Monthly Invoice Is Calculated</h2>
        <p className={styles.subtitle}>
          Your account total reflects fixed subscription access plus only the actual usage and optional add-ons configured for your team.
        </p>
      </div>

      <div className={styles.structureBox}>
        <div className={styles.structureItem}>
          <div className={styles.structureTitle}>1. Monthly Subscription</div>
          <div className={styles.structureDetail}>$9, $29, or $89 / mo</div>
        </div>

        <div className={styles.structureOperator}>+</div>

        <div className={styles.structureItem}>
          <div className={styles.structureTitle}>2. Actual Wallet Usage</div>
          <div className={styles.structureDetail}>Itemized AI &amp; Automation</div>
        </div>

        <div className={styles.structureOperator}>+</div>

        <div className={styles.structureItem}>
          <div className={styles.structureTitle}>3. Optional Add-ons / Setup</div>
          <div className={styles.structureDetail}>As Configured</div>
        </div>

        <div className={styles.structureOperator}>=</div>

        <div className={`${styles.structureItem} ${styles.structureTotal}`}>
          <div className={styles.structureTitle} style={{ color: "var(--ca-brand-strong)" }}>
            Total Account Cost
          </div>
          <div className={styles.structureDetail} style={{ color: "var(--ca-brand-strong)" }}>
            Transparent Invoice
          </div>
        </div>
      </div>
    </section>
  );
}
