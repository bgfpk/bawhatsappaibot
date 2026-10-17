import { QrCode, Smartphone, RefreshCw, Layers } from "lucide-react";
import styles from "./features.module.css";

export function InstanceConnectionSection() {
  return (
    <section id="instance-control" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Instance &amp; Session Management</span>
          <h2 className={styles.sectionTitle}>WhatsApp Connection &amp; Linked Devices Management</h2>
          <p className={styles.sectionDesc}>
            Connect your standard WhatsApp or WhatsApp Business numbers using Linked Devices QR pairing. Monitor connection health and refresh sessions whenever needed.
          </p>
        </div>

        {/* Connection Management Cards */}
        <div className={styles.centeredGrid}>
          <div className={`${styles.card} ${styles.gridItem4}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
              <QrCode size={18} />
              <span>Linked Devices QR Pairing</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
              Pair your primary phone using the Linked Devices QR code scanner inside your WhatsApp mobile app.
            </p>
          </div>

          <div className={`${styles.card} ${styles.gridItem4}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-blue, #425fa8)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
              <Smartphone size={18} />
              <span>Instance Health Diagnostics</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
              Track real-time session status (Online, Disconnected, Reconnecting) with diagnostic indicators.
            </p>
          </div>

          <div className={`${styles.card} ${styles.gridItem4}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-amber, #835607)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
              <RefreshCw size={18} />
              <span>Session Refresh Workflow</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
              If a mobile session expires or disconnects, dashboard alerts notify staff to re-scan the QR code.
            </p>
          </div>

          <div className={`${styles.card} ${styles.gridItem4}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-rose, #a94153)", fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
              <Layers size={18} />
              <span>Multi-Instance Support</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
              Connect 1 instance (Starter), 3 instances (Growth), or 10 instances (Pro) based on your plan.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
