import React from "react";
import { QrCode, Smartphone, RefreshCw, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import styles from "./docs.module.css";

export function InstanceConnectionGuide() {
  return (
    <section id="instance-connection" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <QrCode size={14} /> Instance & Connection Guide
          </div>
          <h2 className={styles.title}>WhatsApp Instance & QR Linking Flow</h2>
          <p className={styles.subtitle}>
            Understand how your WhatsApp instance connects to BlackArrow, how sessions are maintained, and how to reconnect cleanly when needed.
          </p>
        </div>

        <div className={styles.visualBox}>
          <div className={styles.flowRow}>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>1. Create Instance</div>
              <div className={styles.flowDetail}>Generate instance ID in dashboard</div>
            </div>
            <div className={styles.flowArrow}>
              <ArrowRight size={18} />
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>2. Display QR</div>
              <div className={styles.flowDetail}>Wait for ready status in UI</div>
            </div>
            <div className={styles.flowArrow}>
              <ArrowRight size={18} />
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>3. Link a Device</div>
              <div className={styles.flowDetail}>Open WhatsApp &gt; Linked Devices</div>
            </div>
            <div className={styles.flowArrow}>
              <ArrowRight size={18} />
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>4. Connected State</div>
              <div className={styles.flowDetail}>Session verified and ready</div>
            </div>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Operational Action</th>
                <th>Procedure &amp; Expectations</th>
                <th>Status / Outcome</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Instance Creation</strong></td>
                <td>Create a dedicated WhatsApp instance entry in your BlackArrow workspace dashboard. Align instance ownership with the team member responsible for the phone.</td>
                <td><span className={styles.tableTag}>Ready for QR</span></td>
              </tr>
              <tr>
                <td><strong>QR Scan via Linked Devices</strong></td>
                <td>On your phone, open WhatsApp, go to Linked Devices, choose Link a Device, and use the WhatsApp scanner to scan the QR code displayed in BlackArrow.</td>
                <td><span className={styles.tableTag}>Connected</span></td>
              </tr>
              <tr>
                <td><strong>Reconnection</strong></td>
                <td>If network disruption occurs, BlackArrow attempts automatic background socket reconnection. Keep the phone connected to active internet.</td>
                <td><span className={styles.tableTag}>Reconnecting</span></td>
              </tr>
              <tr>
                <td><strong>Reset Login</strong></td>
                <td>Use Reset Login when changing the linked phone or clearing a stuck session. This removes active auth credentials and presents a fresh QR code.</td>
                <td><span className={styles.tableTag}>Session Cleared</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.warningBox}>
          <AlertTriangle className={styles.warningIcon} size={22} />
          <div>
            <div className={styles.warningTitle}>Linked Device Session Ownership Notice</div>
            <div className={styles.warningText}>
              Logging out of the linked device on the physical phone disconnects the session immediately.
              BlackArrow relies on standard WhatsApp Linked Devices pairing; keeping the phone powered and connected to internet prevents avoidable disconnections.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
