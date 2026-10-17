import React from "react";
import { Users, Database, ShoppingBag, GitBranch, Bell, ShieldAlert } from "lucide-react";
import styles from "./docs.module.css";

export function CustomerOperationsGuide() {
  return (
    <section id="customer-operations" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.eyebrow}>
            <Users size={14} /> Customer Operations Guide
          </div>
          <h2 className={styles.title}>Customer 360, CRM &amp; Order Operations</h2>
          <p className={styles.subtitle}>
            Manage customer records, track conversation history, capture structured orders, and supervise CRM pipeline progression.
          </p>
        </div>

        <div className={styles.setupGrid}>
          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepIcon}><Users size={22} /></span>
            </div>
            <h3 className={styles.stepTitle}>Customer 360 Profiles</h3>
            <p className={styles.stepDesc}>
              Consolidates phone numbers, display names, custom confirmation fields, total conversation history, and order count into a unified operational profile.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepIcon}><ShoppingBag size={22} /></span>
            </div>
            <h3 className={styles.stepTitle}>Workspace Orders</h3>
            <p className={styles.stepDesc}>
              Captures structured order details during chat conversations, including item selections, custom confirmation field values, shipping details, and status.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepIcon}><GitBranch size={22} /></span>
            </div>
            <h3 className={styles.stepTitle}>CRM Pipeline Stages</h3>
            <p className={styles.stepDesc}>
              Organizes customer threads by operational stages (e.g., New Lead, Info Sent, Order Pending, Confirmed, Completed) for team oversight.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepIcon}><Bell size={22} /></span>
            </div>
            <h3 className={styles.stepTitle}>Follow-ups &amp; Updates</h3>
            <p className={styles.stepDesc}>
              Schedules automated follow-up prompts and sends delivery or status updates to customers based on workspace activity.
            </p>
          </div>
        </div>

        <div className={styles.visualBox}>
          <h3 className={styles.title} style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>
            Operational Handoff Lifecycle
          </h3>
          <div className={styles.flowRow}>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>1. Inbound Inquiry</div>
              <div className={styles.flowDetail}>Customer messages on WhatsApp</div>
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>2. AI Processing</div>
              <div className={styles.flowDetail}>Grounded AI replies &amp; captures details</div>
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>3. Order / Lead Created</div>
              <div className={styles.flowDetail}>Structured entry recorded in workspace</div>
            </div>
            <div className={styles.flowItem}>
              <div className={styles.flowLabel}>4. Human Handoff</div>
              <div className={styles.flowDetail}>Staff steps in or resumes as needed</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
