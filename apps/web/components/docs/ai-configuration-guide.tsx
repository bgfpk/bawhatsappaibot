import React from "react";
import { Cpu, MessageSquare, Shield, CheckCircle } from "lucide-react";
import styles from "./docs.module.css";

export function AiConfigurationGuide() {
  return (
    <section id="ai-configuration" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <Cpu size={14} /> AI & Business Knowledge Guide
          </div>
          <h2 className={styles.title}>AI Configuration & Reply Behavior</h2>
          <p className={styles.subtitle}>
            Learn how to define your AI assistant persona, supply structured business context, select reply modes, and manage human handoff.
          </p>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Configuration Field</th>
                <th>Description &amp; Operational Purpose</th>
                <th>Best Practice / Recommendation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Bot Name &amp; Business Type</strong></td>
                <td>Identifies your AI assistant persona and primary business domain (e.g. Retail, E-commerce, Clinic, Real Estate).</td>
                <td>Use your official brand name and specific industry for grounded context.</td>
              </tr>
              <tr>
                <td><strong>Language Preference</strong></td>
                <td>Sets primary response language (e.g., English, Urdu, Roman Urdu, or multilingual auto-detection).</td>
                <td>Define Roman Urdu or English clearly if your audience mixes both in chat.</td>
              </tr>
              <tr>
                <td><strong>System Instructions</strong></td>
                <td>Core rules, greeting guidelines, fallback instructions, and boundaries the AI must observe during chats.</td>
                <td>Keep instructions concise, bulleted, and factual. Avoid vague or conflicting prompt text.</td>
              </tr>
              <tr>
                <td><strong>Catalog &amp; Product Context</strong></td>
                <td>Product catalog details, item pricing, stock status, variants, and service terms used for customer inquiries.</td>
                <td>Keep item titles and prices updated so AI replies match current inventory.</td>
              </tr>
              <tr>
                <td><strong>Admin WhatsApp Number</strong></td>
                <td>Designated staff WhatsApp number to receive immediate alert notifications when orders or handoffs occur.</td>
                <td>Ensure the admin number is actively monitored during business operating hours.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.visualBox}>
          <h3 className={styles.title} style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Supported AI Reply Modes
          </h3>
          <div className={styles.setupGrid}>
            <div className={styles.stepCard}>
              <h4 className={styles.stepTitle}>Text Preferred (Recommended)</h4>
              <p className={styles.stepDesc}>
                Understands incoming voice notes and text messages, but responds in clean text by default. Provides optimum cost control and fast reviewability.
              </p>
            </div>
            <div className={styles.stepCard}>
              <h4 className={styles.stepTitle}>Customer Preference</h4>
              <p className={styles.stepDesc}>
                Mirrors the customer&apos;s format—replying in voice notes when audio is received, and in text when text is received.
              </p>
            </div>
            <div className={styles.stepCard}>
              <h4 className={styles.stepTitle}>Always Text</h4>
              <p className={styles.stepDesc}>
                Forces all outgoing AI replies to remain strictly formatted as text messages, regardless of incoming customer media.
              </p>
            </div>
            <div className={styles.stepCard}>
              <h4 className={styles.stepTitle}>Always Voice</h4>
              <p className={styles.stepDesc}>
                Generates audio voice responses for every customer interaction where voice output is supported in your workspace plan.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <Shield className={styles.infoIcon} size={22} />
          <div>
            <div className={styles.infoTitle}>Human Takeover &amp; AI Pause Controls</div>
            <div className={styles.infoText}>
              Staff can pause AI replies, take over a conversation, and resume automation where supported.
              When a team member sends a message in a customer thread or triggers a pause control, BlackArrow pauses automated replies for that thread so humans maintain full authority.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
