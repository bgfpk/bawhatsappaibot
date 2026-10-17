"use client";

import { Truck, Webhook, ShoppingBag, Code, ShieldCheck } from "lucide-react";
import styles from "./homepage.module.css";

const INTEGRATIONS = [
  {
    name: "PostEx Courier API",
    category: "Courier & Logistics",
    description: "Format shipping details and check PostEx order tracking status where API credentials are configured.",
    status: "Where Configured",
  },
  {
    name: "Leopards Courier API",
    category: "Courier & Logistics",
    description: "Check Leopards tracking updates and courier booking details where API credentials are provided.",
    status: "Where Configured",
  },
  {
    name: "Public API & Webhooks",
    category: "Developer Integration",
    description: "Connect custom backends via webhooks and BlackArrow API endpoints.",
    status: "API Connector",
  },
  {
    name: "WooCommerce Catalog Grounding",
    category: "E-Commerce Catalog",
    description: "Format configured or imported WooCommerce catalog data into AI grounding context.",
    status: "Catalog Grounding",
  },
] as const;

export function IntegrationsSection() {
  return (
    <section id="integrations" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Integrations &amp; Connectors</span>
          <h2 className={styles.sectionTitle}>Connect WooCommerce, Courier APIs, and Custom Webhooks</h2>
          <p className={styles.sectionDesc}>
            Use configured WooCommerce catalog data, connect PostEx and Leopards courier tracking where supported, or configure webhooks for custom backend notifications.
          </p>
        </div>

        <div className={styles.grid2}>
          {INTEGRATIONS.map((item) => (
            <div key={item.name} className={styles.card} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ca-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {item.category}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeBrand}`}>{item.status}</span>
                </div>

                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--ca-text-primary)", marginBottom: "0.5rem" }}>
                  {item.name}
                </h3>

                <p style={{ fontSize: "0.9375rem", color: "var(--ca-text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>
                  {item.description}
                </p>
              </div>

              <div style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)", paddingTop: "0.75rem", borderTop: "1px solid var(--ca-border-subtle)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <ShieldCheck size={14} style={{ color: "var(--ca-brand)" }} />
                <span>Requires active credentials configured. Staff should verify product, order and delivery information before fulfillment.</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
