"use client";

import { ShieldCheck, PauseCircle, UserCheck, AlertTriangle } from "lucide-react";
import styles from "./homepage.module.css";

export function HumanControlSection() {
  return (
    <section id="human-control" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Human Takeover &amp; Safety</span>
          <h2 className={styles.sectionTitle}>Human Control and WhatsApp Safety</h2>
          <p className={styles.sectionDesc}>
            Keep full control over customer interactions with easy pause toggles and clear compliance guidelines.
          </p>
        </div>

        <div className={styles.grid2} style={{ alignItems: "center" }}>
          {/* Left Column: Approved Control Wording & Handoff Feature */}
          <div className={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ca-brand-strong)", fontWeight: 700, marginBottom: "1rem" }}>
              <PauseCircle size={20} />
              <h3 style={{ fontSize: "1.25rem", color: "var(--ca-text-primary)" }}>Manual Staff Handoff</h3>
            </div>

            <p style={{ fontSize: "1.0625rem", color: "var(--ca-text-primary)", fontWeight: 600, lineHeight: 1.5, marginBottom: "1rem" }}>
              Pause automated replies and continue the conversation manually when staff intervention is needed.
            </p>

            <ul style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.875rem", color: "var(--ca-text-secondary)", marginBottom: "1.5rem" }}>
              <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--ca-brand)" }}></span>
                <span>Toggle AI replies on or off per customer conversation.</span>
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--ca-brand)" }}></span>
                <span>Staff messages take immediate priority when typed in chat.</span>
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--ca-brand)" }}></span>
                <span>Resume AI automation anytime with a single click.</span>
              </li>
            </ul>

            {/* Responsibility Statement Banner */}
            <div style={{ backgroundColor: "var(--ca-surface-2)", padding: "0.875rem 1rem", borderRadius: "0.625rem", border: "1px solid var(--ca-border)", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <AlertTriangle size={18} style={{ color: "var(--ca-amber)", flexShrink: 0, marginTop: "0.125rem" }} />
              <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                <strong>Client Responsibility Notice:</strong> Clients remain responsible for safe, relevant and compliant WhatsApp usage.
              </div>
            </div>
          </div>

          {/* Right Column: Active vs Paused Visual Toggle */}
          <div className={styles.mockupShell}>
            <div className={styles.mockupHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <UserCheck size={16} style={{ color: "var(--ca-brand)" }} />
                <span>Conversation Control &bull; Active Conversation</span>
              </div>
            </div>

            <div className={styles.mockupBody} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Active AI State Card */}
              <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--ca-text-primary)", fontSize: "0.9375rem" }}>Automated AI Replies</div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)" }}>Status: Responding to routine inquiries</div>
                </div>
                <span className={`${styles.badge} ${styles.badgeBrand}`}>AI ACTIVE</span>
              </div>

              {/* Action Button Simulating Pause */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)", fontStyle: "italic" }}>
                  &darr; Staff toggles conversation state &darr;
                </div>
              </div>

              {/* Paused AI State Card */}
              <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(199, 149, 60, 0.3)" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--ca-text-primary)", fontSize: "0.9375rem" }}>AI Replies Paused</div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)" }}>Human staff member actively typing in chat</div>
                </div>
                <span className={styles.badge} style={{ backgroundColor: "rgba(199, 149, 60, 0.15)", color: "var(--ca-amber)", borderColor: "rgba(199, 149, 60, 0.3)" }}>
                  STAFF TAKEOVER
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
