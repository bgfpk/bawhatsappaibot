import { ShoppingBag, Briefcase, Calendar, HelpCircle, ArrowRight } from "lucide-react";
import styles from "./features.module.css";

const WORKFLOWS = [
  {
    title: "E-Commerce Product Sales",
    icon: ShoppingBag,
    color: "var(--ca-brand-strong, #24ad78)",
    flow: ["Product Inquiries", "AI Catalog Reply", "Delivery Address Capture", "Fulfillment Sync"],
  },
  {
    title: "Service Businesses",
    icon: Briefcase,
    color: "var(--ca-blue, #425fa8)",
    flow: ["Service Quotes", "Business Instructions Match", "Requirement Collection", "Staff Takeover"],
  },
  {
    title: "Bookings & Appointments",
    icon: Calendar,
    color: "var(--ca-amber, #835607)",
    flow: ["Schedule Inquiries", "Service Menu PDF", "Time Request Collection", "Admin Confirmation"],
  },
  {
    title: "Customer Support & FAQ",
    icon: HelpCircle,
    color: "var(--ca-rose, #a94153)",
    flow: ["Policy Questions", "WordPress Knowledge Answer", "Transcribed Voice Notes", "Handoff if Complex"],
  },
];

export function BusinessWorkflowsSection() {
  return (
    <section id="workflows" className={styles.section} style={{ backgroundColor: "var(--ca-canvas-1)" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Practical Workflows</span>
          <h2 className={styles.sectionTitle}>How Features Work Across Different Business Types</h2>
          <p className={styles.sectionDesc}>
            See how BlackArrow&apos;s modular capabilities combine into practical operation paths for product sellers, service providers, and support teams.
          </p>
        </div>

        <div className={styles.centeredGrid}>
          {WORKFLOWS.map((wf) => {
            const Icon = wf.icon;
            return (
              <div key={wf.title} className={`${styles.card} ${styles.gridItem3}`} style={{ backgroundColor: "var(--ca-surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: wf.color, fontWeight: 700, fontSize: "0.9375rem", marginBottom: "1rem" }}>
                  <Icon size={18} />
                  <span>{wf.title}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {wf.flow.map((step, idx) => (
                    <div key={step} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
                      <span style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "var(--ca-surface-1)", color: wf.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.71875rem", flexShrink: 0 }}>
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
