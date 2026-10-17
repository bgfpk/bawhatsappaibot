import { Zap, PlayCircle, Image as ImageIcon, FileText, Clock } from "lucide-react";
import styles from "./features.module.css";

const SEQUENCE_STEPS = [
  { step: "Trigger", label: "Keyword / Shortcut Inquiry", desc: "Customer sends 'info', 'pricing', or starts chat.", icon: Zap, color: "var(--ca-blue, #425fa8)" },
  { step: "Step 1", label: "Welcome & Intro Message", desc: "Immediate greeting with core service options.", icon: PlayCircle, color: "var(--ca-brand-strong, #24ad78)" },
  { step: "Step 2", label: "Media Bundle Delivery", desc: "Product photos or video clip delivered ($0.001/file).", icon: ImageIcon, color: "var(--ca-amber, #835607)" },
  { step: "Step 3", label: "PDF Catalog / Price List", desc: "PDF pricing guide or spec sheet attached.", icon: FileText, color: "var(--ca-rose, #a94153)" },
  { step: "Step 4", label: "Scheduled Follow-Up Question", desc: "Time-delayed question to check buyer interest.", icon: Clock, color: "var(--ca-violet, #654fa7)" },
];

export function SequenceGroupsSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Automated Customer Sequences</span>
          <h2 className={styles.sectionTitle}>Multi-Step Message Flows for Inquiries and Onboarding</h2>
          <p className={styles.sectionDesc}>
            Build structured, multi-step message sequences triggered by keyword inquiries, welcome triggers, or manual staff shortcuts.
          </p>
        </div>

        {/* Sequence Timeline Visual */}
        <div className={styles.mockupShell} style={{ marginBottom: "1.5rem" }}>
          <div className={styles.mockupHeader}>
            <span>Configured Sequence Flow Builder</span>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Opt-in Buyer Sequences</span>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              {SEQUENCE_STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.step} className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: s.color, fontWeight: 700, fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                      <Icon size={16} />
                      <span>{s.step}: {s.label}</span>
                    </div>
                    <p style={{ fontSize: "0.78125rem", color: "var(--ca-text-secondary)", margin: 0 }}>{s.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--ca-text-muted)", margin: 0 }}>
          Sequences are designed for opt-in customer onboarding and responsive inquiry management. BlackArrow does not support unrequested bulk cold outreach.
        </p>
      </div>
    </section>
  );
}
