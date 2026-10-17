import { BILLING_ADDONS } from "@/lib/public-content";
import { PlusCircle } from "lucide-react";
import styles from "./pricing.module.css";

export function AddonsSection() {
  return (
    <section id="addons" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <PlusCircle size={14} /> Modular Expansion
        </div>
        <h2 className={styles.title}>Account Capacity Add-ons</h2>
        <p className={styles.subtitle}>
          Expand specific resource limits as your business grows without upgrading to a larger plan tier.
        </p>
      </div>

      <div className={styles.addonsGrid}>
        {BILLING_ADDONS.map((addon) => (
          <div key={addon.id} className={styles.addonCard}>
            <span className={styles.addonName}>{addon.name}</span>
            <span className={styles.addonPrice}>{addon.price}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
