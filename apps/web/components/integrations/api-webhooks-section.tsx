import { ButtonLink } from "@/components/button-link";
import { Code, Check, Webhook } from "lucide-react";
import styles from "./integrations.module.css";

export function ApiWebhooksSection() {
  const apiCaps = [
    "RESTful JSON API endpoints for custom web forms and external software dispatches",
    "Customer profile update endpoints for saving instructions and workspace preferences",
    "Structured JSON request and response format for technical integration",
    "Account-level request structure for REST API dispatches",
  ];

  const webhookCaps = [
    "Webhook URL configuration field (googleSheetWebhookUrl) for spreadsheet destination setup",
    "Inbound webhook support for platform payment and billing notifications",
    "Structured JSON payload format with event timestamps and customer data fields",
    "Configurable endpoint destination fields managed from account settings",
  ];

  return (
    <section id="developer-api" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Code size={14} /> Technical &amp; Developer Interfaces
        </div>
        <h2 className={styles.title}>Public API &amp; Webhook Connections</h2>
        <p className={styles.subtitle}>
          Connect custom web forms, CRMs, or external business tools using REST API endpoints and webhook configurations.
        </p>
      </div>

      <div className={styles.featureBlockGrid}>
        {/* Public API Card */}
        <div className={styles.featureCard}>
          <div className={styles.featureHeader}>
            <div className={styles.featureTitleWrapper}>
              <div className={styles.iconWrapper}>
                <Code size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Public REST API</h3>
              </div>
            </div>
            <span className={styles.statusBadge}>Public Developer Interface</span>
          </div>

          <p className={styles.cardDescription}>
            Use REST API endpoints to connect custom web forms or proprietary software to your BlackArrow workspace.
          </p>

          <ul className={styles.capabilitiesList}>
            {apiCaps.map((cap, i) => (
              <li key={i} className={styles.capabilityItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>{cap}</span>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: "0.5rem" }}>
            <ButtonLink href="/docs" variant="secondary" showArrow>
              Review API Documentation
            </ButtonLink>
          </div>
        </div>

        {/* Webhooks Card */}
        <div className={styles.featureCard}>
          <div className={styles.featureHeader}>
            <div className={styles.featureTitleWrapper}>
              <div className={styles.iconWrapper}>
                <Webhook size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Webhook Configuration</h3>
              </div>
            </div>
            <span className={styles.statusBadge}>Public Developer Interface</span>
          </div>

          <p className={styles.cardDescription}>
            Configure webhook parameters for spreadsheet destinations and receive inbound platform billing callbacks.
          </p>

          <ul className={styles.capabilitiesList}>
            {webhookCaps.map((cap, i) => (
              <li key={i} className={styles.capabilityItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>{cap}</span>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: "0.5rem" }}>
            <ButtonLink href="/docs" variant="secondary" showArrow>
              Review Webhook Documentation
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
