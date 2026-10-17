import { User, Phone, MapPin, ShoppingBag, FileText, CheckCircle } from "lucide-react";
import styles from "./features.module.css";

export function CustomerCrmSection() {
  return (
    <section id="customers-crm" className={styles.section}>
      <div id="sales-orders" />
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Structured Customer 360</span>
          <h2 className={styles.sectionTitle}>From WhatsApp Conversations to Organized Customer Records</h2>
          <p className={styles.sectionDesc}>
            Extract contact details, delivery addresses, product interests, and order histories directly into organized Customer 360 profiles.
          </p>
        </div>

        {/* 3-Panel Split Visual */}
        <div className={styles.mockupShell}>
          <div className={styles.mockupHeader}>
            <span>Customer 360 Context Extraction Panel</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)", fontStyle: "italic" }}>Sample Workspace Data</span>
              <span className={`${styles.badge} ${styles.badgeBrand}`}>Auto-Structured Record</span>
            </div>
          </div>

          <div className={styles.mockupBody}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
              {/* Panel 1: Chat Input */}
              <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-brand-strong)", marginBottom: "0.75rem" }}>
                  1. Incoming Chat Context
                </div>
                <div style={{ backgroundColor: "var(--ca-surface-1)", padding: "0.75rem", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "var(--ca-text-primary)", marginBottom: "0.5rem" }}>
                  &quot;Hi, I want 2 units of Leather Tote Bag. Name: Sarah K., Address: House 42, Block B, Gulberg III, Lahore.&quot;
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)" }}>Raw WhatsApp Message Stream</span>
              </div>

              {/* Panel 2: Field Extraction */}
              <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-2)", borderColor: "var(--ca-blue, #425fa8)" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-blue, #425fa8)", marginBottom: "0.75rem" }}>
                  2. Smart Entity Extraction
                </div>
                <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.78125rem", color: "var(--ca-text-secondary)", listStyle: "none", padding: 0, margin: 0 }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CheckCircle size={14} style={{ color: "#60A5FA" }} /> Customer Name: Sarah K.
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CheckCircle size={14} style={{ color: "#60A5FA" }} /> City: Lahore (Gulberg III)
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CheckCircle size={14} style={{ color: "#60A5FA" }} /> Product: Leather Tote Bag (x2)
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CheckCircle size={14} style={{ color: "#60A5FA" }} /> Payment: Cash on Delivery
                  </li>
                </ul>
              </div>

              {/* Panel 3: Structured Profile */}
              <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-2)", borderColor: "var(--ca-brand)" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-brand-strong)", marginBottom: "0.75rem" }}>
                  3. Customer 360 Profile
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.78125rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-text-primary)" }}>
                    <User size={14} style={{ color: "var(--ca-brand)" }} />
                    <span style={{ fontWeight: 600 }}>Sarah K. (+92 300 1234567)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-text-secondary)" }}>
                    <MapPin size={14} style={{ color: "var(--ca-brand)" }} />
                    <span>Gulberg III, Lahore</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-text-secondary)" }}>
                    <ShoppingBag size={14} style={{ color: "var(--ca-brand)" }} />
                    <span>Order #ORD-8492 (Rs. 9,200 COD)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-text-secondary)" }}>
                    <FileText size={14} style={{ color: "var(--ca-brand)" }} />
                    <span>PostEx Courier: Pending Dispatch</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
