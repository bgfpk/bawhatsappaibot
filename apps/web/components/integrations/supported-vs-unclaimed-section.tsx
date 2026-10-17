import { Check, HelpCircle, XCircle } from "lucide-react";
import styles from "./integrations.module.css";

export function SupportedVsUnclaimedSection() {
  const supportedList = [
    "WooCommerce (configured product catalog data & workspace order context)",
    "WordPress & Website Knowledge (configured business knowledge sources)",
    "PostEx Courier (order search & delivery tracking where configured)",
    "Leopards Courier (consignment tracking status & packet booking where configured)",
    "Public REST API (technical REST API endpoints)",
    "Webhook Configuration (spreadsheet destination & inbound billing callbacks)",
  ];

  const unclaimedList = [
    "Shopify (not currently claimed or connected)",
    "Salesforce / HubSpot (not currently claimed as direct connectors)",
    "Instagram / Facebook Messenger / Telegram (not currently claimed)",
    "Zapier / Make (not currently claimed as direct connectors; webhooks available)",
    "Other Couriers or CRMs (not currently claimed unless supported by API)",
  ];

  return (
    <section id="comparison-matrix" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <HelpCircle size={14} /> Clear Scope Matrix
        </div>
        <h2 className={styles.title}>Supported vs. Not Currently Claimed</h2>
        <p className={styles.subtitle}>
          We maintain transparent documentation so you know exactly which connectors are supported today.
        </p>
      </div>

      <div className={styles.comparisonWrapper}>
        <div className={styles.comparisonGrid}>
          {/* Supported Column */}
          <div className={styles.comparisonCol}>
            <div className={styles.comparisonColHeader} style={{ color: "var(--ca-brand-strong)" }}>
              <Check size={20} />
              <span>Supported &amp; Configurable</span>
            </div>
            <ul className={styles.comparisonList}>
              {supportedList.map((item, i) => (
                <li key={i} className={styles.comparisonItem}>
                  <Check size={16} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Unclaimed Column */}
          <div className={styles.comparisonCol}>
            <div className={styles.comparisonColHeader} style={{ color: "var(--ca-text-muted)" }}>
              <XCircle size={20} />
              <span>Not Currently Claimed</span>
            </div>
            <ul className={styles.comparisonList}>
              {unclaimedList.map((item, i) => (
                <li key={i} className={styles.comparisonItem}>
                  <XCircle size={16} style={{ color: "var(--ca-text-muted)", flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
