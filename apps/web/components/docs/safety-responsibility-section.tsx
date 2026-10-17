import React from "react";
import { ShieldAlert, CheckSquare, Lock, AlertTriangle } from "lucide-react";
import styles from "./docs.module.css";

export function SafetyResponsibilitySection() {
  return (
    <section id="safety-responsibility" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <ShieldAlert size={14} /> Safety &amp; Client Responsibility
          </div>
          <h2 className={styles.title}>Launch Safety &amp; Compliance Guidance</h2>
          <p className={styles.subtitle}>
            Best practices for operating WhatsApp automation responsibly, maintaining account safety, and understanding client obligations.
          </p>
        </div>

        <div className={styles.setupGrid}>
          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>1. Dedicated Business Line</h3>
            <p className={styles.stepDesc}>
              Use a dedicated business phone number for automated WhatsApp customer conversations rather than personal personal lines.
            </p>
          </div>

          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>2. Avoid Bulk Unsolicited Spam</h3>
            <p className={styles.stepDesc}>
              Only message customers who have opted in or contacted your business. Sending unsolicited bulk messages violates platform terms and risks number restrictions.
            </p>
          </div>

          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>3. Relevant &amp; Grounded Content</h3>
            <p className={styles.stepDesc}>
              Keep AI instructions grounded in real product details, accurate pricing, and clear terms. Vague or deceptive replies damage customer trust.
            </p>
          </div>

          <div className={styles.stepCard}>
            <h3 className={styles.stepTitle}>4. Credential &amp; Key Security</h3>
            <p className={styles.stepDesc}>
              Keep workspace passwords, API keys, and session links confidential. BlackArrow support will never ask you to share passwords or API secrets.
            </p>
          </div>
        </div>

        <div className={styles.warningBox}>
          <AlertTriangle className={styles.warningIcon} size={22} />
          <div>
            <div className={styles.warningTitle}>Platform Risk &amp; Client Legal Responsibility</div>
            <div className={styles.warningText}>
              Clients remain solely responsible for product pricing, refund policies, delivery commitments, customer consent, privacy compliance, and lawful messaging.
              WhatsApp Linked Devices automation carries platform risk. BlackArrow does not make legal guarantees or claim zero risk of number limitation by Meta/WhatsApp.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
