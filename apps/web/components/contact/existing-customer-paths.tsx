import { ButtonLink } from "@/components/button-link";
import { Link2 } from "lucide-react";
import styles from "./contact.module.css";

export function ExistingCustomerPaths() {
  const paths = [
    { label: "Login to Dashboard", href: "/login", desc: "Access your active workspace dashboard to manage instances and replies." },
    { label: "Technical Documentation", href: "/docs", desc: "Review setup guides, reply modes, API endpoints, and configuration options." },
    { label: "Plan & Billing Details", href: "/pricing", desc: "Review plan limits, instance capacities, add-ons, and AI usage rates." },
    { label: "Product Features", href: "/features", desc: "Explore supported features, reply controls, and customer records." },
  ];

  return (
    <section id="customer-paths" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Link2 size={14} /> Quick Links
        </div>
        <h2 className={styles.title}>Existing Customer Resources</h2>
        <p className={styles.subtitle}>
          Need immediate self-service assistance? Use these quick links to access account resources.
        </p>
      </div>

      <div className={styles.optionsGrid}>
        {paths.map((p) => (
          <div key={p.label} className={styles.optionCard}>
            <div>
              <h3 className={styles.optionTitle} style={{ fontSize: "1.125rem" }}>{p.label}</h3>
              <p className={styles.optionDesc} style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>{p.desc}</p>
            </div>
            <div>
              <ButtonLink href={p.href} variant="secondary" showArrow>
                Open {p.label}
              </ButtonLink>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
