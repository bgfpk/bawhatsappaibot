import React from "react";
import { AlertTriangle, HelpCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import styles from "./docs.module.css";

export const TROUBLESHOOTING_ENTRIES = [
  {
    id: "qr-not-appearing",
    symptom: "QR code is not appearing in the connection panel",
    causes: "Network latency between dashboard and server, or previous instance socket closing.",
    safeChecks: "Refresh your browser page, verify internet connection, and wait 10-15 seconds for status refresh.",
    whenReset: "Use Reset Login if the panel stays in 'Initializing' for more than 2 minutes.",
    whenSupport: "Contact contact-086473cbd844@example.invalid if QR fails to generate after Reset Login.",
  },
  {
    id: "qr-expired",
    symptom: "QR code expired before scanning",
    causes: "WhatsApp QR codes refresh every 20-30 seconds for security.",
    safeChecks: "Keep your phone's WhatsApp Linked Devices screen open and ready before refreshing the QR code.",
    whenReset: "Click Refresh QR in the connection panel.",
    whenSupport: "Contact support if new QR codes do not appear upon refresh.",
  },
  {
    id: "connection-stuck",
    symptom: "Connection state stuck in 'Reconnecting'",
    causes: "Business phone lost internet access or phone battery saver killed background WhatsApp service.",
    safeChecks: "Check that your physical phone is powered on, connected to Wi-Fi/data, and WhatsApp is open.",
    whenReset: "Use Reset Login if the phone shows Linked Devices active but BlackArrow shows disconnected.",
    whenSupport: "Contact support if reconnect fails while phone internet is confirmed active.",
  },
  {
    id: "whatsapp-logged-out",
    symptom: "WhatsApp logged out notification on phone",
    causes: "Session was manually logged out from Linked Devices on the physical phone.",
    safeChecks: "Open BlackArrow dashboard and click Reset Login to generate a fresh QR code for pairing.",
    whenReset: "Reset Login is required to re-establish the session pairing.",
    whenSupport: "Not needed unless QR scanning fails repeatedly.",
  },
  {
    id: "media-unavailable",
    symptom: "Media file or group fails to send in chat",
    causes: "Uploaded file exceeds WhatsApp file size limits or storage URL is broken.",
    safeChecks: "Check Media Library in workspace settings to ensure the asset file URL is valid and under 16MB.",
    whenReset: "Re-upload the media file or recreate the media group.",
    whenSupport: "Contact support if verified media files consistently fail to deliver.",
  },
  {
    id: "sequence-not-triggering",
    symptom: "Keyword or Welcome Sequence does not fire",
    causes: "Sequence is toggled inactive, customer is currently in human takeover state, or keyword exact match failed.",
    safeChecks: "Check if the conversation is paused by staff. Verify keyword spelling and active sequence toggle.",
    whenReset: "Toggle the sequence off and back on in workspace settings.",
    whenSupport: "Contact support if active sequences fail for non-paused threads.",
  },
  {
    id: "unexpected-ai-reply",
    symptom: "AI reply is vague or unaligned with business rules",
    causes: "System instructions are missing specific product context or conflicting prompt rules exist.",
    safeChecks: "Review AI System Instructions and Product Catalog entries for clarity and specific wording.",
    whenReset: "Update instructions and test in a trial thread.",
    whenSupport: "Contact support if prompt updates do not refine AI output.",
  },
  {
    id: "courier-no-data",
    symptom: "Courier tracking lookup returns no result",
    causes: "Invalid tracking number format, incorrect merchant API token, or courier API downtime.",
    safeChecks: "Verify PostEx / Leopards API key in workspace settings and test tracking number directly on courier site.",
    whenReset: "Re-enter merchant credentials in courier settings.",
    whenSupport: "Contact support if valid API keys return repeated authentication errors.",
  },
];

export function TroubleshootingGuide() {
  return (
    <section id="troubleshooting" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <AlertTriangle size={14} /> Troubleshooting Guide
          </div>
          <h2 className={styles.title}>Practical Troubleshooting &amp; Diagnostics</h2>
          <p className={styles.subtitle}>
            Step-by-step diagnostic guidance for connection issues, media delivery, sequence triggers, and login resets.
          </p>
        </div>

        <div className={styles.troubleGrid}>
          {TROUBLESHOOTING_ENTRIES.map((entry) => (
            <div key={entry.id} className={styles.troubleCard}>
              <h3 className={styles.troubleSymptom}>
                <HelpCircle size={18} className={styles.flowArrow} /> {entry.symptom}
              </h3>
              
              <div className={styles.troubleSection}>
                <div className={styles.troubleLabel}>Likely Causes</div>
                <div className={styles.troubleText}>{entry.causes}</div>
              </div>

              <div className={styles.troubleSection}>
                <div className={styles.troubleLabel}>Safe Checks</div>
                <div className={styles.troubleText}>{entry.safeChecks}</div>
              </div>

              <div className={styles.troubleSection}>
                <div className={styles.troubleLabel}>When to Reset Login</div>
                <div className={styles.troubleText}>{entry.whenReset}</div>
              </div>

              <div className={styles.troubleSection} style={{ marginBottom: 0 }}>
                <div className={styles.troubleLabel}>When to Contact Support</div>
                <div className={styles.troubleText}>{entry.whenSupport}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
