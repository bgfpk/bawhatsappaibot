import Link from "next/link";
import { Globe, ShoppingCart, Truck, Code, Webhook, ArrowRight } from "lucide-react";
import styles from "./features.module.css";

const INTEGRATIONS_LIST = [
  { name: "WooCommerce", desc: "Format catalog data and order records where configured.", icon: ShoppingCart, status: "Available" },
  { name: "WordPress Knowledge", desc: "Import website pages and FAQ content into Knowledge Base.", icon: Globe, status: "Available" },
  { name: "PostEx Courier API", desc: "Dispatch orders and track shipments where configured & supported.", icon: Truck, status: "Available" },
  { name: "Leopards Courier API", desc: "Fulfill orders via Leopards logistics API where configured & supported.", icon: Truck, status: "Available" },
  { name: "Public REST API", desc: "Export records and trigger workflows via authenticated API keys.", icon: Code, status: "Available" },
  { name: "Custom Webhooks", desc: "Send event notifications to external webhooks on status changes.", icon: Webhook, status: "Available" },
];

export function IntegrationsHubSection() {
  return (
    <section id="integrations" className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Supported Integrations Hub</span>
          <h2 className={styles.sectionTitle}>Link BlackArrow to Your Technical &amp; E-Commerce Stack</h2>
          <p className={styles.sectionDesc}>
            Connect product catalogs, courier logistics, and custom backend systems using supported integrations, public APIs, and webhooks.
          </p>
        </div>

        {/* Integration Hub Visual */}
        <div className={styles.mockupShell} style={{ marginBottom: "2rem" }}>
          <div className={styles.mockupHeader}>
            <span>Supported Integration Node Map</span>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Where Configured &amp; Supported</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              {INTEGRATIONS_LIST.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.name} className={`${styles.card} ${styles.gridItem3}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem" }}>
                        <Icon size={16} />
                        <span>{item.name}</span>
                      </div>
                      <span className={`${styles.badge} ${styles.badgeBrand}`} style={{ fontSize: "0.71875rem" }}>{item.status}</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <Link href="/integrations" className={styles.btnSecondary}>
            <span>View Full Integrations Page</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
