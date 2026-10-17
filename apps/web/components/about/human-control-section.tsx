import { UserCheck, Shield } from "lucide-react";
import styles from "./about.module.css";

export function HumanControlSection() {
  return (
    <section id="human-control" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <UserCheck size={14} /> Human Control &amp; Oversight
        </div>
        <h2 className={styles.title}>Balanced Automation &amp; Human Oversight</h2>
        <p className={styles.subtitle}>
          Staff can pause AI replies, take over a conversation, and resume automation where supported.
        </p>
      </div>

      <div className={styles.noticeBox}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", color: "var(--ca-brand)" }}>
          <Shield size={22} />
          <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ca-text-bright)", margin: 0 }}>
            Operational Boundaries
          </h3>
        </div>
        <p style={{ marginBottom: "1rem" }}>
          BlackArrow assists businesses with automated replies and customer data capture, but full responsibility for customer interactions remains with the operating business.
        </p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <span className={styles.checkIcon}>•</span>
            <span><strong>Client Compliance:</strong> Clients remain responsible for acquiring valid customer consent, adhering to local privacy regulations, and managing opt-outs.</span>
          </li>
          <li className={styles.listItem}>
            <span className={styles.checkIcon}>•</span>
            <span><strong>Commercial Accuracy:</strong> Product pricing, refund decisions, delivery timelines, and promotional promises stated in customer replies remain the responsibility of the client business.</span>
          </li>
          <li className={styles.listItem}>
            <span className={styles.checkIcon}>•</span>
            <span><strong>WhatsApp Platform Terms:</strong> Linked Devices automation carries platform usage conditions. BlackArrow does not make zero-ban guarantees or claim immunity from WhatsApp terms enforcement.</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
