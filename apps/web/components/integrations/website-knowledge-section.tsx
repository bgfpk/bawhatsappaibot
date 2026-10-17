import { Globe, Check } from "lucide-react";
import styles from "./integrations.module.css";

export function WebsiteKnowledgeSection() {
  const capabilities = [
    "Configured website pages (service descriptions, policies, FAQs, and contact details) added as business knowledge sources",
    "WordPress content integration for published posts and pages where configured",
    "Grounded AI reply generation referencing your configured business knowledge base",
    "Manual and rule-based knowledge updating managed directly from account settings",
  ];

  return (
    <section id="website-knowledge" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.featureCard} style={{ maxWidth: "960px", margin: "0 auto" }}>
        <div className={styles.featureHeader}>
          <div className={styles.featureTitleWrapper}>
            <div className={styles.iconWrapper}>
              <Globe size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>WordPress &amp; Website Knowledge</h2>
              <span className={styles.statusBadge}>Where Configured</span>
            </div>
          </div>
        </div>

        <p className={styles.cardDescription}>
          Supply your business website pages, service descriptions, and policy documents to give your AI assistant grounded business context for customer replies.
        </p>

        <ul className={styles.capabilitiesList}>
          {capabilities.map((cap, i) => (
            <li key={i} className={styles.capabilityItem}>
              <Check size={16} className={styles.checkIcon} />
              <span>{cap}</span>
            </li>
          ))}
        </ul>

        <div className={styles.limitNote}>
          <strong>Source Maintenance:</strong> AI reply quality strictly depends on your configured source content. Outdated or inaccurate website pages will produce outdated answers. Automated web crawling is not claimed.
        </div>
      </div>
    </section>
  );
}
