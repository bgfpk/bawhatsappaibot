import { Kanban, ArrowRight } from "lucide-react";
import styles from "./features.module.css";

const STAGES = [
  { name: "New Inquiry", count: 14, color: "var(--ca-blue, #425fa8)" },
  { name: "Qualified", count: 8, color: "var(--ca-amber, #835607)" },
  { name: "Order Pending", count: 6, color: "var(--ca-rose, #a94153)" },
  { name: "Confirmed", count: 12, color: "var(--ca-brand-strong, #24ad78)" },
  { name: "Follow-Up", count: 5, color: "var(--ca-violet, #654fa7)" },
  { name: "Completed", count: 42, color: "var(--ca-teal, #136c65)" },
];

export function CrmPipelineSection() {
  return (
    <section id="crm-pipeline" className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Visual CRM Pipeline</span>
          <h2 className={styles.sectionTitle}>Track Customer Progress Across Configured Workflow Stages</h2>
          <p className={styles.sectionDesc}>
            Organize active conversations into pipeline stages so your team knows which inquiries require immediate action, follow-up, or fulfillment review.
          </p>
        </div>

        {/* Pipeline Board Visual */}
        <div className={styles.mockupShell}>
          <div className={styles.mockupHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Kanban size={16} style={{ color: "var(--ca-brand)" }} />
              <span>CRM Workflow Pipeline Board</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)", fontStyle: "italic" }}>Sample Workspace Data</span>
              <span className={styles.badge}>6 Configured Stages</span>
            </div>
          </div>

          <div className={styles.mockupBody}>
            <div className={styles.centeredGrid}>
              {STAGES.map((stage) => (
                <div key={stage.name} className={`${styles.card} ${styles.gridItemSmall}`} style={{ backgroundColor: "var(--ca-surface-2)", padding: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", borderBottom: `2px solid ${stage.color}`, paddingBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-text-primary)" }}>{stage.name}</span>
                    <span className={styles.badge} style={{ fontSize: "0.75rem" }}>{stage.count}</span>
                  </div>

                  <div style={{ backgroundColor: "var(--ca-surface-1)", borderRadius: "0.5rem", padding: "0.625rem", fontSize: "0.75rem", color: "var(--ca-text-secondary)" }}>
                    <div style={{ fontWeight: 600, color: "var(--ca-text-primary)", marginBottom: "0.25rem" }}>Sample Customer</div>
                    <div>WhatsApp #ORD-{Math.floor(1000 + Math.random() * 9000)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
