import { ShieldAlert, Check } from "lucide-react";
import styles from "./integrations.module.css";

export function IntegrationControlSection() {
  const controls = [
    {
      title: "Credential Privacy & Scoped Access",
      desc: "API keys and store secrets should be scoped to minimum required permissions and kept strictly private in account settings.",
    },
    {
      title: "Knowledge Source Maintenance",
      desc: "Businesses are responsible for maintaining accurate product catalogs and website policy documents to ensure grounded AI replies.",
    },
    {
      title: "External Service Monitoring",
      desc: "Integration responsiveness depends on third-party API availability (e.g. courier tracking uptime or web server availability).",
    },
    {
      title: "Human Escalation & Safety Fallback",
      desc: "Workspace human handoff rules remain active across all connected channels so staff can take over any complex conversation.",
    },
  ];

  return (
    <section className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <ShieldAlert size={14} /> Operational Control
        </div>
        <h2 className={styles.title}>Integration Governance &amp; Responsibility</h2>
        <p className={styles.subtitle}>
          Maintain full control over connected credentials, data privacy, and operational fallbacks.
        </p>
      </div>

      <div className={styles.featureBlockGrid}>
        {controls.map((ctrl, idx) => (
          <div key={idx} className={styles.featureCard}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className={styles.iconWrapper}>
                <Check size={18} />
              </div>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-bright)" }}>
                {ctrl.title}
              </h3>
            </div>
            <p className={styles.cardDescription}>{ctrl.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
