import React from "react";
import { Code, Truck, PackageCheck, AlertTriangle } from "lucide-react";
import styles from "./docs.module.css";

export function IntegrationDeveloperGuide() {
  return (
    <section id="developer-integrations" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <Code size={14} /> Integrations &amp; Logistics Guide
          </div>
          <h2 className={styles.title}>Logistics &amp; Catalog Integration Scope</h2>
          <p className={styles.subtitle}>
            Understand how courier tracking and product catalog context operate within your BlackArrow workspace settings.
          </p>
        </div>

        {/* Business Integrations & Grounding Scope */}
        <div className={styles.setupGrid}>
          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>WooCommerce Product Catalog</h3>
            <p className={styles.stepDesc}>
              Configured or imported WooCommerce product catalog data can be formatted into AI context where available.
            </p>
            <div className={styles.stepNotice}>
              <strong>Scope Notice:</strong> Product context grounding is manual or static; BlackArrow does not automatically connect to WooCommerce APIs, perform real-time store inventory sync, or retrieve WooCommerce orders.
            </div>
          </div>

          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>PostEx Logistics</h3>
            <p className={styles.stepDesc}>
              Connect PostEx courier merchant credentials to perform parcel tracking lookups and generate booking payloads where configured.
            </p>
            <div className={styles.stepNotice}>
              <strong>Scope Notice:</strong> Operational availability requires valid merchant API tokens configured in dashboard settings.
            </div>
          </div>

          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>Leopards Courier</h3>
            <p className={styles.stepDesc}>
              Connect Leopards Courier merchant credentials for consignment tracking lookups and booking dispatch within supported setups.
            </p>
            <div className={styles.stepNotice}>
              <strong>Scope Notice:</strong> Dispatch operations depend on active merchant account credentials and courier server availability.
            </div>
          </div>
        </div>

        <div className={styles.warningBox} style={{ marginTop: "2.5rem" }}>
          <AlertTriangle className={styles.warningIcon} size={22} />
          <div>
            <div className={styles.warningTitle}>API &amp; Platform Architecture Scope</div>
            <div className={styles.warningText}>
              BlackArrow is managed through the secure workspace dashboard UI.
              BlackArrow does not publish an external public REST API or Bearer token interface.
              Never share or disclose workspace login credentials or API keys publicly.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
