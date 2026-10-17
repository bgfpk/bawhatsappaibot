import Link from "next/link";
import { ShoppingBag, Check, ArrowRight } from "lucide-react";
import styles from "./integrations.module.css";

export function WooCommerceSection() {
  const capabilities = [
    "Product catalog details formatted into AI context (names, SKUs, descriptions, prices, and stock quantities where supplied)",
    "BlackArrow uses workspace order records for customer conversation context and inquiry lookups",
    "Grounded WhatsApp reply generation for customer product availability and catalog questions",
    "Product catalog information formatted from configured or imported WooCommerce data",
  ];

  return (
    <section id="woocommerce" className={styles.section}>
      <div className={styles.featureCard} style={{ maxWidth: "960px", margin: "0 auto" }}>
        <div className={styles.featureHeader}>
          <div className={styles.featureTitleWrapper}>
            <div className={styles.iconWrapper}>
              <ShoppingBag size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>WooCommerce Integration</h2>
              <span className={styles.statusBadge}>Where Configured</span>
            </div>
          </div>
        </div>

        <p className={styles.cardDescription}>
          Format configured or imported WooCommerce product catalog data into AI prompt context to assist customers with product inquiries and workspace order records. Explore our dedicated <Link href="/woocommerce-whatsapp-automation" style={{ color: "var(--ca-accent-primary)", textDecoration: "underline" }}>WooCommerce WhatsApp automation guide</Link> for detailed workflow breakdowns.
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
          <strong>Configuration &amp; Operations:</strong> Requires configured product catalog data in your BlackArrow workspace. Automatic WooCommerce store connection, order creation, refund processing, payment processing, and real-time inventory synchronization are not performed by the public integration.
        </div>
      </div>
    </section>
  );
}
