import { ToggleLeft, ToggleRight, UserCheck, AlertTriangle, ShieldCheck } from "lucide-react";
import styles from "./features.module.css";

export function HumanTakeoverSection() {
  return (
    <section id="human-control" className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Human Control &amp; Safety</span>
          <h2 className={styles.sectionTitle}>1-Click Human Handoff &amp; AI Reply Pause Controls</h2>
          <p className={styles.sectionDesc}>
            Your staff stays in complete control. Pause AI automation on any conversation with a single click, reply manually, and resume AI whenever selected.
          </p>
        </div>

        {/* Handoff Lifecycle Visual */}
        <div className={styles.mockupShell} style={{ marginBottom: "2rem" }}>
          <div className={styles.mockupHeader}>
            <span>Per-Chat Human Handoff Control State</span>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Instant Handoff Available</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)", borderColor: "var(--ca-brand)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--ca-brand-strong)" }}>1. AI Active</span>
                  <ToggleRight size={22} style={{ color: "var(--ca-brand-strong)" }} />
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  AI handles routine buyer questions using business knowledge and catalog rules.
                </p>
              </div>

              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)", borderColor: "var(--ca-amber, #835607)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--ca-amber, #835607)" }}>2. Human Steps In</span>
                  <ToggleLeft size={22} style={{ color: "var(--ca-amber, #835607)" }} />
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Staff clicks &apos;Pause AI&apos; to handle custom requests, negotiations, or complex issues.
                </p>
              </div>

              <div className={`${styles.card} ${styles.gridItem4}`} style={{ backgroundColor: "var(--ca-surface-2)", borderColor: "var(--ca-blue, #425fa8)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--ca-blue, #425fa8)" }}>3. 1-Click Resume</span>
                  <UserCheck size={22} style={{ color: "var(--ca-blue, #425fa8)" }} />
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0 }}>
                  Once human conversation concludes, staff can re-enable automated AI replies instantly.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: "var(--ca-surface-2)", border: "1px solid var(--ca-border)", borderRadius: "0.75rem", padding: "1.25rem", display: "flex", alignItems: "flex-start", gap: "0.875rem", maxWidth: "44rem", margin: "0 auto" }}>
          <AlertTriangle size={20} style={{ color: "#F59E0B", flexShrink: 0, marginTop: "0.125rem" }} />
          <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--ca-text-primary)" }}>Safety &amp; Compliance Responsibility:</strong> Clients remain responsible for lawful WhatsApp messaging, customer consent, operating guidelines, and reviewing AI reply quality for their business.
          </p>
        </div>
      </div>
    </section>
  );
}
