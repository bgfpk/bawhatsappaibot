import React from "react";
import { Layers3, FileImage, Workflow, MessageSquareCode, CheckCircle2 } from "lucide-react";
import styles from "./docs.module.css";

export function MediaSequencesGuide() {
  return (
    <section id="media-sequences" className={`${styles.section} ${styles.sectionMuted}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <Layers3 size={14} /> Media &amp; Automation Guide
          </div>
          <h2 className={styles.title}>Media Library, Groups &amp; Sequence Workflows</h2>
          <p className={styles.subtitle}>
            Organize reusable photos, media collections, and automated conversation sequences to handle repeated customer inquiries efficiently.
          </p>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Automation Element</th>
                <th>Definition &amp; Operational Function</th>
                <th>Usage &amp; Behavior</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Media Library</strong></td>
                <td>Individual stored image, video, audio, or document files uploaded to your workspace.</td>
                <td>Used for single asset attachments in product or support replies.</td>
              </tr>
              <tr>
                <td><strong>Media Group</strong></td>
                <td>A named collection of related media items (e.g., catalog photos, size charts, portfolio items).</td>
                <td>Delivered together in response to relevant customer requests.</td>
              </tr>
              <tr>
                <td><strong>Sequence Group</strong></td>
                <td>An ordered chain of messages, media sends, and delay intervals configured for automated execution.</td>
                <td>Executes multi-step outreach or customer follow-up flows.</td>
              </tr>
              <tr>
                <td><strong>Welcome Sequence</strong></td>
                <td>Automated sequence triggered when a new customer initiates their first conversation.</td>
                <td>Introduces your business and prompts for initial inquiry details.</td>
              </tr>
              <tr>
                <td><strong>Keyword Sequence</strong></td>
                <td>Sequence triggered automatically when an incoming message matches configured keyword triggers.</td>
                <td>Delivers specific info when terms like &quot;pricing&quot;, &quot;catalog&quot;, or &quot;location&quot; match.</td>
              </tr>
              <tr>
                <td><strong>Shortcut Sequence</strong></td>
                <td>Pre-configured sequence triggered manually by staff from the dashboard thread view.</td>
                <td>Allows staff to send multi-message templates with a single action.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.visualBox}>
          <h3 className={styles.title} style={{ fontSize: "1.35rem", marginBottom: "0.75rem" }}>
            WhatsApp Groups as Content Libraries
          </h3>
          <p className={styles.subtitle} style={{ marginBottom: "1rem" }}>
            Where configured in your workspace, dedicated WhatsApp groups can serve as live content libraries. Uploading media or templates to a designated content group allows BlackArrow to index those assets for customer automation.
          </p>
          <div className={styles.flowRow}>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>Content Group</div>
              <div className={styles.flowDetail}>Upload media to designated WhatsApp group</div>
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>Asset Indexing</div>
              <div className={styles.flowDetail}>BlackArrow registers media &amp; captions</div>
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>Customer Delivery</div>
              <div className={styles.flowDetail}>AI delivers matching media in customer chats</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
