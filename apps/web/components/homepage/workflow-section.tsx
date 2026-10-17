"use client";

import {
  QrCode,
  BookOpen,
  MessageSquare,
  UserCheck,
  XCircle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import styles from "./homepage.module.css";

const MANUAL_PAINS = [
  { text: "Unanswered messages during peak hours & late nights", icon: XCircle },
  { text: "Staff repeating identical prices, delivery fees, and FAQs", icon: XCircle },
  { text: "Customer addresses & order details buried in chat history", icon: XCircle },
  { text: "Follow-up messages forgotten or sent late", icon: XCircle },
  { text: "No clear handoff between AI and human staff", icon: XCircle },
];

const BLACKARROW_SHIFTS = [
  { text: "Instant grounded AI replies based on your catalog & rules", icon: CheckCircle2 },
  { text: "Multimodal understanding of text, voice notes, and photos", icon: CheckCircle2 },
  { text: "Automated extraction of customer details & order records", icon: CheckCircle2 },
  { text: "Follow-up sequence updates for open inquiries", icon: CheckCircle2 },
  { text: "1-Click human pause & team queue takeover anytime", icon: CheckCircle2 },
];

const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    icon: QrCode,
    title: "Connect WhatsApp",
    desc: "Pair your business WhatsApp number via Linked Devices QR scanning.",
    note: "Primary phone required for initial pairing & session renewals.",
  },
  {
    number: "02",
    icon: BookOpen,
    title: "Train the Assistant",
    desc: "Add your products, FAQs, store hours, delivery areas, and return policies.",
    note: "Refine prompt rules anytime based on customer chat logs.",
  },
  {
    number: "03",
    icon: MessageSquare,
    title: "Reply & Capture",
    desc: "AI answers customer inquiries, voice notes, and logs structured order details.",
    note: "Extracts customer records, delivery notes, and item totals.",
  },
  {
    number: "04",
    icon: UserCheck,
    title: "Monitor & Take Over",
    desc: "Your team monitors live chats and can pause AI with 1 click per conversation.",
    note: "Staff can resume AI or handle complex chats directly.",
  },
];

export function WorkflowSection() {
  return (
    <section id="workflow" className={styles.section} style={{ paddingTop: "4rem", paddingBottom: "4.5rem" }}>
      <div className={styles.container}>
        {/* SECTION 4 — The Business Problem & Operational Shift */}
        <div style={{ marginBottom: "5rem" }}>
          <div className={styles.sectionHeader} style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto 3rem" }}>
            <span className={styles.eyebrow}>Operational Transformation</span>
            <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)", fontWeight: 800 }}>
              The Shift From Manual Chats to BlackArrow
            </h2>
            <p className={styles.sectionDesc} style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
              Compare traditional manual WhatsApp operations against a structured, business-trained AI workflow.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {/* Manual Operations Card */}
            <div
              id="problems"
              className={styles.card}
              style={{
                padding: "1.75rem",
                backgroundColor: "var(--ca-surface-1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ca-rose, #a94153)" }}>
                  BEFORE: MANUAL OPERATIONS
                </span>
                <span className={styles.badge} style={{ backgroundColor: "rgba(169, 65, 83, 0.12)", color: "var(--ca-rose, #a94153)", border: "1px solid rgba(169, 65, 83, 0.25)" }}>
                  Slow &amp; Unstructured
                </span>
              </div>
              <ul style={{ display: "flex", flexDirection: "column", gap: "0.875rem", padding: 0, margin: 0, listStyle: "none" }}>
                {MANUAL_PAINS.map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "start", gap: "0.625rem", fontSize: "0.90625rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                    <item.icon size={18} style={{ color: "var(--ca-rose, #a94153)", flexShrink: 0, marginTop: "0.1rem" }} />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* BlackArrow Operations Card */}
            <div
              id="solutions"
              className={styles.card}
              style={{
                padding: "1.75rem",
                backgroundColor: "var(--ca-surface-1)",
                border: "1px solid rgba(50, 207, 145, 0.35)",
                borderRadius: "1rem",
                boxShadow: "0 10px 30px rgba(50, 207, 145, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ca-brand-strong, #24ad78)" }}>
                  AFTER: BLACKARROW WORKFLOW
                </span>
                <span className={`${styles.badge} ${styles.badgeBrand}`}>Automated &amp; Controlled</span>
              </div>
              <ul style={{ display: "flex", flexDirection: "column", gap: "0.875rem", padding: 0, margin: 0, listStyle: "none" }}>
                {BLACKARROW_SHIFTS.map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "start", gap: "0.625rem", fontSize: "0.90625rem", color: "var(--ca-text-primary)", lineHeight: 1.5 }}>
                    <item.icon size={18} style={{ color: "var(--ca-brand)", flexShrink: 0, marginTop: "0.1rem" }} />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* SECTION 6 — How It Works (4 Connected Steps) */}
        <div id="how-it-works" style={{ borderTop: "1px solid var(--ca-border-subtle)", paddingTop: "4rem" }}>
          <div className={styles.sectionHeader} style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto 3rem" }}>
            <span className={styles.eyebrow}>Four-Step Workflow</span>
            <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)", fontWeight: 800 }}>
              How BlackArrow Works
            </h2>
            <p className={styles.sectionDesc} style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
              A connected, transparent operating concept designed to get your WhatsApp automation running smoothly without losing human control.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.25rem",
              position: "relative",
            }}
          >
            {HOW_IT_WORKS_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className={styles.card}
                  style={{
                    padding: "1.5rem",
                    backgroundColor: "var(--ca-surface-1)",
                    borderRadius: "0.875rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                      <span className={styles.badge} style={{ fontSize: "0.8125rem", fontWeight: 800, padding: "0.25rem 0.625rem" }}>
                        Step {step.number}
                      </span>
                      <div
                        style={{
                          width: "2.5rem",
                          height: "2.5rem",
                          borderRadius: "0.5rem",
                          backgroundColor: "rgba(50, 207, 145, 0.12)",
                          border: "1px solid rgba(50, 207, 145, 0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--ca-brand)",
                        }}
                      >
                        <Icon size={20} />
                      </div>
                    </div>

                    <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", marginBottom: "0.5rem" }}>
                      {step.title}
                    </h3>

                    <p style={{ fontSize: "0.875rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, marginBottom: "1rem" }}>
                      {step.desc}
                    </p>
                  </div>

                  <div style={{ paddingTop: "0.875rem", borderTop: "1px solid var(--ca-border-subtle)", fontSize: "0.78125rem", color: "var(--ca-text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <ShieldCheck size={14} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                    <span>{step.note}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
