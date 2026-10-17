import { ShoppingCart, CheckCircle, Clock, Truck, Send } from "lucide-react";
import styles from "./features.module.css";

const LIFECYCLE_STEPS = [
  { step: "1", title: "Inquiry Received", desc: "Customer sends item query or image on WhatsApp.", icon: ShoppingCart },
  { step: "2", title: "Details Collected", desc: "AI collects delivery address and contact info.", icon: CheckCircle },
  { step: "3", title: "Order Captured", desc: "Order details logged into dashboard context.", icon: CheckCircle },
  { step: "4", title: "Confirmation Sent", desc: "Itemized WhatsApp receipt & total delivered.", icon: Send },
  { step: "5", title: "Scheduled Follow-Up", desc: "Automated reminder for pending confirmations.", icon: Clock },
  { step: "6", title: "Customer Update", desc: "Tracking update via PostEx/Leopards where configured.", icon: Truck },
];

export function OrdersLifecycleSection() {
  return (
    <section id="orders-followups" className={styles.section}>
      <div id="automations" />
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Order Operations Lifecycle</span>
          <h2 className={styles.sectionTitle}>Connected Order Capture, Confirmations, and Follow-Ups</h2>
          <p className={styles.sectionDesc}>
            Guide customer conversations through structured order workflows, itemized confirmation messages, and scheduled follow-ups.
          </p>
        </div>

        {/* Lifecycle Stepper Composition */}
        <div className={styles.mockupShell}>
          <div className={styles.mockupHeader}>
            <span>WhatsApp Order &amp; Follow-Up Lifecycle Workflow</span>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Automated &amp; Staff-Reviewed</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              {LIFECYCLE_STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.step} className={`${styles.card} ${styles.gridItem3}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "var(--ca-brand-soft)", color: "var(--ca-brand-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.8125rem", flexShrink: 0 }}>
                        {s.step}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--ca-text-primary)" }}>{s.title}</div>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>{s.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
