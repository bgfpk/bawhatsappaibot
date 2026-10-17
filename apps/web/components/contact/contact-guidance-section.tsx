import { FileText, Check } from "lucide-react";
import styles from "./contact.module.css";

export function ContactGuidanceSection() {
  const guidanceItems = [
    "Your business type and what products or services you sell/support on WhatsApp",
    "Current daily or monthly WhatsApp message volume and team size",
    "Whether your workflow requires voice note replies, image processing, or order capture",
    "Number of WhatsApp instances or phone numbers you plan to connect",
    "Specific integration requirements (e.g., WooCommerce catalog, PostEx, Leopards, or REST API)",
    "Your existing account email address if you are contacting us about an active account",
  ];

  return (
    <section id="guidance" className={styles.section}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <FileText size={14} /> Information Checklist
        </div>
        <h2 className={styles.title}>What Information to Include</h2>
        <p className={styles.subtitle}>
          Including these operational details in your message helps our team evaluate your setup and provide accurate recommendations.
        </p>
      </div>

      <div className={styles.contactBox} style={{ maxWidth: "880px" }}>
        <ul className={styles.list} style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          {guidanceItems.map((item, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.9375rem", color: "var(--ca-text-muted)", lineHeight: 1.5 }}>
              <Check size={18} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.1rem" }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
