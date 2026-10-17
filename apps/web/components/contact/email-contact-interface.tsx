import { ButtonLink } from "@/components/button-link";
import { Mail, ShieldAlert } from "lucide-react";
import styles from "./contact.module.css";

export function EmailContactInterface() {
  return (
    <section id="email-interface" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <Mail size={14} /> Direct Email Contact
        </div>
        <h2 className={styles.title}>Send Your Inquiry to Support</h2>
        <p className={styles.subtitle}>
          Contact BlackArrow support directly at <strong style={{ color: "var(--ca-brand)" }}>contact-086473cbd844@example.invalid</strong>.
        </p>
      </div>

      <div className={styles.contactBox}>
        <div className={styles.contactBoxHeader}>
          <div className={styles.contactBoxIcon}>
            <Mail size={24} />
          </div>
          <div>
            <h3 className={styles.contactBoxTitle}>Official BlackArrow Support</h3>
            <p className={styles.contactBoxSub}>contact-086473cbd844@example.invalid</p>
          </div>
        </div>

        <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--ca-text-muted)", margin: 0 }}>
          To help us assist you effectively, please include your business name, message volume requirements, specific questions, and registered account email (if you are an existing customer).
        </p>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <ButtonLink href="mailto:contact-086473cbd844@example.invalid?subject=BlackArrow%20Inquiry" showArrow>
            Email Support
          </ButtonLink>
        </div>

        <div className={styles.securityNotice}>
          <ShieldAlert size={20} className={styles.securityNoticeIcon} />
          <div>
            <strong>Security Notice:</strong> Do not send account passwords, OTPs, API keys, payment card details, WhatsApp QR codes, or private credentials in support messages.
          </div>
        </div>
      </div>
    </section>
  );
}
