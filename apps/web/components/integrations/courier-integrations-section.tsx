import Link from "next/link";
import { Truck, Check, ArrowRight } from "lucide-react";
import styles from "./integrations.module.css";

export function CourierIntegrationsSection() {
  const postexCaps = [
    "Order search by customer phone number or order reference via PostEx merchant API credentials",
    "Consignment booking payload formatting for PostEx order creation",
    "Sharing available tracking status or tracking link from the configured courier service",
  ];

  const leopardsCaps = [
    "Consignment tracking lookup by packet tracking numbers via Leopards merchant API credentials",
    "Booked packet creation via Leopards API merchant credentials",
    "Sharing available tracking status or tracking link from the configured courier service",
  ];

  return (
    <section id="couriers" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Truck size={14} /> Logistics &amp; Fulfillment
        </div>
        <h2 className={styles.title}>Supported Courier System Integrations</h2>
        <p className={styles.subtitle}>
          Connect supported logistics services using merchant API credentials to assist customers with <Link href="/whatsapp-order-tracking-automation" style={{ color: "var(--ca-accent-primary)", textDecoration: "underline" }}>delivery status lookups</Link> and <Link href="/whatsapp-cod-order-automation" style={{ color: "var(--ca-accent-primary)", textDecoration: "underline" }}>COD order verification</Link>.
        </p>
      </div>

      <div className={styles.featureBlockGrid}>
        {/* PostEx Card */}
        <div className={styles.featureCard}>
          <div className={styles.featureHeader}>
            <div className={styles.featureTitleWrapper}>
              <div className={styles.iconWrapper}>
                <Truck size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>PostEx Courier</h3>
              </div>
            </div>
            <span className={styles.statusBadge}>Where Configured &amp; Supported</span>
          </div>

          <p className={styles.cardDescription}>
            Connect your PostEx merchant API key to query order status by phone number or reference. Read our full <Link href="/postex-whatsapp-integration" style={{ color: "var(--ca-accent-primary)", textDecoration: "underline" }}>PostEx integration guide</Link>.
          </p>

          <ul className={styles.capabilitiesList}>
            {postexCaps.map((cap, i) => (
              <li key={i} className={styles.capabilityItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>{cap}</span>
              </li>
            ))}
          </ul>

          <div className={styles.timelineFlow}>
            <div className={styles.timelineStep}>1. Order Inquiry</div>
            <ArrowRight size={14} className={styles.flowArrow} />
            <div className={styles.timelineStep}>2. PostEx API Search</div>
            <ArrowRight size={14} className={styles.flowArrow} />
            <div className={styles.timelineStep}>3. WhatsApp Reply</div>
          </div>

          <div className={styles.limitNote}>
            <strong>Provider Conditions:</strong> Requires active PostEx merchant API token (`postex_api_key`). Tracking accuracy depends on PostEx service conditions.
          </div>
        </div>

        {/* Leopards Card */}
        <div className={styles.featureCard}>
          <div className={styles.featureHeader}>
            <div className={styles.featureTitleWrapper}>
              <div className={styles.iconWrapper}>
                <Truck size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Leopards Courier</h3>
              </div>
            </div>
            <span className={styles.statusBadge}>Where Configured &amp; Supported</span>
          </div>

          <p className={styles.cardDescription}>
            Connect your Leopards Courier API key and password to query packet tracking status. Read our full <Link href="/leopards-whatsapp-integration" style={{ color: "var(--ca-accent-primary)", textDecoration: "underline" }}>Leopards integration guide</Link>.
          </p>

          <ul className={styles.capabilitiesList}>
            {leopardsCaps.map((cap, i) => (
              <li key={i} className={styles.capabilityItem}>
                <Check size={16} className={styles.checkIcon} />
                <span>{cap}</span>
              </li>
            ))}
          </ul>

          <div className={styles.timelineFlow}>
            <div className={styles.timelineStep}>1. Packet Tracking ID</div>
            <ArrowRight size={14} className={styles.flowArrow} />
            <div className={styles.timelineStep}>2. Leopards API Lookup</div>
            <ArrowRight size={14} className={styles.flowArrow} />
            <div className={styles.timelineStep}>3. WhatsApp Reply</div>
          </div>

          <div className={styles.limitNote}>
            <strong>Provider Conditions:</strong> Requires Leopards merchant API key and password. BlackArrow does not guarantee third-party courier tracking uptime.
          </div>
        </div>
      </div>
    </section>
  );
}
