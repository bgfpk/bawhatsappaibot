"use client";

import { Users, FileText, ShoppingBag, Clock, ArrowRight, CheckCircle2, UserCheck, Shield } from "lucide-react";
import styles from "./homepage.module.css";

const WORKFLOW_STEPS = [
  { step: "01", title: "Customer Message", desc: "Inquiry received on WhatsApp" },
  { step: "02", title: "Details Captured", desc: "Name, city & address extracted" },
  { step: "03", title: "Customer Record", desc: "Profile logged in CRM 360" },
  { step: "04", title: "Order / Lead Logged", desc: "Structured item & total recorded" },
  { step: "05", title: "Team Review", desc: "Staff review or 1-click takeover" },
  { step: "06", title: "Follow-Up", desc: "Scheduled update or confirmation" },
];

export function CustomerOperationsSection() {
  return (
    <section id="customer-operations" className={styles.section} style={{ paddingTop: "4rem", paddingBottom: "4.5rem" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader} style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto 3.5rem" }}>
          <span className={styles.eyebrow}>Structured Customer &amp; Order Workflow</span>
          <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)", fontWeight: 800 }}>
            From WhatsApp Chat to Structured Operations
          </h2>
          <p className={styles.sectionDesc} style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
            Automatically transform informal customer messages into organized CRM records, order summaries, and scheduled follow-ups.
          </p>
        </div>

        {/* Horizontal Workflow Stepper */}
        <div
          style={{
            maxWidth: "64rem",
            margin: "0 auto 3.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.875rem",
          }}
        >
          {WORKFLOW_STEPS.map((s, idx) => (
            <div
              key={idx}
              className={styles.card}
              style={{
                padding: "1rem",
                backgroundColor: "var(--ca-surface-1)",
                borderRadius: "0.75rem",
                border: "1px solid var(--ca-border-subtle)",
                textAlign: "center",
              }}
            >
              <span className={styles.badge} style={{ fontSize: "0.6875rem", fontWeight: 800, marginBottom: "0.35rem" }}>
                Step {s.step}
              </span>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: "0.25rem 0" }}>
                {s.title}
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)", margin: 0, lineHeight: 1.3 }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Operational Record Interface Preview */}
        <div className={styles.mockupShell} style={{ maxWidth: "64rem", margin: "0 auto" }}>
          <div className={styles.mockupHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <UserCheck size={16} style={{ color: "var(--ca-brand)" }} />
              <span style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)", fontWeight: 600 }}>
                Operations Control Panel &bull; Customer Record &amp; Order Details
              </span>
            </div>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Sample workspace</span>
          </div>

          <div className={styles.mockupBody} style={{ backgroundColor: "var(--ca-canvas-0)", padding: "1.5rem" }}>
            <div className={styles.centeredFlexGrid}>
              {/* Field Label Block 1: Customer Record */}
              <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.75rem" }}>
                  <Users size={18} />
                  <span>Customer Profile Record</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Name:</span><strong>Ayesha Khan</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Phone:</span><strong>+92 321 9876543</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>City:</span><strong>Lahore</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Address Status:</span><span style={{ color: "var(--ca-brand-strong)", fontWeight: 600 }}>Captured (DHA Ph 5)</span></div>
                </div>
              </div>

              {/* Field Label Block 2: Order Detail */}
              <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.75rem" }}>
                  <ShoppingBag size={18} />
                  <span>Order Summary Log</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Product:</span><strong>Organic Serum 50ml</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Quantity:</span><strong>2 Bottles</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Preferred Time:</span><strong>Morning Delivery</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Order Status:</span><span className={`${styles.badge} ${styles.badgeBrand}`}>Pending Verification</span></div>
                </div>
              </div>

              {/* Field Label Block 3: Team Review & Follow-Up */}
              <div className={`${styles.card} ${styles.centeredFlexItem3}`} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "0.75rem" }}>
                  <Clock size={18} />
                  <span>Team Review &amp; Follow-Up</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Team Review:</span><strong>Assigned to Staff #2</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>AI Reply State:</span><strong style={{ color: "var(--ca-brand-strong)" }}>Active (1-Click Pause)</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Next Follow-Up:</span><strong>Today at 5:00 PM</strong></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Courier Status:</span><strong>PostEx COD Ready</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
