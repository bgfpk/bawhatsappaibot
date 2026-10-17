import { ShieldCheck } from "lucide-react";
import styles from "./integrations.module.css";

export function StatusExplanationSection() {
  const statusItems = [
    {
      badge: "Supported",
      title: "Built-In Capability",
      desc: "The product contains the relevant native functionality ready for workspace configuration.",
    },
    {
      badge: "Where Configured",
      title: "Connected Data Required",
      desc: "Requires configured product data, store details, or knowledge source setup in your dashboard.",
    },
    {
      badge: "Where Configured and Supported",
      title: "Account & Provider Conditions",
      desc: "Availability depends on merchant credentials, supported geographic service areas, and third-party service conditions.",
    },
    {
      badge: "Public Developer Interface",
      title: "API & Webhook Access",
      desc: "Available for custom technical integration through BlackArrow's REST API endpoints or webhook configurations.",
    },
  ];

  return (
    <section className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <ShieldCheck size={14} /> Clear Status Labels
        </div>
        <h2 className={styles.title}>Understanding Integration Availability</h2>
        <p className={styles.subtitle}>
          We clearly distinguish between native platform capabilities, store connections, courier services, and developer interfaces.
        </p>
      </div>

      <div className={styles.statusGrid}>
        {statusItems.map((item) => (
          <div key={item.badge} className={styles.statusCard}>
            <div className={styles.statusBadge}>{item.badge}</div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ca-text-bright)" }}>
              {item.title}
            </h3>
            <p className={styles.statusDesc}>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
